import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { SupplierAccountActivityPrintDocument } from "@/lib/supplier-account-activity-print";

type Sheet = { name: string; rows: CellValue[][] };

function nullableAmount(value: number | null): CellValue {
  return value === null ? "" : value;
}

function workbookSheets(document: SupplierAccountActivityPrintDocument): Sheet[] {
  const period = document.from || document.to
    ? (document.from || "بداية غير محددة") + " — " + (document.to || "نهاية غير محددة")
    : "جميع التواريخ المتاحة في المصدر";
  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — كشف حركة حسابات الموردين"],
    ["وقت استخراج الملف", document.generatedAt],
    ["تاريخ البيانات حتى", document.asOfDate],
    ["الفترة", period],
    ["إجمالي قيود المصدر ضمن الفترة", document.entryCount],
    ["عدد قيود التفاصيل في هذه الصفحة", document.entries.length],
    ["رقم الصفحة", document.pageNumber],
    ["حد الصفحة", document.limit],
    ["المزيد من القيود", document.hasMore ? "نعم — تابع الصفحة التالية" : "لا — انتهت الصفحات"],
    ["نطاق التفاصيل", "ورقة التفاصيل تشمل الصفحة الحالية فقط؛ لا تمثل كامل دفتر الموردين عند تعدد الصفحات."],
    ["نطاق الإجماليات", "الإجماليات حسب العملة وملخص الموردين من تجميع الخادم للنطاق المحدد."],
    ["مصادر الحركة", "استلامات مشتريات مرحلة، إشعارات دائن مورد مرحلة، ودفعات مورد مرتبطة بقيود مرحلة."],
    ["حالة المسودات", "المسودات والقيود الملغاة والمعكوسة غير معروضة بوصفها حركة مرحلة."],
    ["الدفعات المحجوزة", "تظهر منفصلة؛ لا تخفض المستحق النهائي حتى يتم ترحيل قيد الدفع والتحقق منه."],
    ["الرصيد النهائي", "يظهر فقط عندما balanceComplete=true في استجابة الخادم؛ القيم غير المعروفة تبقى خلايا فارغة."],
    ["حدود الرصيد", "الرصيد الحالي يغطي إيصالات الاستلام المصدرية المتحققة فقط؛ لا يشمل فواتير المورد خارج هذا النموذج أو مصادر الالتزام الخارجية، ولا يتقلص مع فلتر فترة الحركة."],
    ["العملات", "لا تجمع العملات المختلفة ولا تنفذ تحويل صرف."],
    ["الخصوصية", "لا يتضمن الملف معرّفات UUID أو المؤسسة أو المستخدم أو مفاتيح حسابات داخلية."],
    ["حماية الصيغ", "كل النصوص تُخزن كخلايا نصية صريحة؛ لا تُنفّذ صيغ من بيانات المستندات."],
  ];
  const currencies: CellValue[][] = [
    ["العملة", "عدد الحركات", "مدين", "دائن", "صافي حركة الدائن", "دفعات محجوزة غير مرحلة",
      "المتاح لتخصيص دفعة", "المستحق النهائي", "اكتمال تغطية الرصيد"],
    ...document.currencyTotals.map((row) => [
      row.currency, row.activityCount, row.debitTotal, row.creditTotal, row.netCreditMovement,
      nullableAmount(row.pendingPaymentAmount), nullableAmount(row.availableToAllocate),
      nullableAmount(row.remainingPayable), row.balanceComplete ? "مكتمل" : "غير مكتمل — غير معروف",
    ]),
  ];
  const suppliers: CellValue[][] = [
    ["المورد", "العملة", "عدد الحركات", "مدين", "دائن", "صافي الحركة",
      "دفعات محجوزة غير مرحلة", "المتاح للتخصيص", "المستحق النهائي",
      "اكتمال تغطية الرصيد", "آخر حركة"],
    ...document.suppliers.map((row) => [
      row.supplierName, row.currency, row.activityCount, row.debitTotal, row.creditTotal,
      row.netCreditMovement, nullableAmount(row.pendingPaymentAmount),
      nullableAmount(row.availableToAllocate), nullableAmount(row.remainingPayable),
      row.balanceComplete ? "مكتمل" : "غير مكتمل — غير معروف", row.lastActivityDate ?? "",
    ]),
  ];
  const details: CellValue[][] = [
    ["تاريخ القيد", "رقم القيد", "المورد", "العملة", "المستند المرجعي", "رقم أمر الشراء",
      "رقم إيصال الاستلام", "رمز حساب الالتزام", "اسم حساب الالتزام", "النوع", "البيان", "مدين", "دائن"],
    ...document.entries.map((row) => [
      row.entryDate, row.journalEntryNumber, row.supplierName, row.currency,
      row.documentReference, row.purchaseOrderNumber, row.receiptNumber,
      row.payableAccountCode, row.payableAccountName,
      row.sourceType === "purchase_receipt" ? "استلام مشتريات" :
        row.sourceType === "purchase_supplier_credit_note" ? "إشعار دائن للمورد" : "دفعة مورد مرحلة",
      row.description, row.debit, row.credit,
    ]),
  ];
  return [
    { name: "بيانات الكشف", rows: summary },
    { name: "الإجماليات بالعملة", rows: currencies },
    { name: "ملخص الموردين", rows: suppliers },
    { name: "تفاصيل الصفحة", rows: details },
  ];
}

function workbookFiles(document: SupplierAccountActivityPrintDocument): { name: string; content: string }[] {
  const sheets = workbookSheets(document);
  const overrides = sheets.map((_sheet, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const entries = sheets.map((sheet, index) =>
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
    "<sheets>" + entries + "</sheets><calcPr calcId=\"191029\"/></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — كشف حركة حسابات الموردين") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Tenant-scoped supplier activity statement with paginated detail scope</dc:subject>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(document.generatedAt) + "</dcterms:created></cp:coreProperties>";
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

export function buildSupplierAccountActivityWorkbookXlsx(
  document: SupplierAccountActivityPrintDocument,
): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadSupplierAccountActivityWorkbookXlsx(
  document: SupplierAccountActivityPrintDocument,
): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل ملف Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildSupplierAccountActivityWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-supplier-account-activity-" + document.asOfDate + "-page-" + document.pageNumber + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
