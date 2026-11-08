import type { SupplierInvoiceAccountingPrintDocument } from "@/lib/supplier-invoice-accounting-print";

function money(value: string, currency: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = "00"] = unsigned.split(".");
  const formatted = new Intl.NumberFormat("ar-YE").format(BigInt(whole)) + "." + fraction.padEnd(2, "0").slice(0, 2);
  return (negative ? "−" : "") + formatted + " " + currency;
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

function journalStatusLabel(status: SupplierInvoiceAccountingPrintDocument["journalStatus"], accountingStatus: SupplierInvoiceAccountingPrintDocument["accountingStatus"]): string {
  if (accountingStatus === "journal_reversed") return "مرحّل وله قيد عكس";
  if (status === "draft") return "مسودة";
  if (status === "posted") return "مرحّل";
  if (status === "void") return "ملغى";
  return "لا يوجد قيد";
}

export function SupplierInvoiceAccountingPrintSheet({
  document,
}: {
  document: SupplierInvoiceAccountingPrintDocument;
}) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(document.generatedAt));

  return (
    <article className="supplier-invoice-accounting-print-sheet" data-testid="supplier-invoice-accounting-print-document" dir="rtl" lang="ar">
      <header className="supplier-invoice-accounting-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <h2>محضر مطابقة وتسوية فاتورة مورد</h2>
          <p>المورد: <strong>{document.supplierName}</strong></p>
          <p>فاتورة المورد: <strong>{document.invoiceNumber}</strong> · التاريخ: {document.invoiceDate}</p>
          <p>أمر الشراء: {document.purchaseOrderNumber} · العملة: {document.currency}</p>
        </div>
        <div className="supplier-invoice-accounting-print-generated">
          <strong>وقت استخراج المستند</strong>
          <span>{generatedAt}</span>
        </div>
      </header>

      <section className="supplier-invoice-accounting-print-section">
        <h3>حالة المستند</h3>
        <div className="supplier-invoice-accounting-print-grid">
          <div><span>مطابقة أمر الشراء والاستلام والفاتورة</span><strong>{matchLabel(document.matchStatus)}</strong></div>
          <div><span>الحالة المحاسبية</span><strong>{accountingLabel(document.accountingStatus)}</strong></div>
          <div><span>رقم قيد التسوية</span><strong>{document.journalEntryNumber ?? "—"}</strong></div>
          <div><span>حالة القيد</span><strong>{journalStatusLabel(document.journalStatus, document.accountingStatus)}</strong></div>
        </div>
      </section>

      <section className="supplier-invoice-accounting-print-section">
        <h3>مطابقة بنود الاستلام مع فاتورة المورد</h3>
        <table>
          <thead><tr>
            <th>الإيصال</th><th>رمز الصنف</th><th>الصنف</th><th>الكمية</th>
            <th>تكلفة الاستلام</th><th>سعر الفاتورة</th><th>قيمة الاستلام</th><th>قيمة الفاتورة</th>
          </tr></thead>
          <tbody>
            {document.lines.map((line, index) => (
              <tr key={line.receiptNumber + "-" + line.itemCode + "-" + index}>
                <td>{line.receiptNumber}</td>
                <td>{line.itemCode}</td>
                <td>{line.productName}<small>{line.unit ? " · " + line.unit : ""}</small></td>
                <td>{new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(Number(line.quantity))}</td>
                <td>{money(line.receivedUnitCost, document.currency)}</td>
                <td>{money(line.invoicedUnitCost, document.currency)}</td>
                <td>{money(line.sourceLineTotal, document.currency)}</td>
                <td>{money(line.invoiceLineTotal, document.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="supplier-invoice-accounting-print-section">
        <h3>ملخص التسوية الحسابية</h3>
        <table>
          <tbody>
            <tr><th>تكلفة الكميات المفوترة حسب إيصالات الاستلام</th><td>{money(document.sourceMerchandiseAmount, document.currency)}</td></tr>
            <tr><th>قيمة بنود فاتورة المورد</th><td>{money(document.invoiceMerchandiseSubtotal, document.currency)}</td></tr>
            <tr><th>فرق قيمة البنود عن تكلفة الاستلام</th><td>{money(document.merchandiseVarianceAmount, document.currency)}</td></tr>
            <tr><th>الضريبة الفعلية المسجلة في الفاتورة</th><td>{money(document.taxAmount, document.currency)}</td></tr>
            <tr><th>إجمالي فاتورة المورد</th><td><strong>{money(document.invoiceTotalAmount, document.currency)}</strong></td></tr>
            <tr><th>صافي تعديل التزام المورد ({document.payableDirection === "increase" ? "زيادة" : document.payableDirection === "decrease" ? "تخفيض" : "دون تغيير"})</th><td><strong>{money(document.netAdjustmentAmount, document.currency)}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="supplier-invoice-accounting-print-section">
        <h3>الحسابات المحاسبية المعتمدة</h3>
        <table>
          <tbody>
            <tr><th>حساب الدائن الأصلي المرتبط بإيصال الاستلام</th><td>{document.payableAccount ? document.payableAccount.code + " — " + document.payableAccount.name : "غير محفوظ في سجل التسوية"}</td></tr>
            <tr><th>حساب الضريبة المختار</th><td>{document.taxAccount ? document.taxAccount.code + " — " + document.taxAccount.name : "لا يوجد / لم يُحدد"}</td></tr>
            <tr><th>حساب فرق التكلفة المختار</th><td>{document.varianceAccount ? document.varianceAccount.code + " — " + document.varianceAccount.name : "لا يوجد / لم يُحدد"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="supplier-invoice-accounting-print-signatures">
        <div><strong>إعداد / مراجعة الحسابات</strong><span>الاسم والتوقيع: ....................................</span><span>التاريخ: ........................</span></div>
        <div><strong>اعتماد الإدارة المالية</strong><span>الاسم والتوقيع: ....................................</span><span>التاريخ: ........................</span></div>
      </section>

      <footer className="supplier-invoice-accounting-print-footer">
        هذا المحضر يثبت مطابقة المستندات والتسوية المسجلة من بيانات النظام. مسودة القيد لا تُعد قيدًا مرحّلًا ولا تثبت سداد المورد. يستخدم المحضر تكلفة الكميات المفوترة حسب إيصالات الاستلام الفعلية وحساب الدائن الأصلي نفسه؛ لا ينشئ التزامًا ثانيًا ولا حركة مخزون أو دفعة نقدية. لا يتضمن معرفات قاعدة البيانات أو المؤسسة أو المستخدمين.
      </footer>
    </article>
  );
}
