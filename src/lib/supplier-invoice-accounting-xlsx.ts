import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { worksheetXml, zipStore, xmlEscape, type CellValue } from "@/lib/onyx-export";
import type { SupplierInvoiceAccountingPrintDocument } from "@/lib/supplier-invoice-accounting-print";

type WorkbookSheet = { name: string; rows: CellValue[][] };

function moneyCents(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("مبلغ " + label + " غير صالح في ملف تسوية فاتورة المورد.");
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

function formatCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? "-" : "") + (absolute / 100n).toString() + "." +
    (absolute % 100n).toString().padStart(2, "0");
}

function quantityMilli(value: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(value)) {
    throw new Error("كمية غير صالحة في ملف تسوية فاتورة المورد.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

function roundedSourceCents(quantity: string, unitCost: string): bigint {
  return (quantityMilli(quantity) * moneyCents(unitCost, "تكلفة الاستلام") + 500n) / 1000n;
}

function requireText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في ملف تسوية فاتورة المورد.");
  }
  return value;
}

function matchLabel(status: SupplierInvoiceAccountingPrintDocument["matchStatus"]): string {
  if (status === "matched") return "مطابقة ثلاثية";
  if (status === "variance_approved") return "فرق سعر معتمد بمراجعة مستقلة";
  if (status === "variance_pending") return "فرق سعر بانتظار المراجعة";
  return "فرق سعر مرفوض";
}

function accountingLabel(status: SupplierInvoiceAccountingPrintDocument["accountingStatus"]): string {
  if (status === "no_adjustment_required") return "مطابقة دون قيد إضافي";
  if (status === "journal_draft_created") return "مسودة قيد غير مرحلة";
  if (status === "journal_posted") return "قيد التسوية مرحّل";
  if (status === "journal_void") return "مسودة التسوية ملغاة";
  if (status === "journal_reversed") return "قيد التسوية له قيد عكس";
  return "لم تُعد التسوية المحاسبية";
}

function validateDocument(document: SupplierInvoiceAccountingPrintDocument): {
  sourceCents: bigint;
  subtotalCents: bigint;
  varianceCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
  adjustmentCents: bigint;
} {
  if (!document || typeof document !== "object" || !Array.isArray(document.lines) ||
      document.lines.length < 1 || document.lines.length > 100 ||
      !/^[A-Z]{3}$/.test(document.currency) || !Number.isFinite(Date.parse(document.generatedAt))) {
    throw new Error("رأس ملف التسوية أو نطاق البنود غير صالح؛ أوقف التصدير.");
  }
  requireText(document.supplierName, "اسم المورد");
  requireText(document.invoiceNumber, "رقم الفاتورة", 100);
  requireText(document.purchaseOrderNumber, "أمر الشراء", 80);
  requireText(document.invoiceDate, "تاريخ الفاتورة", 40);

  const sourceCents = moneyCents(document.sourceMerchandiseAmount, "تكلفة الاستلام المصدرية");
  const subtotalCents = moneyCents(document.invoiceMerchandiseSubtotal, "قيمة الفاتورة");
  const varianceCents = moneyCents(document.merchandiseVarianceAmount, "فرق التكلفة");
  const taxCents = moneyCents(document.taxAmount, "الضريبة");
  const totalCents = moneyCents(document.invoiceTotalAmount, "إجمالي الفاتورة");
  const adjustmentCents = moneyCents(document.netAdjustmentAmount, "تعديل الالتزام");

  const lineSource = document.lines.reduce((sum, line) =>
    sum + roundedSourceCents(line.quantity, line.receivedUnitCost), 0n);
  const lineInvoice = document.lines.reduce((sum, line) =>
    sum + moneyCents(line.invoiceLineTotal, "قيمة بند الفاتورة"), 0n);

  if (lineSource !== sourceCents || lineInvoice !== subtotalCents ||
      subtotalCents - sourceCents !== varianceCents ||
      subtotalCents + taxCents !== totalCents ||
      totalCents - sourceCents !== adjustmentCents) {
    throw new Error("لا تتطابق بنود Excel مع مجاميع التسوية المصدرية؛ أوقف التصدير.");
  }

  if ((document.accountingStatus === "no_adjustment_required" &&
      (varianceCents !== 0n || taxCents !== 0n || adjustmentCents !== 0n)) ||
      (document.accountingStatus === "journal_draft_created" &&
      (!document.journalEntryNumber || document.journalStatus !== "draft")) ||
      (document.accountingStatus === "journal_posted" &&
      (!document.journalEntryNumber || document.journalStatus !== "posted")) ||
      (document.accountingStatus === "journal_void" &&
      (!document.journalEntryNumber || document.journalStatus !== "void")) ||
      (document.accountingStatus === "journal_reversed" &&
      (!document.journalEntryNumber || document.journalStatus !== "posted"))) {
    throw new Error("حالة القيد لا تطابق ملف التسوية؛ أوقف التصدير.");
  }
  return { sourceCents, subtotalCents, varianceCents, taxCents, totalCents, adjustmentCents };
}

function accountRow(account: SupplierInvoiceAccountingPrintDocument["payableAccount"]): string {
  return account ? account.code + " — " + account.name : "غير محفوظ";
}

function workbookSheets(document: SupplierInvoiceAccountingPrintDocument): WorkbookSheet[] {
  const totals = validateDocument(document);
  const amountDirection = totals.adjustmentCents > 0n
    ? "زيادة التزام المورد"
    : totals.adjustmentCents < 0n
      ? "تخفيض التزام المورد"
      : "لا يوجد تعديل على التزام المورد";

  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — محضر تسوية فاتورة مورد"],
    ["وقت استخراج الملف", document.generatedAt],
    ["المورد", document.supplierName],
    ["رقم فاتورة المورد", document.invoiceNumber],
    ["تاريخ الفاتورة", document.invoiceDate],
    ["رقم أمر الشراء", document.purchaseOrderNumber],
    ["العملة", document.currency],
    ["حالة المطابقة الثلاثية", matchLabel(document.matchStatus)],
    ["الحالة المحاسبية", accountingLabel(document.accountingStatus)],
    ["رقم قيد التسوية", document.journalEntryNumber ?? "—"],
    ["حالة القيد", document.journalStatus === "draft" ? "مسودة" :
      document.journalStatus === "posted" ? "مرحّل" : document.journalStatus === "void" ? "ملغى" : "لا يوجد قيد"],
    ["تكلفة الكميات المفوترة وفق الاستلام", formatCents(totals.sourceCents) + " " + document.currency],
    ["قيمة بنود فاتورة المورد", formatCents(totals.subtotalCents) + " " + document.currency],
    ["فرق قيمة البنود عن تكلفة الاستلام", formatCents(totals.varianceCents) + " " + document.currency],
    ["الضريبة الموثقة", formatCents(totals.taxCents) + " " + document.currency],
    ["إجمالي فاتورة المورد", formatCents(totals.totalCents) + " " + document.currency],
    ["صافي تعديل الالتزام", formatCents(totals.adjustmentCents) + " " + document.currency],
    ["اتجاه تعديل حساب المورد", amountDirection],
    ["حساب الدائن الأصلي", accountRow(document.payableAccount)],
    ["حساب الضريبة المختار", accountRow(document.taxAccount)],
    ["حساب فرق التكلفة المختار", accountRow(document.varianceAccount)],
    ["عدد البنود المصدرة", document.lines.length],
    ["حدود الملف", "يحتوي جميع بنود الفاتورة المحفوظة؛ الحد الأقصى 100 بند."],
    ["الدقة", "المبالغ محفوظة كنص عشري من منزلتين؛ لا يعاد احتسابها بأرقام Excel الثنائية."],
    ["حماية الصيغ", "كل النصوص مخزنة كخلايا نصية صريحة؛ لا ينفذ الملف صيغًا من بيانات الأعمال."],
    ["حدود الإثبات", "المسودة لا تعد قيدًا مرحّلًا ولا تثبت سداد المورد أو حركة نقدية."],
    ["منع الالتزام المكرر", "تسوية الفاتورة تستخدم حساب الدائن الأصلي لإيصال الاستلام؛ لا تنشئ حساب مورد أو دفتر ذمم موازٍ."],
  ];

  const lines: CellValue[][] = [
    ["رقم إيصال الاستلام", "رمز الصنف", "اسم الصنف", "الوحدة", "الكمية المفوترة",
      "تكلفة الوحدة في الاستلام", "سعر الوحدة في الفاتورة", "قيمة الاستلام للكمية",
      "القيمة الفعلية في فاتورة المورد"],
    ...document.lines.map((line) => [
      requireText(line.receiptNumber, "رقم إيصال الاستلام", 80),
      requireText(line.itemCode, "رمز الصنف", 80),
      requireText(line.productName, "اسم الصنف", 240),
      line.unit ?? "",
      line.quantity,
      line.receivedUnitCost,
      line.invoicedUnitCost,
      line.sourceLineTotal,
      line.invoiceLineTotal,
    ]),
  ];

  const journal: CellValue[][] = [
    ["البند", "رمز الحساب", "اسم الحساب", "مدين", "دائن", "البيان"],
  ];
  if (document.accountingStatus === "journal_draft_created" ||
      document.accountingStatus === "journal_posted" ||
      document.accountingStatus === "journal_reversed") {
    if (!document.payableAccount) throw new Error("حساب الدائن الأصلي غير متاح في ملف القيد.");
    let debit = 0n;
    let credit = 0n;
    const pushLine = (label: string, account: NonNullable<typeof document.payableAccount>,
      lineDebit: bigint, lineCredit: bigint, memo: string) => {
      if (lineDebit < 0n || lineCredit < 0n || (lineDebit > 0n && lineCredit > 0n)) {
        throw new Error("قيمة أحد أسطر القيد غير صالحة.");
      }
      debit += lineDebit;
      credit += lineCredit;
      journal.push([label, account.code, account.name,
        lineDebit > 0n ? formatCents(lineDebit) : "",
        lineCredit > 0n ? formatCents(lineCredit) : "", memo]);
    };

    if (totals.adjustmentCents > 0n) {
      pushLine("حساب المورد", document.payableAccount, 0n, totals.adjustmentCents,
        "زيادة التزام المورد بإجمالي الفاتورة بعد مطابقة تكلفة الاستلام");
    } else if (totals.adjustmentCents < 0n) {
      pushLine("حساب المورد", document.payableAccount, -totals.adjustmentCents, 0n,
        "تخفيض التزام المورد إلى إجمالي الفاتورة الفعلية");
    }
    if (totals.taxCents > 0n) {
      if (!document.taxAccount) throw new Error("حساب الضريبة غير متاح في ملف القيد.");
      pushLine("الضريبة", document.taxAccount, totals.taxCents, 0n,
        "ضريبة فعلية موثقة في فاتورة المورد");
    }
    if (totals.varianceCents > 0n) {
      if (!document.varianceAccount) throw new Error("حساب فرق التكلفة غير متاح في ملف القيد.");
      pushLine("فرق تكلفة البضاعة", document.varianceAccount, totals.varianceCents, 0n,
        "فرق تكلفة فاتورة المورد أعلى من تكلفة الاستلام");
    } else if (totals.varianceCents < 0n) {
      if (!document.varianceAccount) throw new Error("حساب فرق التكلفة غير متاح في ملف القيد.");
      pushLine("فرق تكلفة البضاعة", document.varianceAccount, 0n, -totals.varianceCents,
        "فرق تكلفة فاتورة المورد أقل من تكلفة الاستلام");
    }
    if (debit <= 0n || debit !== credit) {
      throw new Error("تفاصيل القيد لا تتوازن بالقروش؛ أوقف تصدير ملف Excel.");
    }
    journal.push(["الإجمالي", "", "", formatCents(debit), formatCents(credit), "يجب أن يتساوى المدين والدائن"]);
  } else if (document.accountingStatus === "no_adjustment_required") {
    journal.push(["لا حاجة لقيد إضافي", "", "", "0.00", "0.00",
      "تطابقت الفاتورة مع تكلفة الاستلام ولا توجد ضريبة أو فروق."]);
  } else {
    journal.push(["لا يوجد قيد صالح", "", "", "", "",
      "هذه معاينة مطابقة فقط؛ لم تُنشأ تسوية محاسبية بعد."]);
  }

  return [
    { name: "ملخص التسوية", rows: summary },
    { name: "بنود المطابقة", rows: lines },
    { name: "تفاصيل القيد", rows: journal },
  ];
}

function workbookFiles(document: SupplierInvoiceAccountingPrintDocument): { name: string; content: string }[] {
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
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — محضر تسوية فاتورة مورد") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Tenant-scoped supplier invoice reconciliation and draft-only accounting projection</dc:subject>" +
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

export function buildSupplierInvoiceAccountingWorkbookXlsx(
  document: SupplierInvoiceAccountingPrintDocument,
): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadSupplierInvoiceAccountingWorkbookXlsx(
  document: SupplierInvoiceAccountingPrintDocument,
): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل ملف Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildSupplierInvoiceAccountingWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  const safeNumber = document.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "invoice";
  anchor.href = url;
  anchor.download = "aghbari-supplier-invoice-reconciliation-" + safeNumber + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
