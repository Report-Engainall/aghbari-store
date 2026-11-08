import type {DecisionCandidate} from "@/lib/intelligence/types";

export type ActionCardState="loading"|"empty"|"error"|"unavailable"|"ready";
export interface ActionCardProps {
 decision?:DecisionCandidate|null;state?:ActionCardState;errorMessage?:string;ctaLabel?:string;
 onRetry?:()=>void;onContinue?:(decision:DecisionCandidate)=>void;onOpenEvidence?:(decision:DecisionCandidate)=>void;
}

const labels:Record<DecisionCandidate["priority"],string>={P0:"حرج",P1:"مرتفع",P2:"متوسط",P3:"منخفض"};

function ActionCardStateView({
 state,
 errorMessage,
 onRetry,
}: {
 state: ActionCardState;
 errorMessage: string;
 onRetry?: () => void;
}) {
 if(state==="loading")return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل القرار والأدلة…</div>;
 if(state==="empty")return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد قرارات مستحقة وفق المؤشرات المثبتة.</div>;
 if(state==="unavailable")return <div role="note" dir="rtl" className="rounded-xl border p-4 text-sm">مصادر القرار غير متاحة. لم يتم إنشاء بيانات بديلة.</div>;
 if(state==="error")return <div role="alert" dir="rtl" className="rounded-xl border p-4 text-sm"><p>{errorMessage}</p>{onRetry?<button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button>:null}</div>;
 return null;
}

function decisionImpactLabel(decision: DecisionCandidate): string {
 if(decision.impact) {
  const {value,unit,currency}=decision.impact;
  return String(value)+" "+unit+(currency?" "+currency:"");
 }
 if(decision.impactReason==="NO_APPROVED_IMPACT_FORMULA") {
  return "لم تُهيأ معادلة أثر معتمدة";
 }
 return "الأثر غير متاح؛ لم تثبت معادلته أو مدخلاته";
}

function ActionCardHeader({decision}:{decision:DecisionCandidate}) {
 return (
  <header className="flex flex-wrap items-center justify-between gap-2">
   <span className="text-xs font-semibold">{labels[decision.priority]} · {decision.priority}</span>
   <span className="text-xs text-muted-foreground">المالك: {decision.owner}</span>
  </header>
 );
}

function ActionCardNarrative({decision}:{decision:DecisionCandidate}) {
 return (
  <section className="mt-3 space-y-2">
   <h3 className="text-base font-semibold">{decision.what}</h3>
   <p className="text-sm"><strong>WHY:</strong> {decision.why}</p>
   <p className="text-sm"><strong>SO WHAT:</strong> {decision.soWhat}</p>
   <p className="text-sm"><strong>IMPACT:</strong> {decisionImpactLabel(decision)}</p>
   <p className="text-sm"><strong>WHAT NEXT:</strong> {decision.whatNext}</p>
   <p className="text-sm"><strong>EXPECTED OUTCOME:</strong> {decision.expectedOutcome}</p>
  </section>
 );
}

function ActionCardProof({proof}:{proof:DecisionCandidate["proof"]}) {
 const evidenceIds=proof.evidenceIds.join("، ")||"لا توجد مراجع إثبات";
 const formulaVersions=proof.formulaVersions.join("، ")||"غير محددة";
 const metricKeys=proof.metricKeys.join("، ")||"غير محددة";
 return (
  <section aria-label="PROOF" className="mt-3 space-y-1 rounded-lg border p-3 text-xs">
   <strong>PROOF:</strong>
   <p>Evidence IDs: {evidenceIds}</p>
   <p>As of: {proof.asOf}</p>
   <p>Formula versions: {formulaVersions}</p>
   <p>Metric keys: {metricKeys}</p>
  </section>
 );
}

function ActionCardFooter({
 decision,
 ctaLabel,
 onContinue,
 onOpenEvidence,
}: {
 decision: DecisionCandidate;
 ctaLabel: string;
 onContinue?: (decision: DecisionCandidate) => void;
 onOpenEvidence?: (decision: DecisionCandidate) => void;
}) {
 return (
  <footer className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
   <span>الاحتساب: {decision.createdAt}</span>
   <span>الانتهاء: {decision.expiresAt??"غير محدد"}</span>
   <span>الأدلة: {decision.proof.evidenceIds.length}</span>
   {onOpenEvidence?<button type="button" className="rounded-lg border px-3 py-2" onClick={()=>onOpenEvidence(decision)}>عرض الإثبات</button>:null}
   {onContinue?<button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={()=>onContinue(decision)}>{ctaLabel}</button>:null}
  </footer>
 );
}

export function ActionCard({
 decision,
 state="ready",
 errorMessage="تعذر تحميل القرار.",
 ctaLabel="متابعة الإجراء",
 onRetry,
 onContinue,
 onOpenEvidence,
}:ActionCardProps) {
 if(state!=="ready")return <ActionCardStateView state={state} errorMessage={errorMessage} onRetry={onRetry}/>;
 if(!decision)return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد بطاقة قرار لعرضها.</div>;

 return (
  <article dir="rtl" className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
   <ActionCardHeader decision={decision}/>
   <ActionCardNarrative decision={decision}/>
   <ActionCardProof proof={decision.proof}/>
   <ActionCardFooter decision={decision} ctaLabel={ctaLabel} onContinue={onContinue} onOpenEvidence={onOpenEvidence}/>
  </article>
 );
}
