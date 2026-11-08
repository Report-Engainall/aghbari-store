import type { SupplierAccountActivityPrintDocument } from "@/lib/supplier-account-activity-print";

function money(value: number | null, currency: string): string {
  if (value === null) return "غير معروف";
  return new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;
}
function date(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value + "T00:00:00");
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("ar-YE") : "—";
}
function period(document: SupplierAccountActivityPrintDocument): string {
  if (!document.from && !document.to) return "جميع التواريخ المتاحة في المصدر";
  return (document.from ? date(document.from) : "بداية غير محددة") + " — " +
    (document.to ? date(document.to) : "نهاية غير محددة");
}
function sourceLabel(source: SupplierAccountActivityPrintDocument["entries"][number]["sourceType"]): string {
  if (source === "purchase_receipt") return "استلام مشتريات — زيادة الالتزام";
  if (source === "purchase_supplier_credit_note") return "إشعار دائن — تخفيض الالتزام";
  return "دفعة مورد مرحلة — تخفيض الالتزام";
}

export function SupplierAccountActivityPrintSheet({
  document,
}: {
  document: SupplierAccountActivityPrintDocument;
}) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(document.generatedAt));
  return (
    <article className="supplier-account-activity-print-sheet" data-testid="supplier-account-activity-print-document" dir="rtl" lang="ar">
      <header className="supplier-account-activity-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>كشف حركة حسابات الموردين</h2>
          <p>الفترة: <strong>{period(document)}</strong></p>
          <p>تاريخ البيانات حتى: {date(document.asOfDate)} · قيود المصدر: {document.entryCount}</p>
        </div>
        <div className="supplier-account-activity-print-generated">
          <strong>وقت استخراج المستند</strong>
          <span>{generatedAt}</span>
          <strong>تفاصيل الصفحة</strong>
          <span>{document.entries.length} من {document.entryCount} · صفحة {document.pageNumber}</span>
        </div>
      </header>

      <section className="supplier-account-activity-print-section">
        <h3>الإجماليات حسب العملة</h3>
        {document.currencyTotals.length === 0 ? <p>لا توجد حركات مجمعة ضمن الفترة المحددة.</p> : (
          <table><thead><tr>
            <th>العملة</th><th>عدد الحركات</th><th>مدين</th><th>دائن</th><th>صافي الحركة</th>
            <th>دفعات محجوزة</th><th>متاح للتخصيص</th><th>المستحق النهائي</th><th>تغطية الرصيد</th>
          </tr></thead><tbody>{document.currencyTotals.map((row) => (
            <tr key={row.currency}>
              <td>{row.currency}</td><td>{row.activityCount}</td>
              <td>{money(row.debitTotal, row.currency)}</td><td>{money(row.creditTotal, row.currency)}</td>
              <td>{money(row.netCreditMovement, row.currency)}</td>
              <td>{money(row.pendingPaymentAmount, row.currency)}</td><td>{money(row.availableToAllocate, row.currency)}</td>
              <td>{row.balanceComplete ? money(row.remainingPayable, row.currency) : "غير معروف — تغطية غير مكتملة"}</td>
              <td>{row.balanceComplete ? "مكتملة" : "غير مكتملة"}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <section className="supplier-account-activity-print-section">
        <h3>ملخص الموردين حسب العملة</h3>
        {document.suppliers.length === 0 ? <p>لا توجد بيانات موردين ضمن الفترة.</p> : (
          <table><thead><tr>
            <th>المورد</th><th>العملة</th><th>عدد الحركات</th><th>مدين</th><th>دائن</th>
            <th>صافي الحركة</th><th>دفعات محجوزة</th><th>متاح للتخصيص</th><th>المستحق النهائي</th><th>آخر حركة</th>
          </tr></thead><tbody>{document.suppliers.map((row, index) => (
            <tr key={row.supplierName + "-" + row.currency + "-" + index}>
              <td>{row.supplierName}</td><td>{row.currency}</td><td>{row.activityCount}</td>
              <td>{money(row.debitTotal, row.currency)}</td><td>{money(row.creditTotal, row.currency)}</td>
              <td>{money(row.netCreditMovement, row.currency)}</td>
              <td>{money(row.pendingPaymentAmount, row.currency)}</td><td>{money(row.availableToAllocate, row.currency)}</td>
              <td>{row.balanceComplete ? money(row.remainingPayable, row.currency) : "غير معروف — تغطية غير مكتملة"}</td>
              <td>{date(row.lastActivityDate)}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <section className="supplier-account-activity-print-section">
        <h3>تفاصيل قيود الصفحة الحالية</h3>
        <p>يعرض هذا القسم {document.entries.length} قيدًا فقط من أصل {document.entryCount} قيدًا في الفترة. {document.hasMore ? "توجد صفحات لاحقة؛ لا يمثل هذا القسم كامل التفاصيل." : "هذه آخر صفحة في النطاق المعروض."}</p>
        {document.entries.length === 0 ? <p>لا توجد قيود في هذه الصفحة.</p> : (
          <table><thead><tr>
            <th>التاريخ / رقم القيد</th><th>المورد</th><th>العملة</th><th>المستند</th>
            <th>حساب الالتزام</th><th>النوع</th><th>مدين</th><th>دائن</th>
          </tr></thead><tbody>{document.entries.map((row, index) => (
            <tr key={row.journalEntryNumber + "-" + index}>
              <td>#{row.journalEntryNumber}<small>{date(row.entryDate)}</small></td>
              <td>{row.supplierName}</td><td>{row.currency}</td>
              <td>{row.documentReference}<small>أمر {row.purchaseOrderNumber} · إيصال {row.receiptNumber}</small></td>
              <td>{row.payableAccountCode} — {row.payableAccountName}</td>
              <td>{sourceLabel(row.sourceType)}<small>{row.description}</small></td>
              <td>{money(row.debit, row.currency)}</td><td>{money(row.credit, row.currency)}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <footer className="supplier-account-activity-print-footer">
        يشمل الكشف قيود استلام المشتريات وإشعارات الدائن ودفعات الموردين المرحلة المرتبطة بحساب التزام موثق. لا يشمل المسودات أو القيود الملغاة أو المعكوسة. تظهر الدفعات المحجوزة منفصلة ولا تخصم من المستحق النهائي قبل ترحيل قيد الدفع. لا يتم جمع العملات أو إجراء تحويل صرف. تفاصيل القيود محدودة بالصفحة الحالية؛ الإجماليات والملخصات مبنية على تجميع الخادم للنطاق المحدد. المستحق الحالي، عند اكتمال تغطية المصدر، يغطي إيصالات الاستلام المصدرية المتحققة فقط؛ لا يشمل فواتير المورد خارج هذا النموذج أو مصادر الالتزام الخارجية، ولا يتغير بسبب فلتر فترة الحركة. لا يتضمن المستند معرّفات داخلية أو بيانات مستخدمين.
      </footer>
    </article>
  );
}
