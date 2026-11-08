import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { parseLedgerMoneyCents, type LedgerAccountType } from "@/lib/general-ledger";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type TrialBalanceAccount = {
  code: string;
  name: string;
  account_type: LedgerAccountType;
  is_active: boolean;
  debit_total: string;
  credit_total: string;
};

export type TrialBalanceSummary = {
  posted_entry_count: number;
  debit_total: string;
  credit_total: string;
};

export type TrialBalancePeriod = {
  from: string | null;
  to: string | null;
};

type TrialBalanceSheet = { name: string; rows: CellValue[][] };

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new Error("تعذر تصدير ميزان المراجعة: " + label + " غير صالح.");
  }
  return value;
}

function requireCents(value: unknown, label: string): bigint {
  const cents = parseLedgerMoneyCents(value);
  if (cents === null) throw new Error("تعذر تصدير ميزان المراجعة: مبلغ " + label + " غير صالح.");
  return cents;
}

function safeExcelAmount(cents: bigint, label: string): { amount: number; exactCents: number } {
  const exactCents = Number(cents);
  if (!Number.isSafeInteger(exactCents) || BigInt(exactCents) !== cents) {
    throw new Error("تعذر تصدير ميزان المراجعة: قيمة " + label + " تتجاوز الدقة الرقمية الآمنة لملف Excel.");
  }
  return { amount: exactCents / 100, exactCents };
}

function validatePeriod(period: TrialBalancePeriod): void {
  if (
    !period ||
    (period.from !== null && !validIsoDate(period.from)) ||
    (period.to !== null && !validIsoDate(period.to)) ||
    (period.from !== null && period.to !== null && period.from > period.to)
  ) {
    throw new Error("تعذر تصدير ميزان المراجعة: نطاق الفترة غير صالح.");
  }
}

function accountTypeLabel(type: LedgerAccountType): string {
  const labels: Record<LedgerAccountType, string> = {
    asset: "أصل",
    liability: "التزام",
    equity: "حقوق ملكية",
    revenue: "إيراد",
    expense: "مصروف",
  };
  return labels[type];
}

function validateAndNormalize(
  accounts: readonly TrialBalanceAccount[],
  summary: TrialBalanceSummary,
  period: TrialBalancePeriod,
  generatedAt: string,
): { rows: CellValue[][]; summaryRows: CellValue[][]; differenceCents: bigint } {
  validatePeriod(period);
  if (
    !Array.isArray(accounts) ||
    accounts.length > 5000 ||
    !summary ||
    !Number.isSafeInteger(summary.posted_entry_count) ||
    summary.posted_entry_count < 0 ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error("تعذر تصدير ميزان المراجعة: رأس التقرير أو عدد الحسابات غير صالح.");
  }

  const seenCodes = new Set<string>();
  let accountDebitCents = 0n;
  let accountCreditCents = 0n;
  const normalized: Array<{
    code: string;
    name: string;
    type: LedgerAccountType;
    isActive: boolean;
    debitCents: bigint;
    creditCents: bigint;
  }> = [];

  for (const [index, account] of accounts.entries()) {
    if (
      !account ||
      !["asset", "liability", "equity", "revenue", "expense"].includes(account.account_type) ||
      typeof account.is_active !== "boolean"
    ) {
      throw new Error("تعذر تصدير ميزان المراجعة: تصنيف أو حالة الحساب رقم " + (index + 1) + " غير صالحة.");
    }
    const code = requireText(account.code, "رمز الحساب", 64).trim();
    const name = requireText(account.name, "اسم الحساب", 160);
    if (seenCodes.has(code)) throw new Error("تعذر تصدير ميزان المراجعة: رمز الحساب " + code + " مكرر.");
    seenCodes.add(code);

    const debitCents = requireCents(account.debit_total, "مدين " + code);
    const creditCents = requireCents(account.credit_total, "دائن " + code);
    accountDebitCents += debitCents;
    accountCreditCents += creditCents;
    normalized.push({
      code,
      name,
      type: account.account_type,
      isActive: account.is_active,
      debitCents,
      creditCents,
    });
  }

  const summaryDebitCents = requireCents(summary.debit_total, "إجمالي المدين");
  const summaryCreditCents = requireCents(summary.credit_total, "إجمالي الدائن");
  if (
    accountDebitCents !== summaryDebitCents ||
    accountCreditCents !== summaryCreditCents
  ) {
    throw new Error("تعذر تصدير ميزان المراجعة: مجموع تفاصيل الحسابات لا يطابق إجمالي القيود المرحلة.");
  }

  const differenceCents = summaryDebitCents - summaryCreditCents;
  const details: CellValue[][] = [[
    "رمز الحساب",
    "اسم الحساب",
    "نوع الحساب",
    "حالة الحساب",
    "إجمالي المدين (ر.ي)",
    "إجمالي الدائن (ر.ي)",
    "صافي الحركة (مدين − دائن) (ر.ي)",
    "المدين (قروش)",
    "الدائن (قروش)",
    "الصافي (قروش)",
  ]];

  for (const account of normalized) {
    const debit = safeExcelAmount(account.debitCents, "مدين " + account.code);
    const credit = safeExcelAmount(account.creditCents, "دائن " + account.code);
    const net = safeExcelAmount(account.debitCents - account.creditCents, "صافي " + account.code);
    details.push([
      account.code,
      account.name,
      accountTypeLabel(account.type),
      account.isActive ? "نشط" : "غير نشط",
      debit.amount,
      credit.amount,
      net.amount,
      debit.exactCents,
      credit.exactCents,
      net.exactCents,
    ]);
  }

  const totalDebit = safeExcelAmount(summaryDebitCents, "إجمالي المدين");
  const totalCredit = safeExcelAmount(summaryCreditCents, "إجمالي الدائن");
  const difference = safeExcelAmount(differenceCents, "فرق الميزان");
  details.push([
    "",
    "الإجمالي",
    "",
    "",
    totalDebit.amount,
    totalCredit.amount,
    difference.amount,
    totalDebit.exactCents,
    totalCredit.exactCents,
    difference.exactCents,
  ]);

  const fromLabel = period.from ?? "كل الفترات حتى تاريخ اليوم حسب المصدر";
  const toLabel = period.to ?? "غير محدد";
  const statusLabel = differenceCents === 0n ? "متوازن" : "غير متوازن — يتطلب التحقيق";
  const summaryRows: CellValue[][] = [
    ["البيان", "القيمة", "القيمة الصحيحة بالقروش"],
    ["التقرير", BUSINESS_BRAND_NAME + " — ميزان المراجعة"],
    ["من تاريخ", fromLabel],
    ["إلى تاريخ", toLabel],
    ["الحسابات المصدرة", normalized.length],
    ["القيود المرحلة الداخلة في الميزان", summary.posted_entry_count],
    ["إجمالي المدين (ر.ي)", totalDebit.amount, totalDebit.exactCents],
    ["إجمالي الدائن (ر.ي)", totalCredit.amount, totalCredit.exactCents],
    ["فرق الميزان (مدين − دائن)", difference.amount, difference.exactCents],
    ["حالة الميزان", statusLabel],
    ["حد الحسابات", "يشمل جميع حسابات المؤسسة، النشطة وغير النشطة، ولا يقتصر على صفحة قيود اليومية أو رقم صفحتها."],
    ["مصدر الرصيد", "حركات القيود المرحلة فقط ضمن الفترة المحددة؛ المسودات والقيود الملغاة لا تدخل في الإجماليات."],
    ["مرشح الحساب", "اختيار حساب لتصفية قائمة قيود اليومية لا يغيّر نطاق ميزان المراجعة؛ الميزان يتضمن جميع الحسابات."],
    ["سياسة البيانات", "لا تُنشأ أرصدة افتتاحية أو قيود تاريخية افتراضية، ولا تتضمن الورقة معرفات داخلية أو بيانات المؤسسة الحساسة."],
  ];
  return { rows: details, summaryRows, differenceCents };
}

function workbookFiles(
  accounts: readonly TrialBalanceAccount[],
  summary: TrialBalanceSummary,
  period: TrialBalancePeriod,
  generatedAt: string,
): { name: string; content: string }[] {
  const normalized = validateAndNormalize(accounts, summary, period, generatedAt);
  const sheets: TrialBalanceSheet[] = [
    { name: "الملخص", rows: normalized.summaryRows },
    { name: "ميزان المراجعة", rows: normalized.rows },
    {
      name: "المنهجية والحدود",
      rows: [
        ["البيان", "التوضيح"],
        ["التعريف", "ميزان مراجعة إجمالي من جميع حسابات المؤسسة في النطاق الزمني المحدد."],
        ["مستوى التفصيل", "صف واحد لكل حساب؛ لا يعتمد على ترقيم صفحة القيود المعروضة في الواجهة."],
        ["الحالة", normalized.differenceCents === 0n ? "إجمالي المدين يساوي إجمالي الدائن." : "تم الحفاظ على الفرق الفعلي ولم تتم تسويته تلقائيًا."],
        ["التقريب", "تُحسب المطابقة بالقروش كأعداد صحيحة. يرفض التصدير إذا تعذر تمثيل قيمة القروش بأمان في Excel."],
        ["حدود المصدر", "تعكس البيانات القيود المرحلة فقط. المعاملات غير المرتبطة بقيد محاسبي لا تدخل في هذا الميزان."],
        ["الخصوصية", "الملف لا يحتوي معرفات الحسابات الداخلية أو معرفات المستخدمين أو المؤسسة أو تفاصيل القيود."],
        ["تاريخ الإنشاء", generatedAt],
      ],
    },
  ];

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
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — ميزان المراجعة") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Tenant-scoped posted-ledger trial balance</dc:subject>" +
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

export function buildTrialBalanceWorkbookXlsx(
  accounts: readonly TrialBalanceAccount[],
  summary: TrialBalanceSummary,
  period: TrialBalancePeriod,
  generatedAt = new Date().toISOString(),
): Uint8Array {
  return zipStore(workbookFiles(accounts, summary, period, generatedAt));
}

export function downloadTrialBalanceWorkbookXlsx(
  accounts: readonly TrialBalanceAccount[],
  summary: TrialBalanceSummary,
  period: TrialBalancePeriod,
  generatedAt = new Date().toISOString(),
): void {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildTrialBalanceWorkbookXlsx(accounts, summary, period, generatedAt);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const periodLabel = (period.from ?? "all") + "-" + (period.to ?? "all");
  anchor.download = "aghbari-trial-balance-" + periodLabel + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
