import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { createDecisionOutcomeProposal } from "@/lib/intelligence/decision-outcome-client";
import { fetchExecutiveCustomerReceivableAging, type CustomerReceivableAgingItem, type CustomerReceivableAgingResult } from "@/lib/intelligence/customer-receivable-aging-client";
import { RefreshCw } from "lucide-react";
import {
  fetchExecutiveLiquidityWorkspace,
  type ExecutiveLiquidityFetchResult,
  type ExecutiveLiquiditySnapshot,
} from "@/lib/intelligence/executive-liquidity-client";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings } from "./shared";

export interface ExecutiveLiquidityCommandCenterProps {
  refreshKey?: number;
  onDecisionSaved?: () => void;
}

const amount = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;

const phaseLabel = (phase: "OPENING" | "CLOSING") =>
  phase === "OPENING" ? "افتتاح الوردية" : "إقفال الوردية";

const bucketLabel: Record<string, string> = {
  NOT_DUE: "غير مستحقة بعد",
  OVERDUE_1_30: "متأخرة 1–30 يوماً",
  OVERDUE_31_60: "متأخرة 31–60 يوماً",
  OVERDUE_61_90: "متأخرة 61–90 يوماً",
  OVERDUE_90_PLUS: "متأخرة أكثر من 90 يوماً",
  UNKNOWN_DUE_DATE: "تاريخ الاستحقاق غير محدد",
};

function CashCountSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">النقد المعدود في الورديات</h3>
        <p className="text-xs text-muted-foreground">يعرض آخر عدّ محفوظ لكل وردية ومرحلة وعملة. لا تُجمع أعداد الورديات لأنها ليست أرصدة خزائن مستقلة مثبتة.</p>
      </div>
      {snapshot.cashCounts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الوردية</th><th className="p-2">التاريخ</th><th className="p-2">المرحلة</th><th className="p-2">المبلغ المعدود</th><th className="p-2">وقت التسجيل</th><th className="p-2">مرجع الإثبات</th>
            </tr></thead>
            <tbody>
              {snapshot.cashCounts.map((count) => (
                <tr key={count.id} className="border-b last:border-0">
                  <td className="p-2">{count.shiftLabel}</td>
                  <td className="p-2">{count.businessDate}</td>
                  <td className="p-2">{phaseLabel(count.phase)}</td>
                  <td className="p-2 font-semibold">{amount(count.countedAmount, count.currency)}</td>
                  <td className="p-2 text-xs">{count.sourceTimestamp}</td>
                  <td className="p-2 text-xs">{count.evidenceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد عدود نقدية مسجلة للورديات.</p>}
    </section>
  );
}

function CashAccountsSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">حسابات الصندوق والبنوك حسب العملة</h3>
        <p className="text-xs text-muted-foreground">الحسابات المسجلة في إعدادات تسوية الموردين. لا يظهر رصيد متاح دون رصيد افتتاحي وكشف/مطابقة مصرفية مثبتة.</p>
      </div>
      {snapshot.cashAccounts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الحساب</th><th className="p-2">النوع</th><th className="p-2">العملة</th><th className="p-2">الرصيد الحالي</th><th className="p-2">المصدر</th>
            </tr></thead>
            <tbody>
              {snapshot.cashAccounts.map((account) => (
                <tr key={account.accountId + ":" + account.currency} className="border-b last:border-0">
                  <td className="p-2">{account.displayName} · {account.accountCode}</td>
                  <td className="p-2">{account.settlementKind === "cash" ? "صندوق" : "بنك"}</td>
                  <td className="p-2">{account.currency}</td>
                  <td className="p-2">غير متاح · <EvidenceStatusLabel status={account.balanceStatus} /></td>
                  <td className="p-2 text-xs">{account.sourceName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد حسابات تسوية نقدية/مصرفية مفعّلة في إعدادات حسابات الموردين.</p>}
    </section>
  );
}

function CashMovementsSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">التدفق النقدي الفعلي المسجل</h3>
        <p className="text-xs text-muted-foreground">حركات التحصيلات والمدفوعات والمصروفات المرتبطة بقيود مصدرية مرحلة ومتوازنة خلال {snapshot.period.from} — {snapshot.period.to}. هذه حركة الفترة وليست رصيد الحساب.</p>
      </div>
      {snapshot.cashMovements.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الحساب</th><th className="p-2">العملة</th><th className="p-2">الداخل</th><th className="p-2">الخارج</th><th className="p-2">صافي الحركة</th><th className="p-2">عدد الحركات</th><th className="p-2">الحالة والإثبات</th>
            </tr></thead>
            <tbody>
              {snapshot.cashMovements.map((movement) => (
                <tr key={movement.accountId + ":" + movement.currency} className="border-b last:border-0">
                  <td className="p-2">{movement.displayName} · {movement.accountCode} · {movement.settlementKind === "cash" ? "صندوق" : movement.settlementKind === "bank" ? "بنك" : "غير مصنف"}</td>
                  <td className="p-2">{movement.currency}</td>
                  <td className="p-2">{amount(movement.inflows, movement.currency)}</td>
                  <td className="p-2">{amount(movement.outflows, movement.currency)}</td>
                  <td className="p-2 font-semibold">{amount(movement.netMovement, movement.currency)}</td>
                  <td className="p-2">{movement.movementCount}</td>
                  <td className="p-2">
                    <EvidenceStatusLabel status={movement.status} />
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer">تفاصيل المصدر والاحتساب</summary>
                      <p>آخر حركة: {movement.lastMovementAt}</p>
                      <p>المعادلة: {movement.formulaId}@{movement.formulaVersion}</p>
                      <p>أنواع المصدر: {movement.sourceKinds.join("، ") || "غير متاحة"}</p>
                      <p>مراجع الإثبات: <EvidenceReferences ids={movement.evidenceIds} /></p>
                      <EvidenceWarnings warnings={movement.warnings} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد حركات مصدرية مرحلة ضمن الفترة المحددة.</p>}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">اكتمال تغطية الحركات النقدية</h4>
          <span className="text-xs"><EvidenceStatusLabel status={snapshot.cashMovementCoverage.status} /> · {snapshot.cashMovementCoverage.completeness}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <p>قيود نقدية مرحلة غير مصنفة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unclassifiedPostedCashJournalLines.toLocaleString("ar-YE")}</strong></p>
          <p>مصروفات نقدية غير مرتبطة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unlinkedCashExpenses.toLocaleString("ar-YE")}</strong></p>
          <p>دفعات عملاء غير مرتبطة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unlinkedCustomerPayments.toLocaleString("ar-YE")}</strong></p>
        </div>
        <p className="text-xs text-muted-foreground">المصدر: {snapshot.cashMovementCoverage.formulaId}@{snapshot.cashMovementCoverage.formulaVersion} · وقت الاحتساب: {snapshot.cashMovementCoverage.calculatedAt}</p>
        <EvidenceWarnings warnings={snapshot.cashMovementCoverage.warnings} />
      </div>
    </section>
  );
}

function SupplierPayablesSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  const rows = snapshot.supplierPayables.filter((item) => item.postedPayable !== 0 || item.reservedPaymentAmount !== 0);
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">التزامات الموردين المثبتة</h3>
        <p className="text-xs text-muted-foreground">من إيصالات الاستلام ذات القيود المرحلة، بعد طرح إشعارات الخصم والتسويات المرحلة. مسودات الدفع المحجوزة تظهر منفصلة ولا تخصم من الالتزام إلا بعد ترحيلها.</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">المورد</th><th className="p-2">العملة</th><th className="p-2">الإيصالات</th><th className="p-2">المستحق المثبت</th><th className="p-2">دفعات محجوزة غير مرحلة</th><th className="p-2">آخر استلام</th>
            </tr></thead>
            <tbody>
              {rows.map((supplier) => (
                <tr key={supplier.supplierId + ":" + supplier.currency} className="border-b last:border-0">
                  <td className="p-2">{supplier.supplierName}</td>
                  <td className="p-2">{supplier.currency}</td>
                  <td className="p-2">{supplier.receiptCount}</td>
                  <td className="p-2 font-semibold">{amount(supplier.postedPayable, supplier.currency)} · <EvidenceStatusLabel status={supplier.status} /></td>
                  <td className="p-2">{amount(supplier.reservedPaymentAmount, supplier.currency)}</td>
                  <td className="p-2">{supplier.lastReceiptDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد التزامات موردين ناتجة عن إيصالات مرحّلة غير مسددة.</p>}
      {snapshot.supplierPayables.map((supplier) => (
        <details key={supplier.supplierId + ":" + supplier.currency + ":evidence"} className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{supplier.supplierName} · {supplier.currency} · مصدر الاحتساب</summary>
          <p>المعادلة: {supplier.formulaId}@{supplier.formulaVersion} · احتُسب في {supplier.calculatedAt}</p>
          <p>مراجع الإثبات: <EvidenceReferences ids={supplier.evidenceIds} /></p>
          <EvidenceWarnings warnings={supplier.warnings} />
        </details>
      ))}
    </section>
  );
}

function ReceivablesSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-3">
      <div>
        <h3 className="font-semibold">الذمم المدينة والمتأخرات والدفعات الجزئية</h3>
        <p className="text-xs text-muted-foreground">الرصيد المفتوح لكل فاتورة بعد الدفعات المسجلة عليها. أعمار الذمم حسب تاريخ الاستحقاق المحفوظ، وتظل العملة مستقلة.</p>
      </div>
      {snapshot.receivables.length ? snapshot.receivables.map((position) => (
        <article key={position.currency} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="font-semibold">{position.currency}</h4>
            <span className="text-xs"><EvidenceStatusLabel status={position.status} /> · {position.invoiceCount} فاتورة · {position.partiallyPaidCount} دفعة جزئية</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            <p>إجمالي الذمم المفتوحة: <strong>{amount(position.totalOutstanding, position.currency)}</strong></p>
            <p>غير مستحقة: {amount(position.notDueAmount, position.currency)}</p>
            <p>متأخرة: {amount(position.overdueAmount, position.currency)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">فئة العمر</th><th className="p-2">المبلغ</th><th className="p-2">الفواتير</th><th className="p-2">مدفوعة جزئياً</th><th className="p-2">مراجع الإثبات</th></tr></thead>
              <tbody>
                {position.agingBuckets.map((bucket) => (
                  <tr key={bucket.bucket} className="border-b last:border-0">
                    <td className="p-2">{bucketLabel[bucket.bucket]}</td>
                    <td className="p-2">{amount(bucket.amount, position.currency)}</td>
                    <td className="p-2">{bucket.invoiceCount}</td>
                    <td className="p-2">{bucket.partiallyPaidCount}</td>
                    <td className="p-2 text-xs"><EvidenceReferences ids={bucket.evidenceIds} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">المعادلة: {position.formulaId}@{position.formulaVersion} · وقت الاحتساب: {position.calculatedAt} · حتى: {position.asOf}</p>
          <EvidenceWarnings warnings={position.warnings} />
        </article>
      )) : <p className="text-sm text-muted-foreground">لا توجد ذمم مفتوحة لها فواتير قائمة ضمن مصدر الحسابات.</p>}
    </section>
  );
}

function CustomerAgingDecisionSection({
  result,
  userProfileId,
  onDecisionSaved,
}: {
  result: CustomerReceivableAgingResult | null;
  userProfileId?: string | null;
  onDecisionSaved?: () => void;
}) {
  const [busyKey,setBusyKey] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);
  const rows = result?.ok ? result.data.items
    .filter(item=>item.overdueAmount>0)
    .sort((a,b)=>(b.oldestAgeDays??-1)-(a.oldestAgeDays??-1) || b.overdueAmount-a.overdueAmount)
    .slice(0,10) : [];
  const saveDecision = async (item: CustomerReceivableAgingItem) => {
    if (!userProfileId || busyKey) return;
    const evidenceIds=[...new Set(item.agingBuckets.filter(bucket=>bucket.bucket.startsWith("OVERDUE_")).flatMap(bucket=>bucket.evidenceIds))].slice(0,500);
    if (!evidenceIds.length) { setMessage("لا يمكن حفظ قرار تحصيل دون مراجع فواتير/دفعات مثبتة."); return; }
    const priority: "P0" | "P1" | "P2" | "P3" =
      (item.oldestAgeDays??0)>=90 ? "P0" : (item.oldestAgeDays??0)>=60 ? "P1" : (item.oldestAgeDays??0)>=30 ? "P2" : "P3";
    const priorityScore = priority==="P0"?400:priority==="P1"?300:priority==="P2"?200:100;
    const candidateId = ("receivables.collection:"+item.currency+":"+item.customerName.slice(0,70)+":"+item.asOf.slice(0,10)).slice(0,150);
    const expectedOutcome="خفض الرصيد المتأخر للعميل وتسجيل نتيجة التحصيل في مستندات المؤسسة.";
    const impactVerified=item.status==="VERIFIED" && item.overdueAmount>=0;
    const candidateSnapshot={
      schemaVersion:"1.0.0" as const,candidateId,ruleId:"receivables.collection.followup",ruleVersion:"1.0.0",
      priority,priorityScore,what:"تحصيل الذمم المتأخرة من العميل "+item.customerName,
      why:"يوجد رصيد متأخر مثبت بقيمة "+item.overdueAmount+" "+item.currency+"؛ أقدم عمر مستحق "+(item.oldestAgeDays===null?"غير محدد":item.oldestAgeDays+" يوماً")+".",
      risk:"تأخر التحصيل يجمّد سيولة المؤسسة ويزيد مخاطر تأخر السداد؛ لا يُفترض فقدان الدين.",
      soWhat:"تتطلب الذمم المتأخرة تواصلاً موثقاً وخطة تحصيل حسب أقدم فاتورة.",
      whatNext:"راجع الفواتير المتأخرة للعميل، اتفق على موعد سداد، وسجل الدفعة على الفاتورة ذاتها لمنع التكرار.",
      owner:"مسؤول التحصيلات",expectedOutcome,
      impact:impactVerified?{value:item.overdueAmount,unit:"CURRENCY",currency:item.currency,formulaId:item.formulaId,formulaVersion:item.formulaVersion,sourceMetricIds:[]}:null,
      impactStatus:impactVerified?"CALCULATED" as const:"WITHHELD" as const,
      impactReason:impactVerified?null:"CUSTOMER_AGING_REQUIRES_REVIEW",
      proof:{evidenceIds,metricKeys:["receivables.customer_overdue"],asOf:item.asOf,formulaVersions:[item.formulaId+"@"+item.formulaVersion]},
      createdAt:item.calculatedAt,expiresAt:null,
    };
    setBusyKey(candidateId);setMessage(null);
    const saved=await createDecisionOutcomeProposal({
      candidateId,ruleId:candidateSnapshot.ruleId,ruleVersion:candidateSnapshot.ruleVersion,
      ownerProfileId:userProfileId,expectedOutcome,reason:candidateSnapshot.why,candidateSnapshot,
    });
    setBusyKey(null);
    setMessage(saved.ok?(saved.duplicate?"قرار التحصيل محفوظ بالفعل؛ تم استرجاع حالته.":"تم حفظ قرار التحصيل في دورة القرارات."):saved.message);
    if(saved.ok)onDecisionSaved?.();
  };
  if (!result) return <section className="rounded-xl border p-3"><h3 className="font-semibold">أعمار الذمم حسب العميل</h3><p className="text-sm text-muted-foreground">جارٍ تحميل أعمار الذمم...</p></section>;
  if (!result.ok) return <section className="rounded-xl border p-3"><h3 className="font-semibold">أعمار الذمم حسب العميل</h3><p role="alert" className="text-sm">{result.message}</p></section>;
  return (
    <section className="rounded-xl border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">أعمار الذمم حسب العميل</h3>
        <span className="text-xs text-muted-foreground">{result.data.returnedGroups} مجموعة عميل/عملة · {result.data.asOf}</span>
      </div>
      <p className="text-xs text-muted-foreground">الأرصدة بعد خصم الدفعات المسجلة على الفاتورة نفسها. لا تدمج العملات، ولا يظهر العميل كقرار تحصيل دون مراجع مصدرية.</p>
      {rows.length?rows.map(item=>(
        <article key={item.customerName+":"+item.currency} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{item.customerName} · {item.currency}</strong>
            <span className="text-sm font-semibold">{amount(item.overdueAmount,item.currency)} متأخر</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <p>إجمالي المفتوح: {amount(item.totalOutstanding,item.currency)}</p>
            <p>الفواتير: {item.invoiceCount} · جزئية: {item.partiallyPaidCount}</p>
            <p>أقدم عمر: {item.oldestAgeDays===null?"غير محدد":item.oldestAgeDays+" يوم"}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {item.agingBuckets.map(bucket=><span key={bucket.bucket} className="rounded-md border px-2 py-1">{bucket.bucket==="OVERDUE_1_30"?"1–30":bucket.bucket==="OVERDUE_31_60"?"31–60":bucket.bucket==="OVERDUE_61_90"?"61–90":bucket.bucket==="OVERDUE_90_PLUS"?"90+":bucket.bucket==="NOT_DUE"?"غير مستحق":"تاريخ مجهول"}: {amount(bucket.amount,item.currency)}</span>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground"><EvidenceStatusLabel status={item.status}/>: <EvidenceReferences ids={item.agingBuckets.flatMap(bucket=>bucket.evidenceIds).slice(0,12)}/></span>
            <button type="button" className="btn secondary" disabled={!userProfileId||busyKey!==null||!item.agingBuckets.some(bucket=>bucket.bucket.startsWith("OVERDUE_")&&bucket.evidenceIds.length>0)} onClick={()=>void saveDecision(item)}>
              {busyKey==="receivables.collection:"+item.currency+":"+item.customerName.slice(0,70)+":"+item.asOf.slice(0,10)?"جارٍ الحفظ...":"حفظ قرار متابعة التحصيل"}
            </button>
          </div>
        </article>
      )):<p className="text-sm text-muted-foreground">لا توجد ذمم متأخرة على عملاء ضمن بيانات الفواتير المفتوحة.</p>}
      {result.data.warnings.length||!result.data.complete?<p role="status" className="text-xs text-muted-foreground">{result.data.warnings.join(" · ")||"التغطية جزئية؛ راجع الصفوف غير المكتملة."}</p>:null}
      {message?<p role="status" className="text-sm">{message}</p>:null}
    </section>
  );
}

export function ExecutiveLiquidityCommandCenter({ refreshKey = 0, onDecisionSaved }: ExecutiveLiquidityCommandCenterProps) {
  const { user } = useAuth();
  const [customerAgingResult,setCustomerAgingResult] = useState<CustomerReceivableAgingResult|null>(null);
  const [result, setResult] = useState<ExecutiveLiquidityFetchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setCustomerAgingResult(null);
    void fetchExecutiveCustomerReceivableAging().then(value=>{if(active)setCustomerAgingResult(value);});
    return () => { active = false; };
  }, [refreshKey, manualRefreshKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchExecutiveLiquidityWorkspace()
      .then((response) => { if (active) setResult(response); })
      .catch(() => {
        if (active) setResult({ ok: false, status: "UNAVAILABLE", message: "تعذر تحميل مركز القيادة المالية." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, manualRefreshKey]);

  const snapshot = result?.ok ? result.data : null;

  return (
    <section dir="rtl" className="space-y-3" aria-label="مركز القيادة المالية والسيولة">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">مركز القيادة المالية والسيولة</h2>
          <p className="text-xs text-muted-foreground">
            {snapshot ? "حتى " + snapshot.asOf + " · حركة الفترة " + snapshot.period.from + " — " + snapshot.period.to : "قراءة موحدة للصندوق والحسابات والذمم والتزامات الموردين"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot ? <span className="text-xs">الصلاحية: {snapshot.effectiveRole === "admin" ? "مدير المؤسسة" : "مدير"}</span> : null}
          <button
            type="button"
            className="btn secondary"
            onClick={() => setManualRefreshKey((value) => value + 1)}
            disabled={loading}
            aria-label="تحديث مركز القيادة المالية"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "جارٍ التحديث…" : "تحديث المركز"}
          </button>
        </div>
      </header>
      {loading ? <p role="status" className="rounded-lg border p-3 text-sm">جارٍ تحميل المؤشرات المالية من مصادر المؤسسة...</p> : null}
      {!loading && result && !result.ok ? (
        <div role="alert" className="rounded-lg border p-3 text-sm">{result.message}</div>
      ) : null}
      {snapshot ? (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <CashCountSection snapshot={snapshot} />
            <CashAccountsSection snapshot={snapshot} />
          </div>
          <CashMovementsSection snapshot={snapshot} />
          <div className="grid gap-3 xl:grid-cols-2">
            <ReceivablesSection snapshot={snapshot} />
            <SupplierPayablesSection snapshot={snapshot} />
          </div>
          <CustomerAgingDecisionSection result={customerAgingResult} userProfileId={user?.profileId} onDecisionSaved={onDecisionSaved} />
          <EvidenceWarnings warnings={snapshot.warnings} />
        </>
      ) : null}
    </section>
  );
}
