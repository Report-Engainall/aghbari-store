import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type CustomerInvoiceWorkbookInput = {
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt: string | null;
  currency: string;
  customer: {
    code: string;
    businessName: string;
    contactName: string | null;
    tierLabel: string | null;
  };
  items: readonly {
    itemCode: string | null;
    description: string;
    unit: string | null;
    quantity: number | string;
    unitPrice?: number | string;
    lineTotal?: number | string;
  }[];
  financialDetailsVisible: boolean;
  financials: null | {
    subtotal: number | string;
    taxAmount: number | string;
    totalAmount: number | string;
  };
};

type Sheet = { name: string; rows: CellValue[][] };

function textValue(value: string, label: string, optional = false): string {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > 4000) {
    throw new Error("تعذر تصدير الفاتورة: حقل " + label + " غير صالح.");
  }
  return value.trim();
}

function amountValue(value: number | string, label: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1_000_000_000_000) {
    throw new Error("تعذر تصدير الفاتورة: قيمة " + label + " غير صالحة.");
  }
  return amount;
}

function invoiceStatusLabel(status: string): string {
  switch (status) {
    case "paid": return "مدفوعة";
    case "partially_paid": return "مدفوعة جزئيًا";
    case "void": return "ملغاة";
    case "issued": return "صادرة";
    default: return textValue(status, "حالة الفاتورة");
  }
}

function buildSheets(input: CustomerInvoiceWorkbookInput, generatedAt: string): Sheet[] {
  const invoiceNumber = textValue(input.invoiceNumber, "رقم الفاتورة");
  const status = invoiceStatusLabel(input.status);
  const issuedAt = textValue(input.issuedAt, "تاريخ الإصدار");
  const dueAt = input.dueAt === null ? "" : textValue(input.dueAt, "تاريخ الاستحقاق");
  const currency = textValue(input.currency, "العملة");
  const customerName = textValue(
    input.customer.businessName || input.customer.contactName || "غير مسجل",
    "اسم العميل",
  );
  const customerCode = textValue(input.customer.code, "رمز العميل", true);
  const tierLabel = input.customer.tierLabel === null
    ? ""
    : textValue(input.customer.tierLabel, "فئة العميل");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 500) {
    throw new Error("تعذر تصدير الفاتورة: عدد البنود غير صالح أو يتجاوز 500 بند.");
  }
  if (input.financialDetailsVisible !== (input.financials !== null)) {
    throw new Error("تعذر تصدير الفاتورة: حالة إظهار القيم المالية لا تطابق بياناتها.");
  }

  const visibleItems = input.items.map((item, index) => {
    const description = textValue(item.description, "وصف البند " + (index + 1));
    const quantity = amountValue(item.quantity, "كمية البند " + (index + 1));
    if (quantity <= 0) throw new Error("تعذر تصدير الفاتورة: يجب أن تكون كمية كل بند أكبر من صفر.");
    if (input.financialDetailsVisible) {
      if (item.unitPrice === undefined || item.lineTotal === undefined) {
        throw new Error("تعذر تصدير الفاتورة: بيانات أسعار البنود المصرح بها غير مكتملة.");
      }
      return {
        description,
        itemCode: item.itemCode ?? "",
        unit: item.unit ?? "",
        quantity,
        unitPrice: amountValue(item.unitPrice, "سعر البند " + (index + 1)),
        lineTotal: amountValue(item.lineTotal, "إجمالي البند " + (index + 1)),
      };
    }
    if (item.unitPrice !== undefined || item.lineTotal !== undefined) {
      throw new Error("تعذر تصدير الفاتورة: رُصدت قيمة مالية رغم إخفاء الأسعار.");
    }
    return {
      description,
      itemCode: item.itemCode ?? "",
      unit: item.unit ?? "",
      quantity,
    };
  });

  const summaryRows: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — فاتورة العميل"],
    ["رقم الفاتورة", invoiceNumber],
    ["الحالة", status],
    ["تاريخ الإصدار", issuedAt],
    ["تاريخ الاستحقاق", dueAt || "غير محدد"],
    ["العملة", currency],
    ["اسم العميل", customerName],
    ["رمز العميل", customerCode],
    ...(tierLabel ? [["فئة العميل", tierLabel] as CellValue[]] : []),
    ["وقت استخراج الملف", generatedAt],
    ...(input.financialDetailsVisible && input.financials ? [
      ["الإجمالي الفرعي", amountValue(input.financials.subtotal, "الإجمالي الفرعي")],
      ["الضريبة", amountValue(input.financials.taxAmount, "الضريبة")],
      ["الإجمالي", amountValue(input.financials.totalAmount, "الإجمالي")],
    ] as CellValue[][] : [
      ["القيم المالية", "مخفية وفق صلاحية الفاتورة وإعدادات المتجر؛ لم تُدرج في الملف."],
    ]),
    ["مصدر المستند", "لقطة تفاصيل الفاتورة التي أعادها RPC المخصص لحساب العميل بعد التحقق من صلاحية الوصول."],
    ["الحدود المحاسبية", "هذا الملف نسخة من الفاتورة ولا يمثل إيصال قبض أو إثبات استلام دفعة."],
    ["الخصوصية", "لا يتضمن معرّفات UUID أو المؤسسة أو المستخدم أو بيانات التكلفة أو الهامش أو الأسعار غير المصرح بها."],
    ["حماية النصوص", "تُخزن النصوص كخلايا نصية صريحة؛ لا تُنفذ صيغ Excel من بيانات الفاتورة."],
  ];
  const itemRows: CellValue[][] = [
    input.financialDetailsVisible
      ? ["وصف الصنف", "رمز الصنف", "الوحدة", "الكمية", "سعر الوحدة", "إجمالي البند"]
      : ["وصف الصنف", "رمز الصنف", "الوحدة", "الكمية"],
    ...visibleItems.map((item) => input.financialDetailsVisible
      ? [
          item.description, item.itemCode, item.unit, item.quantity,
          "unitPrice" in item ? item.unitPrice : null,
          "lineTotal" in item ? item.lineTotal : null,
        ]
      : [item.description, item.itemCode, item.unit, item.quantity]),
  ];
  const scopeRows: CellValue[][] = [
    ["حدود المستند", "التوضيح"],
    ["مصدر البيانات", "بيانات الفاتورة وبنودها المعادة للحساب الحالي من الخادم؛ لم تُنشأ قراءة بديلة."],
    ["الأسعار", input.financialDetailsVisible ? "تظهر فقط القيم المالية المصرح بها في استجابة الفاتورة." : "حُجبت الأسعار والإجماليات ولم تُدرج في المصنف."],
    ["السداد", "حالة الفاتورة لا تُنشئ إثبات قبض؛ يُرجع إلى سجل الدفعات والإيصالات المعتمدة للتحقق من السداد."],
    ["حقول غير موجودة", "لا يضيف الملف ضرائب أو خصومات أو أرصدة مدفوعة أو متبقية لم تتضمنها لقطة الفاتورة."],
  ];
  return [
    { name: "بيانات الفاتورة", rows: summaryRows },
    { name: "بنود الفاتورة", rows: itemRows },
    { name: "نطاق المستند", rows: scopeRows },
  ];
}

function workbookFiles(input: CustomerInvoiceWorkbookInput): { name: string; content: string }[] {
  const generatedAt = new Date().toISOString();
  const sheets = buildSheets(input, generatedAt);
  const overrides = sheets.map((_sheet, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const sheetEntries = sheets.map((sheet, index) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
  ).join("");
  const relationships = sheets.map((_sheet, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  ).join("");
  const titles = sheets.map((sheet) => "<vt:lpstr>" + xmlEscape(sheet.name) + "</vt:lpstr>").join("");
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
    "<sheets>" + sheetEntries + "</sheets><calcPr calcId=\"191029\"/></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — فاتورة العميل") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Server-approved customer invoice snapshot</dc:subject>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(generatedAt) + "</dcterms:created></cp:coreProperties>";
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

export function buildCustomerInvoiceWorkbookXlsx(input: CustomerInvoiceWorkbookInput): Uint8Array {
  return zipStore(workbookFiles(input));
}

export function downloadCustomerInvoiceWorkbookXlsx(input: CustomerInvoiceWorkbookInput): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildCustomerInvoiceWorkbookXlsx(input);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  const safeNumber = input.invoiceNumber.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-").replace(/^-+|-+$/g, "");
  anchor.href = url;
  anchor.download = "aghbari-customer-invoice-" + (safeNumber || "document") + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
