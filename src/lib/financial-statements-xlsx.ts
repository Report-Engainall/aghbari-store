import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { FinancialStatementsPrintDocument } from "@/lib/general-journal-print";

type Sheet = { name: string; rows: CellValue[][] };

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new Error("تعذر تصدير القوائم المالية: قيمة " + label + " غير صالحة.");
  }
  return value;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requireCents(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") {
    throw new Error("تعذر تصدير القوائم المالية: مبلغ " + label + " ليس عددًا صحيحًا بالقروش.");
  }
  return value;
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function safeExcelAmount(cents: bigint, label: string): { amount: number; exactCents: number } {
  const exactCents = Number(cents);
  if (!Number.isSafeInteger(exactCents) || BigInt(exactCents) !== cents) {
    throw new Error("تعذر تصدير القوائم المالية: قيمة " + label + " تتجاوز الدقة الرقمية الآمنة لملف Excel.");
  }
  return { amount: exactCents / 100, exactCents };
}

function validateDocument(document: FinancialStatementsPrintDocument, generatedAt: string): void {
  if (
    !document ||
    document.kind !== "statements" ||
    !validIsoDate(document.periodFrom) ||
    !validIsoDate(document.periodTo) ||
    document.periodFrom > document.periodTo ||
    !Number.isSafeInteger(document.postedEntryCount) ||
    document.postedEntryCount < 0 ||
    !Array.isArray(document.incomeLines) ||
    !Array.isArray(document.balanceLines) ||
    document.incomeLines.length > 1000 ||
    document.balanceLines.length > 1000 ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error("تعذر تصدير القوائم المالية: بيانات التقرير أو الفترة غير مكتملة.");
  }

  const incomeTypes = new Set(["revenue", "expense"]);
  const balanceTypes = new Set(["asset", "liability", "equity"]);
  for (const line of document.incomeLines) {
    requireText(line?.code, "رمز حساب الدخل", 64);
    requireText(line?.name, "اسم حساب الدخل", 160);
    if (!incomeTypes.has(line.accountType)) {
      throw new Error("تعذر تصدير القوائم المالية: تصنيف حساب الدخل غير صالح.");
    }
    requireCents(line.amountCents, "حساب الدخل");
  }
  for (const line of document.balanceLines) {
    requireText(line?.code, "رمز حساب المركز المالي", 64);
    requireText(line?.name, "اسم حساب المركز المالي", 160);
    if (!balanceTypes.has(line.accountType)) {
      throw new Error("تعذر تصدير القوائم المالية: تصنيف حساب المركز المالي غير صالح.");
    }
    requireCents(line.amountCents, "حساب المركز المالي");
  }

  const revenue = sum(document.incomeLines.filter((line) => line.accountType === "revenue").map((line) => line.amountCents));
  const expense = sum(document.incomeLines.filter((line) => line.accountType === "expense").map((line) => line.amountCents));
  const assets = sum(document.balanceLines.filter((line) => line.accountType === "asset").map((line) => line.amountCents));
  const liabilities = sum(document.balanceLines.filter((line) => line.accountType === "liability").map((line) => line.amountCents));
  const equity = sum(document.balanceLines.filter((line) => line.accountType === "equity").map((line) => line.amountCents));

  if (
    revenue !== requireCents(document.revenueCents, "إجمالي الإيرادات") ||
    expense !== requireCents(document.expenseCents, "إجمالي المصروفات") ||
    document.netIncomeCents !== revenue - expense ||
    assets !== requireCents(document.assetsCents, "إجمالي الأصول") ||
    liabilities !== requireCents(document.liabilitiesCents, "إجمالي الالتزامات") ||
    equity !== requireCents(document.equityCents, "إجمالي حقوق الملكية") ||
    document.liabilitiesEquityAndEarningsCents !== liabilities + equity + requireCents(document.cumulativeEarningsCents, "الأرباح المتراكمة") ||
    document.balanceDifferenceCents !== assets - document.liabilitiesEquityAndEarningsCents
  ) {
    throw new Error("تعذر تصدير القوائم المالية: تفاصيل الحسابات لا تتطابق مع الإجماليات المحفوظة.");
  }
}

function workbookSheets(document: FinancialStatementsPrintDocument, generatedAt: string): Sheet[] {
  validateDocument(document, generatedAt);
  const summary: CellValue[][] = [
    ["المؤشر", "القيمة (ر.ي)", "القيمة بالقروش"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — القوائم المالية"],
    ["فترة قائمة الدخل", document.periodFrom + " إلى " + document.periodTo],
    ["تاريخ استخراج الملف", generatedAt],
    ["عدد القيود المرحلة في الفترة", document.postedEntryCount],
  ];
  const summaryMetrics: Array<[string, bigint]> = [
    ["إجمالي الإيرادات", document.revenueCents],
    ["إجمالي المصروفات", document.expenseCents],
    ["صافي نتيجة الفترة", document.netIncomeCents],
    ["إجمالي الأصول حتى تاريخ النهاية", document.assetsCents],
    ["إجمالي الالتزامات", document.liabilitiesCents],
    ["إجمالي حقوق الملكية", document.equityCents],
    ["الأرباح/الخسائر المتراكمة غير المقفلة", document.cumulativeEarningsCents],
    ["الالتزامات وحقوق الملكية والأرباح المتراكمة", document.liabilitiesEquityAndEarningsCents],
    ["فرق معادلة الميزانية", document.balanceDifferenceCents],
  ];
  for (const [label, cents] of summaryMetrics) {
    const value = safeExcelAmount(cents, label);
    summary.push([label, value.amount, value.exactCents]);
  }
  summary.push(
    ["حالة المعادلة", document.balanceDifferenceCents === 0n ? "متوازنة ضمن القيود المرحلة" : "غير متوازنة — يلزم التحقيق"],
    ["مصدر التقرير", "قيود اليومية المرحلة في دفتر الأستاذ العام للمؤسسة النشطة."],
    ["حدود التقرير", "لا يشمل الفواتير أو التحصيلات أو المصروفات غير المرتبطة بقيود مرحلة."],
    ["سياسة الأرصدة", "لم تُنشأ أرصدة افتتاحية أو قيود تاريخية افتراضية."],
    ["دقة المبالغ", "تتضمن التفاصيل القيمة بالعملة والقيمة الصحيحة بالقروش للتحقق."],
    ["الحقول المستبعدة", "لا يتضمن الملف معرفات الحسابات الداخلية أو المؤسسة أو المستخدمين أو المراجع الداخلية."],
  );

  const income: CellValue[][] = [
    ["رمز الحساب", "اسم الحساب", "نوع الحساب", "صافي الفترة (ر.ي)", "القيمة الصحيحة بالقروش"],
  ];
  for (const line of document.incomeLines) {
    const value = safeExcelAmount(line.amountCents, "حساب " + line.code);
    income.push([
      line.code,
      line.name,
      line.accountType === "revenue" ? "إيراد" : "مصروف",
      value.amount,
      value.exactCents,
    ]);
  }
  income.push(
    ["", "إجمالي الإيرادات", "", safeExcelAmount(document.revenueCents, "الإيرادات").amount, safeExcelAmount(document.revenueCents, "الإيرادات").exactCents],
    ["", "إجمالي المصروفات", "", safeExcelAmount(document.expenseCents, "المصروفات").amount, safeExcelAmount(document.expenseCents, "المصروفات").exactCents],
    ["", "صافي نتيجة الفترة", "", safeExcelAmount(document.netIncomeCents, "نتيجة الفترة").amount, safeExcelAmount(document.netIncomeCents, "نتيجة الفترة").exactCents],
  );

  const balance: CellValue[][] = [
    ["رمز الحساب", "اسم الحساب", "تصنيف الحساب", "الرصيد الطبيعي حتى تاريخ النهاية (ر.ي)", "القيمة الصحيحة بالقروش"],
  ];
  for (const line of document.balanceLines) {
    const value = safeExcelAmount(line.amountCents, "حساب " + line.code);
    const label = line.accountType === "asset" ? "أصل" : line.accountType === "liability" ? "التزام" : "حقوق ملكية";
    balance.push([line.code, line.name, label, value.amount, value.exactCents]);
  }
  const totals: Array<[string, bigint]> = [
    ["إجمالي الأصول", document.assetsCents],
    ["إجمالي الالتزامات", document.liabilitiesCents],
    ["إجمالي حقوق الملكية", document.equityCents],
    ["الأرباح/الخسائر المتراكمة", document.cumulativeEarningsCents],
    ["الالتزامات وحقوق الملكية والأرباح المتراكمة", document.liabilitiesEquityAndEarningsCents],
    ["فرق معادلة الميزانية", document.balanceDifferenceCents],
  ];
  balance.push(...totals.map(([label, cents]) => {
    const value = safeExcelAmount(cents, label);
    return ["", label, "", value.amount, value.exactCents];
  }));

  const notes: CellValue[][] = [
    ["البيان", "التفسير"],
    ["طبيعة الأرقام", "الأرقام مستخرجة من القيود المرحلة فقط؛ المسودات والقيود الملغاة لا تدخل في الأرصدة."],
    ["قائمة الدخل", "صافي الإيراد والمصروف للفترة المحددة أعلاه."],
    ["المركز المالي", "الأصول والالتزامات وحقوق الملكية تراكميًا حتى تاريخ نهاية الفترة."],
    ["الأرباح المتراكمة", "محسوبة من إيراد ومصروف القيود حتى تاريخ نهاية الفترة؛ لم تُنفذ قيود إقفال افتراضية."],
    ["فرق الميزانية", "الأصول ناقص الالتزامات وحقوق الملكية والأرباح المتراكمة؛ لا يُصفّر الفرق تلقائيًا."],
    ["حدود المطابقة", "الفواتير والتحصيلات والمدفوعات التي لم تُربط بقيود محاسبية لا تدخل في هذا التقرير."],
    ["نطاق الصلاحية", "يُنشأ الملف داخل واجهة دفتر الأستاذ المالية بعد تحقق صلاحية المحاسب أو المدير أو المسؤول."],
  ];

  return [
    { name: "ملخص القوائم", rows: summary },
    { name: "قائمة الدخل", rows: income },
    { name: "المركز المالي", rows: balance },
    { name: "منهجية وحدود", rows: notes },
  ];
}

function workbookFiles(document: FinancialStatementsPrintDocument, generatedAt: string): { name: string; content: string }[] {
  const sheets = workbookSheets(document, generatedAt);
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
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — القوائم المالية") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Tenant-scoped posted-ledger financial statements</dc:subject>" +
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

export function buildFinancialStatementsWorkbookXlsx(
  document: FinancialStatementsPrintDocument,
  generatedAt = new Date().toISOString(),
): Uint8Array {
  return zipStore(workbookFiles(document, generatedAt));
}

export function downloadFinancialStatementsWorkbookXlsx(
  statementDocument: FinancialStatementsPrintDocument,
  generatedAt = new Date().toISOString(),
): void {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildFinancialStatementsWorkbookXlsx(statementDocument, generatedAt);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-financial-statements-" + statementDocument.periodFrom + "-" + statementDocument.periodTo + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
