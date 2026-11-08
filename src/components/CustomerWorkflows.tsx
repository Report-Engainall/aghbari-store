import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  ScanLine,
  Send,
  CheckCircle2,
  Bot,
  Banknote,
  Wifi,
  WifiOff,
  MapPin,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { getCurrentTenantScope, supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, formatDateShort, formatNumber } from "@/lib/format";
import {
  classifyAssistantIntent,
  matchesArabicCatalogSearch,
  normalizeCartDraft,
  sanitizePublicCatalogCache,
  summarizeAccount,
  summarizeInvoiceAmounts,
  isCustomerStatementPossiblyPartial,
  summarizeCustomerInvoiceStatuses,
  summarizeCustomerOrderStatuses,
  parseCustomerStatementCreditMemos,
  type CustomerStatementCreditMemo,
  type InvoiceAmount,
  type PaymentAmount,
} from "@/lib/commerce-utils";
import { fetchProducts, fetchResolvedProductPrices, fetchSettingsMap } from "@/lib/api";
import { FinanceDocumentPrintActions } from "@/components/FinanceDocumentPrintActions";
import { CustomerPaymentReceiptPrintActions } from "@/components/CustomerPaymentReceiptPrintActions";
import { downloadCustomerAccountStatementWorkbookXlsx } from "@/lib/customer-account-statement-xlsx";
import { downloadReceivablesAgingWorkbookXlsx } from "@/lib/receivables-aging-xlsx";
import { projectCustomerQuotePrintDocument, type CustomerQuotePrintDocument } from "@/lib/customer-quote-print";
import { downloadCustomerQuoteWorkbookXlsx } from "@/lib/customer-quote-xlsx";
import { downloadCustomerInvoiceWorkbookXlsx } from "@/lib/customer-invoice-xlsx";
import { downloadCustomerPaymentHistoryWorkbookXlsx } from "@/lib/customer-payment-history-xlsx";
import { validateCustomerPaymentInput } from "@/lib/finance-input";
import { CashExpenseLedger } from "@/components/CashExpenseLedger";
import { GeneralLedgerWorkspace } from "@/components/GeneralLedgerWorkspace";
import { fetchCustomerAddresses, saveCustomerAddress, deleteCustomerAddress, type CustomerAddress, type CustomerAddressInput } from "@/lib/customer-addresses";
import { fetchCustomerCompanyContacts, saveCustomerCompanyContact, deleteCustomerCompanyContact, type CustomerCompanyContact, type CustomerCompanyContactInput } from "@/lib/customer-company-contacts";
import { loadOfflineCartDraft, mergeOfflineCartDraft, saveOfflineCartDraft } from "@/lib/offline-cart";
import { resolveStorefrontPricePresentation } from "@/lib/storefront-price-visibility";
import {
  clearLegacyOfflineCatalogCache,
  clearOfflineCatalogCache,
  offlineCatalogCacheKeys,
  offlineCatalogScopeFingerprint,
  reconcileOfflineCatalogScope,
} from "@/lib/offline-catalog-cache";

type Invoice = {
  id: string;
  invoice_number: string;
  order_id: string;
  customer_id: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  subtotal?: number | string;
  tax_amount?: number | string;
  total_amount?: number | string;
  paid_amount?: number | string;
  credit_memo_amount?: number | string;
  outstanding_amount?: number | string;
};

type ReceivablesAgingBucket = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "over_90" | "unknown_due_date";
type ReceivablesAgingItem = {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  total_amount: number | string;
  paid_amount: number | string;
  outstanding_amount: number | string;
  days_overdue: number | null;
  aging_bucket: ReceivablesAgingBucket;
};
type ReceivablesAgingSummary = {
  currency: string;
  open_invoice_count: number;
  overdue_invoice_count: number;
  unknown_due_date_count: number;
  current_amount: number | string;
  days_1_30_amount: number | string;
  days_31_60_amount: number | string;
  days_61_90_amount: number | string;
  over_90_amount: number | string;
  unknown_due_date_amount: number | string;
  total_outstanding_amount: number | string;
};
type ReceivablesAgingReport = {
  as_of_utc: string;
  limit: number;
  offset: number;
  total_open_invoices: number;
  has_more: boolean;
  summary: ReceivablesAgingSummary[];
  items: ReceivablesAgingItem[];
};
const RECEIVABLES_AGING_PAGE_SIZE = 200;
const STAFF_FINANCE_INVOICE_PAGE_SIZE = 200;
const CUSTOMER_INVOICE_PAGE_SIZE = 100;

type CustomerInvoiceCursor = Pick<Invoice, "id" | "issued_at">;

async function fetchCustomerInvoicePage(cursor?: CustomerInvoiceCursor): Promise<Invoice[] | null> {
  const query = supabase
    .from("customer_invoices")
    .select("id,invoice_number,order_id,customer_id,status,issued_at,due_at,currency");
  const pageQuery = cursor
    ? query.or(`issued_at.lt.${cursor.issued_at},and(issued_at.eq.${cursor.issued_at},id.gt.${cursor.id})`)
    : query;
  const result = await pageQuery
    .order("issued_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(CUSTOMER_INVOICE_PAGE_SIZE + 1);

  return result.error ? null : (result.data ?? []) as Invoice[];
}

function appendUniqueInvoiceRows(current: Invoice[], nextPage: Invoice[]): Invoice[] {
  const knownIds = new Set(current.map((invoice) => invoice.id));
  return [...current, ...nextPage.filter((invoice) => !knownIds.has(invoice.id))];
}
const RECEIVABLES_AGING_BUCKET_LABELS: Record<ReceivablesAgingBucket, string> = {
  current: "غير متأخرة / مستحقة حاليًا",
  days_1_30: "1–30 يومًا",
  days_31_60: "31–60 يومًا",
  days_61_90: "61–90 يومًا",
  over_90: "أكثر من 90 يومًا",
  unknown_due_date: "تاريخ استحقاق غير محدد",
};
function formatAgingMoney(value: number | string, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "غير متاح";
  try {
    return new Intl.NumberFormat("ar-YE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + " " + currency;
  }
}
function formatAgingDate(value: string | null): string {
  if (!value) return "غير محدد";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "تاريخ غير صالح"
    : new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

type InvoiceLine = {
  id: string;
  item_code: string | null;
  description: string;
  unit: string | null;
  quantity: number | string;
  unit_price?: number | string;
  line_total?: number | string;
};
type InvoiceFinancialSummary = {
  currency: string;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
};

function formatInvoiceMoney(value: number | string | undefined, currency: string): string {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0) return "غير متاح";
  return `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

function isValidInvoiceMoney(value: unknown): value is number | string {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(amount) && amount >= 0;
}
type Product = {
  id: string;
  name: string;
  item_code: string;
  barcode?: string | null;
  unit: string;
  base_price?: number | string | null;
  status?: string;
  image_url?: string | null;
};
type Quote = {
  id: string;
  quote_number: string;
  status: string;
  notes: string | null;
  response_note: string | null;
  created_at: string;
  quoted_at: string | null;
  valid_until: string | null;
};
type QuoteLine = {
  id: string;
  quote_id?: string;
  product_id: string | null;
  item_code: string | null;
  product_name_snapshot: string;
  unit_snapshot: string | null;
  requested_quantity: number | string;
  target_unit_price: number | string | null;
  quoted_unit_price: number | string | null;
};
type ReorderTemplate = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  source_order_id: string | null;
};
type ReorderTemplateLine = { product_id: string | null; quantity: number | string };
type AssistantOrderRow = { order_number: string | number; status: string; created_at: string };
type AssistantInvoiceStatusRow = { invoice_number: string; status: string; issued_at: string };
type AssistantProductRow = {
  id: string;
  name: string;
  item_code: string;
  barcode: string | null;
  unit: string;
  base_price?: number | string | null;
  status: string;
};

function customerStorefrontPriceSuffix(policyValue: unknown, value: unknown): string {
  const presentation = resolveStorefrontPricePresentation(policyValue, value);
  return presentation.visible ? " · " + formatCurrency(presentation.amount) : "";
}

function resolvedProductPriceLabel(value: unknown): string {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(amount) && amount >= 0
    ? formatCurrency(amount)
    : "السعر غير متاح";
}

function withResolvedProductPrice(
  product: {
    id: string;
    name?: unknown;
    item_code?: unknown;
    barcode?: unknown;
    unit?: unknown;
    status?: unknown;
    image_url?: unknown;
  },
  price: number | null | undefined,
): Product {
  // Build a new public DTO; do not spread the raw customer query/RPC payload, which may
  // contain confidential tier prices, costs or margins if a future selection is broadened.
  const safeProduct: Product = {
    id: product.id,
    name: typeof product.name === "string" ? product.name : "",
    item_code: typeof product.item_code === "string" ? product.item_code : "",
    barcode: typeof product.barcode === "string" ? product.barcode : null,
    unit: typeof product.unit === "string" ? product.unit : "",
    status: typeof product.status === "string" ? product.status : undefined,
    image_url: typeof product.image_url === "string" ? product.image_url : null,
  };
  return price === null || price === undefined
    ? safeProduct
    : { ...safeProduct, base_price: price };
}

const card: React.CSSProperties = {
  background: "var(--card, #fff)",
  border: "1px solid #e0ecee",
  borderRadius: 16,
  padding: 18,
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
};
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const quiet: React.CSSProperties = { color: "#71868a", fontSize: 13 };
const field: React.CSSProperties = {
  display: "block",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #d5e4e5",
  borderRadius: 10,
  background: "#fff",
  color: "#18383c",
};
const primary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 10,
  background: "#087f8d",
  color: "#fff",
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};
const secondary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "1px solid #d5e4e5",
  borderRadius: 10,
  background: "#fff",
  color: "#087f8d",
  padding: "9px 13px",
  fontWeight: 750,
  cursor: "pointer",
};
const links = [
  ["/addresses", "عناوين التوصيل"],
  ["/company/contacts", "جهات الاتصال بالشركة"],
  ["/company/members", "أعضاء الشركة"],
  ["/invoices", "الفواتير"],
  ["/statement", "كشف الحساب"],
  ["/quotes", "عروض الأسعار"],
  ["/reorder", "إعادة الطلب"],
  ["/barcode", "ماسح الباركود"],
  ["/assistant", "المساعد الذكي"],
  ["/offline", "دون اتصال"],
] as const;

function WorkspaceShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="storefront" dir="rtl" style={{ minHeight: "100vh" }}>
      <header className="sf-header">
        <div className="sf-header-inner">
          <Link to="/" className="sf-brand" style={{ textDecoration: "none" }}>
            <div className="sf-brand-icon">
              <FileText size={22} />
            </div>
            <div>
              <strong>الأغبري</strong>
              <span>الحساب التجاري</span>
            </div>
          </Link>
          <Link to="/" className="sf-admin-btn" style={{ textDecoration: "none" }}>
            <ArrowRight size={16} /> العودة للمتجر
          </Link>
        </div>
      </header>
      <nav
        aria-label="أدوات الحساب"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          padding: 12,
          borderBottom: "1px solid #e3eeee",
          background: "#fff",
        }}
      >
        {links.map(([to, label]) => (
          <Link
            key={to}
            to={to as never}
            style={{
              textDecoration: "none",
              border: "1px solid #d9e8e8",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              color: "#087f8d",
              fontWeight: 800,
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 64px" }}>
        <h1 style={{ fontSize: 27, margin: "0 0 6px" }}>{title}</h1>
        <p style={{ color: "#71868a", margin: "0 0 22px" }}>{subtitle}</p>
        {children}
      </main>
    </div>
  );
}
function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <WorkspaceShell title="جارٍ التحقق" subtitle="نجهز حسابك التجاري">
        <p role="status">جارٍ تحميل الحساب...</p>
      </WorkspaceShell>
    );
  if (!user) return <Login />;
  return <>{children}</>;
}
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      style={{ ...card, borderColor: "#efc5c5", color: "#9b2626", marginBottom: 14 }}
    >
      {message}
      {retry && (
        <button style={{ ...secondary, marginInlineStart: 12 }} onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: 28, color: "#71868a" }}>{children}</div>
  );
}

export function CustomerInvoicesPage() {
  return (
    <Gate>
      <Invoices />
    </Gate>
  );
}
function Invoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [chosen, setChosen] = useState<Invoice | null>(null);
  const [chosenCustomer, setChosenCustomer] = useState<{
    customer_code: string;
    business_name: string;
    contact_name: string | null;
    tier_label: string | null;
  } | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<{
    quantity_review_required: boolean;
    customer_adjustment_note: string | null;
    customer_payment_requested_at: string | null;
    payment_request_status: string;
    status: string;
  } | null>(null);
  const [items, setItems] = useState<InvoiceLine[]>([]);
  const [chosenFinancials, setChosenFinancials] = useState<InvoiceFinancialSummary | null>(null);
  const [financialDetailsVisible, setFinancialDetailsVisible] = useState(false);
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState("");
  const [olderInvoicesError, setOlderInvoicesError] = useState("");
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [loadingOlderInvoices, setLoadingOlderInvoices] = useState(false);
  const loadOlderInvoicesInFlightRef = useRef(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [xlsxError, setXlsxError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    setOlderInvoicesError("");
    try {
      const page = await fetchCustomerInvoicePage();
      if (!page) {
        setError("تعذر تحميل الفواتير. تأكد من نشر ترحيل قاعدة البيانات.");
        return;
      }
      setRows(page.slice(0, CUSTOMER_INVOICE_PAGE_SIZE));
      setHasMoreInvoices(page.length > CUSTOMER_INVOICE_PAGE_SIZE);
    } catch {
      setError("تعذر تحميل الفواتير. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }, []);
  const loadOlderInvoices = useCallback(async () => {
    if (loadOlderInvoicesInFlightRef.current || busy || loadingOlderInvoices || !hasMoreInvoices || rows.length === 0) return;
    const cursor = rows[rows.length - 1];
    if (!cursor.issued_at) {
      setOlderInvoicesError("تعذر متابعة سجل الفواتير لأن تاريخ إصدار آخر فاتورة مفقود. حدّث القائمة أو راجع بيانات الفاتورة.");
      return;
    }
    loadOlderInvoicesInFlightRef.current = true;
    setLoadingOlderInvoices(true);
    setOlderInvoicesError("");
    try {
      const page = await fetchCustomerInvoicePage(cursor);
      if (!page) {
        setOlderInvoicesError("تعذر تحميل الفواتير الأقدم. احتفظنا بالقائمة الحالية؛ أعد المحاولة.");
        return;
      }
      const nextPage = page.slice(0, CUSTOMER_INVOICE_PAGE_SIZE);
      setRows((current) => appendUniqueInvoiceRows(current, nextPage));
      setHasMoreInvoices(page.length > CUSTOMER_INVOICE_PAGE_SIZE);
    } catch {
      setOlderInvoicesError("تعذر تحميل الفواتير الأقدم. احتفظنا بالقائمة الحالية؛ أعد المحاولة.");
    } finally {
      setLoadingOlderInvoices(false);
      loadOlderInvoicesInFlightRef.current = false;
    }
  }, [busy, hasMoreInvoices, loadingOlderInvoices, rows]);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(i: Invoice) {
    setChosen(i);
    setDetailBusy(true);
    setChosenFinancials(null);
    setFinancialDetailsVisible(false);
    setChosenCustomer(null);
    setItems([]);
    const [invoicePayloadResult, orderResult] = await Promise.all([
      supabase.rpc("get_customer_invoice_pdf", { p_invoice_id: i.id }),
      supabase
        .from("orders")
        .select(
          "quantity_review_required,customer_adjustment_note,customer_payment_requested_at,payment_request_status,status",
        )
        .eq("id", i.order_id)
        .maybeSingle(),
    ]);
    const payload = invoicePayloadResult.data as {
      invoice?: Invoice & { id?: string };
      lines?: InvoiceLine[];
      customer?: {
        customer_code?: string | null;
        business_name?: string | null;
        contact_name?: string | null;
        tier_label?: unknown;
      };
      financial_details_visible?: unknown;
      customer_tier_visible?: unknown;
    } | null;
    const invoice = payload?.invoice;
    const lines = payload?.lines;
    const hasVisibleFinancialValues = Boolean(
      invoice &&
      isValidInvoiceMoney(invoice.subtotal) &&
      isValidInvoiceMoney(invoice.tax_amount) &&
      isValidInvoiceMoney(invoice.total_amount) &&
      Array.isArray(lines) &&
      lines.every((line) => isValidInvoiceMoney(line.unit_price) && isValidInvoiceMoney(line.line_total)),
    );
    const hiddenPayloadOmitsFinancialValues = Boolean(
      invoice &&
      !("subtotal" in invoice) &&
      !("tax_amount" in invoice) &&
      !("total_amount" in invoice) &&
      Array.isArray(lines) &&
      lines.every((line) => !("unit_price" in line) && !("line_total" in line)),
    );
    const policyShapeValid = payload?.financial_details_visible === true
      ? hasVisibleFinancialValues
      : payload?.financial_details_visible === false && hiddenPayloadOmitsFinancialValues;
    const tierPolicyShapeValid = payload?.customer_tier_visible === true
      ? typeof payload.customer?.tier_label === "string" && payload.customer.tier_label.trim().length > 0
      : payload?.customer_tier_visible === false &&
        Boolean(payload.customer && !Object.prototype.hasOwnProperty.call(payload.customer, "tier_label"));
    const payloadValid = Boolean(
      invoice &&
      invoice.id === i.id &&
      typeof invoice.currency === "string" &&
      invoice.currency.length > 0 &&
      Array.isArray(lines) &&
      payload?.customer &&
      policyShapeValid &&
      tierPolicyShapeValid,
    );
    if (invoicePayloadResult.error || orderResult.error || !payloadValid || !payload) {
      setError("تعذر تحميل تفاصيل الفاتورة ومبالغها المصرح بها. تحقق من صلاحية الفاتورة ونشر مخطط المالية.");
      setChosen(null);
      setChosenCustomer(null);
      setChosenFinancials(null);
      setFinancialDetailsVisible(false);
      setItems([]);
      setInvoiceOrder(null);
    } else {
      const customerSnapshot = payload.customer;
      if (!customerSnapshot) {
        setError("لا يمكن عرض الفاتورة دون مرجع عميل موثوق؛ لم تُحمّل أي بيانات مالية.");
        setChosen(null);
        setChosenCustomer(null);
        setChosenFinancials(null);
        setFinancialDetailsVisible(false);
        setItems([]);
        setInvoiceOrder(null);
        return;
      }
      setError("");
      const financialVisible = payload.financial_details_visible === true;
      setFinancialDetailsVisible(financialVisible);
      setItems((payload.lines ?? []).map((line) => financialVisible
        ? line
        : { id: line.id, item_code: line.item_code, description: line.description, unit: line.unit, quantity: line.quantity }));
      setChosenCustomer({
        customer_code: customerSnapshot.customer_code ?? "",
        business_name: customerSnapshot.business_name ?? "",
        contact_name: customerSnapshot.contact_name ?? null,
        tier_label: payload.customer_tier_visible === true ? customerSnapshot.tier_label as string : null,
      });
      setChosenFinancials(financialVisible ? {
        currency: payload.invoice!.currency,
        subtotal: payload.invoice!.subtotal!,
        tax_amount: payload.invoice!.tax_amount!,
        total_amount: payload.invoice!.total_amount!,
      } : null);
      setInvoiceOrder(
        orderResult.data as {
          quantity_review_required: boolean;
          customer_adjustment_note: string | null;
          customer_payment_requested_at: string | null;
          payment_request_status: string;
          status: string;
        } | null,
      );
    }
    setDetailBusy(false);
  }
  async function downloadInvoicePdf(invoiceId: string) {
    setPdfBusyId(invoiceId);
    setPdfError("");
    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token;
      if (sessionResult.error || !accessToken) {
        throw new Error("سجّل الدخول مجددًا لتنزيل الفاتورة.");
      }

      const response = await fetch(`/api/invoice-pdf/${encodeURIComponent(invoiceId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/pdf",
        },
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "تعذر إنشاء ملف PDF للفاتورة.";
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error.length < 240) message = body.error;
        } catch {
          // Preserve the safe fallback for non-JSON responses.
        }
        throw new Error(message);
      }

      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) {
        throw new Error("استجابة المستند غير صحيحة؛ لم يتم تنزيل الملف.");
      }
      const blob = await response.blob();
      if (blob.size < 500) throw new Error("ملف PDF فارغ أو غير صالح.");

      const objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "aghbari-invoice.pdf";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "تعذر تنزيل الفاتورة.");
    } finally {
      setPdfBusyId(null);
    }
  }
  function downloadInvoiceXlsx() {
    setXlsxError("");
    try {
      if (!chosen || detailBusy || items.length === 0) {
        throw new Error("حمّل تفاصيل الفاتورة أولًا قبل إنشاء ملف Excel.");
      }
      downloadCustomerInvoiceWorkbookXlsx({
        invoiceNumber: chosen.invoice_number,
        status: chosen.status,
        issuedAt: chosen.issued_at,
        dueAt: chosen.due_at,
        currency: chosen.currency,
        customer: {
          code: chosenCustomer?.customer_code ?? "",
          businessName: chosenCustomer?.business_name ?? "",
          contactName: chosenCustomer?.contact_name ?? null,
          tierLabel: chosenCustomer?.tier_label ?? null,
        },
        items: items.map((line) => ({
          itemCode: line.item_code ?? null,
          description: line.description,
          unit: line.unit ?? null,
          quantity: line.quantity,
          ...(financialDetailsVisible && line.unit_price !== undefined && line.line_total !== undefined
            ? { unitPrice: line.unit_price, lineTotal: line.line_total }
            : {}),
        })),
        financialDetailsVisible,
        financials: chosenFinancials
          ? {
              subtotal: chosenFinancials.subtotal,
              taxAmount: chosenFinancials.tax_amount,
              totalAmount: chosenFinancials.total_amount,
            }
          : null,
      });
    } catch (cause) {
      setXlsxError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel للفاتورة.");
    }
  }

  return (
    <WorkspaceShell
      title="فواتيري"
      subtitle="مستندات الفوترة الصادرة بعد اعتماد الإدارة. يعرض ملخص الفاتورة تفاصيل الأصناف والكميات، ويضم PDF الأسعار والإجماليات المسموح بها لصلاحية الحساب."
    >
      <div
        style={{
          ...card,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span style={quiet}>{rows.length} فاتورة{hasMoreInvoices ? " محملة" : ""}</span>
        <button style={secondary} disabled={busy || loadingOlderInvoices} onClick={() => void load()}>
          <RefreshCw size={15} /> تحديث
        </button>
      </div>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      {!busy && hasMoreInvoices && (
        <p role="status" style={{ ...quiet, color: "#9b4e22", marginBottom: 12 }}>
          تعرض القائمة الأحدث أولًا. توجد فواتير أقدم يمكنك تحميلها دون فقد القائمة الحالية.
        </p>
      )}
      <section style={{ ...card, padding: 0, overflowX: "auto" }}>
        {busy ? (
          <p role="status" style={{ padding: 18 }}>
            جارٍ تحميل الفواتير...
          </p>
        ) : !rows.length ? (
          <EmptyBox>
            <FileText size={30} />
            <p>لا توجد فواتير صادرة بعد.</p>
            <p style={quiet}>تُصدر الفاتورة عند تأكيد الطلب من فريق الأغبري.</p>
            <Link to="/orders" className="sf-link">
              عرض طلباتي
            </Link>
          </EmptyBox>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                <th style={{ padding: 12 }}>رقم الفاتورة</th>
                <th>الإصدار</th>
                <th>الاستحقاق</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} style={{ borderTop: "1px solid #edf2f3" }}>
                  <td style={{ padding: 12, fontWeight: 800 }}>{i.invoice_number}</td>
                  <td>{formatDateShort(i.issued_at)}</td>
                  <td>{i.due_at ? formatDateShort(i.due_at) : "حسب الاتفاق"}</td>
                  <td>
                    {i.status === "paid"
                      ? "مدفوعة"
                      : i.status === "partially_paid"
                        ? "مدفوعة جزئيًا"
                        : i.status === "void"
                          ? "ملغاة"
                          : "صادرة"}
                  </td>
                  <td>
                    <button className="sf-link" onClick={() => void open(i)}>
                      عرض / طباعة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {olderInvoicesError && (
        <ErrorBox message={olderInvoicesError} retry={() => void loadOlderInvoices()} />
      )}
      {hasMoreInvoices && !busy && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            type="button"
            style={secondary}
            disabled={loadingOlderInvoices}
            onClick={() => void loadOlderInvoices()}
          >
            {loadingOlderInvoices ? "جارٍ تحميل فواتير أقدم..." : "عرض فواتير أقدم"}
          </button>
        </div>
      )}
      {chosen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="تفاصيل الفاتورة"
          className="print-area"
          style={{ ...card, marginTop: 18 }}
        >
          <div
            className="no-print"
            style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
          >
            <button style={secondary} onClick={() => setChosen(null)}>
              إغلاق
            </button>
            <button
              style={primary}
              onClick={() => void downloadInvoicePdf(chosen.id)}
              disabled={pdfBusyId === chosen.id}
            >
              <FileText size={16} />
              {pdfBusyId === chosen.id ? "جارٍ إنشاء PDF..." : "تنزيل PDF عربي"}
            </button>
            <button
              style={secondary}
              onClick={downloadInvoiceXlsx}
              disabled={detailBusy || items.length === 0}
            >
              <FileSpreadsheet size={15} /> تنزيل Excel
            </button>
            <button style={secondary} onClick={() => window.print()}>
              <Printer size={16} /> طباعة من المتصفح
            </button>
          </div>
          {pdfError && <ErrorBox message={pdfError} retry={() => void downloadInvoicePdf(chosen.id)} />}
          {xlsxError && <ErrorBox message={xlsxError} retry={downloadInvoiceXlsx} />}
          <header
            style={{
              borderBottom: "2px solid #087f8d",
              padding: "16px 0",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: "#087f8d" }}>الأغبري</h2>
              <small>فاتورة تجارية</small>
              <div style={{ marginTop: 8 }}>
                رقم العميل: <strong>{chosenCustomer?.customer_code ?? "—"}</strong>
              </div>
              <div>
                اسم العميل:{" "}
                <strong>
                  {chosenCustomer?.business_name ?? chosenCustomer?.contact_name ?? "—"}
                </strong>
              </div>
              {chosenCustomer?.tier_label && (
                <div>فئة العميل: <strong>{chosenCustomer.tier_label}</strong></div>
              )}
            </div>
            <div>
              <strong>{chosen.invoice_number}</strong>
              <div>{formatDate(chosen.issued_at)}</div>
              <small>الحالة: {chosen.status}</small>
            </div>
          </header>
          {detailBusy ? (
            <p role="status">جارٍ تحميل البنود...</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ textAlign: "right", padding: 10 }}>الصنف</th>
                  <th>الرمز</th>
                  <th>الكمية</th>
                  {financialDetailsVisible && <><th>سعر الوحدة</th><th>الإجمالي</th></>}
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid #edf2f3" }}>
                    <td style={{ padding: 10 }}>{l.description}</td>
                    <td>{l.item_code ?? "—"}</td>
                    <td>{formatNumber(Number(l.quantity))} {l.unit ?? ""}</td>
                    {financialDetailsVisible && <>
                      <td>{formatInvoiceMoney(l.unit_price, chosenFinancials?.currency ?? chosen.currency)}</td>
                      <td>{formatInvoiceMoney(l.line_total, chosenFinancials?.currency ?? chosen.currency)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!detailBusy && !financialDetailsVisible && (
            <p role="status" data-testid="invoice-prices-hidden" style={{ marginTop: 14, ...quiet }}>
              الأسعار والإجماليات مخفية في هذه الفاتورة وفق إعدادات المتجر.
            </p>
          )}
          {!detailBusy && chosenFinancials && (
            <div style={{ ...card, marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <div><span style={quiet}>الإجمالي الفرعي</span><strong style={{ display: "block", marginTop: 6 }}>{formatInvoiceMoney(chosenFinancials.subtotal, chosenFinancials.currency)}</strong></div>
              <div><span style={quiet}>الضريبة</span><strong style={{ display: "block", marginTop: 6 }}>{formatInvoiceMoney(chosenFinancials.tax_amount, chosenFinancials.currency)}</strong></div>
              <div><span style={quiet}>الإجمالي المستحق</span><strong style={{ display: "block", marginTop: 6 }}>{formatInvoiceMoney(chosenFinancials.total_amount, chosenFinancials.currency)}</strong></div>
            </div>
          )}
          {invoiceOrder?.quantity_review_required && (
            <p role="alert" style={{ marginTop: 14, fontWeight: 800, color: "#9a5b13" }}>
              تنبيه: الطلب بانتظار اعتماد تعديلات الكميات أو الأسعار.
            </p>
          )}
          {invoiceOrder?.customer_adjustment_note && (
            <p role="status" style={{ marginTop: 10, fontWeight: 800 }}>
              {invoiceOrder.customer_adjustment_note}
            </p>
          )}
          {invoiceOrder?.customer_payment_requested_at &&
            invoiceOrder.payment_request_status === "requested" && (
              <p
                role="status"
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: "#edf9f2",
                  color: "#17684d",
                  fontWeight: 800,
                }}
              >
                تم اعتماد الطلب من الإدارة. يرجى اتباع تعليمات السداد المتفق عليها مع الشركة؛ هذا
                الإشعار لا يؤكد استلام دفعة.
              </p>
            )}
        </section>
      )}
    </WorkspaceShell>
  );
}

export function CustomerStatementPage() {
  return (
    <Gate>
      <Statement />
    </Gate>
  );
}
function formatAccountMoney(value: number | string, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "غير متاح";
  return `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}
function Statement() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<(PaymentAmount & { id?: string; paid_at?: string })[]>([]);
  const [credits, setCredits] = useState<CustomerStatementCreditMemo[]>([]);
  const [statementSummary, setStatementSummary] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState("");
  const [summaryAsOfUtc, setSummaryAsOfUtc] = useState("");
  const [creditDetailsAvailable, setCreditDetailsAvailable] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setXlsxError("");
    try {
      const r = await supabase.rpc("get_customer_account_statement");
      if (r.error) throw new Error("تعذر قراءة كشف الحساب. تحقق من نشر مخطط المالية.");
      if (!r.data || typeof r.data !== "object") throw new Error("استجابة كشف الحساب غير مكتملة.");
      const payload = r.data as {
        invoices?: unknown;
        payments?: unknown;
        credits?: unknown;
        summary?: unknown;
        summary_as_of_utc?: unknown;
      };
      if (!Array.isArray(payload.invoices) || payload.invoices.length > 200 ||
          !Array.isArray(payload.payments) || payload.payments.length > 500) {
        throw new Error("تفاصيل كشف الحساب غير صالحة أو تجاوزت حدود القراءة.");
      }
      const parsedCredits = parseCustomerStatementCreditMemos(payload.credits);
      setInvoices(payload.invoices as Invoice[]);
      setPayments(payload.payments as (PaymentAmount & { id?: string; paid_at?: string })[]);
      setCredits(parsedCredits);
      setCreditDetailsAvailable(Array.isArray(payload.credits));
      setSummaryAsOfUtc(
        typeof payload.summary_as_of_utc === "string" && Number.isFinite(Date.parse(payload.summary_as_of_utc))
          ? payload.summary_as_of_utc
          : "",
      );
      setStatementSummary(Object.prototype.hasOwnProperty.call(payload, "summary") ? payload.summary : undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر قراءة بيانات كشف الحساب.");
      setInvoices([]);
      setPayments([]);
      setCredits([]);
      setCreditDetailsAvailable(false);
      setSummaryAsOfUtc("");
      setStatementSummary(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadStatementPdf = useCallback(async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token;
      if (sessionResult.error || !accessToken) {
        throw new Error("سجّل الدخول مجددًا لتنزيل كشف الحساب.");
      }

      const response = await fetch("/api/statement-pdf", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/pdf",
        },
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "تعذر إنشاء ملف PDF من كشف الحساب.";
        try {
          const body = (await response.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error.length < 240) message = body.error;
        } catch {
          // Keep the safe fallback when the server did not return JSON.
        }
        throw new Error(message);
      }

      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) {
        throw new Error("استجابة المستند غير صحيحة؛ لم يتم تنزيل الملف.");
      }
      const blob = await response.blob();
      if (blob.size < 500 || blob.type && !blob.type.toLowerCase().includes("application/pdf")) {
        throw new Error("ملف PDF فارغ أو غير صالح.");
      }

      const objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "aghbari-account-statement.pdf";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : "تعذر تنزيل كشف الحساب.");
    } finally {
      setPdfBusy(false);
    }
  }, []);

  const downloadStatementXlsx = useCallback(() => {
    setXlsxBusy(true);
    setXlsxError("");
    try {
      downloadCustomerAccountStatementWorkbookXlsx({
        invoices,
        payments,
        credits,
        summary: statementSummary,
        summaryAsOfUtc,
        generatedAt: new Date().toISOString(),
        creditDetailsAvailable,
      });
    } catch (cause) {
      setXlsxError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel لكشف الحساب.");
    } finally {
      setXlsxBusy(false);
    }
  }, [invoices, payments, credits, statementSummary, summaryAsOfUtc, creditDetailsAvailable]);

  useEffect(() => {
    void load();
  }, [load]);
  const totals = useMemo(
    () => summarizeAccount(invoices as InvoiceAmount[], payments, statementSummary),
    [invoices, payments, statementSummary],
  );
  const statementMayBePartial = isCustomerStatementPossiblyPartial(invoices.length, payments.length, credits.length);
  return (
    <WorkspaceShell title="كشف الحساب" subtitle="ملخص من الفواتير والمدفوعات المسجلة فقط.">
      <div
        className="no-print"
        style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <button style={primary} onClick={() => void downloadStatementPdf()} disabled={pdfBusy || loading}>
          <FileText size={15} /> {pdfBusy ? "جارٍ إنشاء PDF..." : "تنزيل PDF عربي"}
        </button>
        <button
          style={secondary}
          onClick={downloadStatementXlsx}
          disabled={loading || xlsxBusy || !totals.valid || statementSummary === undefined || !summaryAsOfUtc || !creditDetailsAvailable}
        >
          <FileSpreadsheet size={15} /> {xlsxBusy ? "جارٍ تجهيز Excel..." : "تنزيل Excel"}
        </button>
        <button style={secondary} onClick={() => window.print()} disabled={loading}>
          <Printer size={15} /> طباعة من المتصفح
        </button>
      </div>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      {pdfError && <ErrorBox message={pdfError} retry={() => void downloadStatementPdf()} />}
      {xlsxError && <ErrorBox message={xlsxError} retry={downloadStatementXlsx} />}
      {!loading && !creditDetailsAvailable && (
        <p role="note" style={{ ...quiet, color: "#9b4e22", marginBottom: 12 }}>
          تنزيل Excel غير متاح حتى يعيد الخادم تفاصيل الإشعارات الدائنة مع ملخص دفتر العميل الكامل.
        </p>
      )}
      {loading ? (
        <p role="status">جارٍ تحميل كشف الحساب...</p>
      ) : (
        <>
          {!totals.valid && (
            <p role="alert" style={{ ...quiet, color: "#9b4e22", marginBottom: 12 }}>
              تعذر احتساب أرصدة الحساب بدقة؛ توجد قيمة مالية غير صالحة في البيانات. لم تُعرض كصفر.
            </p>
          )}
          {statementMayBePartial && (
            <p role="status" style={{ ...quiet, color: "#9b4e22", marginBottom: 12 }}>
              تنبيه اكتمال التفاصيل: يعرض كشف الحساب بحد أقصى 200 فاتورة و500 دفعة و500 إشعار دائن. ملخص الأرصدة أعلاه من دفتر العميل الكامل عند توفر ملخص الخادم.
            </p>
          )}
          {statementSummary !== undefined && totals.valid && (
            <p role="status" style={{ ...quiet, marginBottom: 12 }}>
              إجماليات الرصيد محسوبة من دفتر العميل الكامل لكل عملة؛ قوائم التفاصيل أدناه محدودة للقراءة والطباعة.
            </p>
          )}
          {totals.valid ? (
            totals.currencies.length ? (
              <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
                {totals.currencies.map((currencyBalance) => (
                  <section key={currencyBalance.currency} style={card}>
                    <h3 style={{ margin: "0 0 12px", color: "#087f8d" }}>
                      ملخص الرصيد بعملة {currencyBalance.currency}
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
                      {(
                        [
                          ["إجمالي الفواتير", currencyBalance.invoiced],
                          ["المدفوع المسجل", currencyBalance.paid],
                          ["الإشعارات الدائنة", currencyBalance.credited],
                          ["المتبقي المستحق", currencyBalance.outstanding],
                        ] as const
                      ).map(([label, value]) => (
                        <article key={label} style={{ ...card, boxShadow: "none" }}>
                          <span style={quiet}>{label}</span>
                          <strong
                            style={{
                              display: "block",
                              fontSize: 23,
                              marginTop: 8,
                              color: label === "المتبقي المستحق" ? "#9b4e22" : "#087f8d",
                            }}
                          >
                            {formatAccountMoney(value, currencyBalance.currency)}
                          </strong>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p style={{ ...quiet, marginBottom: 18 }}>لا توجد أرصدة مالية مسجلة.</p>
            )
          ) : null}
          <section style={{ ...card, padding: 0, overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                  <th style={{ padding: 12 }}>التاريخ</th>
                  <th>المستند</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>الإشعارات الدائنة</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const balance = summarizeInvoiceAmounts(i as InvoiceAmount, payments);
                  return (
                    <tr key={i.id} style={{ borderTop: "1px solid #edf2f3" }}>
                      <td style={{ padding: 12 }}>{formatDateShort(i.issued_at)}</td>
                      <td>
                        <strong>{i.invoice_number}</strong>
                      </td>
                      <td>{balance.valid ? formatAccountMoney(balance.total, balance.currency) : "غير متاح"}</td>
                      <td>{balance.valid ? formatAccountMoney(balance.paid, balance.currency) : "غير متاح"}</td>
                      <td>{balance.valid ? formatAccountMoney(balance.credited, balance.currency) : "غير متاح"}</td>
                      <td>{balance.valid ? formatAccountMoney(balance.outstanding, balance.currency) : "غير متاح"}</td>
                      <td>
                        {i.status === "void"
                          ? "ملغاة"
                          : balance.valid && balance.credited > 0 && balance.outstanding === 0 && i.status !== "paid"
                            ? "مسوّاة بإشعار دائن"
                            : i.status === "paid"
                              ? "مدفوعة"
                              : i.status === "partially_paid"
                                ? "جزئيًا"
                                : "مستحقة"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!invoices.length && <p style={{ padding: 14 }}>لا توجد حركات مالية مسجلة.</p>}
          </section>
          <section style={{ ...card, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>سجل الدفعات المسجلة</h3>
            <p style={quiet}>حركات الدفعات كما أعادها دفتر العميل المصرّح به. لا تُعرض عملة أو قيمة لدفعة لا تتوفر فاتورتها ضمن تفاصيل القراءة الحالية.</p>
            {payments.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                      <th style={{ padding: 10 }}>تاريخ الدفع</th>
                      <th>الفاتورة المرتبطة</th>
                      <th>المبلغ</th>
                      <th>العملة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment, index) => {
                      const relatedInvoice = invoices.find((invoice) => invoice.id === payment.invoice_id);
                      return (
                        <tr key={payment.id ?? (payment.invoice_id + "-" + (payment.paid_at ?? "undated") + "-" + index)} style={{ borderTop: "1px solid #edf2f3" }}>
                          <td style={{ padding: 10 }}>{payment.paid_at ? formatDateShort(payment.paid_at) : "تاريخ غير متاح"}</td>
                          <td>{relatedInvoice?.invoice_number ?? "فاتورة خارج تفاصيل القراءة الحالية"}</td>
                          <td>{relatedInvoice ? formatAccountMoney(payment.amount, relatedInvoice.currency) : "غير متاح"}</td>
                          <td>{relatedInvoice?.currency ?? "غير متاحة"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={quiet}>لا توجد دفعات مسجلة ضمن تفاصيل القراءة الحالية.</p>
            )}
          </section>
          <section style={{ ...card, marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>الإشعارات الدائنة المرحّلة</h3>
            {credits.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                      <th style={{ padding: 10 }}>رقم الإشعار</th>
                      <th>الفاتورة الأصلية</th>
                      <th>تاريخ الترحيل</th>
                      <th>العملة والمبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map((credit) => (
                      <tr key={credit.id} style={{ borderTop: "1px solid #edf2f3" }}>
                        <td style={{ padding: 10 }}><strong>{credit.memo_number}</strong></td>
                        <td>{credit.invoice_number}</td>
                        <td>{formatDateShort(credit.posted_at)}</td>
                        <td>{formatAccountMoney(credit.total_amount, credit.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={quiet}>لا توجد إشعارات دائنة مرحّلة ضمن تفاصيل القراءة الحالية.</p>
            )}
          </section>
          <p style={quiet}>عدد الدفعات المسجلة: {payments.length}؛ الإشعارات الدائنة المعروضة: {credits.length}.</p>
        </>
      )}
    </WorkspaceShell>
  );
}

export function CustomerPaymentsPage() {
  return (
    <Gate>
      <CustomerPayments />
    </Gate>
  );
}

type CustomerPaymentHistoryRow = PaymentAmount & {
  id?: string;
  paid_at?: string;
};

function CustomerPayments() {
  const [payments, setPayments] = useState<CustomerPaymentHistoryRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [xlsxError, setXlsxError] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_customer_account_statement");
      if (result.error || !result.data || typeof result.data !== "object") {
        throw new Error("تعذر قراءة سجل الدفعات من دفتر الحساب المصرّح به.");
      }
      const payload = result.data as { invoices?: unknown; payments?: unknown };
      if (!Array.isArray(payload.invoices) || payload.invoices.length > 200 ||
          !Array.isArray(payload.payments) || payload.payments.length > 500) {
        throw new Error("أعاد الخادم تفاصيل دفعات غير مكتملة أو تجاوزت حدود القراءة.");
      }
      const parsed: CustomerPaymentHistoryRow[] = [];
      for (const candidate of payload.payments) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          throw new Error("توجد حركة دفع لا تطابق عقد دفتر الحساب؛ لم تُعرض بيانات جزئية.");
        }
        const row = candidate as Record<string, unknown>;
        const amount = typeof row.amount === "number" || typeof row.amount === "string"
          ? Number(row.amount)
          : NaN;
        if (typeof row.invoice_id !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.invoice_id) ||
            !Number.isFinite(amount) || amount < 0 ||
            (row.id !== undefined && (typeof row.id !== "string" ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id))) ||
            (row.paid_at !== undefined && (typeof row.paid_at !== "string" || !Number.isFinite(Date.parse(row.paid_at))))) {
          throw new Error("إحدى حركات الدفع تحتوي مرجعاً أو مبلغاً أو تاريخاً غير صالح.");
        }
        parsed.push({
          invoice_id: row.invoice_id,
          amount: row.amount as number | string,
          ...(typeof row.id === "string" ? { id: row.id } : {}),
          ...(typeof row.paid_at === "string" ? { paid_at: row.paid_at } : {}),
        });
      }
      setInvoices(payload.invoices as Invoice[]);
      setPayments(parsed);
    } catch (cause) {
      setInvoices([]);
      setPayments([]);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل الدفعات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invoiceById = useMemo(() => new Map(invoices.map(invoice => [invoice.id, invoice])), [invoices]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return payments;
    return payments.filter(payment => {
      const invoice = invoiceById.get(payment.invoice_id);
      return [
        invoice?.invoice_number ?? "",
        payment.paid_at ? formatDateShort(payment.paid_at) : "",
        payment.invoice_id,
      ].some(value => value.toLocaleLowerCase("ar").includes(term));
    });
  }, [invoiceById, payments, search]);

  function downloadPaymentHistoryXlsx() {
    if (loading || error || filtered.length === 0 || xlsxBusy) return;
    setXlsxBusy(true);
    setXlsxError("");
    try {
      downloadCustomerPaymentHistoryWorkbookXlsx({
        payments: filtered.map((payment) => {
          const invoice = invoiceById.get(payment.invoice_id);
          return {
            paidAt: payment.paid_at ?? null,
            invoiceNumber: invoice?.invoice_number ?? null,
            amount: invoice ? payment.amount : null,
            currency: invoice?.currency ?? null,
          };
        }),
        loadedCount: payments.length,
        detailMayBePartial,
        searchFiltered: Boolean(search.trim()),
      });
    } catch (cause) {
      setXlsxError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel لسجل الدفعات.");
    } finally {
      setXlsxBusy(false);
    }
  }

  const detailMayBePartial = payments.length >= 500 || invoices.length >= 200;
  return (
    <WorkspaceShell
      title="دفعاتي"
      subtitle="حركات الدفعات المسجلة في دفتر حسابك. هذه الشاشة للقراءة فقط ولا تنشئ دفعة أو إيصال سداد."
    >
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/statement" style={secondary}>كشف الحساب</Link>
          <Link to="/invoices" style={secondary}>الفواتير</Link>
        </div>
        <button type="button" style={secondary} onClick={downloadPaymentHistoryXlsx}
          disabled={loading || Boolean(error) || filtered.length === 0 || xlsxBusy}>
          <FileSpreadsheet size={15} /> {xlsxBusy ? "جارٍ تجهيز Excel..." : "تنزيل Excel"}
        </button>
        <button type="button" style={secondary} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> تحديث الدفعات
        </button>
      </div>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      {xlsxError && <ErrorBox message={xlsxError} retry={downloadPaymentHistoryXlsx} />}
      {!error && detailMayBePartial && (
        <p role="status" style={{ ...quiet, color: "#9b4e22", marginBottom: 12 }}>
          هذه قائمة تفاصيل محدودة بآخر 500 دفعة و200 فاتورة من مصدر كشف الحساب. لا تمثل هذه الصفحة وحدها كامل دفتر العميل.
        </p>
      )}
      <section style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>سجل الدفعات</h2>
            <p style={{ ...quiet, marginTop: 6 }}>عدد الحركات المحمّلة: {payments.length.toLocaleString("ar-YE")} · المعروض: {filtered.length.toLocaleString("ar-YE")}</p>
          </div>
          <label className="search-field" style={{ minWidth: 220 }}>
            <Search size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو التاريخ" maxLength={120} />
          </label>
        </div>
      </section>
      {loading ? (
        <p role="status">جارٍ تحميل الدفعات من دفتر الحساب...</p>
      ) : !error && filtered.length === 0 ? (
        <EmptyBox>{search ? "لا توجد دفعات تطابق البحث." : "لا توجد دفعات مسجلة ضمن تفاصيل القراءة الحالية."}</EmptyBox>
      ) : !error ? (
        <section style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                <th style={{ padding: 12 }}>تاريخ الدفع</th>
                <th>الفاتورة المرتبطة</th>
                <th>المبلغ</th>
                <th>العملة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((payment, index) => {
                const invoice = invoiceById.get(payment.invoice_id);
                const key = payment.id ?? payment.invoice_id + "-" + (payment.paid_at ?? "undated") + "-" + index;
                return (
                  <tr key={key} style={{ borderTop: "1px solid #edf2f3" }}>
                    <td style={{ padding: 12 }}>{payment.paid_at ? formatDateShort(payment.paid_at) : "تاريخ غير متاح"}</td>
                    <td>{invoice?.invoice_number ?? "فاتورة خارج تفاصيل القراءة الحالية"}</td>
                    <td>{invoice ? formatAccountMoney(payment.amount, invoice.currency) : "غير متاح"}</td>
                    <td>{invoice?.currency ?? "غير متاحة"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
      <p style={{ ...quiet, marginTop: 12 }}>
        مصدر البيانات هو أمر قراءة كشف الحساب المصرّح به. لا تعرض الشاشة تفاصيل مالية لدفعة لا تتوفر فاتورتها ضمن تفاصيل القراءة المحمّلة.
      </p>
    </WorkspaceShell>
  );
}

export function QuoteWorkspacePage() {
  return (
    <Gate>
      <Quotes />
    </Gate>
  );
}
function Quotes() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteItems, setQuoteItems] = useState<Record<string, QuoteLine[]>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMoreQuotes, setLoadingMoreQuotes] = useState(false);
  const [hasMoreQuotes, setHasMoreQuotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printingQuoteId, setPrintingQuoteId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const tenantScope = await getCurrentTenantScope().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "تعذر تحديد المؤسسة الحالية.");
      setLoading(false);
      return null;
    });
    if (!tenantScope) return;
    const { organizationId: orgId } = tenantScope;
    const [p, q] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,item_code,barcode,unit,status")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("name")
        .limit(500),
      supabase
        .from("sales_quotes")
        .select("id,quote_number,status,notes,response_note,created_at,quoted_at,valid_until")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50),
    ]);
    if (p.error || q.error)
      setError("تعذر تحميل المنتجات أو عروض الأسعار. تحقق من نشر ترحيل قاعدة البيانات.");
    else {
      try {
        const rows = (p.data ?? []) as Array<{ id: string; [key: string]: unknown }>;
        const priceMap = await fetchResolvedProductPrices(rows.map((row) => row.id));
        setProducts(rows.map((row) => withResolvedProductPrice(row, priceMap.get(row.id))) as Product[]);
      } catch (priceError) {
        setProducts([]);
        setError(priceError instanceof Error ? priceError.message : "تعذر تحميل سعر فئة حسابك.");
      }
      const quoteRows = (q.data ?? []) as Quote[];
      setQuotes(quoteRows);
      setQuoteItems({});
      setHasMoreQuotes(quoteRows.length === 50);
      if (quoteRows.length) {
        const lineRows = await supabase
          .from("sales_quote_items")
          .select(
            "id,quote_id,product_id,item_code,product_name_snapshot,unit_snapshot,requested_quantity,target_unit_price,quoted_unit_price",
          )
          .in(
            "quote_id",
            quoteRows.map((x) => x.id),
          )
          .order("created_at");
        if (lineRows.error) setError("تعذر قراءة أسعار العروض.");
        else {
          const grouped: Record<string, QuoteLine[]> = {};
          for (const row of (lineRows.data ?? []) as QuoteLine[]) {
            const key = row.quote_id ?? "";
            if (key) (grouped[key] ??= []).push(row);
          }
          setQuoteItems(grouped);
        }
      } else setQuoteItems({});
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!printingQuoteId) return;
    const clearAfterPrint = () => setPrintingQuoteId(null);
    window.addEventListener("afterprint", clearAfterPrint, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", clearAfterPrint);
  }, [printingQuoteId]);

  async function loadMoreQuotes() {
    if (loadingMoreQuotes || !hasMoreQuotes || quotes.length === 0) return;
    const cursor = quotes[quotes.length - 1];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(cursor.id) || !Number.isFinite(Date.parse(cursor.created_at))) {
      setError("تعذر التحقق من مؤشر سجل العروض؛ لم يتم تحميل صفحة غير موثوقة.");
      return;
    }

    setLoadingMoreQuotes(true);
    setError("");
    try {
      const { organizationId } = await getCurrentTenantScope();
      const cursorAt = new Date(cursor.created_at).toISOString();
      const { data, error: quoteError } = await supabase
        .from("sales_quotes")
        .select("id,quote_number,status,notes,response_note,created_at,quoted_at,valid_until")
        .eq("organization_id", organizationId)
        .or("created_at.lt." + cursorAt + ",and(created_at.eq." + cursorAt + ",id.lt." + cursor.id + ")")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (quoteError) throw new Error("تعذر تحميل العروض الأقدم من الخادم.");

      const rows = (data ?? []) as Quote[];
      if (rows.some((row) => !uuidPattern.test(row.id) || !Number.isFinite(Date.parse(row.created_at)))) {
        throw new Error("أعاد الخادم صف عرض سعر غير صالح؛ لم تُضف الصفحة إلى السجل.");
      }
      const existingIds = new Set(quotes.map((quote) => quote.id));
      const additions = rows.filter((quote) => !existingIds.has(quote.id));
      if (additions.length > 0) {
        const lineResult = await supabase
          .from("sales_quote_items")
          .select("id,quote_id,product_id,item_code,product_name_snapshot,unit_snapshot,requested_quantity,target_unit_price,quoted_unit_price")
          .in("quote_id", additions.map((quote) => quote.id))
          .order("created_at");
        if (lineResult.error) throw new Error("تعذر تحميل بنود العروض الأقدم؛ لم تُضف عروضًا بلا تفاصيلها.");
        const grouped: Record<string, QuoteLine[]> = {};
        for (const row of (lineResult.data ?? []) as QuoteLine[]) {
          const key = row.quote_id ?? "";
          if (key) (grouped[key] ??= []).push(row);
        }
        setQuoteItems((current) => ({ ...current, ...grouped }));
        setQuotes((current) => {
          const currentIds = new Set(current.map((quote) => quote.id));
          return [...current, ...additions.filter((quote) => !currentIds.has(quote.id))];
        });
      }
      setHasMoreQuotes(rows.length === 50 && additions.length > 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل العروض الأقدم.");
    } finally {
      setLoadingMoreQuotes(false);
    }
  }

  const normalizedQuoteSearch = quoteSearch.trim().toLocaleLowerCase("ar");
  const visibleQuotes = quotes.filter((quote) => {
    if (!normalizedQuoteSearch) return true;
    const lineText = (quoteItems[quote.id] ?? []).map((line) => line.product_name_snapshot + " " + (line.item_code ?? "")).join(" ");
    return [quote.quote_number, quote.status, quote.notes ?? "", quote.response_note ?? "", lineText]
      .join(" ").toLocaleLowerCase("ar").includes(normalizedQuoteSearch);
  });

  const printableQuote = printingQuoteId
    ? quotes.find((quote) => quote.id === printingQuoteId) ?? null
    : null;
  const printableDocument = printableQuote
    ? projectCustomerQuotePrintDocument(printableQuote, quoteItems[printableQuote.id] ?? [])
    : null;
  const visible = products.filter((p) => matchesArabicCatalogSearch(p, query));
  async function request(e: FormEvent) {
    e.preventDefault();
    const lines = Object.entries(quantities)
      .filter(([, q]) => Number.isInteger(q) && q > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!lines.length) {
      setError("اختر صنفًا واحدًا على الأقل وحدد كميته.");
      return;
    }
    setBusy(true);
    setError("");
    const r = await supabase.rpc("request_sales_quote", { p_lines: lines, p_notes: notes.trim() });
    if (r.error)
      setError(
        r.error.message.includes("approved customer")
          ? "حسابك التجاري بانتظار الاعتماد قبل طلب عرض سعر."
          : "تعذر إرسال الطلب: " + r.error.message,
      );
    else {
      setQuantities({});
      setNotes("");
      setNotice("تم إرسال طلب عرض السعر. لم يتم إنشاء طلب بيع أو فرض سعر.");
      await load();
    }
    setBusy(false);
  }
  async function answer(id: string, accept: boolean) {
    setBusy(true);
    setError("");
    const r = await supabase.rpc("customer_respond_to_quote", { p_quote_id: id, p_accept: accept });
    if (r.error) setError("تعذر تحديث العرض: " + r.error.message);
    else {
      setNotice(
        accept ? "سُجلت موافقتك على الأسعار. يلزم إنشاء طلب منفصل للشراء." : "تم رفض العرض.",
      );
      await load();
    }
    setBusy(false);
  }
  const label = (s: string) =>
    ({
      requested: "بانتظار التسعير",
      quoted: "تم التسعير",
      accepted: "مقبول",
      rejected: "مرفوض",
      expired: "منتهي",
    })[s] ?? s;
  return (
    <WorkspaceShell
      title="عروض الأسعار"
      subtitle="اطلب تسعيرًا تجاريًا موثقًا، ثم راجع رد فريق الأغبري."
    >

      {notice && (
        <div role="status" style={{ ...card, borderColor: "#a8d8c6", marginBottom: 12 }}>
          {notice}
        </div>
      )}
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <form onSubmit={request} style={{ ...card, display: "grid", gap: 12, marginBottom: 18 }}>
        <label>
          بحث في المنتجات
          <input
            style={{ ...field, marginTop: 6 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اسم الصنف أو الرمز أو الباركود"
          />
        </label>
        {loading ? (
          <p role="status">جارٍ تحميل المنتجات...</p>
        ) : (
          <div
            style={{
              maxHeight: 340,
              overflow: "auto",
              border: "1px solid #e6eeee",
              borderRadius: 10,
            }}
          >
            {visible.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) 100px",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  borderBottom: "1px solid #edf2f3",
                }}
              >
                <div>
                  <strong>{p.name}</strong>
                  <div style={quiet}>
                    {p.item_code} · {p.unit} · السعر الحالي {resolvedProductPriceLabel(p.base_price)}
                  </div>
                </div>
                <input
                  aria-label={"كمية " + p.name}
                  style={field}
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={quantities[p.id] ?? ""}
                  onChange={(e) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [p.id]: Math.min(10000, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                  placeholder="الكمية"
                />
              </div>
            ))}
          </div>
        )}
        <label>
          ملاحظات
          <textarea
            style={{ ...field, minHeight: 75, marginTop: 6 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="الكميات الشهرية أو موعد التوريد المطلوب"
          />
        </label>
        <button style={primary} type="submit" disabled={busy || loading}>
          <Send size={16} />
          {busy ? "جارٍ الإرسال..." : "إرسال طلب عرض سعر"}
        </button>
      </form>
      <h2 style={{ fontSize: 19 }}>عروضي السابقة</h2>
      <label style={{ ...card, display: "grid", gap: 6, marginBottom: 12 }}>
        البحث في سجل العروض المحمّلة
        <input
          style={field}
          value={quoteSearch}
          onChange={(event) => setQuoteSearch(event.target.value)}
          maxLength={120}
          placeholder="رقم العرض أو الحالة أو اسم الصنف أو ملاحظة الرد"
        />
      </label>
      {loading ? (
        <p role="status">جارٍ تحميل العروض...</p>
      ) : !quotes.length ? (
        <EmptyBox>لم ترسل عروض أسعار بعد.</EmptyBox>
      ) : !visibleQuotes.length ? (
        <EmptyBox>لا توجد عروض مطابقة للبحث ضمن العروض المحمّلة.</EmptyBox>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visibleQuotes.map((q) => (
            <article key={q.id} style={card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <strong>{q.quote_number}</strong>
                <span
                  style={{
                    borderRadius: 20,
                    padding: "4px 10px",
                    background: "#eff7f7",
                    color: "#087f8d",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {label(q.status)}
                </span>
              </div>
              <p style={quiet}>
                تاريخ الطلب: {formatDate(q.created_at)}
                {q.valid_until ? " · صالح حتى " + formatDateShort(q.valid_until) : ""}
              </p>
              {q.notes && <p>{q.notes}</p>}
              {(quoteItems[q.id] ?? []).length > 0 && (
                <div style={{ margin: "10px 0", borderTop: "1px solid #edf2f3", paddingTop: 8 }}>
                  {(quoteItems[q.id] ?? []).map((line) => (
                    <div
                      key={line.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "5px 0",
                      }}
                    >
                      <span>
                        {line.product_name_snapshot} ×{" "}
                        {formatNumber(Number(line.requested_quantity))}
                      </span>
                      <strong>
                        {line.quoted_unit_price == null
                          ? "بانتظار التسعير"
                          : formatCurrency(Number(line.quoted_unit_price)) + " / وحدة"}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              {q.response_note && (
                <p style={{ ...card, background: "#f8fbfb" }}>{q.response_note}</p>
              )}
              {projectCustomerQuotePrintDocument(q, quoteItems[q.id] ?? []) && (
                <button
                  className="customer-quote-print-trigger"
                  style={secondary}
                  disabled={busy}
                  onClick={() => setPrintingQuoteId(q.id)}
                >
                  <Printer size={16} /> طباعة عرض السعر
                </button>
              )}
              {(() => {
                const exportDocument = projectCustomerQuotePrintDocument(q, quoteItems[q.id] ?? []);
                return exportDocument ? (
                  <button
                    type="button"
                    className="customer-quote-xlsx-trigger"
                    style={secondary}
                    disabled={busy}
                    onClick={() => {
                      try {
                        downloadCustomerQuoteWorkbookXlsx(exportDocument);
                        setNotice("تم إعداد كشف عرض السعر المعتمد بصيغة Excel. لا يحتوي الملف على سعر الهدف أو التكلفة أو الهامش.");
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : "تعذر إعداد ملف Excel لعرض السعر.");
                      }
                    }}
                  >
                    <FileSpreadsheet size={16} /> تنزيل Excel
                  </button>
                ) : null;
              })()}
              {q.status === "quoted" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button disabled={busy} style={primary} onClick={() => void answer(q.id, true)}>
                    <CheckCircle2 size={16} /> الموافقة على الأسعار
                  </button>
                  <button
                    disabled={busy}
                    style={secondary}
                    onClick={() => void answer(q.id, false)}
                  >
                    رفض العرض
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {quotes.length > 0 && hasMoreQuotes ? (
        <div className="no-print" style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button
            type="button"
            style={secondary}
            disabled={loadingMoreQuotes || loading || busy}
            onClick={() => void loadMoreQuotes()}
          >
            <RefreshCw size={16} />
            {loadingMoreQuotes ? "جارٍ تحميل العروض الأقدم..." : "تحميل العروض الأقدم"}
          </button>
        </div>
      ) : null}
      {quotes.length > 0 && !hasMoreQuotes ? (
        <p role="status" style={{ ...quiet, textAlign: "center", marginTop: 12 }}>وصلت إلى نهاية سجل عروض الأسعار المتاح.</p>
      ) : null}
      {printableDocument && createPortal((
        <article
          className="customer-quote-print-sheet"
          data-testid="customer-quote-print-document"
          dir="rtl"
        >
          <header>
            <div>
              <h1 style={{ margin: 0, fontSize: 21 }}>متجر الأغبري | Aghbari Commerce</h1>
              <small>عرض سعر للعميل</small>
            </div>
            <div>
              <strong>رقم العرض: {printableDocument.quoteNumber}</strong>
              <p style={{ margin: "5px 0" }}>الحالة: {printableDocument.statusLabel}</p>
              <small>تاريخ الطلب: {printableDocument.createdAt ? formatDate(printableDocument.createdAt) : "—"}</small>
            </div>
          </header>
          {printableDocument.quotedAt && <p>تاريخ التسعير: {formatDate(printableDocument.quotedAt)}</p>}
          {printableDocument.validUntil && <p>صالح حتى: {formatDateShort(printableDocument.validUntil)}</p>}
          {printableDocument.customerNotes && <p>ملاحظات العميل: {printableDocument.customerNotes}</p>}
          {printableDocument.responseNote && <p>رد الأغبري: {printableDocument.responseNote}</p>}
          <table>
            <thead>
              <tr>
                <th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th>
                <th>الكمية المطلوبة</th><th>سعر الوحدة المعتمد في العرض</th>
              </tr>
            </thead>
            <tbody>
              {printableDocument.items.map((item, index) => (
                <tr key={item.itemCode + "-" + item.productName + "-" + index}>
                  <td>{item.itemCode ?? "—"}</td>
                  <td>{item.productName}</td>
                  <td>{item.unit ?? "—"}</td>
                  <td>{formatNumber(item.quantity)}</td>
                  <td>{formatCurrency(item.quotedUnitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 18, fontSize: 11 }}>
            يعرض هذا المستند أسعار العرض التي اعتمدها الخادم فقط، ولا يمثل أمر بيع أو إثبات استلام دفعة.
          </p>
        </article>
        ),
        document.body,
      )}
    </WorkspaceShell>
  );
}

export function ReorderWorkspacePage() {
  return (
    <Gate>
      <Reorder />
    </Gate>
  );
}
function Reorder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<ReorderTemplate[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState("طلب متكرر");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [priceVisibilityPolicy, setPriceVisibilityPolicy] = useState<unknown>(undefined);
  const loadRevisionRef = useRef(0);
  const activeProfileIdRef = useRef(user?.profileId);
  activeProfileIdRef.current = user?.profileId;
  const load = useCallback(async () => {
    const requestRevision = ++loadRevisionRef.current;
    setError("");
    const tenantScope = await getCurrentTenantScope().catch((cause) => {
      if (requestRevision === loadRevisionRef.current) {
        setError(cause instanceof Error ? cause.message : "تعذر تحديد المؤسسة الحالية.");
      }
      return null;
    });
    if (!tenantScope || requestRevision !== loadRevisionRef.current) return;
    const { organizationId: orgId } = tenantScope;
    const responses = await Promise.all([
      supabase
        .from("products")
        .select("id,name,item_code,barcode,unit,status")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("name")
        .limit(500),
      supabase
        .from("reorder_templates")
        .select("id,name,created_at,updated_at,source_order_id")
        .order("updated_at", { ascending: false })
        .limit(100),
      fetchSettingsMap().catch(() => null),
    ]).catch(() => null);
    if (!responses) {
      if (requestRevision === loadRevisionRef.current) {
        setError("تعذر تحميل المنتجات أو قوالب إعادة الطلب. تحقق من الاتصال ثم حاول مجددًا.");
      }
      return;
    }
    if (requestRevision !== loadRevisionRef.current) return;
    const [p, t, publicSettings] = responses;
    setPriceVisibilityPolicy(publicSettings?.show_price_on_cards);
    if (p.error || t.error)
      setError("تعذر تحميل المنتجات أو قوالب إعادة الطلب. تحقق من الاتصال وإعدادات الحساب.");
    else {
      try {
        const rows = (p.data ?? []) as Array<{ id: string; [key: string]: unknown }>;
        const priceMap = await fetchResolvedProductPrices(rows.map((row) => row.id));
        if (requestRevision !== loadRevisionRef.current) return;
        setProducts(rows.map((row) => withResolvedProductPrice(row, priceMap.get(row.id))) as Product[]);
      } catch (priceError) {
        if (requestRevision !== loadRevisionRef.current) return;
        setProducts([]);
        setError(priceError instanceof Error ? priceError.message : "تعذر تحميل سعر فئة حسابك.");
      }
      if (requestRevision === loadRevisionRef.current) {
        setTemplates((t.data ?? []) as ReorderTemplate[]);
      }
    }
  }, [user?.profileId]);
  useEffect(() => {
    setProducts([]);
    setTemplates([]);
    setQuantities({});
    setPriceVisibilityPolicy(undefined);
    setError("");
    setNotice("");
    setBusy(false);
    void load();
    return () => {
      loadRevisionRef.current += 1;
    };
  }, [load]);
  const visible = products.filter((p) => matchesArabicCatalogSearch(p, query));
  async function save(e: FormEvent) {
    e.preventDefault();
    const actionProfileId = user?.profileId;
    const lines = Object.entries(quantities)
      .filter(([, q]) => Number.isInteger(q) && q > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (name.trim().length < 2 || !lines.length) {
      setError("اكتب اسم القالب واختر صنفًا واحدًا على الأقل.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase.rpc("save_reorder_template", {
        p_name: name.trim(),
        p_lines: lines,
        p_source_order_id: null,
      });
      if (activeProfileIdRef.current !== actionProfileId) return;
      if (r.error) throw new Error("تعذر حفظ القالب. تحقق من الاتصال والصلاحيات ثم حاول مجددًا.");
      if (typeof r.data !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.data)) {
        throw new Error("لم يؤكد الخادم حفظ قالب صالح؛ لم تُعرض نتيجة نجاح.");
      }
      setNotice("تم حفظ قالب إعادة الطلب.");
      setQuantities({});
      await load();
    } catch (cause) {
      if (activeProfileIdRef.current === actionProfileId) {
        setError(cause instanceof Error ? cause.message : "تعذر حفظ قالب إعادة الطلب. تحقق من الاتصال ثم حاول مجددًا.");
      }
    } finally {
      if (activeProfileIdRef.current === actionProfileId) setBusy(false);
    }
  }
  async function apply(t: ReorderTemplate) {
    const actionProfileId = user?.profileId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await supabase
        .from("reorder_template_items")
        .select("product_id,quantity")
        .eq("template_id", t.id);
      if (activeProfileIdRef.current !== actionProfileId) return;
      if (r.error) throw new Error("تعذر قراءة أصناف القالب. حاول مجددًا.");
      const draft = normalizeCartDraft(
        (r.data ?? [])
          .filter((x: ReorderTemplateLine) => x.product_id)
          .map((x: ReorderTemplateLine) => ({
            product_id: x.product_id as string,
            quantity: Number(x.quantity),
          })),
      );
      if (!draft.length) throw new Error("لا يحتوي القالب على أصناف صالحة لإضافتها إلى السلة.");
      const merged = mergeOfflineCartDraft(window.localStorage, actionProfileId, draft);
      if (!merged) throw new Error("تعذر حفظ السلة المعزولة لهذا الحساب على الجهاز.");
      if (activeProfileIdRef.current !== actionProfileId) return;
      await navigate({ to: "/cart" });
    } catch (cause) {
      if (activeProfileIdRef.current === actionProfileId) {
        setError(cause instanceof Error ? cause.message : "تعذر تطبيق قالب إعادة الطلب. لم تتغير السلة.");
      }
    } finally {
      if (activeProfileIdRef.current === actionProfileId) setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      title="إعادة الطلب"
      subtitle="احفظ قوالب متكررة ثم حمّل كمياتها إلى السلة لمراجعتها قبل الإرسال."
    >
      {notice && (
        <div role="status" style={{ ...card, marginBottom: 12 }}>
          {notice}
        </div>
      )}
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <form onSubmit={save} style={{ ...card, display: "grid", gap: 12, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>حفظ قالب جديد</h2>
        <label>
          اسم القالب
          <input
            style={{ ...field, marginTop: 6 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          بحث في المنتجات
          <input
            style={{ ...field, marginTop: 6 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اسم الصنف أو الرمز"
          />
        </label>
        <div
          style={{
            maxHeight: 320,
            overflow: "auto",
            border: "1px solid #e6eeee",
            borderRadius: 10,
          }}
        >
          {visible.map((p) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 95px",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderBottom: "1px solid #edf2f3",
              }}
            >
              <div>
                <strong>{p.name}</strong>
                <div style={quiet}>
                  {p.item_code}{customerStorefrontPriceSuffix(priceVisibilityPolicy, p.base_price)}
                </div>
              </div>
              <input
                style={field}
                type="number"
                min="0"
                max="10000"
                step="1"
                aria-label={"كمية " + p.name}
                value={quantities[p.id] ?? ""}
                onChange={(e) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [p.id]: Math.min(10000, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
                placeholder="الكمية"
              />
            </div>
          ))}
        </div>
        <button type="submit" style={primary} disabled={busy}>
          <Save size={16} />
          {busy ? "جارٍ الحفظ..." : "حفظ القالب"}
        </button>
      </form>
      <h2 style={{ fontSize: 19 }}>قوالبي المحفوظة</h2>
      {!templates.length ? (
        <EmptyBox>ستظهر هنا القوالب التي تحفظها.</EmptyBox>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {templates.map((t) => (
            <article
              key={t.id}
              style={{
                ...card,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{t.name}</strong>
                <p style={quiet}>آخر تحديث: {formatDateShort(t.updated_at)}</p>
              </div>
              <button style={primary} disabled={busy} onClick={() => void apply(t)}>
                <ShoppingCart size={16} /> تحميل إلى السلة
              </button>
            </article>
          ))}
        </div>
      )}
    </WorkspaceShell>
  );
}

export function BarcodeWorkspacePage() {
  return (
    <Gate>
      <Barcode />
    </Gate>
  );
}
function Barcode() {
  const { user } = useAuth();
  const [value, setValue] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();
  const lookup = useCallback(
    async (raw = value) => {
      const code = raw.trim();
      if (!code) {
        setError("أدخل رقم الباركود أو رمز الصنف.");
        return;
      }
      if (code.length > 100) {
        setError("الرمز يتجاوز الحد المسموح.");
        return;
      }
      setBusy(true);
      setError("");
      setProduct(null);
      const tenantScope = await getCurrentTenantScope().catch((cause) => {
        setError(cause instanceof Error ? cause.message : "تعذر تحديد المؤسسة الحالية.");
        setBusy(false);
        return null;
      });
      if (!tenantScope) return;
      const { organizationId: orgId } = tenantScope;
      let r = await supabase
        .from("products")
        .select("id,name,item_code,barcode,unit,status")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .eq("barcode", code)
        .maybeSingle();
      if (!r.data && !r.error)
        r = await supabase
          .from("products")
          .select("id,name,item_code,barcode,unit,status")
          .eq("organization_id", orgId)
          .eq("status", "active")
          .eq("item_code", code)
          .maybeSingle();
      if (r.error) setError("تعذر البحث في الكتالوج.");
      else if (!r.data) setError("لم نعثر على صنف بهذا الرمز.");
      else {
        try {
          const priceMap = await fetchResolvedProductPrices([r.data.id]);
          setProduct(withResolvedProductPrice(r.data, priceMap.get(r.data.id)) as Product);
        } catch (priceError) {
          setError(priceError instanceof Error ? priceError.message : "تعذر تحميل سعر فئة حسابك.");
        }
      }
      setBusy(false);
    },
    [value],
  );
  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let stream: MediaStream | null = null;
    let frame = 0;
    let video: HTMLVideoElement | null = null;
    type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
    type DetectorCtor = new (options: { formats: string[] }) => Detector;

    const setup = async () => {
      try {
        const BarcodeCtor = (window as unknown as { BarcodeDetector?: DetectorCtor })
          .BarcodeDetector;
        if (!BarcodeCtor) {
          setCameraError("هذا المتصفح لا يدعم قراءة الباركود بالكاميرا. استخدم الإدخال اليدوي.");
          setScanning(false);
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        video = videoRef.current;
        if (!active || !video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
        });
        const scan = async () => {
          if (!active || !video) return;
          try {
            const hits = await detector.detect(video);
            if (hits[0]?.rawValue) {
              setValue(hits[0].rawValue);
              setScanning(false);
              return;
            }
          } catch {
            // Ignore one unreadable frame and continue scanning.
          }
          frame = requestAnimationFrame(() => void scan());
        };
        void scan();
      } catch {
        setCameraError("تعذر فتح الكاميرا. اسمح بالوصول إليها عبر HTTPS أو استخدم الإدخال اليدوي.");
        setScanning(false);
      }
    };
    void setup();
    return () => {
      active = false;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [scanning]);
  async function add() {
    if (!product) return;
    try {
      const merged = mergeOfflineCartDraft(window.localStorage, user?.profileId, [
        { product_id: product.id, quantity: 1 },
      ]);
      if (!merged) {
        setError("تعذر حفظ الصنف في السلة المعزولة لهذا الحساب.");
        return;
      }
      void navigate({ to: "/" });
    } catch {
      setError("تعذر حفظ الصنف في السلة على هذا الجهاز.");
    }
  }
  return (
    <WorkspaceShell
      title="ماسح الباركود"
      subtitle="اقرأ بالكاميرا في المتصفحات المدعومة أو استخدم البحث اليدوي."
    >
      {error && <ErrorBox message={error} />}
      {cameraError && <ErrorBox message={cameraError} />}
      <section style={{ ...card, display: "grid", gap: 12 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            autoComplete="off"
            aria-label="رقم الباركود"
            style={{ ...field, flex: "1 1 260px" }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="امسح الرمز أو اكتب رقم الباركود"
          />
          <button type="submit" style={primary} disabled={busy}>
            <Search size={16} />
            {busy ? "جارٍ البحث..." : "بحث"}
          </button>
          <button
            type="button"
            style={secondary}
            onClick={() => {
              setCameraError("");
              setScanning((v) => !v);
            }}
          >
            <ScanLine size={16} />
            {scanning ? "إيقاف الكاميرا" : "فتح الكاميرا"}
          </button>
        </form>
        {scanning && (
          <div style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: "100%", borderRadius: 12, background: "#111" }}
            />
            <p style={quiet}>وجّه الكاميرا نحو الباركود بإضاءة جيدة.</p>
          </div>
        )}
        {product && (
          <article style={{ ...card, borderColor: "#a8d8c6" }}>
            <h2 style={{ margin: "0 0 6px" }}>{product.name}</h2>
            <p style={quiet}>
              رمز الصنف: {product.item_code} · الباركود: {product.barcode ?? "غير مسجل"}
            </p>
            <strong style={{ fontSize: 22, color: "#087f8d" }}>
              {resolvedProductPriceLabel(product.base_price)}
            </strong>
            <span style={{ marginInlineStart: 8 }}>/ {product.unit}</span>
            <div style={{ marginTop: 14 }}>
              <button style={primary} onClick={() => void add()}>
                <ShoppingCart size={16} /> أضف إلى السلة
              </button>
            </div>
          </article>
        )}
      </section>
    </WorkspaceShell>
  );
}

export function CommerceAssistantPage() {
  return (
    <Gate>
      <Assistant />
    </Gate>
  );
}
async function loadAssistantOrderStatus(): Promise<string> {
  const response = await supabase
    .from("orders")
    .select("order_number,status,created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (response.error) throw response.error;
  return summarizeCustomerOrderStatuses((response.data ?? []) as AssistantOrderRow[], formatDateShort);
}

async function loadAssistantInvoiceStatus(): Promise<string> {
  const response = await supabase
    .from("customer_invoices")
    .select("invoice_number,status,issued_at")
    .order("issued_at", { ascending: false })
    .limit(100);
  if (response.error) throw new Error("تعذر الوصول إلى الفواتير. تحقق من نشر مخطط المالية.");
  return summarizeCustomerInvoiceStatuses(
    (response.data ?? []) as AssistantInvoiceStatusRow[],
    formatDateShort,
  );
}

async function searchAssistantCatalog(question: string): Promise<string> {
  const { organizationId } = await getCurrentTenantScope();
  const response = await supabase
    .from("products")
    .select("id,name,item_code,barcode,unit,status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("name")
    .limit(300);
  if (response.error) throw response.error;

  const tokens = question
    .split(/\s+/)
    .filter((word) =>
      word.length > 2 &&
      !/^(هل|يوجد|عندي|عندكم|من|في|على|ما|هو|هي|ابحث|لي|عن|سعر|كم|الرجاء|اريد|أريد)$/.test(word),
    );
  const matches = ((response.data ?? []) as Array<Omit<AssistantProductRow, "base_price">>)
    .filter((product) =>
      tokens.some((token) =>
        (product.name + " " + product.item_code + " " + (product.barcode ?? ""))
          .toLocaleLowerCase("ar")
          .includes(token.toLocaleLowerCase("ar")),
      ),
    )
    .slice(0, 8);
  const priceMap = await fetchResolvedProductPrices(matches.map((product) => product.id));
  const hits = matches.map((product) =>
    withResolvedProductPrice(product, priceMap.get(product.id)),
  ) as AssistantProductRow[];
  if (!hits.length) return "لم أعثر على صنف مطابق في الكتالوج الحالي.";
  return "نتائج من الكتالوج:\n" + hits
    .map((product) =>
      product.name + " (" + product.item_code + ") — " +
      resolvedProductPriceLabel(product.base_price) + "/" + product.unit,
    )
    .join("\n");
}

async function requestGeneralAssistant(question: string): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-gateway", {
      body: { action: "ask", question },
    });
    const result = data as { answer?: unknown } | null;
    return !error && typeof result?.answer === "string"
      ? result.answer
      : "المساعد الخارجي غير متاح أو تجاوز حدود الاستخدام. لا تزال بيانات الحساب الفعلية متاحة من شاشات الطلبات والفواتير والكتالوج.";
  } catch {
    return "المساعد الخارجي غير متاح الآن. يمكنك متابعة الطلبات والفواتير والأسعار من الشاشات الموثقة داخل المتجر.";
  }
}

async function resolveAssistantAnswer(question: string): Promise<string> {
  switch (classifyAssistantIntent(question)) {
    case "offline_help":
      return "افتح صفحة «دون اتصال» لعرض الكتالوج المخزن سابقًا ومسودة السلة. إرسال الطلب وتأكيد السعر يحتاجان اتصالًا بالخادم.";
    case "order_status":
      return loadAssistantOrderStatus();
    case "invoice_help":
      return loadAssistantInvoiceStatus();
    case "catalog_search":
      return searchAssistantCatalog(question);
    default:
      // Verified account data remains on deterministic, tenant-scoped paths above.
      return requestGeneralAssistant(question);
  }
}

function Assistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) {
      setError("اكتب سؤالك أولًا.");
      return;
    }
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      setAnswer(await resolveAssistantAnswer(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر استرجاع بيانات موثوقة.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      title="المساعد الذكي"
      subtitle="مساعد تجاري يعتمد على بيانات حسابك الفعلية ولا يخترع أسعارًا أو حالات طلبات."
    >
      <section style={{ ...card, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "#e3f4f2",
              color: "#087f8d",
            }}
          >
            <Bot size={26} />
          </span>
          <div>
            <strong style={{ fontSize: 18 }}>مساعد الأغبري</strong>
            <p style={quiet}>الطلبات والفواتير والمنتجات والاتصال.</p>
          </div>
        </div>
        <form onSubmit={ask} style={{ display: "grid", gap: 10 }}>
          <textarea
            style={{ ...field, minHeight: 96 }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="مثال: ما حالة طلبي الأخير؟ أو كم المتبقي في كشف حسابي؟"
          />
          <button style={primary} disabled={busy} type="submit">
            <Send size={16} />
            {busy ? "جارٍ فحص البيانات..." : "اسأل المساعد"}
          </button>
        </form>
        {error && <ErrorBox message={error} />}
        {answer && (
          <div
            role="status"
            style={{ ...card, whiteSpace: "pre-wrap", lineHeight: 1.9, background: "#f7fbfb" }}
          >
            {answer}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}

export function OfflineWorkspacePage() {
  return (
    <Gate>
      <Offline />
    </Gate>
  );
}
const OFFLINE_CATALOG_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function getOfflineCatalogFreshness(value: unknown, now = Date.now()): { label: string; stale: boolean; unknown: boolean } {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000) {
    return { label: "آخر تحقق من الخادم: غير معروف", stale: true, unknown: true };
  }
  const age = Math.max(0, now - timestamp);
  const minutes = Math.floor(age / 60_000);
  const hours = Math.floor(age / 3_600_000);
  const days = Math.floor(age / 86_400_000);
  const relative = minutes < 1
    ? "منذ أقل من دقيقة"
    : minutes < 60
      ? "منذ " + minutes + " دقيقة"
      : hours < 24
        ? "منذ " + hours + " ساعة"
        : "منذ " + days + " يوم";
  return {
    label: "آخر تحقق من الخادم: " + relative,
    stale: age >= OFFLINE_CATALOG_STALE_AFTER_MS,
    unknown: false,
  };
}
function Offline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const offlineCatalogKeys = offlineCatalogCacheKeys(user?.profileId);
  const catalogKey = offlineCatalogKeys?.catalogKey ?? null;
  const catalogSyncKey = offlineCatalogKeys?.lastServerSyncKey ?? null;
  const catalogScopeKey = offlineCatalogKeys?.scopeKey ?? null;
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [cached, setCached] = useState(0);
  const [lastCatalogSyncAt, setLastCatalogSyncAt] = useState<string | null>(null);
  const [cachedProducts, setCachedProducts] = useState<ReturnType<typeof sanitizePublicCatalogCache>>([]);
  const [draftLines, setDraftLines] = useState<ReturnType<typeof loadOfflineCartDraft>>([]);
  const [cartCount, setCartCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => {
    if (!catalogKey || !catalogSyncKey || !catalogScopeKey) {
      setLastCatalogSyncAt(null);
      setCachedProducts([]);
      setCached(0);
      setDraftLines([]);
      setCartCount(0);
      return;
    }
    try {
      clearLegacyOfflineCatalogCache(window.localStorage);
      const hasVerifiedScope = Boolean(localStorage.getItem(catalogScopeKey));
      if (!hasVerifiedScope) {
        clearOfflineCatalogCache(window.localStorage, user?.profileId);
      }
      let safeCatalog: ReturnType<typeof sanitizePublicCatalogCache> = [];
      const storedCatalog = hasVerifiedScope ? localStorage.getItem(catalogKey) : null;
      if (storedCatalog !== null) {
        try {
          safeCatalog = sanitizePublicCatalogCache(JSON.parse(storedCatalog));
        } catch {
          localStorage.removeItem(catalogKey);
        }
        // Rewrite only an existing catalog through the allowlist; do not create
        // an empty cache entry when the previous scope was invalidated.
        if (localStorage.getItem(catalogKey) !== null) {
          localStorage.setItem(catalogKey, JSON.stringify(safeCatalog));
        }
      }
      setLastCatalogSyncAt(hasVerifiedScope ? localStorage.getItem(catalogSyncKey) : null);
      setCachedProducts(safeCatalog);
      setCached(safeCatalog.length);
      // Cart drafts are profile-scoped independently from catalog authorization.
      const lines = loadOfflineCartDraft(window.localStorage, user?.profileId);
      setDraftLines(lines);
      setCartCount(lines.reduce((sum, line) => sum + line.quantity, 0));
    } catch {
      setCachedProducts([]);
      setCached(0);
      setDraftLines([]);
      setCartCount(0);
    }
  }, [catalogKey, catalogSyncKey, catalogScopeKey, user?.profileId]);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const verifyAndRefresh = async () => {
      const currentRevision = ++revision;
      if (!navigator.onLine) {
        setOnline(false);
        refresh();
        setMessage("وضع القراءة دون اتصال: لا يمكن إعادة التحقق من صلاحيات المؤسسة أو المستودع قبل عودة الخادم.");
        return;
      }
      setOnline(true);
      // Do not keep painting tenant-derived rows while the fresh scope is resolved.
      setLastCatalogSyncAt(null);
      setCachedProducts([]);
      setCached(0);
      if (!user?.profileId) {
        refresh();
        return;
      }
      try {
        const scope = await getCurrentTenantScope({ forceRefresh: true });
        if (scope.profileId !== user.profileId) {
          throw new Error("تغير نطاق الحساب الحالي؛ لم نعرض الكتالوج المحلي.");
        }
        const scopeMatches = reconcileOfflineCatalogScope(window.localStorage, scope);
        if (!active || currentRevision !== revision) return;
        refresh();
        if (!scopeMatches) {
          setMessage("تغير نطاق المؤسسة أو المستودع؛ أُزيل الكتالوج المحلي السابق. حدّث الكتالوج من الخادم.");
        }
      } catch (error) {
        if (!active || currentRevision !== revision) return;
        clearOfflineCatalogCache(window.localStorage, user.profileId);
        setLastCatalogSyncAt(null);
        setCachedProducts([]);
        setCached(0);
        const profileMismatch = error instanceof Error && error.message.includes("نطاق الحساب");
        setMessage(profileMismatch
          ? "تغير نطاق الحساب؛ لم نعرض الكتالوج المحلي."
          : "تعذر التحقق من نطاق المؤسسة والمستودع؛ لم نعرض الكتالوج المحلي.");
      }
    };
    const on = () => { setOnline(true); void verifyAndRefresh(); };
    const off = () => {
      revision += 1;
      setOnline(false);
      refresh();
      setMessage("وضع القراءة دون اتصال: الصلاحيات الحالية لا يمكن إعادة التحقق منها دون الخادم.");
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void verifyAndRefresh();
    return () => {
      active = false;
      revision += 1;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh, user?.profileId]);
  async function sync() {
    if (!online || !navigator.onLine) {
      setMessage("لا يوجد اتصال؛ ستظل النسخة المحلية محفوظة.");
      return;
    }
    if (!catalogKey || !catalogSyncKey || !catalogScopeKey || !user?.profileId) {
      setMessage("تعذر تحديد حساب صالح لحفظ نسخة الكتالوج المحلية.");
      return;
    }
    setSyncing(true);
    setMessage("");
    let persistedRows: ReturnType<typeof sanitizePublicCatalogCache> | null = null;
    try {
      const scopeBeforeSync = await getCurrentTenantScope({ forceRefresh: true });
      if (scopeBeforeSync.profileId !== user.profileId) {
        throw new Error("تغير نطاق الحساب؛ لم نحفظ نسخة الكتالوج.");
      }
      reconcileOfflineCatalogScope(window.localStorage, scopeBeforeSync);
      if (localStorage.getItem(catalogScopeKey) !== offlineCatalogScopeFingerprint(scopeBeforeSync)) {
        throw new Error("تغير نطاق الحساب أو تعذر تثبيته؛ لم نحفظ النسخة.");
      }
      const rows = sanitizePublicCatalogCache(await fetchProducts());
      const scopeAfterSync = await getCurrentTenantScope({ forceRefresh: true });
      if (
        offlineCatalogScopeFingerprint(scopeAfterSync) !==
        offlineCatalogScopeFingerprint(scopeBeforeSync)
      ) {
        clearOfflineCatalogCache(window.localStorage, user.profileId);
        throw new Error("تغير نطاق الحساب أو المستودع أثناء التحديث؛ لم نحفظ النسخة.");
      }
      localStorage.setItem(catalogKey, JSON.stringify(rows));
      persistedRows = rows;
      const syncedAt = new Date().toISOString();
      localStorage.setItem(catalogSyncKey, syncedAt);
      setLastCatalogSyncAt(syncedAt);
      refresh();
      setMessage(
        "تم تحديث نسخة الكتالوج المحلية من الخادم: " +
          rows.length +
          " صنف، مع أرصدة المخزون والتصنيفات المتاحة.",
      );
    } catch (error) {
      if (persistedRows) {
        try { localStorage.removeItem(catalogSyncKey); } catch { /* keep the UI fail-closed */ }
        setCachedProducts(persistedRows);
        setCached(persistedRows.length);
        setLastCatalogSyncAt(null);
        setMessage("حُفظت نسخة الكتالوج محليًا، لكن تعذر تثبيت وقت المزامنة؛ حداثتها غير مؤكدة. تحقق من الخادم قبل الاعتماد عليها.");
      } else {
        const scopeChanged = error instanceof Error && error.message.includes("تغير نطاق");
        if (scopeChanged && user?.profileId) {
          clearOfflineCatalogCache(window.localStorage, user.profileId);
          setLastCatalogSyncAt(null);
          setCachedProducts([]);
          setCached(0);
        }
        setMessage(scopeChanged
          ? "تغير نطاق الحساب أو المستودع أثناء التحديث؛ مُسحت النسخة المحلية القديمة."
          : "تعذر تحديث الكتالوج؛ لم نغيّر النسخة المحلية.");
      }
    } finally {
      setSyncing(false);
    }
  }
  function queue() {
    try {
      const lines = loadOfflineCartDraft(window.localStorage, user?.profileId);
      if (!lines.length) {
        setMessage("السلة فارغة.");
        return;
      }
      if (!saveOfflineCartDraft(window.localStorage, user?.profileId, lines)) {
        setMessage("تعذر حفظ المسودة على هذا الجهاز؛ لم نغيّر حالة الطلب.");
        return;
      }
      setDraftLines(lines);
      setCartCount(lines.reduce((sum, line) => sum + line.quantity, 0));
      setMessage(
        "حُفظت مسودة هذا الحساب (" +
          lines.length +
          " صنف). لن يُرسل أي طلب ولن يُعتمد سعر أو مخزون قبل التحقق من الخادم.",
      );
    } catch {
      setMessage("تعذر حفظ مسودة السلة المحلية.");
    }
  }
  async function restoreDraft() {
    if (!online || !navigator.onLine || !user?.profileId) {
      setMessage("استعادة المسودة تتطلب اتصالًا والتحقق من الحساب الحالي.");
      return;
    }
    setSyncing(true);
    setMessage("");
    try {
      const scope = await getCurrentTenantScope({ forceRefresh: true });
      if (scope.profileId !== user.profileId) {
        throw new Error("تغير نطاق الحساب؛ لم نستعد المسودة.");
      }
      const currentProducts = sanitizePublicCatalogCache(await fetchProducts());
      const allowedIds = new Set(currentProducts.map((product) => product.id));
      const saved = loadOfflineCartDraft(window.localStorage, user.profileId);
      if (!saved.length) {
        setDraftLines([]);
        setCartCount(0);
        setMessage("لا توجد مسودة محفوظة لهذا الحساب.");
        return;
      }
      const validLines = saved.filter((line) => allowedIds.has(line.product_id));
      if (!validLines.length) {
        setMessage("لا توجد أصناف في المسودة متاحة في الكتالوج الحالي. بقيت المسودة محفوظة للمراجعة.");
        return;
      }
      if (!saveOfflineCartDraft(window.localStorage, user.profileId, validLines)) {
        throw new Error("تعذر حفظ المسودة بعد مراجعتها.");
      }
      setDraftLines(validLines);
      setCartCount(validLines.reduce((sum, line) => sum + line.quantity, 0));
      if (validLines.length !== saved.length) {
        setMessage("حُذفت من المسودة الأصناف التي لم تعد تظهر في الكتالوج الحالي. راجع القائمة المحدّثة ثم اضغط «التحقق واستعادة السلة» مرة أخرى للمتابعة.");
        return;
      }
      setMessage("تم التحقق من وجود الأصناف في كتالوج هذا الحساب. ستُعاد مراجعة الأسعار والمخزون عند فتح السلة.");
      void navigate({ to: "/cart" });
    } catch (error) {
      setMessage(error instanceof Error
        ? "لم تُستعد المسودة: " + error.message + ". بقيت محفوظة ولم يُرسل طلب."
        : "تعذر التحقق من المسودة؛ بقيت محفوظة ولم يُرسل طلب.");
    } finally {
      setSyncing(false);
    }
  }
  const catalogFreshness = getOfflineCatalogFreshness(lastCatalogSyncAt);
  return (
    <WorkspaceShell
      title="العمل دون اتصال"
      subtitle="كتالوج مخزن ومسودة سلة على هذا الجهاز. لا تُعتمد الطلبات أو المدفوعات دون الخادم."
    >
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        {online ? <Wifi size={28} color="#087f8d" /> : <WifiOff size={28} color="#b45309" />}
        <div>
          <strong>{online ? "متصل بالإنترنت" : "غير متصل بالإنترنت"}</strong>
          <p style={quiet}>حالة اتصال الجهاز لا تضمن صحة قاعدة البيانات.</p>
          <p style={quiet}>{catalogFreshness.label}</p>
          {catalogFreshness.stale && (
            <p role="alert" style={{ ...quiet, color: "#b45309" }}>
              {catalogFreshness.unknown
                ? "لم يتم التحقق من حداثة النسخة المحلية؛ حدّث الكتالوج عند توفر الاتصال قبل الاعتماد على بياناته."
                : "النسخة المحلية قديمة؛ حدّث الكتالوج عند توفر الاتصال قبل الاعتماد على بياناته."}
            </p>
          )}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <article style={card}>
          <span style={quiet}>أصناف محفوظة</span>
          <strong style={{ fontSize: 25, display: "block", marginTop: 8 }}>
            {formatNumber(cached)}
          </strong>
        </article>
        <article style={card}>
          <span style={quiet}>كمية السلة</span>
          <strong style={{ fontSize: 25, display: "block", marginTop: 8 }}>
            {formatNumber(cartCount)}
          </strong>
        </article>
      </div>
      <section style={{ ...card, marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>مسودة السلة لهذا الحساب</h2>
        {draftLines.length ? (
          <ul style={{ margin: 0, paddingInlineStart: 24, lineHeight: 1.9 }}>
            {draftLines.map((line) => {
              const product = cachedProducts.find((item) => item.id === line.product_id);
              return (
                <li key={line.product_id}>
                  {product?.name ?? "صنف غير موجود في النسخة المحلية"} — {formatNumber(line.quantity)}
                  {product?.unit ? " " + product.unit : ""}
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ ...quiet, margin: 0 }}>لا توجد مسودة محفوظة لهذا الحساب على هذا الجهاز.</p>
        )}
        <p style={{ ...quiet, marginBottom: 0 }}>تُحفظ معرّفات الأصناف والكميات فقط؛ الأسعار والمخزون والاعتماد النهائي يعاد التحقق منها عبر الخادم.</p>
      </section>
      <section style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={primary} onClick={() => void sync()} disabled={syncing || !online}>
          <RefreshCw size={16} />
          {syncing ? "جارٍ التحديث..." : "تحديث الكتالوج المحلي"}
        </button>
        <button style={secondary} onClick={queue} disabled={syncing || draftLines.length === 0}>
          <Save size={16} /> حفظ مسودة السلة
        </button>
        <button style={primary} onClick={() => void restoreDraft()} disabled={syncing || !online || draftLines.length === 0}>
          <ShoppingCart size={16} /> التحقق واستعادة السلة
        </button>
        <Link to="/" style={secondary as React.CSSProperties}>
          فتح المتجر
        </Link>
      </section>
      {message && (
        <p role="status" style={{ ...card, marginTop: 14 }}>
          {message}
        </p>
      )}
      <p style={{ ...quiet, marginTop: 14 }}>
        بعد عودة الإنترنت، راجع السلة والأسعار الحالية ثم أرسل الطلب بالطريقة المعتادة. لا نحفظ
        بيانات الفواتير أو الحسابات الحساسة دون اتصال.
      </p>
    </WorkspaceShell>
  );
}

export function StaffQuotesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loadingMoreQuotes, setLoadingMoreQuotes] = useState(false);
  const [hasMoreQuotes, setHasMoreQuotes] = useState(true);
  const [chosen, setChosen] = useState<Quote | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [valid, setValid] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [printDocument, setPrintDocument] = useState<CustomerQuotePrintDocument | null>(null);
  const [dialogReady, setDialogReady] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const quoteOpenerRef = useRef<HTMLElement | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await supabase
      .from("sales_quotes")
      .select("id,quote_number,status,notes,response_note,created_at,quoted_at,valid_until")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (r.error) {
      setError("تعذر تحميل عروض الأسعار. تأكد من نشر ترحيل قاعدة البيانات.");
      setHasMoreQuotes(false);
    } else {
      const rows = (r.data ?? []) as Quote[];
      setQuotes(rows);
      setHasMoreQuotes(rows.length === 100);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function loadMoreQuotes() {
    if (loadingMoreQuotes || loading || !hasMoreQuotes || quotes.length === 0) return;
    const cursor = quotes[quotes.length - 1];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(cursor.id) || !Number.isFinite(Date.parse(cursor.created_at))) {
      setError("تعذر التحقق من مؤشر سجل العروض؛ لم يتم تحميل صفحة غير موثوقة.");
      return;
    }
    setLoadingMoreQuotes(true);
    setError("");
    try {
      const cursorAt = new Date(cursor.created_at).toISOString();
      const { data, error: quoteError } = await supabase
        .from("sales_quotes")
        .select("id,quote_number,status,notes,response_note,created_at,quoted_at,valid_until")
        .or("created_at.lt." + cursorAt + ",and(created_at.eq." + cursorAt + ",id.lt." + cursor.id + ")")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);
      if (quoteError) throw new Error("تعذر تحميل عروض الأسعار الأقدم من الخادم.");
      const rows = (data ?? []) as Quote[];
      if (rows.some((row) => !uuidPattern.test(row.id) || !Number.isFinite(Date.parse(row.created_at)))) {
        throw new Error("أعاد الخادم مؤشر عرض غير صالح؛ لم تُضف الصفحة إلى السجل.");
      }
      const existingIds = new Set(quotes.map((quote) => quote.id));
      const additions = rows.filter((quote) => !existingIds.has(quote.id));
      if (additions.length > 0) {
        setQuotes((current) => {
          const currentIds = new Set(current.map((quote) => quote.id));
          return [...current, ...additions.filter((quote) => !currentIds.has(quote.id))];
        });
      }
      setHasMoreQuotes(rows.length === 100 && additions.length > 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل عروض الأسعار الأقدم.");
    } finally {
      setLoadingMoreQuotes(false);
    }
  }

  useEffect(() => {
    if (!printDocument) return;
    const clearAfterPrint = () => setPrintDocument(null);
    window.addEventListener("afterprint", clearAfterPrint, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", clearAfterPrint);
  }, [printDocument]);

  const closePricingDialog = useCallback(() => {
    setChosen(null);
    setDialogReady(false);
    const opener = quoteOpenerRef.current;
    quoteOpenerRef.current = null;
    opener?.focus();
  }, []);

  useEffect(() => {
    if (!chosen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dialogReady) {
      const initialFocus = dialog.querySelector<HTMLElement>(
        'input[type="number"]:not([disabled])',
      ) ?? dialog.querySelector<HTMLElement>("button:not([disabled])") ?? dialog;
      initialFocus.focus();
    }

    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) =>
      !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
    );

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePricingDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [chosen, dialogReady, closePricingDialog]);

  function printSavedQuote() {
    if (!chosen) return;
    const document = projectCustomerQuotePrintDocument(chosen, lines);
    if (!document) {
      setError("لا يمكن طباعة العرض قبل اعتماد سعر الخادم لجميع البنود.");
      return;
    }
    setError("");
    setPrintDocument(document);
  }
  async function open(q: Quote) {
    quoteOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setDialogReady(false);
    setChosen(q);
    setLines([]);
    const r = await supabase
      .from("sales_quote_items")
      .select(
        "id,product_id,item_code,product_name_snapshot,unit_snapshot,requested_quantity,target_unit_price,quoted_unit_price",
      )
      .eq("quote_id", q.id)
      .order("created_at");
    if (r.error) {
      setError("تعذر تحميل بنود العرض.");
      closePricingDialog();
      return;
    }
    const rows = (r.data ?? []) as QuoteLine[];
    setLines(rows);
    setPrices(
      Object.fromEntries(
        rows.map((l) => [l.id, l.quoted_unit_price == null ? "" : String(l.quoted_unit_price)]),
      ),
    );
    setNote(q.response_note ?? "");
    setValid(q.valid_until?.slice(0, 10) ?? "");
    setDialogReady(true);
  }
  async function send() {
    if (!chosen) return;
    const p = lines.map((l) => ({ item_id: l.id, unit_price: Number(prices[l.id]) }));
    if (!p.length || p.some((x) => !Number.isFinite(x.unit_price) || x.unit_price < 0)) {
      setError("أدخل سعرًا صالحًا لكل بند.");
      return;
    }
    setBusy(true);
    setError("");
    const r = await supabase.rpc("respond_to_sales_quote", {
      p_quote_id: chosen.id,
      p_prices: p,
      p_response_note: note.trim(),
      p_valid_until: valid ? new Date(valid + "T23:59:59").toISOString() : null,
    });
    if (r.error) setError("تعذر حفظ التسعير: " + r.error.message);
    else {
      setMessage("تم حفظ العرض وإرساله للعميل.");
      closePricingDialog();
      await load();
    }
    setBusy(false);
  }
  async function reject(q: Quote) {
    setBusy(true);
    const r = await supabase
      .from("sales_quotes")
      .update({
        status: "rejected",
        responded_by: user?.profileId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", q.id);
    if (r.error) setError("تعذر تحديث العرض: " + r.error.message);
    else {
      setMessage("تم رفض طلب العرض.");
      await load();
    }
    setBusy(false);
  }
  return (
    <section style={{ display: "grid", gap: 14, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
      <header>
        <h1 style={{ fontSize: 24, margin: 0 }}>إدارة عروض الأسعار</h1>
        <p style={quiet}>
          سعّر بنود الطلب ثم أرسل العرض للعميل. لا تغيّر هذه العملية أسعار الكتالوج.
        </p>
      </header>
      {message && (
        <div role="status" style={card}>
          {message}
        </div>
      )}
      {error && <ErrorBox message={error} retry={() => void load()} />}
      {loading ? (
        <p role="status">جارٍ تحميل العروض...</p>
      ) : !quotes.length ? (
        <EmptyBox>لا توجد طلبات عروض أسعار.</EmptyBox>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {quotes.map((q) => (
            <article key={q.id} style={card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <strong>{q.quote_number}</strong>
                <span>{q.status}</span>
              </div>
              <p style={quiet}>
                {formatDate(q.created_at)}
                {q.notes ? " · " + q.notes : ""}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={primary} disabled={busy} onClick={() => void open(q)}>
                  فتح / تسعير
                </button>
                {q.status !== "accepted" && q.status !== "rejected" && (
                  <button style={secondary} disabled={busy} onClick={() => void reject(q)}>
                    رفض الطلب
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && hasMoreQuotes ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
          <button type="button" style={secondary}
            disabled={loadingMoreQuotes || busy} onClick={() => void loadMoreQuotes()}>
            {loadingMoreQuotes ? "جارٍ تحميل العروض الأقدم..." : "تحميل عروض أقدم"}
          </button>
        </div>
      ) : null}
      {chosen && (
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-quote-pricing-dialog-title"
          tabIndex={-1}
          style={{ ...card, display: "grid", gap: 12 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <h2 id="staff-quote-pricing-dialog-title" style={{ margin: 0, fontSize: 19 }}>تسعير {chosen.quote_number}</h2>
            <button type="button" style={secondary} onClick={closePricingDialog}>
              إغلاق
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ textAlign: "right", padding: 8 }}>الصنف</th>
                  <th>الكمية</th>
                  <th>السعر المطلوب</th>
                  <th>سعر العرض</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid #edf2f3" }}>
                    <td style={{ padding: 8 }}>
                      {l.product_name_snapshot}
                      <small style={{ display: "block", color: "#71868a" }}>{l.item_code}</small>
                    </td>
                    <td>
                      {formatNumber(Number(l.requested_quantity))} {l.unit_snapshot ?? ""}
                    </td>
                    <td>
                      {l.target_unit_price == null
                        ? "—"
                        : formatCurrency(Number(l.target_unit_price))}
                    </td>
                    <td>
                      <input
                        style={{ ...field, width: 140 }}
                        type="number"
                        min="0"
                        step="0.01"
                        value={prices[l.id] ?? ""}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label>
            رسالة للعميل
            <textarea
              style={{ ...field, minHeight: 70, marginTop: 6 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </label>
          <label>
            صالح حتى (اختياري)
            <input
              style={{ ...field, marginTop: 6 }}
              type="date"
              value={valid}
              onChange={(e) => setValid(e.target.value)}
            />
          </label>
          {projectCustomerQuotePrintDocument(chosen, lines) && (
            <button type="button" style={secondary} disabled={busy} onClick={printSavedQuote}>
              <Printer size={16} /> طباعة الأسعار المحفوظة
            </button>
          )}
          <button style={primary} disabled={busy} onClick={() => void send()}>
            <Save size={16} />
            {busy ? "جارٍ الحفظ..." : "حفظ الأسعار وإرسال العرض"}
          </button>
        </section>
      )}
      {printDocument && (
        <>
          <style>{`
            @page { size: A4 portrait; margin: 14mm; }
            .staff-quote-print-sheet { display: none; }
            @media print {
              body * { visibility: hidden !important; }
              .staff-quote-print-sheet,
              .staff-quote-print-sheet * { visibility: visible !important; }
              .staff-quote-print-sheet {
                display: block !important; position: fixed; inset: 0; width: 100%;
                box-sizing: border-box; padding: 0; background: #fff !important;
                color: #111 !important; direction: rtl; font-family: Tahoma, Arial, sans-serif;
              }
              .staff-quote-print-sheet header {
                display: flex; justify-content: space-between; gap: 16px;
                border-bottom: 2px solid #176b55; padding-bottom: 12px; margin-bottom: 14px;
              }
              .staff-quote-print-sheet table {
                width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 14px;
              }
              .staff-quote-print-sheet th,
              .staff-quote-print-sheet td {
                border: 1px solid #999 !important; padding: 7px; text-align: right;
                color: #111 !important;
              }
              .staff-quote-print-sheet thead { display: table-header-group; }
              .staff-quote-print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
            }
          `}</style>
          <article className="staff-quote-print-sheet" data-testid="staff-quote-print-document" dir="rtl">
            <header>
              <div>
                <h1 style={{ margin: 0, fontSize: 21 }}>متجر الأغبري | Aghbari Commerce</h1>
                <small>نسخة عرض سعر محفوظة للعميل</small>
              </div>
              <div>
                <strong>رقم العرض: {printDocument.quoteNumber}</strong>
                <p style={{ margin: "5px 0" }}>الحالة: {printDocument.statusLabel}</p>
                <small>تاريخ الطلب: {printDocument.createdAt ? formatDate(printDocument.createdAt) : "—"}</small>
              </div>
            </header>
            {printDocument.quotedAt && <p>تاريخ التسعير: {formatDate(printDocument.quotedAt)}</p>}
            {printDocument.validUntil && <p>صالح حتى: {formatDateShort(printDocument.validUntil)}</p>}
            {printDocument.customerNotes && <p>ملاحظات العميل: {printDocument.customerNotes}</p>}
            {printDocument.responseNote && <p>رد الأغبري: {printDocument.responseNote}</p>}
            <table>
              <thead><tr>
                <th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th>
                <th>الكمية المطلوبة</th><th>سعر الوحدة المعتمد في العرض</th>
              </tr></thead>
              <tbody>{printDocument.items.map((item, index) => (
                <tr key={item.itemCode + "-" + item.productName + "-" + index}>
                  <td>{item.itemCode ?? "—"}</td><td>{item.productName}</td><td>{item.unit ?? "—"}</td>
                  <td>{formatNumber(item.quantity)}</td><td>{formatCurrency(item.quotedUnitPrice)}</td>
                </tr>
              ))}</tbody>
            </table>
            <p style={{ marginTop: 18, fontSize: 11 }}>
              هذه النسخة تعكس الأسعار المحفوظة والمعتمدة لدى الخادم، ولا تعرض مسودات التسعير غير المحفوظة.
            </p>
          </article>
        </>
      )}
    </section>
  );
}

function parseExactMoneyCents(value: unknown): bigint | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 16 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  if (whole.length > 13) return null;
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return cents <= 999999999999999n ? cents : null;
}

function formatExactMoneyCents(value: bigint): string {
  return (value / 100n).toString() + "." + (value % 100n).toString().padStart(2, "0");
}

export function StaffFinancePage({ initialInvoiceId }: { initialInvoiceId?: string } = {}) {
  const { user } = useAuth();
  const canManageFinance = Boolean(
    user?.roles.some((role) => role === "admin" || role === "manager" || role === "accountant"),
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceHasMore, setInvoiceHasMore] = useState(false);
  const [loadingMoreInvoices, setLoadingMoreInvoices] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [splitReceipt, setSplitReceipt] = useState(false);
  const [allocationInvoiceIds, setAllocationInvoiceIds] = useState<string[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  // Keep a separate key for each unresolved request so changing form values cannot orphan an ambiguous retry.
  const paymentRequestKeysRef = useRef<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [latestReceiptId, setLatestReceiptId] = useState<string | null>(null);
  const [agingReport, setAgingReport] = useState<ReceivablesAgingReport | null>(null);
  const [agingOffset, setAgingOffset] = useState(0);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingError, setAgingError] = useState("");
  const [agingExportBusy, setAgingExportBusy] = useState(false);
  const [agingExportError, setAgingExportError] = useState("");

  function exportReceivablesAgingWorkbook() {
    if (!agingReport || agingLoading || agingError) return;
    setAgingExportBusy(true);
    setAgingExportError("");
    try {
      downloadReceivablesAgingWorkbookXlsx(agingReport);
    } catch (cause) {
      setAgingExportError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel لأعمار الذمم.");
    } finally {
      setAgingExportBusy(false);
    }
  }

  function printReceivablesAgingReport() {
    const root = document.documentElement;
    root.classList.add("print-receivables-aging");
    const restore = () => {
      root.classList.remove("print-receivables-aging");
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore, { once: true });
    try {
      window.print();
    } catch (cause) {
      restore();
      throw cause;
    }
  }
  const loadInvoices = useCallback(async (
    beforeIssuedAt: string | null,
    beforeId: string | null,
    append: boolean,
  ) => {
    if (append) setLoadingMoreInvoices(true);
    else setLoading(true);
    setError("");
    try {
      const r = await supabase.rpc("fetch_staff_finance_invoice_page", {
        p_limit: STAFF_FINANCE_INVOICE_PAGE_SIZE,
        p_before_issued_at: beforeIssuedAt,
        p_before_id: beforeId,
      });
      if (r.error) throw new Error("تعذر تحميل الفواتير المالية. تحقق من نشر الترحيل وصلاحيات المحاسب/الإدارة.");
      const payload = (r.data ?? {}) as {
        invoices?: unknown;
        total_invoices?: unknown;
        limit?: unknown;
        has_more?: unknown;
      };
      if (
        !Array.isArray(payload.invoices) ||
        typeof payload.total_invoices !== "number" ||
        !Number.isSafeInteger(payload.total_invoices) ||
        payload.total_invoices < 0 ||
        payload.limit !== STAFF_FINANCE_INVOICE_PAGE_SIZE ||
        typeof payload.has_more !== "boolean" ||
        payload.invoices.length > STAFF_FINANCE_INVOICE_PAGE_SIZE ||
        (payload.has_more && payload.invoices.length === 0)
      ) {
        throw new Error("أعاد الخادم صفحة فواتير غير مكتملة؛ لم يتم استبدال البيانات الحالية.");
      }
      const page = payload.invoices as Invoice[];
      setInvoices((current) => append ? [...current, ...page] : page);
      setInvoiceTotal(payload.total_invoices);
      setInvoiceHasMore(payload.has_more);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الفواتير المالية.");
      if (!append) {
        setInvoices([]);
        setInvoiceTotal(0);
        setInvoiceHasMore(false);
      }
    } finally {
      if (append) setLoadingMoreInvoices(false);
      else setLoading(false);
    }
  }, []);
  const load = useCallback(async () => {
    await loadInvoices(null, null, false);
  }, [loadInvoices]);
  const loadAging = useCallback(async (offset: number) => {
    setAgingLoading(true);
    setAgingError("");
    setAgingExportError("");
    try {
      const result = await supabase.rpc("fetch_staff_receivables_aging", {
        p_limit: RECEIVABLES_AGING_PAGE_SIZE,
        p_offset: offset,
      });
      if (result.error) throw new Error(result.error.message || "تعذر تحميل تقرير أعمار الذمم.");
      const report = result.data as ReceivablesAgingReport | null;
      if (
        !report || typeof report.as_of_utc !== "string" ||
        !Number.isSafeInteger(report.total_open_invoices) || report.total_open_invoices < 0 ||
        !Array.isArray(report.summary) || !Array.isArray(report.items) ||
        typeof report.has_more !== "boolean"
      ) {
        throw new Error("أعاد الخادم تقرير أعمار ذمم غير مكتمل؛ لم تُعرض مبالغ بديلة.");
      }
      setAgingReport(report);
      setAgingOffset(offset);
    } catch (cause) {
      setAgingError(cause instanceof Error ? cause.message : "تعذر تحميل تقرير أعمار الذمم.");
      setAgingReport(null);
    } finally {
      setAgingLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canManageFinance) {
      void load();
      void loadAging(0);
    }
  }, [load, loadAging, canManageFinance]);
  useEffect(() => {
    if (initialInvoiceId && invoices.some((invoice) => invoice.id === initialInvoiceId)) {
      setInvoiceId(initialInvoiceId);
    }
  }, [initialInvoiceId, invoices]);
  const outstanding = (i: Invoice): number | null => {
    if (i.status === "void") return 0;
    const raw = i.outstanding_amount;
    if (raw === undefined || raw === null) return null;
    const normalized = String(raw).trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
    const cents = Math.round(Number(normalized) * 100);
    return Number.isSafeInteger(cents) && cents >= 0 ? cents / 100 : null;
  };
  const paidAmountLabel = (i: Invoice): string => {
    if (i.paid_amount === undefined || i.paid_amount === null) return "غير متاح";
    const amount = typeof i.paid_amount === "number" ? i.paid_amount : Number(String(i.paid_amount).trim());
    return Number.isFinite(amount) && amount >= 0 ? formatCurrency(amount) : "غير متاح";
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      setError("اختر فاتورة صحيحة قبل تسجيل الدفعة.");
      return;
    }

    try {
      validateCustomerPaymentInput(amount, method, reference, notes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بيانات الدفعة غير صالحة.");
      return;
    }

    const normalizedMethod = method.trim().toLowerCase();
    const normalizedReference = reference.trim() || null;
    const normalizedNotes = notes.trim() || null;
    let allocations: { invoice_id: string; amount: string }[] | null = null;

    if (splitReceipt) {
      const selectedIds = [invoice.id, ...allocationInvoiceIds];
      if (selectedIds.length < 2 || selectedIds.length > 50 || new Set(selectedIds).size !== selectedIds.length) {
        setError("اختر فاتورتين على الأقل وبحد أقصى 50 فاتورة دون تكرار.");
        return;
      }

      const candidateInvoices = selectedIds.map((id) => invoices.find((item) => item.id === id));
      if (candidateInvoices.some((item) => !item)) {
        setError("إحدى الفواتير المحددة لم تعد ضمن صفحة البيانات المحمّلة؛ حدّث الفواتير ثم أعد التحديد.");
        return;
      }

      const normalized: { invoice_id: string; amount: string }[] = [];
      for (const selected of candidateInvoices) {
        if (!selected || selected.status === "void" ||
            selected.customer_id !== invoice.customer_id ||
            selected.currency !== invoice.currency) {
          setError("يجب أن تكون كل الفواتير نشطة وللعميل نفسه وبالعملة نفسها. لا ينفّذ النظام تحويل عملات.");
          return;
        }

        const rawAmount = selected.id === invoice.id ? amount : allocationAmounts[selected.id] ?? "";
        const cents = parseExactMoneyCents(rawAmount);
        const remaining = parseExactMoneyCents(selected.outstanding_amount);
        if (cents === null || cents <= 0n) {
          setError("أدخل مبلغ تخصيص موجبًا وصحيحًا حتى منزلتين عشريتين لكل فاتورة.");
          return;
        }
        if (remaining === null) {
          setError("تعذر التحقق من المتبقي من دفتر العميل الكامل لإحدى الفواتير؛ حدّث البيانات قبل التسجيل.");
          return;
        }
        if (cents > remaining) {
          setError("مبلغ التخصيص يتجاوز المتبقي في الفاتورة " + selected.invoice_number + ".");
          return;
        }
        normalized.push({ invoice_id: selected.id, amount: formatExactMoneyCents(cents) });
      }
      allocations = normalized.sort((a, b) => a.invoice_id.localeCompare(b.invoice_id));
    } else {
      const remaining = parseExactMoneyCents(invoice.outstanding_amount);
      const requested = parseExactMoneyCents(amount);
      if (remaining === null) {
        setError("تعذر التحقق من المتبقي من دفتر العميل الكامل؛ أعد تحميل البيانات قبل تسجيل الدفعة.");
        return;
      }
      if (requested === null || requested > remaining) {
        setError("المبلغ يتجاوز المتبقي على الفاتورة بعد احتساب الإشعارات الدائنة المرحّلة.");
        return;
      }
    }

    const requestFingerprint = allocations
      ? JSON.stringify({
          allocations,
          paymentMethod: normalizedMethod,
          reference: normalizedReference,
          notes: normalizedNotes,
        })
      : JSON.stringify({
          invoiceId: invoice.id,
          amount: Number(amount),
          paymentMethod: normalizedMethod,
          reference: normalizedReference,
          notes: normalizedNotes,
        });
    const pendingRequests = paymentRequestKeysRef.current;
    let idempotencyKey = pendingRequests.get(requestFingerprint);
    if (!idempotencyKey) {
      idempotencyKey = globalThis.crypto.randomUUID();
      pendingRequests.set(requestFingerprint, idempotencyKey);
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (allocations) {
        const result = await supabase.rpc("record_customer_payment_allocation", {
          p_allocations: allocations,
          p_payment_method: normalizedMethod,
          p_idempotency_key: idempotencyKey,
          p_reference: normalizedReference,
          p_notes: normalizedNotes,
        });
        const receipt = result.data as Record<string, unknown> | null;
        const expectedTotal = allocations.reduce(
          (sum, item) => sum + (parseExactMoneyCents(item.amount) ?? 0n),
          0n,
        );
        const acknowledgedTotal = receipt ? parseExactMoneyCents(receipt.total_amount) : null;
        const validReceiptId = typeof receipt?.receipt_id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.receipt_id);
        const validReceipt = validReceiptId &&
          receipt?.currency === invoice.currency &&
          receipt?.allocation_count === allocations.length &&
          typeof receipt?.replayed === "boolean" &&
          acknowledgedTotal === expectedTotal;
        if (result.error || !validReceipt) {
          const reason = result.error?.message ?? "استجابة الخادم لسند القبض غير مكتملة أو غير متطابقة";
          setError("تعذر تأكيد سند القبض: " + reason + ". أعد المحاولة بالقيم نفسها.");
          return;
        }
        setLatestReceiptId(receipt.receipt_id as string);
      } else {
        const result = await supabase.rpc("record_customer_payment", {
          p_invoice_id: invoice.id,
          p_amount: Number(amount),
          p_payment_method: normalizedMethod,
          p_idempotency_key: idempotencyKey,
          p_reference: normalizedReference,
          p_notes: normalizedNotes,
        });
        const acknowledgedPaymentId = typeof result.data === "string" ? result.data.trim() : "";
        const hasValidPaymentId =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            acknowledgedPaymentId,
          );
        if (result.error || !hasValidPaymentId) {
          const reason = result.error?.message ?? "استجابة الخادم لم تتضمن معرف دفعة صالحًا";
          setError("تعذر تسجيل الدفعة: " + reason + ". أعد المحاولة بالقيم نفسها.");
          return;
        }
      }

      if (paymentRequestKeysRef.current.get(requestFingerprint) === idempotencyKey) {
        paymentRequestKeysRef.current.delete(requestFingerprint);
      }
      setMessage(allocations
        ? "تم تسجيل سند القبض وتوزيعه على " + allocations.length + " فواتير مع تحديث أرصدتها."
        : "تم تسجيل الدفعة وتحديث حالة الفاتورة.");
      setInvoiceId("");
      setAmount("");
      setReference("");
      setNotes("");
      setSplitReceipt(false);
      setAllocationInvoiceIds([]);
      setAllocationAmounts({});
      try {
        await Promise.all([load(), loadAging(0)]);
      } catch {
        setError("تم تسجيل الدفعة، لكن تعذر تحديث العرض المالي. أعد تحميل البيانات.");
      }
    } catch {
      setError(
        allocations
          ? "تعذر تأكيد نتيجة سند القبض. أعد المحاولة بالقيم نفسها؛ سيُستخدم مفتاح الطلب نفسه."
          : "تعذر تأكيد نتيجة الدفعة. أعد المحاولة بالقيم نفسها؛ سيُستخدم مفتاح الطلب نفسه.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!canManageFinance)
    return (
      <section className="panel" role="alert" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>صلاحية المحاسبة مطلوبة</h1>
        <p>هذا القسم متاح للمحاسب ولفريق الإدارة المخوّل فقط.</p>
      </section>
    );
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 24, margin: 0 }}>الفواتير والتحصيل</h1>
        <p style={quiet}>تسجيل دفعة فعلية من خلال أمر خادمي يتحقق من المتبقي داخل معاملة واحدة.</p>
      </header>
      <FinanceDocumentPrintActions />
      <CustomerPaymentReceiptPrintActions latestReceiptId={latestReceiptId} />
      {message && (
        <div role="status" style={card}>
          {message}
        </div>
      )}
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <form
        onSubmit={submit}
        style={{
          ...card,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 12,
        }}
      >
        <label>
          الفاتورة
          <select
            style={{ ...field, marginTop: 6 }}
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              setSplitReceipt(false);
              setAllocationInvoiceIds([]);
              setAllocationAmounts({});
            }}
            required
          >
            <option value="">اختر فاتورة</option>
            {invoices.map((i) => {
              const remaining = outstanding(i);
              if (i.status === "void" || remaining === null || remaining <= 0) return null;
              return (
                <option key={i.id} value={i.id}>
                  {i.invoice_number} — متبقٍ {formatCurrency(remaining)}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          المبلغ
          <input
            style={{ ...field, marginTop: 6 }}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={splitReceipt}
            disabled={busy || !invoiceId || invoices.every((item) =>
              item.id === invoiceId || item.customer_id !== invoices.find((row) => row.id === invoiceId)?.customer_id ||
              item.currency !== invoices.find((row) => row.id === invoiceId)?.currency ||
              item.status === "void" || (parseExactMoneyCents(item.outstanding_amount) ?? 0n) <= 0n
            )}
            onChange={(event) => {
              setSplitReceipt(event.target.checked);
              setAllocationInvoiceIds([]);
              setAllocationAmounts({});
            }}
          />
          توزيع سند قبض واحد على عدة فواتير للعميل نفسه وبالعملة نفسها
        </label>
        {splitReceipt && (() => {
          const primaryInvoice = invoices.find((item) => item.id === invoiceId);
          const candidates = primaryInvoice
            ? invoices.filter((item) =>
                item.id !== primaryInvoice.id &&
                item.customer_id === primaryInvoice.customer_id &&
                item.currency === primaryInvoice.currency &&
                item.status !== "void" &&
                (parseExactMoneyCents(item.outstanding_amount) ?? 0n) > 0n
              )
            : [];
          return (
            <section
              aria-label="توزيع سند القبض على الفواتير"
              style={{ gridColumn: "1/-1", border: "1px solid #d6dfe4", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}
            >
              <p style={quiet}>
                المبلغ الأول أعلاه يُخصص للفاتورة الأساسية. اختر الفواتير الإضافية وحدد الجزء المخصص لكل منها.
                لا يجري النظام تحويلًا بين العملات.
              </p>
              {candidates.length === 0 ? (
                <p role="status" style={quiet}>لا توجد فواتير إضافية متاحة للعميل والعملة المحددين ضمن البيانات المحمّلة.</p>
              ) : candidates.map((candidate) => {
                const selected = allocationInvoiceIds.includes(candidate.id);
                return (
                  <div key={candidate.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(150px,220px)", gap: 10, alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        aria-label={"تخصيص على الفاتورة " + candidate.invoice_number}
                        checked={selected}
                        disabled={busy}
                        onChange={(event) => {
                          setAllocationInvoiceIds((current) => event.target.checked
                            ? [...current, candidate.id]
                            : current.filter((id) => id !== candidate.id));
                          if (!event.target.checked) {
                            setAllocationAmounts((current) => {
                              const next = { ...current };
                              delete next[candidate.id];
                              return next;
                            });
                          }
                        }}
                      />
                      <span>
                        <strong>{candidate.invoice_number}</strong>
                        <small style={{ display: "block", color: "var(--muted-foreground, #66757b)" }}>
                          متبقٍ {formatCurrency(outstanding(candidate) ?? 0)} {candidate.currency}
                        </small>
                      </span>
                    </label>
                    {selected && (
                      <label>
                        مبلغ التخصيص
                        <input
                          type="text"
                          inputMode="decimal"
                          maxLength={16}
                          aria-label={"مبلغ التخصيص على الفاتورة " + candidate.invoice_number}
                          style={{ ...field, marginTop: 5 }}
                          placeholder="0.00"
                          value={allocationAmounts[candidate.id] ?? ""}
                          disabled={busy}
                          onChange={(event) => setAllocationAmounts((current) => ({
                            ...current,
                            [candidate.id]: event.target.value,
                          }))}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })()}
        <label>
          طريقة الدفع
          <select
            style={{ ...field, marginTop: 6 }}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="cash">نقدًا</option>
            <option value="transfer">تحويل</option>
            <option value="card">بطاقة</option>
            <option value="other">أخرى</option>
          </select>
        </label>
        <label>
          مرجع العملية
          <input
            style={{ ...field, marginTop: 6 }}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={200}
          />
        </label>
        <label style={{ gridColumn: "1/-1" }}>
          ملاحظات
          <textarea
            style={{ ...field, minHeight: 65, marginTop: 6 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
          />
        </label>
        <button style={primary} disabled={busy || loading} type="submit">
          <Banknote size={16} />
          {busy ? "جارٍ تسجيل الدفعة..." : splitReceipt ? "تسجيل سند القبض وتوزيعه" : "تسجيل الدفعة"}
        </button>
      </form>
      {loading ? (
        <p role="status">جارٍ تحميل الفواتير...</p>
      ) : (
        <section style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                <th style={{ padding: 12 }}>الفاتورة</th>
                <th>الإصدار</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const remainingAmount = outstanding(i);
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid #edf2f3" }}>
                    <td style={{ padding: 12 }}>{i.invoice_number}</td>
                    <td>{formatDateShort(i.issued_at)}</td>
                    <td>{formatCurrency(Number(i.total_amount))}</td>
                    <td>{paidAmountLabel(i)}</td>
                    <td>{typeof remainingAmount === "number" ? formatCurrency(remainingAmount) : "غير متاح"}</td>
                    <td>{i.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {!loading && (
        <div
          aria-label="ترقيم صفحات الفواتير"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}
        >
          <span style={quiet}>
            تم تحميل {invoices.length.toLocaleString("ar-YE")} فاتورة من إجمالي {invoiceTotal.toLocaleString("ar-YE")} فاتورة
          </span>
          {invoiceHasMore && (
            <button
              type="button"
              style={secondary}
              disabled={loadingMoreInvoices}
              onClick={() => {
                const last = invoices[invoices.length - 1];
                if (last) void loadInvoices(last.issued_at, last.id, true);
              }}
            >
              {loadingMoreInvoices ? "جارٍ تحميل المزيد..." : "تحميل المزيد من الفواتير"}
            </button>
          )}
        </div>
      )}
      <section className="receivables-aging-report" style={{ ...card, display: "grid", gap: 12 }}>
        <header>
          <h2 style={{ margin: 0, fontSize: 20 }}>تقرير أعمار الذمم المدينة</h2>
          <p style={quiet}>
            يعتمد التقرير على الفواتير والدفعات المحفوظة في الخادم، ويحسب المتبقي لكل فاتورة قبل تجميعه حسب العملة وفترة التأخر.
            الفواتير الملغاة مستبعدة، وتواريخ الاستحقاق المفقودة تبقى ضمن بند مستقل ولا تُصنف على أنها متأخرة أو صفرية.
          </p>
          <div className="receivables-aging-print-controls" style={{ display: "flex", justifyContent: "flex-start", marginTop: 10 }}>
            <button
              type="button"
              style={secondary}
              disabled={agingLoading || !agingReport || Boolean(agingError) || agingExportBusy}
              onClick={exportReceivablesAgingWorkbook}
            ><FileSpreadsheet size={15} /> {agingExportBusy ? "جارٍ تجهيز Excel..." : "تنزيل Excel للملخص والصفحة المعروضة"}</button>
            <button
              type="button"
              style={secondary}
              disabled={agingLoading || !agingReport || Boolean(agingError)}
              onClick={printReceivablesAgingReport}
            ><Printer size={15} /> طباعة كشف أعمار الذمم (الملخص والصفحة المعروضة)</button>
          </div>
          {agingReport && (
            <p style={{ ...quiet, marginTop: 8 }}>
              مرجع التاريخ: {agingReport.as_of_utc} UTC — إجمالي الفواتير ذات الرصيد المستحق: {agingReport.total_open_invoices.toLocaleString("ar-YE")}
            </p>
          )}
        </header>
        {agingError && <ErrorBox message={agingError} retry={() => void loadAging(agingOffset)} />}
        {agingExportError && <ErrorBox message={agingExportError} retry={exportReceivablesAgingWorkbook} />}
        {agingLoading && <p role="status">جارٍ تحميل تقرير الذمم من الخادم...</p>}
        {!agingLoading && !agingError && agingReport && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                    <th style={{ padding: 10 }}>العملة</th>
                    <th>غير متأخر</th>
                    <th>1–30 يومًا</th>
                    <th>31–60 يومًا</th>
                    <th>61–90 يومًا</th>
                    <th>أكثر من 90</th>
                    <th>استحقاق غير محدد</th>
                    <th>إجمالي المتبقي</th>
                    <th>فواتير متأخرة</th>
                  </tr>
                </thead>
                <tbody>
                  {agingReport.summary.map((summary) => (
                    <tr key={summary.currency} style={{ borderTop: "1px solid #edf2f3" }}>
                      <td style={{ padding: 10, fontWeight: 800 }}>{summary.currency}</td>
                      <td>{formatAgingMoney(summary.current_amount, summary.currency)}</td>
                      <td>{formatAgingMoney(summary.days_1_30_amount, summary.currency)}</td>
                      <td>{formatAgingMoney(summary.days_31_60_amount, summary.currency)}</td>
                      <td>{formatAgingMoney(summary.days_61_90_amount, summary.currency)}</td>
                      <td>{formatAgingMoney(summary.over_90_amount, summary.currency)}</td>
                      <td>{formatAgingMoney(summary.unknown_due_date_amount, summary.currency)}</td>
                      <td style={{ fontWeight: 800 }}>{formatAgingMoney(summary.total_outstanding_amount, summary.currency)}</td>
                      <td>{summary.overdue_invoice_count.toLocaleString("ar-YE")}</td>
                    </tr>
                  ))}
                  {agingReport.summary.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 14 }}>لا توجد أرصدة مستحقة مسجلة ضمن نطاق المؤسسة.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>تفاصيل الفواتير المستحقة</h3>
              <span style={quiet}>
                عرض {agingReport.items.length ? agingOffset + 1 : 0}–{agingOffset + agingReport.items.length} من {agingReport.total_open_invoices.toLocaleString("ar-YE")}
              </span>
            </div>
            {agingReport.items.length === 0 ? (
              <p role="status" style={quiet}>لا توجد فواتير مستحقة في هذه الصفحة.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                      <th style={{ padding: 10 }}>الفاتورة / العميل</th>
                      <th>الاستحقاق</th>
                      <th>التأخر بالأيام</th>
                      <th>تصنيف العمر</th>
                      <th>الإجمالي</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingReport.items.map((item) => (
                      <tr key={item.id} style={{ borderTop: "1px solid #edf2f3" }}>
                        <td style={{ padding: 10 }}>
                          <strong>{item.invoice_number}</strong>
                          <div style={quiet}>{item.customer_name || "عميل غير محدد"}</div>
                        </td>
                        <td>{formatAgingDate(item.due_at)}</td>
                        <td>{item.days_overdue === null ? "غير محدد" : item.days_overdue.toLocaleString("ar-YE")}</td>
                        <td>{RECEIVABLES_AGING_BUCKET_LABELS[item.aging_bucket] ?? "غير مصنف"}</td>
                        <td>{formatAgingMoney(item.total_amount, item.currency)}</td>
                        <td>{formatAgingMoney(item.paid_amount, item.currency)}</td>
                        <td style={{ fontWeight: 800 }}>{formatAgingMoney(item.outstanding_amount, item.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                style={secondary}
                disabled={agingLoading || agingOffset === 0}
                onClick={() => void loadAging(Math.max(0, agingOffset - RECEIVABLES_AGING_PAGE_SIZE))}
              >السابق</button>
              <button
                type="button"
                style={secondary}
                disabled={agingLoading || !agingReport.has_more}
                onClick={() => void loadAging(agingOffset + RECEIVABLES_AGING_PAGE_SIZE)}
              >التالي</button>
            </footer>
          </>
        )}
      </section>
      <CashExpenseLedger />
      <GeneralLedgerWorkspace />
    </section>
  );
}


export function CustomerAddressesPage() {
  const { user, ready } = useAuth();
  if (!ready) return <WorkspaceShell title="عناوين التوصيل" subtitle="جارٍ التحقق من الحساب"><p role="status">جارٍ التحقق من جلسة الحساب...</p></WorkspaceShell>;
  if (!user) return <Login />;
  if (user.isStaff) return <WorkspaceShell title="عناوين التوصيل" subtitle="مساحة حساب العميل"><ErrorBox message="هذه الشاشة مخصصة لحساب العميل. استخدم ملف العميل في لوحة الإدارة للوصول إلى العناوين وفق صلاحيتك." /></WorkspaceShell>;
  return <CustomerAddresses />;
}

const EMPTY_ADDRESS: CustomerAddressInput = {
  id: null, label: "", recipient_name: "", phone: "", address_line1: "",
  address_line2: "", city: "", region: "", postal_code: "", country: "YE",
  delivery_instructions: "", is_default: false,
};

function CustomerAddresses() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [draft, setDraft] = useState<CustomerAddressInput>({ ...EMPTY_ADDRESS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setAddresses(await fetchCustomerAddresses()); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل عناوين التوصيل."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function edit(a: CustomerAddress) {
    setError(""); setNotice("");
    setDraft({ id:a.id,label:a.label,recipient_name:a.recipient_name,phone:a.phone,
      address_line1:a.address_line1,address_line2:a.address_line2 ?? "",city:a.city,
      region:a.region ?? "",postal_code:a.postal_code ?? "",country:a.country,
      delivery_instructions:a.delivery_instructions ?? "",is_default:a.is_default });
  }
  function reset() { setDraft({ ...EMPTY_ADDRESS }); setError(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await saveCustomerAddress(draft);
      setNotice(draft.id ? "تم تحديث العنوان في الحساب." : "تم حفظ عنوان التوصيل في الحساب.");
      reset(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ العنوان."); }
    finally { setSaving(false); }
  }
  async function remove(a: CustomerAddress) {
    if (deleting || saving || !window.confirm("هل تريد حذف العنوان «" + a.label + "»؟")) return;
    setDeleting(a.id); setError(""); setNotice("");
    try {
      await deleteCustomerAddress(a.id);
      setNotice("تم حذف العنوان وتعيين عنوان رئيسي بديل عند الحاجة.");
      if (draft.id === a.id) reset();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حذف العنوان."); }
    finally { setDeleting(null); }
  }

  const inputStyle: React.CSSProperties = { ...field, marginTop: 6 };
  type AddressTextField = Exclude<keyof CustomerAddressInput, "id" | "is_default">;
  const setText = (key: AddressTextField, value: string) => setDraft(d => ({ ...d, [key]: value }));
  return <WorkspaceShell title="عناوين التوصيل" subtitle="احفظ عناوين شركتك ومواقع الاستلام. يستخرج الخادم حساب العميل وصلاحياته ولا يقبل هوية العميل أو المؤسسة من المتصفح.">
    {error && <ErrorBox message={error} retry={() => void load()} />}
    {notice && <div role="status" style={{ ...card, borderColor:"#a8d7c0", color:"#17684d", marginBottom:14 }}>{notice}</div>}
    <section style={{ ...card, marginBottom:18 }}>
      <h2 style={{ margin:"0 0 14px",fontSize:19,display:"flex",alignItems:"center",gap:8 }}>
        {draft.id ? <Pencil size={18}/> : <Plus size={18}/>} {draft.id ? "تعديل عنوان التوصيل" : "إضافة عنوان توصيل"}
      </h2>
      <form onSubmit={submit}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12 }}>
          <label>اسم العنوان<input style={inputStyle} value={draft.label} onChange={e=>setText("label",e.target.value)} maxLength={50} required /></label>
          <label>اسم المستلم<input style={inputStyle} value={draft.recipient_name} onChange={e=>setText("recipient_name",e.target.value)} minLength={2} maxLength={120} autoComplete="name" required /></label>
          <label>رقم الهاتف<input style={inputStyle} type="tel" dir="auto" value={draft.phone} onChange={e=>setText("phone",e.target.value)} minLength={7} maxLength={32} autoComplete="tel" required /></label>
          <label>المدينة<input style={inputStyle} value={draft.city} onChange={e=>setText("city",e.target.value)} minLength={2} maxLength={100} autoComplete="address-level2" required /></label>
          <label>العنوان التفصيلي<input style={inputStyle} value={draft.address_line1} onChange={e=>setText("address_line1",e.target.value)} minLength={3} maxLength={180} autoComplete="street-address" required /></label>
          <label>تفاصيل إضافية<input style={inputStyle} value={draft.address_line2 ?? ""} onChange={e=>setText("address_line2",e.target.value)} maxLength={180} /></label>
          <label>المحافظة / المنطقة<input style={inputStyle} value={draft.region ?? ""} onChange={e=>setText("region",e.target.value)} maxLength={100} autoComplete="address-level1" /></label>
          <label>الرمز البريدي<input style={inputStyle} value={draft.postal_code ?? ""} onChange={e=>setText("postal_code",e.target.value)} maxLength={24} autoComplete="postal-code" /></label>
          <label>رمز الدولة<input style={inputStyle} value={draft.country} onChange={e=>setText("country",e.target.value)} minLength={2} maxLength={2} autoComplete="country" required /></label>
          <label style={{ gridColumn:"1/-1" }}>تعليمات للمندوب (اختياري)<textarea style={{ ...inputStyle,minHeight:76,resize:"vertical" }} value={draft.delivery_instructions ?? ""} onChange={e=>setText("delivery_instructions",e.target.value)} maxLength={1000} /></label>
        </div>
        <label style={{ display:"flex",alignItems:"center",gap:8,marginTop:14,fontWeight:750 }}>
          <input type="checkbox" checked={draft.is_default} onChange={e=>setDraft(d=>({...d,is_default:e.target.checked}))} /> اجعل هذا العنوان هو العنوان الرئيسي للتوصيل
        </label>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:16 }}>
          <button style={primary} type="submit" disabled={saving || loading}><Save size={16}/>{saving ? "جارٍ الحفظ..." : draft.id ? "حفظ التعديلات" : "حفظ العنوان"}</button>
          {draft.id && <button style={secondary} type="button" disabled={saving} onClick={reset}>إلغاء التعديل</button>}
        </div>
      </form>
    </section>
    <section style={{ ...card,padding:0,overflow:"hidden" }}>
      <header style={{ display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:12,padding:16,borderBottom:"1px solid #edf2f3" }}>
        <h2 style={{ margin:0,fontSize:18 }}><MapPin size={18} style={{ verticalAlign:"middle",marginInlineEnd:6 }}/>العناوين المحفوظة</h2>
        <button type="button" style={secondary} onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> تحديث</button>
      </header>
      {loading ? <p role="status" style={{ padding:18 }}>جارٍ تحميل العناوين...</p> :
       addresses.length === 0 ? <EmptyBox><MapPin size={30}/><p>لا توجد عناوين محفوظة بعد.</p><p style={quiet}>أضف عنوانًا لتسهيل تجهيز الطلبات والتوصيل لاحقًا.</p></EmptyBox> :
       <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,padding:14 }}>
         {addresses.map(a=><article key={a.id} style={{ ...card,padding:16,borderColor:a.is_default ? "#83c8bc" : "#e0ecee" }}>
           <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}>
             <div><h3 style={{ margin:0,fontSize:17 }}>{a.label}</h3>{a.is_default && <span style={{ display:"inline-block",marginTop:6,padding:"3px 8px",borderRadius:20,background:"#e8f7f1",color:"#17684d",fontSize:12,fontWeight:800 }}>العنوان الرئيسي</span>}</div><MapPin size={18} aria-hidden="true"/>
           </div>
           <p style={{ margin:"12px 0 4px",fontWeight:800 }}>{a.recipient_name}</p>
           <p dir="auto" style={{ margin:"0 0 4px",color:"#516b70" }}>{a.phone}</p>
           <p style={{ margin:"0 0 4px" }}>{a.address_line1}{a.address_line2 ? "، " + a.address_line2 : ""}</p>
           <p style={{ margin:"0 0 4px",color:"#516b70" }}>{[a.city,a.region,a.postal_code].filter(Boolean).join("، ")}</p>
           {a.delivery_instructions && <p style={{ ...quiet,margin:"8px 0 0" }}>تعليمات: {a.delivery_instructions}</p>}
           <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:14 }}>
             <button type="button" style={secondary} onClick={()=>edit(a)} disabled={saving || Boolean(deleting)}><Pencil size={14}/> تعديل</button>
             <button type="button" style={{ ...secondary,color:"#9b2626" }} onClick={()=>void remove(a)} disabled={Boolean(deleting) || saving}><Trash2 size={14}/>{deleting === a.id ? "جارٍ الحذف..." : "حذف"}</button>
           </div>
         </article>)}
       </div>}
    </section>
  </WorkspaceShell>;
}


export function CustomerCompanyContactsPage() {
  const { user, ready } = useAuth();
  if (!ready) return <WorkspaceShell title="جهات الاتصال بالشركة" subtitle="جارٍ التحقق من الحساب"><p role="status">جارٍ التحقق من جلسة الحساب...</p></WorkspaceShell>;
  if (!user) return <Login />;
  if (user.isStaff) return <WorkspaceShell title="جهات الاتصال بالشركة" subtitle="مساحة حساب العميل"><ErrorBox message="هذه الشاشة مخصصة لحساب العميل. استخدم ملف العميل في لوحة الإدارة للوصول إلى البيانات وفق صلاحيتك." /></WorkspaceShell>;
  return <CustomerCompanyContacts />;
}

const EMPTY_COMPANY_CONTACT: CustomerCompanyContactInput = {
  id: null, full_name: "", job_title: "", department: "", phone: "", email: "", is_primary: false,
};

function CustomerCompanyContacts() {
  const [contacts, setContacts] = useState<CustomerCompanyContact[]>([]);
  const [draft, setDraft] = useState<CustomerCompanyContactInput>({ ...EMPTY_COMPANY_CONTACT });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setContacts(await fetchCustomerCompanyContacts()); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل جهات اتصال الشركة."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function reset() { setDraft({ ...EMPTY_COMPANY_CONTACT }); setError(""); }
  function edit(contact: CustomerCompanyContact) {
    setError(""); setNotice("");
    setDraft({
      id: contact.id, full_name: contact.full_name, job_title: contact.job_title ?? "",
      department: contact.department ?? "", phone: contact.phone, email: contact.email ?? "",
      is_primary: contact.is_primary,
    });
  }
  const setText = (key: Exclude<keyof CustomerCompanyContactInput, "id" | "is_primary">, value: string) =>
    setDraft(d => ({ ...d, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await saveCustomerCompanyContact(draft);
      setNotice(draft.id ? "تم تحديث جهة الاتصال." : "تم حفظ جهة الاتصال.");
      reset();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ جهة الاتصال."); }
    finally { setSaving(false); }
  }

  async function remove(contact: CustomerCompanyContact) {
    if (deleting || saving || !window.confirm("هل تريد حذف جهة الاتصال «" + contact.full_name + "»؟")) return;
    setDeleting(contact.id); setError(""); setNotice("");
    try {
      await deleteCustomerCompanyContact(contact.id);
      setNotice("تم حذف جهة الاتصال وتحديث جهة الاتصال الرئيسية عند الحاجة.");
      if (draft.id === contact.id) reset();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حذف جهة الاتصال."); }
    finally { setDeleting(null); }
  }

  const inputStyle: React.CSSProperties = { ...field, marginTop: 6 };
  return <WorkspaceShell
    title="جهات الاتصال بالشركة"
    subtitle="أدر جهات الاتصال التشغيلية لشركتك. يستنتج الخادم حساب العميل والمؤسسة من الجلسة؛ هذه السجلات لا تنشئ حسابات دخول أو صلاحيات مستخدمين."
  >
    {error && <ErrorBox message={error} retry={() => void load()} />}
    {notice && <div role="status" style={{ ...card, borderColor: "#a8d7c0", color: "#17684d", marginBottom: 14 }}>{notice}</div>}
    <section style={{ ...card, marginBottom: 18 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 19 }}>{draft.id ? "تعديل جهة اتصال" : "إضافة جهة اتصال"}</h2>
      <form onSubmit={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
          <label>اسم جهة الاتصال<input style={inputStyle} value={draft.full_name} onChange={e => setText("full_name", e.target.value)} minLength={2} maxLength={120} autoComplete="name" required /></label>
          <label>رقم الهاتف<input style={inputStyle} type="tel" dir="auto" value={draft.phone} onChange={e => setText("phone", e.target.value)} minLength={7} maxLength={32} autoComplete="tel" required /></label>
          <label>البريد الإلكتروني<input style={inputStyle} type="email" dir="auto" value={draft.email ?? ""} onChange={e => setText("email", e.target.value)} maxLength={254} autoComplete="email" /></label>
          <label>المسمى الوظيفي<input style={inputStyle} value={draft.job_title ?? ""} onChange={e => setText("job_title", e.target.value)} maxLength={80} /></label>
          <label>القسم<input style={inputStyle} value={draft.department ?? ""} onChange={e => setText("department", e.target.value)} maxLength={80} /></label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontWeight: 750 }}>
          <input type="checkbox" checked={draft.is_primary} onChange={e => setDraft(d => ({ ...d, is_primary: e.target.checked }))} />
          اجعلها جهة الاتصال الرئيسية
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button style={primary} type="submit" disabled={saving || loading}>{saving ? "جارٍ الحفظ..." : draft.id ? "حفظ التعديلات" : "حفظ جهة الاتصال"}</button>
          {draft.id && <button style={secondary} type="button" disabled={saving} onClick={reset}>إلغاء التعديل</button>}
          <button style={secondary} type="button" disabled={loading} onClick={() => void load()}>تحديث القائمة</button>
        </div>
      </form>
    </section>
    <section style={{ ...card, padding: 0, overflow: "hidden" }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderBottom: "1px solid #edf2f3" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>جهات الاتصال المحفوظة ({contacts.length})</h2>
      </header>
      {loading ? <p role="status" style={{ padding: 18 }}>جارٍ تحميل جهات الاتصال...</p> :
        contacts.length === 0 ? <EmptyBox><p>لا توجد جهات اتصال محفوظة بعد.</p><p style={quiet}>أضف مسؤول المشتريات أو المحاسب أو جهة الاستلام لتسهيل التواصل التجاري.</p></EmptyBox> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, padding: 14 }}>
          {contacts.map(contact => <article key={contact.id} style={{ ...card, padding: 16, borderColor: contact.is_primary ? "#83c8bc" : "#e0ecee" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>{contact.full_name}</h3>
                {contact.is_primary && <span style={{ display: "inline-block", marginTop: 6, padding: "3px 8px", borderRadius: 20, background: "#e8f7f1", color: "#17684d", fontSize: 12, fontWeight: 800 }}>جهة الاتصال الرئيسية</span>}
              </div>
            </div>
            {(contact.job_title || contact.department) && <p style={{ margin: "10px 0 4px", color: "#516b70" }}>{[contact.job_title, contact.department].filter(Boolean).join(" · ")}</p>}
            <p dir="auto" style={{ margin: "8px 0 4px", fontWeight: 750 }}>{contact.phone}</p>
            {contact.email && <p dir="auto" style={{ margin: "0 0 4px", color: "#516b70" }}>{contact.email}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" style={secondary} onClick={() => edit(contact)} disabled={saving || Boolean(deleting)}>تعديل</button>
              <button type="button" style={{ ...secondary, color: "#9b2626" }} onClick={() => void remove(contact)} disabled={Boolean(deleting) || saving}>{deleting === contact.id ? "جارٍ الحذف..." : "حذف"}</button>
            </div>
          </article>)}
        </div>}
    </section>
  </WorkspaceShell>;
}
