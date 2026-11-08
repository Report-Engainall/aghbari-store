import type { SupplierQuoteComparisonDocument } from "@/lib/supplier-quote-comparison-print";

function amount(value: number, currency: string): string {
  return new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;
}
function date(value: string | null): string {
  if (!value) return "غير محدد";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("ar-YE") : "—";
}

export function SupplierQuoteComparisonPrintSheet({
  document,
}: {
  document: SupplierQuoteComparisonDocument;
}) {
  const generated = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(document.generatedAt));
  return (
    <article className="supplier-quote-comparison-print-sheet" data-testid="supplier-quote-comparison-print-document" dir="rtl" lang="ar">
      <header className="supplier-quote-comparison-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>مقارنة عروض الموردين</h2>
          <p>تاريخ استخراج المقارنة: <strong>{generated}</strong></p>
        </div>
        <div className="supplier-quote-comparison-print-scope">
          <strong>{document.quoteCount} عرض · {document.lineCount} بند</strong>
          <span>العملات: {document.currencies.join("، ") || "لا توجد"}</span>
          <span>مصدر المقارنة: سجل العروض المحفوظة عند وقت الاستخراج</span>
        </div>
      </header>

      <section className="supplier-quote-comparison-print-section">
        <h3>ملخص عروض الموردين وشروطهم</h3>
        {document.offers.length === 0 ? <p>لا توجد عروض محفوظة في المصدر.</p> : (
          <table><thead><tr>
            <th>المورد / الرمز</th><th>رقم العرض</th><th>الحالة</th><th>العملة / الإجمالي</th>
            <th>مدة التوريد</th><th>الصلاحية</th><th>شروط الدفع</th><th>تاريخ التسجيل</th>
          </tr></thead><tbody>{document.offers.map((row, index) => (
            <tr key={row.quoteNumber + "-" + index}>
              <td>{row.supplierName}<small>{row.supplierCode}</small></td>
              <td>{row.quoteNumber}<small>{row.supplierReference ?? "—"}</small></td>
              <td>{row.statusLabel}</td>
              <td>{amount(row.total, row.currency)}</td>
              <td>{row.deliveryDays === null ? "غير محددة" : row.deliveryDays + " يوم"}</td>
              <td>{date(row.validUntil)}</td>
              <td>{row.paymentTerms ?? "غير مسجلة"}</td>
              <td>{date(row.createdAt)}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <section className="supplier-quote-comparison-print-section">
        <h3>مقارنة تكلفة الوحدة حسب الصنف والعملة</h3>
        {document.products.length === 0 ? <p>لا توجد بنود عروض للمقارنة.</p> : (
          <table><thead><tr>
            <th>الصنف</th><th>رمز الصنف</th><th>الوحدة</th><th>العملة</th>
            <th>عروض قابلة للمقارنة</th><th>أقل تكلفة وحدة</th><th>المورد / العرض</th><th>مدة التوريد</th>
          </tr></thead><tbody>{document.products.map((row, index) => (
            <tr key={row.itemCode + "-" + row.currency + "-" + index}>
              <td>{row.productName}</td><td>{row.itemCode}</td><td>{row.unit ?? "—"}</td><td>{row.currency}</td>
              <td>{row.receivedOfferCount}</td>
              <td>{row.lowestUnitCost === null ? "لا يوجد عرض قابل للمقارنة" : amount(row.lowestUnitCost, row.currency)}</td>
              <td>{row.lowestSupplierName ? row.lowestSupplierName + " · " + row.lowestQuoteNumber : "—"}</td>
              <td>{row.lowestDeliveryDays === null ? "غير محددة" : row.lowestDeliveryDays + " يوم"}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <section className="supplier-quote-comparison-print-section">
        <h3>تفاصيل بنود العروض</h3>
        <table><thead><tr>
          <th>المورد</th><th>رقم العرض</th><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th>
          <th>إجمالي البند</th><th>العملة</th><th>الحالة</th>
        </tr></thead><tbody>{document.lines.map((row, index) => (
          <tr key={row.quoteNumber + "-" + row.itemCode + "-" + index}>
            <td>{row.supplierName}</td><td>{row.quoteNumber}</td><td>{row.productName}<small>{row.itemCode}</small></td>
            <td>{new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(row.quantity)} {row.unit ?? ""}</td>
            <td>{amount(row.unitCost, row.currency)}</td><td>{amount(row.lineTotal, row.currency)}</td>
            <td>{row.currency}</td><td>{row.statusLabel}{row.isLowestComparableCost ? <small>الأقل ضمن العروض القابلة للمقارنة</small> : null}</td>
          </tr>
        ))}</tbody></table>
      </section>

      <footer className="supplier-quote-comparison-print-footer">
        أقل تكلفة وحدة تعني أقل سعر مسجل بين العروض التي تحمل حالة «مستلم — قابل للمقارنة» للصنف والعملة نفسيهما فقط. لا تقارن هذه النتيجة الجودة أو الالتزام أو شروطًا غير مسجلة، ولا تعني ترسية العرض. العروض المرسّاة والمنتهية تبقى ظاهرة في الملخص والتفاصيل ولا تدخل في ترتيب الأقل تكلفة. لا تُجمع العملات ولا يُنفّذ تحويل صرف. لا يتضمن التقرير ملاحظات العروض الداخلية أو معرّفات النظام.
      </footer>
    </article>
  );
}
