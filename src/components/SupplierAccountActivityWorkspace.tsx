import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BookOpen, Download, Printer, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchSupplierAccountActivity,
  type SupplierAccountActivityPayload,
} from "@/lib/supplier-account-activity";
import { projectSupplierAccountActivityPrintDocument, type SupplierAccountActivityPrintDocument } from "@/lib/supplier-account-activity-print";
import { downloadSupplierAccountActivityWorkbookXlsx } from "@/lib/supplier-account-activity-xlsx";
import { SupplierAccountActivityPrintSheet } from "@/components/SupplierAccountActivityPrintSheet";

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px",
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit",
};
const mutedStyle: React.CSSProperties = { color: "var(--muted-foreground, #64748b)", fontSize: 12, lineHeight: 1.7 };
const amountText = (value: number, currency: string) =>
  new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;
const signedAmountText = (value: number, currency: string) => {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + amountText(Math.abs(value), currency);
};
const dateText = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ar-YE");
};

export function SupplierAccountActivityWorkspace({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) =>
    role === "admin" || role === "manager" || role === "accountant"
  ));
  const [payload, setPayload] = useState<SupplierAccountActivityPayload | null>(null);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [printError, setPrintError] = useState("");
  const [printDocument, setPrintDocument] = useState<SupplierAccountActivityPrintDocument | null>(null);

  const load = useCallback(async () => {
    if (!canManageFinance) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await fetchSupplierAccountActivity({
        from, to, limit: 50, offset: page * 50,
      });
      setPayload(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل حركة حسابات الموردين.");
    } finally { setLoading(false); }
  }, [canManageFinance, from, to, page, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!printDocument || typeof window === "undefined" ||
        typeof document === "undefined" || typeof window.print !== "function") return;
    const body = document.body;
    const previousMode = body.getAttribute("data-print-mode");
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute("data-print-mode");
      else body.setAttribute("data-print-mode", previousMode);
      window.removeEventListener("afterprint", restore);
      setPrintDocument(null);
    };
    body.setAttribute("data-print-mode", "supplier-account-activity");
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setPrintError("تعذر فتح نافذة طباعة كشف الموردين في هذا المتصفح.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "supplier-account-activity") {
        if (previousMode === null) body.removeAttribute("data-print-mode");
        else body.setAttribute("data-print-mode", previousMode);
      }
    };
  }, [printDocument]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setError("تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.");
      return;
    }
    setFrom(draftFrom);
    setTo(draftTo);
    setPage(0);
  }

  function clearFilters() {
    setDraftFrom(""); setDraftTo("");
    setFrom(""); setTo(""); setPage(0);
    setExportError(""); setPrintError("");
  }

  function createStatementDocument(): SupplierAccountActivityPrintDocument {
    if (!payload) throw new Error("لا توجد بيانات مصدرية لإنشاء كشف الموردين.");
    return projectSupplierAccountActivityPrintDocument(payload, { from, to });
  }

  function exportStatement() {
    setExportError("");
    try {
      downloadSupplierAccountActivityWorkbookXlsx(createStatementDocument());
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel لكشف الموردين.");
    }
  }

  function printStatement() {
    setPrintError("");
    if (typeof window === "undefined" || typeof window.print !== "function") {
      setPrintError("الطباعة غير مدعومة في بيئة المتصفح الحالية.");
      return;
    }
    try {
      setPrintDocument(createStatementDocument());
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "تعذر إنشاء مستند طباعة كشف الموردين.");
    }
  }

  if (!canManageFinance) return null;
  const entries = payload?.entries ?? [];
  const suppliers = payload?.suppliers ?? [];
  const currencyTotals = payload?.currencyTotals ?? [];

  return (
    <>
    <section aria-label="كشف حركة حسابات الموردين" dir="rtl" style={{ display: "grid", gap: 12, marginBlock: 18, minWidth: 0 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}><BookOpen size={18} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} /> كشف حركة حسابات الموردين</h3>
          <p style={{ ...mutedStyle, margin: "5px 0 0" }}>
            كشف مترابط للاستلامات وإشعارات الدائن ودفعات المورد المرحلة. الدفعات المحجوزة تظهر منفصلة ولا تُخصم من المستحق النهائي قبل ترحيل القيد.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <button className="btn secondary" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} /> تحديث الكشف
          </button>
          <button className="btn secondary" type="button" onClick={exportStatement} disabled={loading || !payload}>
            <Download size={15} /> تصدير Excel
          </button>
          <button className="btn secondary" type="button" onClick={printStatement} disabled={loading || !payload}>
            <Printer size={15} /> طباعة / PDF
          </button>
        </div>
      </header>

      <form onSubmit={applyFilters} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", alignItems: "end", gap: 9, padding: 12, border: "1px solid var(--border, #e3e9ec)", borderRadius: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>من تاريخ
          <input type="date" style={fieldStyle} value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>إلى تاريخ
          <input type="date" style={fieldStyle} value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button className="btn primary" type="submit" disabled={loading}>تطبيق الفترة</button>
          <button className="btn secondary" type="button" onClick={clearFilters} disabled={loading}>مسح الفترة</button>
        </div>
      </form>

      {error && <p role="alert" style={{ margin: 0, color: "#991b1b" }}><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{error}</p>}
      {exportError && <p role="alert" style={{ margin: 0, color: "#991b1b" }}>{exportError}</p>}
      {printError && <p role="alert" style={{ margin: 0, color: "#991b1b" }}>{printError}</p>}
      {loading && <p role="status" style={mutedStyle}>جار تحميل الحركات المرحلة…</p>}

      {!loading && payload && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, ...mutedStyle }}>
            <span>عدد الحركات المصدرية: {payload.entryCount}</span>
            <span>تاريخ إعداد الكشف: {dateText(payload.asOfDate)}</span>
          </div>

          <section style={{ display: "grid", gap: 8 }}>
            <strong>إجماليات الحركة حسب العملة</strong>
            {currencyTotals.length === 0 ? <p style={mutedStyle}>لا توجد حركات موردين مرحلة ضمن الفترة المحددة.</p> :
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 9 }}>
                {currencyTotals.map((item) => (
                  <article key={item.currency} style={{ border: "1px solid var(--border, #dce4e8)", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
                    <strong>{item.currency}</strong>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={mutedStyle}>مدين — يخفض الالتزام</span><strong>{amountText(item.debitTotal, item.currency)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={mutedStyle}>دائن — يزيد الالتزام</span><strong>{amountText(item.creditTotal, item.currency)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 6 }}><span style={mutedStyle}>صافي الحركة الدفترية</span><strong>{signedAmountText(item.netCreditMovement, item.currency)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={mutedStyle}>دفعات محجوزة غير مرحلة</span><strong>{item.pendingPaymentAmount == null ? "—" : amountText(item.pendingPaymentAmount, item.currency)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={mutedStyle}>المتاح لتخصيص دفعة جديدة</span><strong>{item.availableToAllocate == null ? "—" : amountText(item.availableToAllocate, item.currency)}</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 6 }}><span style={mutedStyle}>المستحق النهائي</span><strong>{item.balanceComplete === true && item.remainingPayable != null ? amountText(item.remainingPayable, item.currency) : "غير معروف — تغطية المصدر غير مكتملة"}</strong></div>
                  </article>
                ))}
              </div>}
          </section>

          <section style={{ display: "grid", gap: 8 }}>
            <strong>ملخص المورد حسب العملة</strong>
            {suppliers.length === 0 ? <p style={mutedStyle}>لا توجد بيانات مصدرية لموردين ضمن الفترة.</p> :
              <div style={{ overflowX: "auto", border: "1px solid var(--border, #e3e9ec)", borderRadius: 10 }}>
                <table style={{ width: "100%", minWidth: 1040, borderCollapse: "collapse", textAlign: "right", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}>
                    <th style={thStyle}>المورد</th><th style={thStyle}>العملة</th><th style={thStyle}>الحركات</th>
                    <th style={thStyle}>مدين</th><th style={thStyle}>دائن</th><th style={thStyle}>صافي الحركة</th>
                    <th style={thStyle}>محجوز غير مرحّل</th><th style={thStyle}>المتاح للتخصيص</th><th style={thStyle}>المستحق النهائي</th><th style={thStyle}>آخر حركة</th>
                  </tr></thead>
                  <tbody>{suppliers.map((supplier) => (
                    <tr key={supplier.supplierId + ":" + supplier.currency} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}>
                      <td style={tdStyle}><strong>{supplier.supplierName}</strong></td>
                      <td style={tdStyle}>{supplier.currency}</td>
                      <td style={tdStyle}>{supplier.activityCount}</td>
                      <td style={tdStyle}>{amountText(supplier.debitTotal, supplier.currency)}</td>
                      <td style={tdStyle}>{amountText(supplier.creditTotal, supplier.currency)}</td>
                      <td style={tdStyle}><strong>{signedAmountText(supplier.netCreditMovement, supplier.currency)}</strong></td>
                      <td style={tdStyle}>{supplier.pendingPaymentAmount == null ? "—" : amountText(supplier.pendingPaymentAmount, supplier.currency)}</td>
                      <td style={tdStyle}>{supplier.availableToAllocate == null ? "—" : amountText(supplier.availableToAllocate, supplier.currency)}</td>
                      <td style={tdStyle}><strong>{supplier.balanceComplete === true && supplier.remainingPayable != null ? amountText(supplier.remainingPayable, supplier.currency) : "غير معروف — تغطية المصدر غير مكتملة"}</strong></td>
                      <td style={tdStyle}>{dateText(supplier.lastActivityDate)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
          </section>

          <section style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
              <strong>الحركات التفصيلية في الأستاذ</strong>
              <span style={mutedStyle}>المعروض {entries.length} من {payload.entryCount}</span>
            </div>
            {!entries.length ? <p style={mutedStyle}>لا توجد قيود مصدرية قابلة للعرض في هذه الصفحة.</p> :
              <div style={{ overflowX: "auto", border: "1px solid var(--border, #e3e9ec)", borderRadius: 10 }}>
                <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse", textAlign: "right", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}>
                    <th style={thStyle}>التاريخ / القيد</th><th style={thStyle}>المورد</th><th style={thStyle}>المستند المرجعي</th>
                    <th style={thStyle}>حساب الالتزام</th><th style={thStyle}>مدين</th><th style={thStyle}>دائن</th><th style={thStyle}>النوع</th>
                  </tr></thead>
                  <tbody>{entries.map((entry) => (
                    <tr key={entry.journalEntryId} style={{ borderTop: "1px solid var(--border, #e3e9ec)" }}>
                      <td style={tdStyle}><strong>#{entry.journalEntryNumber}</strong><div style={mutedStyle}>{dateText(entry.entryDate)}</div></td>
                      <td style={tdStyle}>{entry.supplierName}</td>
                      <td style={tdStyle}>{entry.documentReference}<div style={mutedStyle}>أمر {entry.purchaseOrderNumber} · إيصال {entry.receiptNumber}</div></td>
                      <td style={tdStyle}>{entry.payableAccountCode} — {entry.payableAccountName}</td>
                      <td style={tdStyle}>{amountText(entry.debit, entry.currency)}</td>
                      <td style={tdStyle}>{amountText(entry.credit, entry.currency)}</td>
                      <td style={tdStyle}>{entry.sourceType === "purchase_receipt"
                        ? "استلام — زيادة دائن المورد"
                        : entry.sourceType === "purchase_supplier_credit_note"
                          ? "إشعار دائن — تخفيض دائن المورد"
                          : "دفعة مورد مرحلة — تخفيض دائن المورد"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={mutedStyle}>صفحة {page + 1}</span>
              <div style={{ display: "flex", gap: 7 }}>
                <button className="btn secondary" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading}>السابق</button>
                <button className="btn secondary" type="button" onClick={() => setPage((current) => current + 1)} disabled={!payload.hasMore || loading || page >= 200}>التالي</button>
              </div>
            </div>
          </section>

          <p style={{ ...mutedStyle, margin: 0, padding: 10, borderRadius: 8, background: "var(--muted, #f5f7f8)" }}>
            نطاق الكشف يشمل قيود الاستلام وإشعارات الدائن ودفعات المورد المرحلة والمربوطة بحساب التزام مثبت. استُبعدت المسودات والقيود الملغاة والمعكوسة والقيود غير المرتبطة بمورد. الدفعات المحجوزة معروضة منفصلة ولا تخفض الرصيد النهائي قبل الترحيل. لا يُعرض «المستحق النهائي» كقيمة رقمية إلا عندما يؤكد المصدر balanceComplete=true؛ وإلا فالرصيد غير معروف بسبب عدم اكتمال تغطية المصدر. هذا المستحق يغطي إيصالات الاستلام المصدرية المتحققة فقط؛ ولا يشمل فواتير المورد خارج هذا النموذج أو مصادر الالتزام الخارجية. فلتر الفترة يحدد حركة الفترة ولا يقصر الرصيد الحالي على تلك الفترة.
          </p>
        </>
      )}
    </section>
    {printDocument && typeof document !== "undefined"
      ? createPortal(<SupplierAccountActivityPrintSheet document={printDocument} />, document.body)
      : null}
    </>
  );
}

const thStyle: React.CSSProperties = { padding: 9, whiteSpace: "nowrap", textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: 9, verticalAlign: "top" };
