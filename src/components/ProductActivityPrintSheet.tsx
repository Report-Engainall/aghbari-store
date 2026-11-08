import { formatDateShort, formatNumber } from "@/lib/format";
import { PRODUCT_ACTIVITY_STATUS_LABELS } from "@/lib/product-activity-report";
import type { ProductActivityPrintDocument } from "@/lib/product-activity-print";

const catalogStatus = (value: string) =>
  value === "active" ? "نشط بالكتالوج" : value === "inactive" ? "موقوف بالكتالوج" : value;

const quantity = (value: number | null) =>
  value === null ? "غير متاح" : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value);

export function ProductActivityPrintSheet({ document }: { document: ProductActivityPrintDocument }) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.generatedAt));
  return (
    <article className="product-activity-print-sheet" data-testid="product-activity-print-document" dir="rtl" lang="ar">
      <header className="product-activity-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>التقرير التنفيذي لحركة الأصناف والركود</h2>
          <p>نافذة النشاط الحديث: {formatNumber(document.recentDays)} يومًا · حد الركود: {formatNumber(document.slowDays)} يومًا</p>
        </div>
        <div className="product-activity-print-generated">
          <strong>وقت استخراج التقرير</strong>
          <span>{generatedAt}</span>
          <strong>حالة الاكتمال</strong>
          <span>كامل — {formatNumber(document.returnedProducts)} من {formatNumber(document.totalProducts)} صنفًا</span>
        </div>
      </header>

      <section className="product-activity-print-summary">
        <h3>ملخص الحركة — كامل أصناف المؤسسة</h3>
        <table>
          <thead><tr><th>نشط آخر 30 يومًا</th><th>بطيء 31–90 يومًا</th><th>راكد أكثر من 90 يومًا</th><th>لم يُبع سابقًا</th><th>مخزون غير متاح</th></tr></thead>
          <tbody><tr>
            <td>{formatNumber(document.summary.activeLast30Days)}</td>
            <td>{formatNumber(document.summary.slowMoving90Days)}</td>
            <td>{formatNumber(document.summary.stagnantOver90Days)}</td>
            <td>{formatNumber(document.summary.neverSold)}</td>
            <td>{formatNumber(document.summary.stockUnknownCount)}</td>
          </tr></tbody>
        </table>
      </section>

      <section className="product-activity-print-details">
        <h3>تفاصيل جميع الأصناف ({formatNumber(document.products.length)})</h3>
        <table>
          <thead><tr>
            <th>كود الصنف</th><th>الصنف</th><th>الوحدة</th><th>حالة الكتالوج</th><th>حالة الحركة</th>
            <th>مباع 30 يومًا</th><th>مباع 90 يومًا</th><th>آخر بيع</th><th>أيام منذ البيع</th><th>المتاح بالمخازن النشطة</th>
          </tr></thead>
          <tbody>
            {document.products.map((row, index) => (
              <tr key={(row.itemCode ?? "no-code") + "-" + row.productName + "-" + index} data-testid="product-activity-print-row">
                <td>{row.itemCode ?? "دون رمز"}</td>
                <td>{row.productName}</td>
                <td>{row.unit || "غير محددة"}</td>
                <td>{catalogStatus(row.catalogStatus)}</td>
                <td>{PRODUCT_ACTIVITY_STATUS_LABELS[row.activityStatus]}</td>
                <td>{quantity(row.soldQuantityLast30Days)}</td>
                <td>{quantity(row.soldQuantityLast90Days)}</td>
                <td>{row.lastSoldAt ? formatDateShort(row.lastSoldAt) : "لم يُسجل بيع"}</td>
                <td>{row.daysSinceLastSale === null ? "—" : formatNumber(row.daysSinceLastSale)}</td>
                <td>{quantity(row.availableQuantity)}</td>
              </tr>
            ))}
            {document.products.length === 0 ? <tr><td colSpan={10}>لا توجد أصناف ضمن نتيجة التقرير.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <footer className="product-activity-print-footer">
        المصدر: تقرير حركة الأصناف الخادمي للمؤسسة الحالية. يشمل هذا المخرج كامل الصفوف المعادة فقط عند اكتمال التقرير؛ تمنع الطباعة عند تجاوز حد 5000 صنف. يعتمد التصنيف على بنود الطلبات غير الملغاة المرتبطة بمعرّف الصنف. لا يعامل الرصيد المجهول على أنه صفر، ولا يتضمن المخرج معرّف الصنف الداخلي أو التكلفة أو الهامش.
      </footer>
    </article>
  );
}
