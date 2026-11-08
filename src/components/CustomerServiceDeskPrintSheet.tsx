import type { CustomerServiceDeskPrintDocument } from "@/lib/customer-service-desk-print";

function date(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(parsed)
    : "—";
}

export function CustomerServiceDeskPrintSheet({
  document,
}: {
  document: CustomerServiceDeskPrintDocument;
}) {
  const generatedAt = date(document.generatedAt);
  return (
    <article className="customer-service-desk-print-sheet" data-testid="customer-service-desk-print-document" dir="rtl" lang="ar">
      <header className="customer-service-desk-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>كشف طابور خدمة العملاء ومؤشرات SLA</h2>
          <p>وقت استخراج التقرير: <strong>{generatedAt}</strong></p>
        </div>
        <div className="customer-service-desk-print-scope">
          <strong>تفاصيل الحالات المحمّلة: {document.loadedCount}</strong>
          <span>النطاق: {document.filters.status} · الأولوية: {document.filters.priority}</span>
          <span>الإسناد: {document.filters.assignment} · المتأخرة فقط: {document.filters.overdueOnly ? "نعم" : "لا"}</span>
          {document.filters.search && <span>بحث: {document.filters.search}</span>}
          {document.hasMore && <strong>توجد صفحات أخرى غير محمّلة؛ لا يمثل هذا التقرير كامل نتائج الطابور.</strong>}
        </div>
      </header>

      <section className="customer-service-desk-print-metrics">
        <h3>مؤشرات المؤسسة — جميع الحالات المفتوحة</h3>
        <div>
          <article><span>مفتوحة</span><strong>{document.fullOpenSummary.open_count}</strong></article>
          <article><span>تأخر الاستجابة</span><strong>{document.fullOpenSummary.response_overdue_count}</strong></article>
          <article><span>تأخر الحل</span><strong>{document.fullOpenSummary.resolution_overdue_count}</strong></article>
          <article><span>غير مسندة</span><strong>{document.fullOpenSummary.unassigned_count}</strong></article>
          <article><span>عاجلة</span><strong>{document.fullOpenSummary.urgent_count}</strong></article>
          <article><span>عالية الأولوية</span><strong>{document.fullOpenSummary.high_count}</strong></article>
        </div>
        <p>مؤشرات المؤسسة هي ملخص كامل للحالات المفتوحة من الخادم، ولا تتقيد بمرشحات تفاصيل التقرير.</p>
      </section>

      <section className="customer-service-desk-print-cases">
        <h3>تفاصيل الحالات ضمن الصفحات المحمّلة</h3>
        {document.cases.length === 0 ? <p>لا توجد حالات في النطاق المحمّل.</p> : (
          <table><thead><tr>
            <th>الحالة / العميل</th><th>الموضوع</th><th>النوع</th><th>الأولوية / الحالة</th>
            <th>موعد الاستجابة</th><th>موعد الحل</th><th>المسؤول / التصعيد</th><th>فتح / تحديث</th>
          </tr></thead><tbody>{document.cases.map((row, index) => (
            <tr key={row.caseCode + "-" + index}>
              <td><strong>{row.caseCode}</strong><small>{row.customerName}{row.customerCode ? " · " + row.customerCode : ""}</small></td>
              <td>{row.subject}</td>
              <td>{row.caseType}</td>
              <td>{row.priority}<small>{row.status}</small></td>
              <td>{date(row.responseDueAt)}<small>{row.firstResponseAt ? "أول رد: " + date(row.firstResponseAt) : row.responseOverdue ? "تجاوز الموعد" : "لم تسجل استجابة"}</small></td>
              <td>{date(row.resolutionDueAt)}<small>{row.resolutionOverdue ? "متأخرة" : "ضمن المهلة / منتهية"}</small></td>
              <td>{row.assignedToName}<small>{row.escalationLevel ? "تصعيد " + row.escalationLevel : "دون تصعيد"}</small></td>
              <td>{date(row.createdAt)}<small>آخر تحديث: {date(row.updatedAt)}</small></td>
            </tr>
          ))}</tbody></table>
        )}
      </section>

      <footer className="customer-service-desk-print-footer">
        هذا كشف تشغيلي داخلي من بيانات الطابور المصرح بها. لا يتضمن وصف الحالة التفصيلي أو نص المحادثات أو الملاحظات الداخلية أو معرفات النظام. تفاصيل الحالات تقتصر على الصفحات التي حمّلها المستخدم؛ حمّل الصفحات المتبقية من مكتب الخدمة قبل إعادة التصدير للوصول إلى كامل نتائج المرشح.
      </footer>
    </article>
  );
}
