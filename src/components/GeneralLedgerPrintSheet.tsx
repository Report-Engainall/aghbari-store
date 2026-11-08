import { formatLedgerMoney } from "@/lib/general-ledger";
import { formatStatementCents } from "@/lib/financial-statements";
import type { GeneralLedgerPrintDocument } from "@/lib/general-journal-print";

function GeneralLedgerPrintHeader({
  document,
  generatedAt,
}: {
  document: GeneralLedgerPrintDocument;
  generatedAt: string;
}) {
  return (
      <header className="general-ledger-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          {document.kind === "journal" ? (
            <>
              <h2>مستند قيد اليومية</h2>
              <p>رقم القيد: <strong>{document.entryNumber}</strong> · التاريخ: {document.entryDate}</p>
              <p>{document.description}</p>
              <p>الحالة: {document.statusLabel} · المصدر: {document.sourceLabel}{document.reversalLabel ? " · " + document.reversalLabel : ""}</p>
            </>
          ) : (
            <>
              <h2>القوائم المالية — قائمة الدخل والمركز المالي</h2>
              <p>الفترة: {document.periodFrom} إلى {document.periodTo} · القيود المرحلة: {document.postedEntryCount}</p>
            </>
          )}
        </div>
        <div className="general-ledger-print-generated"><strong>وقت الاستخراج</strong><span>{generatedAt}</span></div>
      </header>
  );
}

type JournalPrintLine = Extract<GeneralLedgerPrintDocument, { kind: "journal" }>["lines"][number];

function JournalPrintLineRow({ line }: { line: JournalPrintLine }) {
  return (
    <tr>
      <td>{line.lineNumber}</td><td>{line.accountCode}</td><td>{line.accountName}</td><td>{line.memo ?? "—"}</td>
      <td>{formatLedgerMoney(line.debit)}</td><td>{formatLedgerMoney(line.credit)}</td>
    </tr>
  );
}

function JournalPrintBody({ document }: { document: Extract<GeneralLedgerPrintDocument, { kind: "journal" }> }) {
  return (
          <section className="general-ledger-print-section">
            <h3>تفاصيل القيد المزدوج</h3>
            <table>
              <thead><tr><th>#</th><th>رمز الحساب</th><th>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead>
              <tbody>{document.lines.map((line) => <JournalPrintLineRow key={line.lineNumber} line={line} />)}</tbody>
              <tfoot><tr><th colSpan={4}>الإجمالي المتوازن</th><th>{formatLedgerMoney(document.debitTotal)}</th><th>{formatLedgerMoney(document.creditTotal)}</th></tr></tfoot>
            </table>
            <p className="general-ledger-print-note">
              {document.status === "draft" ? "هذه مسودة غير مرحلة؛ لا تُعد قيداً معتمداً ولا تدخل في ميزان المراجعة." :
                document.status === "void" ? "هذا القيد ملغى ولا يدخل ضمن الأرصدة المرحلة." :
                  "هذا القيد مرحّل من دفتر الأستاذ العام. لا يمثل المستند بحد ذاته إيصال دفع أو إثبات تسوية خارجية."}
            </p>
          </section>
  );
}

function FinancialStatementsPrintBody({ document }: { document: Extract<GeneralLedgerPrintDocument, { kind: "statements" }> }) {
  return (
    <>
          <section className="general-ledger-print-section">
            <h3>ملخص قائمة الدخل</h3>
            <table>
              <tbody>
                <tr><th>الإيرادات</th><td>{formatStatementCents(document.revenueCents)}</td></tr>
                <tr><th>المصروفات</th><td>{formatStatementCents(document.expenseCents)}</td></tr>
                <tr><th>صافي نتيجة الفترة</th><td>{formatStatementCents(document.netIncomeCents)}</td></tr>
              </tbody>
            </table>
            <h3>تفصيل قائمة الدخل حسب الحساب</h3>
            <table>
              <thead><tr><th>رمز الحساب</th><th>الحساب</th><th>التصنيف</th><th>صافي الفترة</th></tr></thead>
              <tbody>
                {document.incomeLines.map((line, index) => <tr key={line.code + "-" + index}><td>{line.code}</td><td>{line.name}</td><td>{line.accountType === "revenue" ? "إيراد" : "مصروف"}</td><td>{formatStatementCents(line.amountCents)}</td></tr>)}
                {!document.incomeLines.length ? <tr><td colSpan={4}>لا توجد حركة إيراد أو مصروف مرحلة في الفترة.</td></tr> : null}
              </tbody>
            </table>
          </section>
          <section className="general-ledger-print-section">
            <h3>ملخص المركز المالي حتى {document.periodTo}</h3>
            <table>
              <tbody>
                <tr><th>الأصول</th><td>{formatStatementCents(document.assetsCents)}</td></tr>
                <tr><th>الالتزامات</th><td>{formatStatementCents(document.liabilitiesCents)}</td></tr>
                <tr><th>حقوق الملكية</th><td>{formatStatementCents(document.equityCents)}</td></tr>
                <tr><th>الأرباح/الخسائر المتراكمة غير المقفلة</th><td>{formatStatementCents(document.cumulativeEarningsCents)}</td></tr>
                <tr><th>الالتزامات وحقوق الملكية والأرباح المتراكمة</th><td>{formatStatementCents(document.liabilitiesEquityAndEarningsCents)}</td></tr>
                <tr><th>فرق معادلة الميزانية</th><td>{formatStatementCents(document.balanceDifferenceCents)}</td></tr>
              </tbody>
            </table>
            <h3>تفصيل أرصدة المركز المالي حسب الحساب</h3>
            <table>
              <thead><tr><th>رمز الحساب</th><th>الحساب</th><th>التصنيف</th><th>الرصيد الطبيعي</th></tr></thead>
              <tbody>
                {document.balanceLines.map((line, index) => <tr key={line.code + "-" + index}><td>{line.code}</td><td>{line.name}</td><td>{line.accountType === "asset" ? "أصل" : line.accountType === "liability" ? "التزام" : "حقوق ملكية"}</td><td>{formatStatementCents(line.amountCents)}</td></tr>)}
                {!document.balanceLines.length ? <tr><td colSpan={4}>لا توجد حركة مسجلة في حسابات المركز المالي.</td></tr> : null}
              </tbody>
            </table>
            <p className="general-ledger-print-note">
              {document.balanceDifferenceCents === 0n ? "معادلة الميزانية متوازنة ضمن البيانات المحاسبية المرحلة." : "تنبيه: يوجد فرق في معادلة الميزانية. لا تعتمد هذه القائمة قبل التحقيق المحاسبي."}
            </p>
          </section>
    </>
  );
}
export function GeneralLedgerPrintSheet({ document }: { document: GeneralLedgerPrintDocument }) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <article className="general-ledger-print-sheet" dir="rtl" lang="ar" data-testid="general-ledger-print-document">
      <GeneralLedgerPrintHeader document={document} generatedAt={generatedAt} />

      {document.kind === "journal" ? (
        <JournalPrintBody document={document} />
      ) : (
        <FinancialStatementsPrintBody document={document} />
      )}

      <footer className="general-ledger-print-footer">
        المصدر: دفتر الأستاذ العام للمؤسسة النشطة، ضمن الصلاحيات المالية للمستخدم. لا يتضمن هذا المستند معرفات قاعدة البيانات أو معرفات المؤسسة أو المراجع الداخلية أو بيانات المستخدمين.
      </footer>
    </article>
  );
}
