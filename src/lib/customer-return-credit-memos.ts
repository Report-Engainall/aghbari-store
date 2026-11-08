export interface ReturnCreditAccount {
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "revenue" | "liability";
}

export interface ReturnCreditLine {
  request_item_id: string;
  order_item_id: string;
  product_id: string | null;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
  received_quantity: number;
  invoice_item_id: string | null;
  invoice_item_quantity: number;
  invoice_item_line_total: number;
  already_credited_quantity: number;
  remaining_invoice_quantity: number;
}

export interface ReturnCreditMemoSummary {
  id: string;
  memo_number: string;
  status: "draft" | "posted" | "void" | "reversed";
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  journal_entry_id: string;
  journal_entry_number: string;
  journal_status: "draft" | "posted" | "void";
  reversed_at: string | null;
  reversal_reason: string | null;
  reversal_journal_entry_id: string | null;
  reversal_journal_entry_number: string | null;
  receivable_account_id: string;
  revenue_account_id: string;
  tax_account_id: string | null;
  created_at: string;
  posted_at: string | null;
}

export interface ReturnCreditRequest {
  request_id: string;
  request_number: string;
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  created_at: string;
  invoice_id: string | null;
  invoice_number: string | null;
  currency: string | null;
  invoice_subtotal: number | null;
  invoice_tax_amount: number | null;
  invoice_total_amount: number | null;
  invoice_status: string | null;
  invoice_totals_reconcile: boolean;
  mapping_ready: boolean;
  items: ReturnCreditLine[];
  credit_memo: ReturnCreditMemoSummary | null;
}

export interface ReturnCreditQueue {
  accounts: ReturnCreditAccount[];
  requests: ReturnCreditRequest[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("بيانات الإشعار الدائن غير مكتملة: " + name);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteAmount(value: unknown, name: string): number {
  const amount = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e16) {
    throw new Error("قيمة مالية غير صالحة: " + name);
  }
  return amount;
}

function nullableAmount(value: unknown, name: string): number | null {
  return value === null || value === undefined ? null : finiteAmount(value, name);
}

export function readReturnCreditMemoQueue(value: unknown): ReturnCreditQueue {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !Array.isArray(value.requests)) {
    throw new Error("أعاد الخادم قائمة إشعارات دائنة غير صالحة.");
  }
  const accounts = value.accounts.map((raw): ReturnCreditAccount => {
    if (!isRecord(raw)) throw new Error("بيانات الحساب المحاسبي غير صالحة.");
    const type = requiredText(raw.account_type, "account_type");
    if (type !== "asset" && type !== "revenue" && type !== "liability") {
      throw new Error("نوع الحساب غير مسموح به لإشعار دائن.");
    }
    return {
      id: requiredText(raw.id, "account.id"),
      code: requiredText(raw.code, "account.code"),
      name: requiredText(raw.name, "account.name"),
      account_type: type,
    };
  });
  const requests = value.requests.map((raw): ReturnCreditRequest => {
    if (!isRecord(raw) || !Array.isArray(raw.items)) {
      throw new Error("سجل المرتجع المؤهل للإشعار الدائن غير صالح.");
    }
    const invoiceId = nullableText(raw.invoice_id);
    const memoRaw = raw.credit_memo;
    let creditMemo: ReturnCreditMemoSummary | null = null;
    if (memoRaw !== null && memoRaw !== undefined) {
      if (!isRecord(memoRaw)) throw new Error("ملخص الإشعار الدائن غير صالح.");
      const status = requiredText(memoRaw.status, "credit_memo.status");
      const journalStatus = requiredText(memoRaw.journal_status, "credit_memo.journal_status");
      if (!["draft", "posted", "void", "reversed"].includes(status) || !["draft", "posted", "void"].includes(journalStatus)) {
        throw new Error("حالة الإشعار الدائن أو القيد غير معروفة.");
      }
      creditMemo = {
        id: requiredText(memoRaw.id, "credit_memo.id"),
        memo_number: requiredText(memoRaw.memo_number, "credit_memo.memo_number"),
        status: status as ReturnCreditMemoSummary["status"],
        currency: requiredText(memoRaw.currency, "credit_memo.currency"),
        subtotal_amount: finiteAmount(memoRaw.subtotal_amount, "credit_memo.subtotal_amount"),
        tax_amount: finiteAmount(memoRaw.tax_amount, "credit_memo.tax_amount"),
        total_amount: finiteAmount(memoRaw.total_amount, "credit_memo.total_amount"),
        journal_entry_id: requiredText(memoRaw.journal_entry_id, "credit_memo.journal_entry_id"),
        journal_entry_number: requiredText(memoRaw.journal_entry_number, "credit_memo.journal_entry_number"),
        journal_status: journalStatus as ReturnCreditMemoSummary["journal_status"],
        reversed_at: nullableText(memoRaw.reversed_at),
        reversal_reason: nullableText(memoRaw.reversal_reason),
        reversal_journal_entry_id: nullableText(memoRaw.reversal_journal_entry_id),
        reversal_journal_entry_number: nullableText(memoRaw.reversal_journal_entry_number),
        receivable_account_id: requiredText(memoRaw.receivable_account_id, "credit_memo.receivable_account_id"),
        revenue_account_id: requiredText(memoRaw.revenue_account_id, "credit_memo.revenue_account_id"),
        tax_account_id: nullableText(memoRaw.tax_account_id),
        created_at: requiredText(memoRaw.created_at, "credit_memo.created_at"),
        posted_at: nullableText(memoRaw.posted_at),
      };
    }
    const items = raw.items.map((line): ReturnCreditLine => {
      if (!isRecord(line)) throw new Error("سطر مصدر الإشعار الدائن غير صالح.");
      return {
        request_item_id: requiredText(line.request_item_id, "item.request_item_id"),
        order_item_id: requiredText(line.order_item_id, "item.order_item_id"),
        product_id: nullableText(line.product_id),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "item.product_name"),
        unit: nullableText(line.unit),
        requested_quantity: finiteAmount(line.requested_quantity, "item.requested_quantity"),
        received_quantity: finiteAmount(line.received_quantity, "item.received_quantity"),
        invoice_item_id: nullableText(line.invoice_item_id),
        invoice_item_quantity: finiteAmount(line.invoice_item_quantity ?? 0, "item.invoice_item_quantity"),
        invoice_item_line_total: finiteAmount(line.invoice_item_line_total ?? 0, "item.invoice_item_line_total"),
        already_credited_quantity: finiteAmount(line.already_credited_quantity ?? 0, "item.already_credited_quantity"),
        remaining_invoice_quantity: finiteAmount(line.remaining_invoice_quantity ?? 0, "item.remaining_invoice_quantity"),
      };
    });
    const currency = nullableText(raw.currency);
    return {
      request_id: requiredText(raw.request_id, "request_id"),
      request_number: requiredText(raw.request_number, "request_number"),
      order_id: requiredText(raw.order_id, "order_id"),
      order_number: requiredText(raw.order_number, "order_number"),
      customer_id: requiredText(raw.customer_id, "customer_id"),
      customer_name: requiredText(raw.customer_name, "customer_name"),
      created_at: requiredText(raw.created_at, "created_at"),
      invoice_id: invoiceId,
      invoice_number: nullableText(raw.invoice_number),
      currency,
      invoice_subtotal: nullableAmount(raw.invoice_subtotal, "invoice_subtotal"),
      invoice_tax_amount: nullableAmount(raw.invoice_tax_amount, "invoice_tax_amount"),
      invoice_total_amount: nullableAmount(raw.invoice_total_amount, "invoice_total_amount"),
      invoice_status: nullableText(raw.invoice_status),
      invoice_totals_reconcile: raw.invoice_totals_reconcile === true,
      mapping_ready: raw.mapping_ready === true,
      items,
      credit_memo: creditMemo,
    };
  });
  return { accounts, requests };
}

export function createCreditMemoIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export interface ReturnCreditMemoMutation {
  credit_memo_id: string;
  memo_number: string;
  status: "draft" | "posted" | "void";
  journal_entry_id: string;
  journal_entry_number: string;
  journal_status: "draft" | "posted" | "void";
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  replayed: boolean;
}

export function readReturnCreditMemoMutation(value: unknown): ReturnCreditMemoMutation {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة للإشعار الدائن.");
  const status = requiredText(value.status, "status");
  const journalStatus = requiredText(value.journal_status, "journal_status");
  if (!["draft", "posted", "void"].includes(status) || !["draft", "posted", "void"].includes(journalStatus)) {
    throw new Error("حالة الإشعار الدائن أو قيده غير صالحة.");
  }
  if (typeof value.replayed !== "boolean") throw new Error("علامة إعادة المحاولة غير موجودة في استجابة الخادم.");
  return {
    credit_memo_id: requiredText(value.credit_memo_id, "credit_memo_id"),
    memo_number: requiredText(value.memo_number, "memo_number"),
    status: status as ReturnCreditMemoMutation["status"],
    journal_entry_id: requiredText(value.journal_entry_id, "journal_entry_id"),
    journal_entry_number: requiredText(value.journal_entry_number, "journal_entry_number"),
    journal_status: journalStatus as ReturnCreditMemoMutation["journal_status"],
    subtotal_amount: finiteAmount(value.subtotal_amount, "subtotal_amount"),
    tax_amount: finiteAmount(value.tax_amount, "tax_amount"),
    total_amount: finiteAmount(value.total_amount, "total_amount"),
    currency: requiredText(value.currency, "currency"),
    replayed: value.replayed,
  };
}


export interface ReturnCreditMemoReversalMutation {
  credit_memo_id: string;
  memo_number: string;
  status: "reversed";
  original_journal_entry_id: string;
  reversal_journal_entry_id: string;
  reversal_journal_entry_number: string;
  reversal_status: "posted";
  reason: string;
  replayed: boolean;
}

export function readReturnCreditMemoReversalMutation(value: unknown): ReturnCreditMemoReversalMutation {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة لعكس الإشعار الدائن.");
  if (value.status !== "reversed" || value.reversal_status !== "posted") {
    throw new Error("لم يؤكد الخادم حالة الإشعار المعكوس والقيد العكسي المرحّل.");
  }
  if (typeof value.replayed !== "boolean") throw new Error("علامة إعادة محاولة العكس غير موجودة.");
  return {
    credit_memo_id: requiredText(value.credit_memo_id, "credit_memo_id"),
    memo_number: requiredText(value.memo_number, "memo_number"),
    status: "reversed",
    original_journal_entry_id: requiredText(value.original_journal_entry_id, "original_journal_entry_id"),
    reversal_journal_entry_id: requiredText(value.reversal_journal_entry_id, "reversal_journal_entry_id"),
    reversal_journal_entry_number: requiredText(value.reversal_journal_entry_number, "reversal_journal_entry_number"),
    reversal_status: "posted",
    reason: requiredText(value.reason, "reason"),
    replayed: value.replayed,
  };
}

export interface PrintableReturnCreditMemo {
  memo: { id:string; memo_number:string; status:"draft"|"posted"|"reversed"; currency:string;
    subtotal_amount:number; tax_amount:number; total_amount:number; created_at:string; posted_at:string|null;
    reversed_at:string|null; reversal_reason:string|null; reversal_journal_entry_number:string|null; reversal_journal_status:"posted"|null };
  customer: { id:string; name:string; contact_name:string|null };
  invoice: { id:string; invoice_number:string; currency:string; issued_at:string;
    subtotal:number; tax_amount:number; total_amount:number; order_number:string };
  return_request: { id:string; request_number:string; status:string; created_at:string };
  journal: { id:string; entry_number:string; status:"draft"|"posted"; entry_date:string };
  lines: Array<{ id:string; item_code:string|null; description:string; unit:string|null;
    returned_quantity:number; credited_subtotal:number; invoice_quantity:number; invoice_unit_price:number; invoice_line_total:number }>;
}

export function readPrintableReturnCreditMemo(value: unknown): PrintableReturnCreditMemo {
  if (!isRecord(value) || !isRecord(value.memo) || !isRecord(value.customer) || !isRecord(value.invoice) ||
      !isRecord(value.return_request) || !isRecord(value.journal) || !Array.isArray(value.lines) ||
      value.lines.length < 1 || value.lines.length > 100) {
    throw new Error("أعاد الخادم بيانات طباعة إشعار دائن غير مكتملة.");
  }
  const status = requiredText(value.memo.status,"memo.status");
  const journalStatus = requiredText(value.journal.status,"journal.status");
  if ((status!=="draft" && status!=="posted" && status!=="reversed") ||
      (journalStatus!=="draft" && journalStatus!=="posted") ||
      !((status===journalStatus) || (status==="reversed" && journalStatus==="posted"))) {
    throw new Error("حالة الإشعار الدائن والقيد المحاسبي غير متطابقة للطباعة.");
  }
  const reversedAt=nullableText(value.memo.reversed_at);
  const reversalReason=nullableText(value.memo.reversal_reason);
  const reversalJournalNumber=nullableText(value.memo.reversal_journal_entry_number);
  const reversalJournalStatus=nullableText(value.memo.reversal_journal_status);
  if (status==="reversed" && (!reversedAt || !reversalReason || !reversalJournalNumber || reversalJournalStatus!=="posted")) {
    throw new Error("الإشعار المعكوس يفتقد دليل قيد العكس المرحّل؛ تم منع الطباعة.");
  }
  if (status!=="reversed" && (reversedAt || reversalReason || reversalJournalNumber || reversalJournalStatus)) {
    throw new Error("مستند غير معكوس يحمل حقول عكس مالية غير متوقعة؛ تم منع الطباعة.");
  }
  const currency=requiredText(value.memo.currency,"memo.currency");
  if (!/^[A-Z]{3}$/.test(currency) || value.invoice.currency!==currency) throw new Error("عملة الإشعار لا تطابق الفاتورة المصدر.");
  const subtotal=finiteAmount(value.memo.subtotal_amount,"memo.subtotal_amount");
  const tax=finiteAmount(value.memo.tax_amount,"memo.tax_amount");
  const total=finiteAmount(value.memo.total_amount,"memo.total_amount");
  if (subtotal<=0 || tax<0 || total<=0 || Math.abs(subtotal+tax-total)>0.001) throw new Error("إجماليات الإشعار الدائن لا تتطابق؛ أوقفت الطباعة.");
  const invoiceSubtotal=finiteAmount(value.invoice.subtotal,"invoice.subtotal");
  const invoiceTax=finiteAmount(value.invoice.tax_amount,"invoice.tax_amount");
  const invoiceTotal=finiteAmount(value.invoice.total_amount,"invoice.total_amount");
  if (invoiceSubtotal<0 || invoiceTax<0 || invoiceTotal<=0 || Math.abs(invoiceSubtotal+invoiceTax-invoiceTotal)>0.001) {
    throw new Error("إجمالي الفاتورة الأصلية غير متطابق؛ أوقفت الطباعة.");
  }
  const lines=value.lines.map((raw):PrintableReturnCreditMemo["lines"][number]=>{
    if (!isRecord(raw)) throw new Error("يوجد سطر غير صالح في مستند الإشعار الدائن.");
    const returned=finiteAmount(raw.returned_quantity,"line.returned_quantity");
    const invoiceQty=finiteAmount(raw.invoice_quantity,"line.invoice_quantity");
    const credit=finiteAmount(raw.credited_subtotal,"line.credited_subtotal");
    const unitPrice=finiteAmount(raw.invoice_unit_price,"line.invoice_unit_price");
    const lineTotal=finiteAmount(raw.invoice_line_total,"line.invoice_line_total");
    if (returned<=0 || invoiceQty<=0 || returned>invoiceQty || credit<0 || unitPrice<0 || lineTotal<0) {
      throw new Error("كمية أو قيمة غير صالحة في سطر إشعار دائن؛ أوقفت الطباعة.");
    }
    return {id:requiredText(raw.id,"line.id"),item_code:nullableText(raw.item_code),
      description:requiredText(raw.description,"line.description"),unit:nullableText(raw.unit),
      returned_quantity:returned,credited_subtotal:credit,invoice_quantity:invoiceQty,
      invoice_unit_price:unitPrice,invoice_line_total:lineTotal};
  });
  if (Math.abs(lines.reduce((sum,line)=>sum+line.credited_subtotal,0)-subtotal)>0.011) {
    throw new Error("مجموع بنود الإشعار الدائن لا يطابق الإجمالي؛ أوقفت الطباعة.");
  }
  return {
    memo:{id:requiredText(value.memo.id,"memo.id"),memo_number:requiredText(value.memo.memo_number,"memo.memo_number"),
      status,currency,subtotal_amount:subtotal,tax_amount:tax,total_amount:total,
      created_at:requiredText(value.memo.created_at,"memo.created_at"),posted_at:nullableText(value.memo.posted_at),
      reversed_at:reversedAt,reversal_reason:reversalReason,reversal_journal_entry_number:reversalJournalNumber,
      reversal_journal_status:reversalJournalStatus as "posted"|null},
    customer:{id:requiredText(value.customer.id,"customer.id"),name:requiredText(value.customer.name,"customer.name"),
      contact_name:nullableText(value.customer.contact_name)},
    invoice:{id:requiredText(value.invoice.id,"invoice.id"),invoice_number:requiredText(value.invoice.invoice_number,"invoice.invoice_number"),
      currency,issued_at:requiredText(value.invoice.issued_at,"invoice.issued_at"),subtotal:invoiceSubtotal,
      tax_amount:invoiceTax,total_amount:invoiceTotal,order_number:requiredText(value.invoice.order_number,"invoice.order_number")},
    return_request:{id:requiredText(value.return_request.id,"return_request.id"),
      request_number:requiredText(value.return_request.request_number,"return_request.request_number"),
      status:requiredText(value.return_request.status,"return_request.status"),created_at:requiredText(value.return_request.created_at,"return_request.created_at")},
    journal:{id:requiredText(value.journal.id,"journal.id"),entry_number:requiredText(value.journal.entry_number,"journal.entry_number"),
      status:journalStatus,entry_date:requiredText(value.journal.entry_date,"journal.entry_date")},
    lines,
  };
}
