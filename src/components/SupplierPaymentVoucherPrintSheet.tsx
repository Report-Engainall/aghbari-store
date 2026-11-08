import type { SupplierPaymentVoucherPrintDocument } from "@/lib/supplier-payment-voucher-print";

function money(value: string, currency: string): string {
  const [whole, fraction = "00"] = value.split(".");
  const formatted = new Intl.NumberFormat("ar-YE").format(BigInt(whole));
  return formatted + "." + fraction + " " + currency;
}
function date(value: string): string {
  const parsed = new Date(value + "T00:00:00");
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("ar-YE") : "—";
}

export function SupplierPaymentVoucherPrintSheet({
  document,
}: {
  document: SupplierPaymentVoucherPrintDocument;
}) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(document.generatedAt));
  return (
    <article className="supplier-payment-voucher-print-sheet" data-testid="supplier-payment-voucher-print-document" dir="rtl" lang="ar">
      <header className="supplier-payment-voucher-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>سند صرف / سداد مورد</h2>
          <p>رقم السند: <strong>{document.paymentNumber}</strong> · التاريخ: {date(document.paymentDate)}</p>
          <p>المورد: <strong>{document.supplierName}</strong></p>
        </div>
        <div className="supplier-payment-voucher-print-generated">
          <strong>تاريخ قراءة المصدر</strong><span>{date(document.asOfDate)}</span>
          <strong>وقت استخراج النسخة</strong><span>{generatedAt}</span>
        </div>
      </header>

      <section className="supplier-payment-voucher-print-section">
        <h3>بيانات السداد</h3>
        <div className="supplier-payment-voucher-print-grid">
          <div><span>المبلغ والعملة</span><strong>{money(document.amount, document.currency)}</strong></div>
          <div><span>طريقة الصرف</span><strong>{document.paymentMethodLabel}</strong></div>
          <div><span>مرجع أداة الصرف</span><strong dir="auto">{document.paymentReference}</strong></div>
          <div><span>حساب الصندوق / البنك</span><strong>{document.settlementAccountName}</strong></div>
          <div><span>حساب التزام المورد</span><strong>{document.payableAccountCode}</strong></div>
          <div><span>حالة السند</span><strong>{document.paymentStatusLabel}</strong></div>
        </div>
      </section>

      <section className="supplier-payment-voucher-print-section">
        <h3>المطابقة والقيد المحاسبي</h3>
        <table><tbody>
          <tr><th>حالة المطابقة المستقلة</th><td>{document.reconciliationStatusLabel}</td></tr>
          <tr><th>مرجع دليل المطابقة</th><td>{document.reconciliationReference ?? "لا يوجد دليل محفوظ"}</td></tr>
          <tr><th>رقم قيد الأستاذ</th><td>{document.journalEntryNumber ?? "لا يوجد قيد مرتبط"}</td></tr>
          <tr><th>حالة قيد الأستاذ</th><td>{document.journalStatusLabel}</td></tr>
          <tr><th>الأثر على المستحق</th><td><strong>{document.settlementEffectLabel}</strong></td></tr>
        </tbody></table>
      </section>

      <section className="supplier-payment-voucher-print-signatures">
        <div><strong>إعداد / مراجع السند</strong><span>الاسم والتوقيع: ....................................</span><span>التاريخ: ........................</span></div>
        <div><strong>اعتماد الحسابات</strong><span>الاسم والتوقيع: ....................................</span><span>التاريخ: ........................</span></div>
      </section>

      <footer className="supplier-payment-voucher-print-footer">
        هذه النسخة تعرض بيانات رأس سند الدفع المحفوظ ونتيجة آخر مطابقة وحالة القيد المقروءة من المصدر. لا تعرض تفاصيل توزيع السند على إيصالات الشراء لأن واجهة سجل السندات لا توفرها في هذه القراءة. حفظ السند أو إنشاء مسودة قيد لا يثبت السداد النهائي؛ تُحتسب الدفعة في رصيد المورد بعد ترحيل قيد صحيح فقط. لا تتضمن النسخة معرّفات داخلية أو بيانات مستخدمين.
      </footer>
    </article>
  );
}
