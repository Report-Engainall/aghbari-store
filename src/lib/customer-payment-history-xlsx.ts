import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type CustomerPaymentHistoryWorkbookInput = {
  payments: readonly {
    paidAt: string | null;
    invoiceNumber: string | null;
    amount: number | string | null;
    currency: string | null;
  }[];
  loadedCount: number;
  detailMayBePartial: boolean;
  searchFiltered: boolean;
};

type Sheet = { name: string; rows: CellValue[][] };

function validDate(value: string | null): string {
  if (value === null) return "تاريخ غير متاح في المصدر";
  if (value.length > 80 || !Number.isFinite(Date.parse(value))) {
    throw new Error("تعذر تصدير سجل الدفعات: تاريخ إحدى الحركات غير صالح.");
  }
  return value;
}

function validText(value: string, label: string, maxLength: number): string {
  if (!value.trim() || value.length > maxLength) {
    throw new Error("تعذر تصدير سجل الدفعات: حقل " + label + " غير صالح.");
  }
  return value;
}

function validAmount(value: number | string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1_000_000_000_000) {
    throw new Error("تعذر تصدير سجل الدفعات: مبلغ إحدى الحركات غير صالح.");
  }
  return amount;
}

function workbookSheets(input: CustomerPaymentHistoryWorkbookInput): Sheet[] {
  if (!Array.isArray(input.payments) || input.payments.length < 1 || input.payments.length > 500 ||
      !Number.isSafeInteger(input.loadedCount) || input.loadedCount < input.payments.length ||
      input.loadedCount > 500 || typeof input.detailMayBePartial !== "boolean" ||
      typeof input.searchFiltered !== "boolean") {
    throw new Error("تعذر تصدير سجل الدفعات: حدود البيانات غير صالحة.");
  }

  let hiddenAmountCount = 0;
  const lines: CellValue[][] = [
    ["تاريخ الدفع", "رقم الفاتورة", "المبلغ", "العملة", "نطاق الربط"],
    ...input.payments.map((payment, index) => {
      const paidAt = validDate(payment.paidAt);
      if (payment.invoiceNumber === null) {
        if (payment.amount !== null || payment.currency !== null) {
          throw new Error("تعذر تصدير سجل الدفعات: لا يجوز إظهار مبلغ دون فاتورة مرتبطة ضمن التفاصيل.");
        }
        hiddenAmountCount += 1;
        return [
          paidAt,
          "الفاتورة خارج تفاصيل القراءة الحالية",
          null,
          null,
          "المبلغ مخفي لأن الفاتورة المرتبطة غير متاحة ضمن الصفحة المحملة",
        ];
      }

      const invoiceNumber = validText(payment.invoiceNumber, "رقم الفاتورة في الحركة " + (index + 1), 100);
      if (payment.amount === null || payment.currency === null ||
          !/^[A-Z]{3}$/.test(payment.currency)) {
        throw new Error("تعذر تصدير سجل الدفعات: مرجع الفاتورة موجود لكن بيانات العملة أو المبلغ غير مكتملة.");
      }
      return [
        paidAt,
        invoiceNumber,
        validAmount(payment.amount),
        payment.currency,
        "مرتبطة بفاتورة ضمن تفاصيل القراءة الحالية",
      ];
    }),
  ];

  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — سجل دفعات العميل"],
    ["وقت استخراج الملف", new Date().toISOString()],
    ["عدد الحركات المصدرة", input.payments.length],
    ["إجمالي الحركات المحملة في الصفحة", input.loadedCount],
    ["حركات بلا تفاصيل فاتورة مرتبطة", hiddenAmountCount],
    ["التصفية", input.searchFiltered ? "التصدير يطابق نتائج البحث الحالية" : "لم يطبق بحث على القائمة الحالية"],
    ["حدود السجل", input.detailMayBePartial
      ? "تفاصيل القراءة محدودة بآخر 500 دفعة و200 فاتورة؛ قد توجد حركات أقدم خارج الملف."
      : "الملف يعكس الحركات التي أعادها مصدر كشف الحساب ضمن حدود القراءة الحالية."],
    ["منهجية المبالغ", "لا يظهر مبلغ الحركة إلا عند توفر رقم الفاتورة والعملة ضمن تفاصيل القراءة المصرح بها."],
    ["المصدر", "حركات الدفعات التي أعادها RPC كشف حساب العميل؛ لم تُنشأ قراءة مالية بديلة."],
    ["الخصوصية", "لا يتضمن الملف UUID أو معرفات الدفع أو الفاتورة أو العميل أو المؤسسة أو المستخدم."],
    ["الحدود المحاسبية", "هذا سجل حركات وليس إيصال قبض مستقلًا، ولا يثبت تحصيلًا خارج القيود التي أعادها المصدر."],
    ["حماية النصوص", "تُخزن النصوص كخلايا نصية صريحة؛ لا تُنفذ صيغ Excel من بيانات السجل."],
  ];

  return [
    { name: "ملخص السجل", rows: summary },
    { name: "حركات الدفع", rows: lines },
  ];
}

function workbookFiles(input: CustomerPaymentHistoryWorkbookInput): { name: string; content: string }[] {
  const sheets = workbookSheets(input);
  const overrides = sheets.map((_sheet, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const names = sheets.map((sheet, index) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
  ).join("");
  const relationships = sheets.map((_sheet, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  ).join("");
  const titles = sheets.map(sheet => "<vt:lpstr>" + xmlEscape(sheet.name) + "</vt:lpstr>").join("");
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" + names + "</sheets><calcPr calcId=\"191029\"/></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — سجل دفعات العميل") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Customer authorized payment history export</dc:subject>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(new Date().toISOString()) + "</dcterms:created></cp:coreProperties>";
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>" + xmlEscape(BUSINESS_BRAND_NAME) + "</Application>" +
    '<TitlesOfParts><vt:vector size="' + sheets.length + '" baseType="lpstr">' + titles + "</vt:vector></TitlesOfParts></Properties>";
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...sheets.map((sheet, index) => ({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(sheet.rows, true),
    })),
  ];
}

export function buildCustomerPaymentHistoryWorkbookXlsx(input: CustomerPaymentHistoryWorkbookInput): Uint8Array {
  return zipStore(workbookFiles(input));
}

export function downloadCustomerPaymentHistoryWorkbookXlsx(input: CustomerPaymentHistoryWorkbookInput): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildCustomerPaymentHistoryWorkbookXlsx(input);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-customer-payment-history.xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
