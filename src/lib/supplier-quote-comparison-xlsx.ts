import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { SupplierQuoteComparisonDocument } from "@/lib/supplier-quote-comparison-print";

type Sheet = { name: string; rows: CellValue[][] };

function sheets(document: SupplierQuoteComparisonDocument): Sheet[] {
  const scope: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — مقارنة عروض الموردين"],
    ["وقت استخراج المقارنة", document.generatedAt],
    ["عدد عروض الموردين", document.quoteCount],
    ["عدد بنود العروض", document.lineCount],
    ["العملات الموجودة", document.currencies.join("، ") || "لا توجد عملات"],
    ["مصدر التقرير", "لقطة عروض الموردين المحفوظة التي أعادها الخادم في وقت الاستخراج."],
    ["نطاق المقارنة", "المقارنة حسب الصنف والعملة. لا تجمع العملات ولا تنفذ تحويل صرف."],
    ["معنى الأقل تكلفة", "أقل تكلفة وحدة مسجلة بين العروض ذات الحالة (مستلم قابل للمقارنة) فقط؛ ليست توصية جودة أو قرار ترسية."],
    ["العروض المرسّاة", "تظل ظاهرة في سجل العروض، لكنها لا تدخل في ترتيب أقل تكلفة للعروض القابلة للمقارنة."],
    ["الحقول المستبعدة", "ملاحظات العرض الداخلية ومعرفات UUID ومعرفات المؤسسة والحسابات لا تصدر في الملف."],
    ["أمر الشراء", "العرض المحفوظ لا يعني تلقائيًا أن أمر شراء اعتمد أو أرسل أو استُلم؛ راجع سجل أوامر الشراء."],
  ];
  const offers: CellValue[][] = [
    ["المورد", "رمز المورد", "رقم العرض", "مرجع المورد", "الحالة", "العملة",
      "عدد البنود", "إجمالي العرض", "مدة التوريد (يوم)", "صالح حتى", "شروط الدفع", "تاريخ التسجيل"],
    ...document.offers.map((row) => [
      row.supplierName, row.supplierCode, row.quoteNumber, row.supplierReference ?? "",
      row.statusLabel, row.currency, row.lineCount, row.total,
      row.deliveryDays ?? "", row.validUntil ?? "", row.paymentTerms ?? "", row.createdAt,
    ]),
  ];
  const products: CellValue[][] = [
    ["الصنف", "رمز الصنف", "الوحدة", "العملة", "عدد العروض القابلة للمقارنة",
      "أقل تكلفة وحدة", "المورد الأقل تكلفة", "رقم عرضه", "مدة توريده (يوم)"],
    ...document.products.map((row) => [
      row.productName, row.itemCode, row.unit ?? "", row.currency, row.receivedOfferCount,
      row.lowestUnitCost ?? "", row.lowestSupplierName ?? "", row.lowestQuoteNumber ?? "",
      row.lowestDeliveryDays ?? "",
    ]),
  ];
  const details: CellValue[][] = [
    ["المورد", "رقم العرض", "الصنف", "رمز الصنف", "الكمية", "الوحدة",
      "تكلفة الوحدة", "إجمالي البند", "العملة", "الحالة", "الأقل تكلفة ضمن العروض القابلة للمقارنة"],
    ...document.lines.map((row) => [
      row.supplierName, row.quoteNumber, row.productName, row.itemCode, row.quantity,
      row.unit ?? "", row.unitCost, row.lineTotal, row.currency, row.statusLabel,
      row.isLowestComparableCost ? "نعم" : "لا",
    ]),
  ];
  return [
    { name: "نطاق المقارنة", rows: scope },
    { name: "العروض وشروطها", rows: offers },
    { name: "مقارنة الأصناف", rows: products },
    { name: "تفاصيل البنود", rows: details },
  ];
}

function workbookFiles(document: SupplierQuoteComparisonDocument): { name: string; content: string }[] {
  const data = sheets(document);
  const overrides = data.map((_sheet, i) =>
    '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const entries = data.map((sheet, i) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'
  ).join("");
  const relationships = data.map((_sheet, i) =>
    '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'
  ).join("");
  const titles = data.map((sheet) => "<vt:lpstr>" + xmlEscape(sheet.name) + "</vt:lpstr>").join("");
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
    "<sheets>" + entries + "</sheets></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — مقارنة عروض الموردين") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator></cp:coreProperties>";
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>" + xmlEscape(BUSINESS_BRAND_NAME) + "</Application>" +
    '<TitlesOfParts><vt:vector size="' + data.length + '" baseType="lpstr">' + titles + "</vt:vector></TitlesOfParts></Properties>";
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...data.map((sheet, index) => ({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(sheet.rows, true),
    })),
  ];
}

export function buildSupplierQuoteComparisonWorkbookXlsx(
  document: SupplierQuoteComparisonDocument,
): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadSupplierQuoteComparisonWorkbookXlsx(
  document: SupplierQuoteComparisonDocument,
): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل ملف Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildSupplierQuoteComparisonWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-supplier-quote-comparison-" +
    new Date(document.generatedAt).toISOString().slice(0, 10) + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
