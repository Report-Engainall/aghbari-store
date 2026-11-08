import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BrainCircuit, RefreshCw, ShieldCheck, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CustomerQuotePipelineSummary } from "@/components/intelligence/CustomerQuotePipelineSummary";
import { buildDeadStockReport } from "@/lib/intelligence/dead-stock";
import { buildReplenishmentRecommendations } from "@/lib/intelligence/replenishment";
import { buildLiquiditySnapshot } from "@/lib/intelligence/liquidity";
import { buildCashflowForecast } from "@/lib/intelligence/cashflow-forecast";
import { buildDailyDecisions, type DecisionRule } from "@/lib/intelligence/daily-decisions";
import { buildEvidencePassport } from "@/lib/intelligence/evidence-passport";
import { buildBusinessHealthMap, type BusinessHealthMapResult } from "@/lib/intelligence/business-health-map";
import { buildDecisionMemoryBook } from "@/lib/intelligence/decision-memory";
import { fetchCustomerRetentionAggregate, type CustomerRetentionAggregateResult } from "@/lib/intelligence/customer-retention-client";
import { fetchOperationalShiftWorkspace, startOperationalShift, recordOperationalShiftCashCount, recordOperationalShiftHandover, acceptOperationalShiftHandover, captureOperationalShiftSnapshot } from "@/lib/intelligence/shift-operations-client";
import { fetchProcessBottlenecks, type ProcessBottleneckFetchResult } from "@/lib/intelligence/process-bottlenecks-client";
import { fetchSupplierPerformance, type SupplierPerformanceFetchResult } from "@/lib/intelligence/supplier-performance-client";
import { fetchCustomerQuotePipeline, type CustomerQuotePipelineFetchResult } from "@/lib/intelligence/customer-quote-pipeline-client";
import { fetchTaskPerformanceScorecard, type TaskPerformanceScorecardFetchResult } from "@/lib/intelligence/task-performance-scorecard-client";
import type { GrowthOpportunityKind } from "@/lib/intelligence/growth-opportunities";
import type { ShiftQueueSourceKey } from "@/lib/intelligence/shift-operations";
import type { DecisionCandidate, EvidencePassport as EvidencePassportData, MetricSnapshot } from "@/lib/intelligence/types";
import {
  createInventoryIntelligencePeriod,
  fetchInventoryIntelligence,
  type InventoryIntelligenceResult,
} from "@/lib/intelligence/inventory-intelligence-client";
import {
  createCashflowScheduleRequest,
  fetchCashflowSchedule,
  type CashflowMeasurementProof,
  type CashflowScheduleResult,
} from "@/lib/intelligence/cashflow-schedule-client";
import {
  commandDecisionOutcome,
  createDecisionOutcomeProposal,
  fetchDecisionOutcomes,
  type DecisionOutcomeEventType,
  type DecisionOutcomeView,
  type DecisionOutcomeListResult,
} from "@/lib/intelligence/decision-outcome-client";
import {
  ActionCard,
  CommercePolicyGovernancePanel,
  BusinessHealthMap,
  DecisionMemoryBook,
  ExecutiveLiquidityCommandCenter,
  CashflowForecastCard,
  DeadStockCard,
  EvidencePassport,
  GrowthOpportunityRadar,
  LiquiditySummary,
  ReplenishmentCard,
  ShiftOperationsCenter,
  ProcessBottlenecksPanel,
  SupplierPerformancePanel,
  TaskPerformanceScorecard,
  NaturalLanguageAssistant,
} from "@/components/intelligence";

const DECISION_PAGE_SIZE = 50;
const formatDay = (value: string) => new Date(value + "T00:00:00.000Z").toLocaleDateString("ar-YE", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;
const stateLabels: Record<DecisionOutcomeView["state"], string> = {
  PROPOSED: "مقترح", IN_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض",
  DEFERRED: "مؤجل", ASSIGNED: "مُعيّن", EXECUTING: "قيد التنفيذ", EXECUTED: "بانتظار القياس", MEASURED: "مقاس",
};
function currencyFromCandidate(candidateId: string): string | null {
  const parts = candidateId.split(":");
  return parts[0] === "cashflow.expected_collections" && /^[A-Z]{3}$/.test(parts[1] ?? "") ? parts[1] : null;
}
function candidateIdFor(currency: string, period: { from: string; to: string }): string {
  return "cashflow.expected_collections:" + currency + ":" + period.from + ":" + period.to;
}

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDay(day: string, offset: number): string {
  const date = new Date(day + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isUtcDay(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function previousMatchingPeriod(from: string, to: string): { from: string; to: string } | null {
  const start = Date.parse(from + "T00:00:00.000Z");
  const end = Date.parse(to + "T00:00:00.000Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  const days = Math.floor((end - start) / 86_400_000) + 1;
  return { from: shiftUtcDay(from, -days), to: shiftUtcDay(from, -1) };
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Aden";
  } catch {
    return "Asia/Aden";
  }
}

function dayInTimeZone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  } catch {
    return utcDay();
  }
}

const collectionFollowupRules: DecisionRule[] = [{
  id: "cashflow.collection.followup",
  version: "1.0.0",
  metricKey: "cashflow.expected_collections",
  operator: "GT",
  threshold: 0,
  priority: "P2",
  impactFormula: { id: "cashflow.expected-collection-impact", version: "1.0.0", operation: "IDENTITY", metricKeys: ["cashflow.expected_collections"], resultUnit: "CURRENCY" },
  what: "متابعة التحصيلات المجدولة",
  why: "يوجد إجمالي تحصيل مثبت ضمن الفترة المحددة.",
  soWhat: "تلزم مراجعة المستحقات وتوثيق إجراءات المتابعة.",
  whatNext: "افحص الفواتير القريبة من الاستحقاق أو المتأخرة ووثّق إجراء المتابعة.",
  owner: "مدير المالية",
  expectedOutcome: "تسجيل المتابعة ونتيجة التحصيل من مستندات المؤسسة.",
}];

type EvidenceBackedAction = { decision: DecisionCandidate; proof: CashflowMeasurementProof | null; candidateId: string };

type DecisionTransitionOptions = {
  reason?: string;
  ownerProfileId?: string;
  proof?: CashflowMeasurementProof;
};

type DecisionTransitionHandler = (
  outcome: DecisionOutcomeView,
  eventType: Exclude<DecisionOutcomeEventType, "DEFER" | "RESUBMIT_FOR_REVIEW">,
  options?: DecisionTransitionOptions,
) => void;

function DecisionOutcomeHistory({ events }: { events: DecisionOutcomeView["history"] }) {
  return (
    <>
      {events.map((event) => (
        <span key={event.id} className="me-3">
          {event.version}. {event.type} · {event.actorRole} · {formatDay(event.at.slice(0, 10))}
        </span>
      ))}
    </>
  );
}

function DecisionOutcomeCard({
  outcome,
  measurementMetrics,
  actionReason,
  busy,
  anyBusy,
  profileId,
  onReasonChange,
  onTransition,
}: {
  outcome: DecisionOutcomeView;
  measurementMetrics: CashflowMeasurementProof[];
  actionReason: string;
  busy: boolean;
  anyBusy: boolean;
  profileId: string | undefined;
  onReasonChange: (id: string, value: string) => void;
  onTransition: DecisionTransitionHandler;
}) {
  const currency = currencyFromCandidate(outcome.candidateId);
  const candidatePeriod = outcome.candidateId.split(":").slice(2).join(":");
  const proof = measurementMetrics.find((item) =>
    item.currency === currency && item.period.from + ":" + item.period.to === candidatePeriod,
  );

  return (
    <article className="rounded-xl border p-4" aria-label={"قرار " + outcome.id}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{outcome.expectedOutcome}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{outcome.ruleId}@{outcome.ruleVersion} · المالك: {outcome.ownerLabel}</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">{stateLabels[outcome.state]} · v{outcome.version}</span>
      </header>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <p>النطاق: {currency ?? "غير محدد"} · {candidatePeriod.split(":").join(" — ")}</p>
        <p>الأحداث المحفوظة: {outcome.eventCount} · آخر تحديث: {formatDay(outcome.updatedAt.slice(0, 10))}</p>
        {outcome.measuredOutcome ? <p className="font-semibold">النتيجة المقاسة: {formatMoney(outcome.measuredOutcome.value, outcome.measuredOutcome.currency)} · {outcome.measuredOutcome.asOf}</p> : null}
        {outcome.reason ? <p>السبب: {outcome.reason}</p> : null}
      </div>
      {outcome.state === "IN_REVIEW" ? (
        <label className="mt-3 grid gap-1 text-sm">سبب الاعتماد أو الرفض
          <input className="rounded-lg border bg-background p-2" value={actionReason} maxLength={2000} onChange={(event) => onReasonChange(outcome.id, event.target.value)} />
        </label>
      ) : null}
      <DecisionOutcomeActions
        outcome={outcome}
        proof={proof}
        currency={currency}
        busy={busy}
        anyBusy={anyBusy}
        profileId={profileId}
        actionReason={actionReason}
        onTransition={onTransition}
      />
      {outcome.state === "EXECUTED" && !proof ? <p className="mt-2 text-xs text-muted-foreground">القياس محجوب: لا توجد حزمة إثبات كاملة للعملة والفترة المطابقتين تماماً.</p> : null}
      <footer className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        <DecisionOutcomeHistory events={outcome.history} />
      </footer>
    </article>
  );
}

function DecisionOutcomeActions({
  outcome,
  proof,
  currency,
  busy,
  anyBusy,
  profileId,
  actionReason,
  onTransition,
}: {
  outcome: DecisionOutcomeView;
  proof: CashflowMeasurementProof | undefined;
  currency: string | null;
  busy: boolean;
  anyBusy: boolean;
  profileId: string | undefined;
  actionReason: string;
  onTransition: DecisionTransitionHandler;
}) {
  const disabled = busy || anyBusy;
  if (outcome.state === "PROPOSED") {
    return <div className="mt-3 flex flex-wrap gap-2"><button className="btn primary" type="button" disabled={disabled} onClick={() => onTransition(outcome, "SUBMIT_FOR_REVIEW")}>إرسال للمراجعة</button>{busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}</div>;
  }
  if (outcome.state === "IN_REVIEW") {
    const missingReason = !actionReason.trim();
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn primary" type="button" disabled={disabled || missingReason} onClick={() => onTransition(outcome, "APPROVE", { reason: actionReason })}>اعتماد</button>
        <button className="btn secondary" type="button" disabled={disabled || missingReason} onClick={() => onTransition(outcome, "REJECT", { reason: actionReason })}>رفض مع السبب</button>
        {busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}
      </div>
    );
  }
  if (outcome.state === "APPROVED") {
    return <div className="mt-3 flex flex-wrap gap-2"><button className="btn primary" type="button" disabled={disabled || !profileId} onClick={() => profileId && onTransition(outcome, "ASSIGN", { ownerProfileId: profileId })}>تعيين لنفسي</button>{busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}</div>;
  }
  if (outcome.state === "ASSIGNED") {
    return <div className="mt-3 flex flex-wrap gap-2"><button className="btn primary" type="button" disabled={disabled} onClick={() => onTransition(outcome, "START_EXECUTION")}>بدء التنفيذ</button>{busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}</div>;
  }
  if (outcome.state === "EXECUTING") {
    return <div className="mt-3 flex flex-wrap gap-2"><button className="btn primary" type="button" disabled={disabled} onClick={() => onTransition(outcome, "COMPLETE_EXECUTION")}>إتمام التنفيذ</button>{busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}</div>;
  }
  if (outcome.state === "EXECUTED") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn primary" type="button" disabled={disabled || !proof} onClick={() => proof && onTransition(outcome, "MEASURE", { proof })}>
          قياس من مصدر {currency ?? "غير متاح"}
        </button>
        {busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}
      </div>
    );
  }
  return <div className="mt-3">{busy ? <span role="status" className="text-xs">جارٍ تسجيل الحدث...</span> : null}</div>;
}


function DecisionCyclePanel({
  outcomeResult,
  outcomesLoading,
  outcomeOffset,
  onPageChange,
  onRetry,
  outcomeReasons,
  outcomeBusyId,
  measurementMetrics,
  profileId,
  onReasonChange,
  onTransition,
}: {
  outcomeResult: DecisionOutcomeListResult | null;
  outcomesLoading: boolean;
  outcomeOffset: number;
  onPageChange: (offset: number) => void;
  onRetry: () => void;
  outcomeReasons: Record<string, string>;
  outcomeBusyId: string | null;
  measurementMetrics: CashflowMeasurementProof[];
  profileId: string | undefined;
  onReasonChange: (id: string, value: string) => void;
  onTransition: DecisionTransitionHandler;
}) {
  const outcomes = outcomeResult?.ok ? outcomeResult.items : [];
  const showError = !outcomesLoading && outcomeResult !== null && !outcomeResult.ok;
  const showEmpty = !outcomesLoading && outcomeResult?.ok === true && outcomeResult.items.length === 0;
  const showItems = !outcomesLoading && outcomes.length > 0;

  return (
    <section className="panel space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><ShieldCheck size={18} /><h2>دورة القرارات المحفوظة</h2></div>
        <span className="text-xs text-muted-foreground">{outcomeResult?.ok ? outcomeResult.total + " قرار" : ""}</span>
      </div>
      <p className="report-note">كل انتقال يحفظ بإصدار متوقع ومفتاح منع تكرار وسجل تدقيق ذري. لا يتغير وضع القرار محلياً قبل استجابة الخادم.</p>
      {outcomesLoading ? <p role="status" className="text-sm">جارٍ تحميل القرارات...</p> : null}
      {showError && outcomeResult && !outcomeResult.ok ? (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          <p>{outcomeResult.message}</p>
          <button type="button" className="btn secondary mt-2" onClick={onRetry} disabled={outcomeBusyId !== null}>
            إعادة تحميل القرارات
          </button>
        </div>
      ) : null}
      {showEmpty ? <p role="status" className="text-sm">لا توجد قرارات محفوظة لهذه المؤسسة.</p> : null}
      {showItems ? (
        <div className="space-y-3">
          {outcomes.map((outcome) => (
            <DecisionOutcomeCard
              key={outcome.id}
              outcome={outcome}
              measurementMetrics={measurementMetrics}
              actionReason={outcomeReasons[outcome.id] ?? ""}
              busy={outcomeBusyId === outcome.id}
              anyBusy={outcomeBusyId !== null}
              profileId={profileId}
              onReasonChange={onReasonChange}
              onTransition={onTransition}
            />
          ))}
        </div>
      ) : null}
      {!outcomesLoading && outcomeResult?.ok && outcomeResult.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {outcomes.length > 0
              ? `عرض ${outcomeOffset + 1}–${Math.min(outcomeOffset + outcomes.length, outcomeResult.total)} من ${outcomeResult.total}`
              : "لا توجد سجلات في هذه الصفحة"}
          </span>
          <nav className="flex items-center gap-2" aria-label="صفحات دورة القرارات">
            <button type="button" className="btn secondary" aria-label="السابق"
              onClick={() => onPageChange(Math.max(0, outcomeOffset - DECISION_PAGE_SIZE))}
              disabled={outcomeOffset === 0 || outcomeBusyId !== null}>السابق</button>
            <button type="button" className="btn secondary" aria-label="التالي"
              onClick={() => onPageChange(outcomeOffset + DECISION_PAGE_SIZE)}
              disabled={outcomeOffset + DECISION_PAGE_SIZE >= outcomeResult.total || outcomeBusyId !== null}>التالي</button>
          </nav>
        </div>
      ) : null}
    </section>
  );
}

export function IntelligenceWorkspace({ onOpenRecord, onOpenShiftItem, onOpenSupplierInvoice, onOpenPurchaseOrder }: {
  onOpenRecord?: (kind: GrowthOpportunityKind, subjectRef: string) => void;
  onOpenShiftItem?: (sourceKey: ShiftQueueSourceKey, sourceRef: string) => void;
  onOpenSupplierInvoice?: (invoiceId: string) => void;
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
}) {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<CashflowScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeResult, setOutcomeResult] = useState<DecisionOutcomeListResult | null>(null);
  const [outcomesLoading, setOutcomesLoading] = useState(true);
  const [outcomeOffset, setOutcomeOffset] = useState(0);
  const outcomeRequestGeneration = useRef(0);
  const snapshotAt = useRef(new Date());
  const outcomesMounted = useRef(false);
  const [outcomeBusyId, setOutcomeBusyId] = useState<string | null>(null);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [outcomeReasons, setOutcomeReasons] = useState<Record<string, string>>({});
  const [proposalCurrency, setProposalCurrency] = useState("");
  const [proposalExpected, setProposalExpected] = useState("متابعة التحصيل وفق الفواتير المثبتة في الفترة المحددة");
  const [proposalReason, setProposalReason] = useState("");
  const [inventoryResult, setInventoryResult] = useState<InventoryIntelligenceResult | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [retentionResult, setRetentionResult] = useState<CustomerRetentionAggregateResult | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [shiftBusinessDate, setShiftBusinessDate] = useState(() => dayInTimeZone(browserTimeZone()));
  const [shiftLabel, setShiftLabel] = useState("الوردية الصباحية");
  const [shiftHandoverId, setShiftHandoverId] = useState<string | null>(null);
  const [shiftTimeZone, setShiftTimeZone] = useState(browserTimeZone());
  const [shiftCashPhase, setShiftCashPhase] = useState<"OPENING" | "CLOSING">("OPENING");
  const [shiftCashCurrency, setShiftCashCurrency] = useState("YER");
  const [shiftCashAmount, setShiftCashAmount] = useState("");
  const [shiftCashNote, setShiftCashNote] = useState("");
  const [shiftCashCorrectionReason, setShiftCashCorrectionReason] = useState("");
  const [shiftHandoverReason, setShiftHandoverReason] = useState("");
  const [shiftHandoverNote, setShiftHandoverNote] = useState("");
  const [shiftResponse, setShiftResponse] = useState<Awaited<ReturnType<typeof fetchOperationalShiftWorkspace>> | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);
  const [shiftActionBusy, setShiftActionBusy] = useState(false);
  const [shiftActionMessage, setShiftActionMessage] = useState<string | null>(null);
  const shiftRequestGeneration = useRef(0);
  const shiftCommandKeys = useRef(new Map<string, string>());
  const [processFrom, setProcessFrom] = useState(() => shiftUtcDay(utcDay(), -29));
  const [processTo, setProcessTo] = useState(() => utcDay());
  const [processCompare, setProcessCompare] = useState(true);
  const [processResponse, setProcessResponse] = useState<ProcessBottleneckFetchResult | null>(null);
  const [processLoading, setProcessLoading] = useState(true);
  const [processRefreshKey, setProcessRefreshKey] = useState(0);
  const processRequestGeneration = useRef(0);
  const [supplierPerformanceResponse, setSupplierPerformanceResponse] = useState<SupplierPerformanceFetchResult | null>(null);
  const [supplierPerformanceLoading, setSupplierPerformanceLoading] = useState(true);
  const [supplierPerformanceRefreshKey, setSupplierPerformanceRefreshKey] = useState(0);
  const supplierPerformanceRequestGeneration = useRef(0);
  const [customerQuotePipelineResponse, setCustomerQuotePipelineResponse] = useState<CustomerQuotePipelineFetchResult | null>(null);
  const [customerQuotePipelineLoading, setCustomerQuotePipelineLoading] = useState(true);
  const [customerQuotePipelineRefreshKey, setCustomerQuotePipelineRefreshKey] = useState(0);
  const customerQuotePipelineRequestGeneration = useRef(0);
  const [taskPerformanceResponse, setTaskPerformanceResponse] = useState<TaskPerformanceScorecardFetchResult | null>(null);
  const [taskPerformanceLoading, setTaskPerformanceLoading] = useState(true);
  const [taskPerformanceRefreshKey, setTaskPerformanceRefreshKey] = useState(0);
  const taskPerformanceRequestGeneration = useRef(0);

  useEffect(() => {
    outcomesMounted.current = true;
    return () => {
      outcomesMounted.current = false;
      outcomeRequestGeneration.current += 1;
    };
  }, []);

  const loadCashflow = useCallback(async (active: () => boolean) => {
    if (!canManage) {
      setResult({ ok: false, status: "DENIED", message: "تتطلب هذه الشاشة صلاحية المدير أو مدير المؤسسة المالية." });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const request = createCashflowScheduleRequest({ horizonDays: 90, now: snapshotAt.current });
      const response = await fetchCashflowSchedule(request);
      if (!active()) return;
      setResult(response);
    } catch {
      if (!active()) return;
      setResult({ ok: false, status: "ERROR", message: "تعذر إنشاء طلب التحليل؛ لم تُعرض أرقام بديلة." });
    } finally {
      if (active()) setLoading(false);
    }
  }, [canManage]);

  const loadInventory = useCallback(async (active: () => boolean) => {
    if (!canManage) {
      setInventoryResult({ ok: false, status: "DENIED", message: "تتطلب قراءة بيانات المخزون صلاحية المدير أو مدير المؤسسة المالية." });
      setInventoryLoading(false);
      return;
    }
    setInventoryLoading(true);
    try {
      const request = createInventoryIntelligencePeriod(snapshotAt.current, 92);
      const response = await fetchInventoryIntelligence(request.period, request.asOf);
      if (active()) setInventoryResult(response);
    } catch {
      if (active()) setInventoryResult({ ok: false, status: "ERROR", message: "تعذر إنشاء طلب أدلة المخزون." });
    } finally {
      if (active()) setInventoryLoading(false);
    }
  }, [canManage]);

  const loadCustomerRetention = useCallback(async (active: () => boolean) => {
    if (!canManage) {
      setRetentionResult({ ok: false, status: "DENIED", message: "تتطلب قراءة مجتمع العملاء صلاحية موظف نشط داخل المؤسسة." });
      setRetentionLoading(false);
      return;
    }
    setRetentionLoading(true);
    try {
      const response = await fetchCustomerRetentionAggregate(90, snapshotAt.current.toISOString());
      if (active()) setRetentionResult(response);
    } catch {
      if (active()) setRetentionResult({ ok: false, status: "ERROR", message: "تعذر إنشاء لقطة الاحتفاظ بالعملاء." });
    } finally {
      if (active()) setRetentionLoading(false);
    }
  }, [canManage]);

  const loadShiftWorkspace = useCallback(async (active: () => boolean) => {
    const generation = ++shiftRequestGeneration.current;
    if (!canManage) {
      setShiftResponse({ ok: false, status: "DENIED", message: "تتطلب إدارة الوردية صلاحية المدير أو مدير المؤسسة." });
      setShiftLoading(false);
      return;
    }
    setShiftLoading(true);
    try {
      const response = await fetchOperationalShiftWorkspace({ businessDate: shiftBusinessDate });
      if (!active() || generation !== shiftRequestGeneration.current) return;
      setShiftResponse(response);
    } catch {
      if (!active() || generation !== shiftRequestGeneration.current) return;
      setShiftResponse({ ok: false, status: "ERROR", message: "تعذر تحميل أدلة الوردية من قاعدة البيانات." });
    } finally {
      if (active() && generation === shiftRequestGeneration.current) setShiftLoading(false);
    }
  }, [canManage, shiftBusinessDate]);

  const loadProcessBottlenecks = useCallback(async (active: () => boolean) => {
    const generation = ++processRequestGeneration.current;
    if (!canManage) {
      setProcessResponse({ ok: false, status: "DENIED", message: "تتطلب قراءة تحليل العمليات صلاحية المدير أو مدير المؤسسة." });
      setProcessLoading(false);
      return;
    }
    const baseline = processCompare ? previousMatchingPeriod(processFrom, processTo) : null;
    if (!isUtcDay(processFrom) || !isUtcDay(processTo) || processFrom > processTo || (processCompare && !baseline)) {
      setProcessResponse({ ok: false, status: "ERROR", message: "حدد فترة UTC صحيحة؛ يجب أن يكون تاريخ البداية قبل تاريخ النهاية." });
      setProcessLoading(false);
      return;
    }
    setProcessLoading(true);
    try {
      const response = await fetchProcessBottlenecks({
        from: processFrom,
        to: processTo,
        baselineFrom: baseline?.from ?? null,
        baselineTo: baseline?.to ?? null,
      });
      if (!active() || generation !== processRequestGeneration.current) return;
      setProcessResponse(response);
    } catch {
      if (!active() || generation !== processRequestGeneration.current) return;
      setProcessResponse({ ok: false, status: "ERROR", message: "تعذر تحميل تحليل زمن العمليات من قاعدة البيانات." });
    } finally {
      if (active() && generation === processRequestGeneration.current) setProcessLoading(false);
    }
  }, [canManage, processCompare, processFrom, processTo]);

  useEffect(() => {
    let mounted = true;
    const generation = ++supplierPerformanceRequestGeneration.current;
    if (!canManage) {
      setSupplierPerformanceResponse({ ok: false, status: "DENIED", message: "تتطلب قراءة أداء الموردين صلاحية المدير أو مدير المؤسسة." });
      setSupplierPerformanceLoading(false);
      return () => { mounted = false; };
    }
    setSupplierPerformanceLoading(true);
    void fetchSupplierPerformance({ from: processFrom, to: processTo, limit: 100 })
      .then((response) => {
        if (mounted && generation === supplierPerformanceRequestGeneration.current) setSupplierPerformanceResponse(response);
      })
      .catch(() => {
        if (mounted && generation === supplierPerformanceRequestGeneration.current) {
          setSupplierPerformanceResponse({ ok: false, status: "ERROR", message: "تعذر تحميل مؤشرات أداء الموردين من سجلات التوريد." });
        }
      })
      .finally(() => {
        if (mounted && generation === supplierPerformanceRequestGeneration.current) setSupplierPerformanceLoading(false);
      });
    return () => {
      mounted = false;
      supplierPerformanceRequestGeneration.current += 1;
    };
  }, [canManage, processFrom, processTo, supplierPerformanceRefreshKey]);

  useEffect(() => {
    let mounted = true;
    const generation = ++customerQuotePipelineRequestGeneration.current;
    if (!canManage) {
      setCustomerQuotePipelineResponse({ ok: false, status: "DENIED", message: "تتطلب قراءة مسار عروض أسعار العملاء صلاحية موظف نشط داخل المؤسسة." });
      setCustomerQuotePipelineLoading(false);
      return () => { mounted = false; };
    }
    setCustomerQuotePipelineLoading(true);
    void fetchCustomerQuotePipeline({ from: processFrom, to: processTo })
      .then((response) => {
        if (mounted && generation === customerQuotePipelineRequestGeneration.current) setCustomerQuotePipelineResponse(response);
      })
      .catch(() => {
        if (mounted && generation === customerQuotePipelineRequestGeneration.current) {
          setCustomerQuotePipelineResponse({ ok: false, status: "ERROR", message: "تعذر تحميل مسار عروض أسعار العملاء من المصدر المعتمد." });
        }
      })
      .finally(() => {
        if (mounted && generation === customerQuotePipelineRequestGeneration.current) setCustomerQuotePipelineLoading(false);
      });
    return () => {
      mounted = false;
      customerQuotePipelineRequestGeneration.current += 1;
    };
  }, [canManage, processFrom, processTo, customerQuotePipelineRefreshKey]);

  useEffect(() => {
    let mounted = true;
    const generation = ++taskPerformanceRequestGeneration.current;
    if (!canManage) {
      setTaskPerformanceResponse({
        ok: false,
        status: "DENIED",
        message: "تتطلب قراءة بطاقة أداء المهام صلاحية المدير أو مدير المؤسسة.",
      });
      setTaskPerformanceLoading(false);
      return () => { mounted = false; };
    }
    setTaskPerformanceLoading(true);
    void fetchTaskPerformanceScorecard()
      .then((response) => {
        if (mounted && generation === taskPerformanceRequestGeneration.current) {
          setTaskPerformanceResponse(response);
        }
      })
      .catch(() => {
        if (mounted && generation === taskPerformanceRequestGeneration.current) {
          setTaskPerformanceResponse({
            ok: false,
            status: "ERROR",
            message: "تعذر تحميل بطاقة أداء المهام من قاعدة البيانات.",
          });
        }
      })
      .finally(() => {
        if (mounted && generation === taskPerformanceRequestGeneration.current) {
          setTaskPerformanceLoading(false);
        }
      });
    return () => {
      mounted = false;
      taskPerformanceRequestGeneration.current += 1;
    };
  }, [canManage, taskPerformanceRefreshKey]);

  const runShiftMutation = async (
    scope: string,
    operation: (idempotencyKey: string) => Promise<{ ok: boolean; message?: string; data?: unknown }>,
    successMessage: string,
  ) => {
    const key = shiftCommandKeys.current.get(scope) ?? crypto.randomUUID();
    shiftCommandKeys.current.set(scope, key);
    setShiftActionBusy(true);
    setShiftActionMessage(null);
    try {
      const response = await operation(key);
      if (!response.ok) {
        setShiftActionMessage(response.message ?? "تعذر حفظ إجراء الوردية.");
        return;
      }
      shiftCommandKeys.current.delete(scope);
      setShiftActionMessage(successMessage);
      setShiftRefreshKey((value) => value + 1);
    } catch {
      setShiftActionMessage("تعذر إكمال الإجراء؛ أعد المحاولة بالبيانات نفسها للمحافظة على منع التكرار.");
    } finally {
      setShiftActionBusy(false);
    }
  };

  const submitStartShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scope = ["start", shiftBusinessDate, shiftLabel.trim(), shiftTimeZone.trim()].join(":");
    void runShiftMutation(scope, (idempotencyKey) => startOperationalShift({
      businessDate: shiftBusinessDate,
      shiftLabel: shiftLabel.trim(),
      timeZone: shiftTimeZone.trim(),
      idempotencyKey,
    }), "تم فتح الوردية وربطها تلقائياً بآخر وردية سابقة في المؤسسة وفق سجل الخادم.");
  };

  const submitShiftCashCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shift = shiftResponse?.ok ? shiftResponse.data.snapshot : null;
    const amount = Number(shiftCashAmount);
    const currency = shiftCashCurrency.trim().toUpperCase();
    if (!shift || shiftCashAmount.trim() === "" || !Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) {
      setShiftActionMessage("أدخل مبلغاً صالحاً ورمز عملة من ثلاثة أحرف.");
      return;
    }
    const scope = ["cash", shift.shiftId, shiftCashPhase, currency, shiftCashAmount, shiftCashNote, shiftCashCorrectionReason].join(":");
    void runShiftMutation(scope, (idempotencyKey) => recordOperationalShiftCashCount({
      shiftId: shift.shiftId,
      phase: shiftCashPhase,
      currency,
      countedAmount: amount,
      note: shiftCashNote.trim() || undefined,
      correctionReason: shiftCashCorrectionReason.trim() || undefined,
      idempotencyKey,
    }), "تم تسجيل العد النقدي؛ أُعيد تحميل أدلة الوردية.");
  };

  const submitShiftHandover = () => {
    const shift = shiftResponse?.ok ? shiftResponse.data : null;
    if (!shift) return;
    if (!shift.snapshot.previousShiftId) {
      setShiftActionMessage("هذه أول وردية في التسلسل؛ لا يوجد مالك سابق يستلزم محضر تسليم.");
      return;
    }
    if (shift.result.handover.state === "ACCEPTED") {
      setShiftActionMessage("محضر الوردية السابقة مقبول بالفعل.");
      return;
    }
    const refs = [...new Set(shift.result.items
      .filter((item) => item.state !== "RESOLVED" && item.state !== "UNKNOWN")
      .map((item) => item.sourceRef))];
    if (!refs.length || refs.length > 200) {
      setShiftActionMessage(refs.length ? "تجاوزت عناصر التسليم الحد الأقصى البالغ 200." : "لا توجد عناصر مفتوحة موثقة للتسليم.");
      return;
    }
    const scope = ["handover", shift.snapshot.shiftId, refs.join(","), shiftHandoverReason, shiftHandoverNote].join(":");
    void runShiftMutation(scope, async (idempotencyKey) => {
      const response = await recordOperationalShiftHandover({
        currentShiftId: shift.snapshot.shiftId,
        openItemRefs: refs,
        reason: shiftHandoverReason.trim() || undefined,
        note: shiftHandoverNote.trim() || undefined,
        idempotencyKey,
      });
      if (response.ok) setShiftHandoverId(response.data.handoverId ?? null);
      return response;
    }, "تم تسجيل محضر التسليم؛ يمكن للمستلم قبول المحضر من الجلسة الحالية.");
  };

  const acceptShiftHandover = () => {
    if (!shiftHandoverId) {
      setShiftActionMessage("لا يتوفر معرّف محضر القبول في جلسة الشاشة الحالية؛ أعد تسجيل المحضر من مسؤول الوردية لإصدار مرجع قبول جديد.");
      return;
    }
    const scope = ["accept-handover", shiftHandoverId].join(":");
    void runShiftMutation(scope, async (idempotencyKey) => {
      const response = await acceptOperationalShiftHandover(shiftHandoverId, idempotencyKey);
      if (response.ok) setShiftHandoverId(null);
      return response;
    }, "تم قبول محضر التسليم من المستلم وحفظ حدث القبول.");
  };

  const captureShiftSnapshot = (snapshotKind: "OPENING" | "CLOSEOUT") => {
    const shift = shiftResponse?.ok ? shiftResponse.data.snapshot : null;
    if (!shift) return;
    const scope = ["snapshot", shift.shiftId, snapshotKind].join(":");
    void runShiftMutation(scope, (idempotencyKey) => captureOperationalShiftSnapshot({
      shiftId: shift.shiftId,
      snapshotKind,
      idempotencyKey,
    }), snapshotKind === "OPENING" ? "تم حفظ لقطة افتتاح الوردية." : "تم حفظ لقطة الإقفال؛ حالة الإقفال لا تتغير تلقائياً.");
  };

  const loadOutcomes = useCallback(async () => {
    const requestGeneration = ++outcomeRequestGeneration.current;
    if (!outcomesMounted.current) return;
    if (!canManage) {
      setOutcomeResult({ ok: false, status: "DENIED", message: "إدارة القرارات متاحة للمدير ومدير المؤسسة المالية فقط." });
      setOutcomesLoading(false);
      return;
    }
    setOutcomesLoading(true);
    const response = await fetchDecisionOutcomes(DECISION_PAGE_SIZE, outcomeOffset);
    if (!outcomesMounted.current || requestGeneration !== outcomeRequestGeneration.current) return;
    if (response.ok && outcomeOffset > 0 && outcomeOffset >= response.total) {
      const lastValidOffset = response.total === 0
        ? 0
        : Math.floor((response.total - 1) / DECISION_PAGE_SIZE) * DECISION_PAGE_SIZE;
      if (lastValidOffset !== outcomeOffset) {
        setOutcomeOffset(lastValidOffset);
        return;
      }
    }
    setOutcomeResult(response);
    setOutcomesLoading(false);
  }, [canManage, outcomeOffset]);

  useEffect(() => {
    snapshotAt.current = new Date();
  }, [refreshKey]);

  useEffect(() => {
    let mounted = true;
    void loadCashflow(() => mounted);
    return () => { mounted = false; };
  }, [loadCashflow, refreshKey]);

  useEffect(() => {
    let mounted = true;
    void loadInventory(() => mounted);
    return () => { mounted = false; };
  }, [loadInventory, refreshKey]);

  useEffect(() => {
    let mounted = true;
    void loadCustomerRetention(() => mounted);
    return () => { mounted = false; };
  }, [loadCustomerRetention, refreshKey]);

  useEffect(() => {
    let mounted = true;
    void loadShiftWorkspace(() => mounted);
    return () => {
      mounted = false;
      shiftRequestGeneration.current += 1;
    };
  }, [loadShiftWorkspace, shiftRefreshKey]);

  useEffect(() => {
    let mounted = true;
    void loadProcessBottlenecks(() => mounted);
    return () => {
      mounted = false;
      processRequestGeneration.current += 1;
    };
  }, [loadProcessBottlenecks, processRefreshKey]);

  useEffect(() => {
    void loadOutcomes();
  }, [loadOutcomes, refreshKey]);

  const data = result?.ok ? result.data : null;
  const cashflowDenied = Boolean(result && !result.ok && result.status === "DENIED");
  const inventoryData = inventoryResult?.ok ? inventoryResult.data : null;
  const customerRetention = retentionResult?.ok ? retentionResult.data : null;
  const shiftWorkspace = shiftResponse?.ok ? shiftResponse.data : null;
  const shiftViewState = shiftLoading ? "loading"
    : shiftResponse?.ok ? "ready"
    : shiftResponse?.status === "NOT_FOUND" ? "empty"
    : shiftResponse?.status === "UNAVAILABLE" ? "unavailable"
    : "error";
  const processViewState = processLoading ? "loading"
    : processResponse?.ok ? "ready"
    : processResponse?.status === "UNAVAILABLE" ? "unavailable"
    : "error";
  const supplierPerformanceViewState = supplierPerformanceLoading ? "loading"
    : supplierPerformanceResponse?.ok ? "ready"
    : supplierPerformanceResponse?.status === "UNAVAILABLE" ? "unavailable"
    : "error";
  const customerQuotePipelineViewState = customerQuotePipelineLoading ? "loading"
    : customerQuotePipelineResponse?.ok ? "ready"
    : customerQuotePipelineResponse?.status === "UNAVAILABLE" ? "unavailable"
    : "error";
  const openShiftItems = shiftWorkspace?.result.items.filter((item) => item.state !== "RESOLVED" && item.state !== "UNKNOWN") ?? [];
  const handoverRefs = [...new Set(openShiftItems
    .map((item) => item.sourceRef)
    .filter((ref) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)))];
  const cashCountAlreadyExists = Boolean(shiftWorkspace?.result.cashControls.some((control) =>
    control.currency === shiftCashCurrency.trim().toUpperCase() &&
    (shiftCashPhase === "OPENING" ? control.opening.counted : control.closing.counted) !== null
  ));
  const cashflowMetrics = useMemo<MetricSnapshot[]>(() => {
    if (!data) return [];
    const scheduledMetrics: MetricSnapshot[] = data.schedule.entries.map((entry) => ({
      id: entry.amount.id,
      key: entry.amount.key,
      value: entry.amount.value,
      unit: "CURRENCY",
      currency: entry.amount.currency,
      status: entry.amount.status,
      completeness: entry.amount.completeness,
      quality: entry.amount.quality,
      period: null,
      asOf: entry.amount.asOf,
      lineage: {
        evidenceIds: entry.amount.lineage.evidenceIds,
        calculatedAt: entry.amount.asOf,
        formulaId: entry.amount.lineage.formulaId,
        formulaVersion: entry.amount.lineage.formulaVersion,
        transformations: ["server-sourced scheduled movement", entry.direction, "due date " + entry.dueDate],
      },
      warnings: [],
    }));
    const collectionMetrics: MetricSnapshot[] = data.measurementMetrics.map((proof) => ({
      id: "metric:cashflow.expected-collections:" + proof.currency + ":" + proof.period.from + ":" + proof.period.to,
      key: proof.metricKey,
      value: proof.value,
      unit: proof.unit,
      currency: proof.currency,
      status: proof.status,
      completeness: proof.completeness,
      quality: proof.quality,
      period: proof.period,
      asOf: proof.asOf,
      lineage: {
        evidenceIds: proof.evidenceIds,
        calculatedAt: proof.asOf,
        formulaId: proof.formulaId,
        formulaVersion: proof.formulaVersion,
        transformations: ["same-tenant scheduled invoices less recorded payments"],
      },
      warnings: [],
    }));
    return [...scheduledMetrics, ...collectionMetrics];
  }, [data]);
  const evidencePassport = useMemo<EvidencePassportData | null>(() => {
    if (!data) return null;
    return buildEvidencePassport({
      id: "cashflow-evidence:" + data.asOf,
      generatedAt: data.asOf,
      asOf: data.asOf,
      evidenceRecords: data.evidenceRecords,
      metrics: cashflowMetrics,
    });
  }, [data, cashflowMetrics]);
  const cashflowForecast = useMemo(() => {
    if (!data) return null;
    const metricsById = new Map(cashflowMetrics.map((metric) => [metric.id, metric]));
    return buildCashflowForecast({
      id: "cashflow-forecast:" + data.asOf,
      generatedAt: data.asOf,
      asOf: data.asOf,
      evidenceRecords: data.evidenceRecords,
      openingBalances: [],
      entries: data.schedule.entries.flatMap((entry) => {
        const amount = metricsById.get(entry.amount.id);
        return amount ? [{ id: entry.id, direction: entry.direction, dueDate: entry.dueDate, amount }] : [];
      }),
      scheduleStatus: data.schedule.status,
      scheduleCompleteness: data.schedule.completeness,
      scheduleQuality: data.schedule.quality,
    });
  }, [data, cashflowMetrics]);
  const evidenceBackedActions = useMemo<EvidenceBackedAction[]>(() => {
    if (!data || !evidencePassport) return [];
    return data.measurementMetrics.flatMap((proof) => {
      const metric = evidencePassport.metrics.find((item) =>
        item.key === proof.metricKey &&
        item.currency === proof.currency &&
        item.period?.from === proof.period.from &&
        item.period?.to === proof.period.to,
      );
      if (!metric) return [];
      const decisions = buildDailyDecisions({
        generatedAt: data.asOf,
        asOf: data.asOf,
        evidenceRecords: evidencePassport.evidenceRecords,
        metrics: [metric],
        rules: collectionFollowupRules,
      });
      return decisions.candidates.map((decision) => ({ decision, proof, candidateId: candidateIdFor(proof.currency, proof.period) }));
    });
  }, [data, evidencePassport]);
  const liquiditySnapshot = useMemo(() => {
    if (!data?.evidenceRecords.length || !data.measurementMetrics.length) return null;
    const currencies = data.measurementMetrics.map((proof) => ({
      currency: proof.currency,
      // The current source contract contains receivables, not a verified cash/bank opening balance.
      availableBalance: null,
      expectedCollections: {
        id: "metric:liquidity.expected-collections:" + proof.currency,
        key: "cashflow.expected_collections",
        value: proof.value,
        unit: "CURRENCY" as const,
        currency: proof.currency,
        status: proof.status,
        completeness: proof.completeness,
        quality: proof.quality,
        period: proof.period,
        asOf: proof.asOf,
        lineage: {
          evidenceIds: proof.evidenceIds,
          calculatedAt: proof.asOf,
          formulaId: proof.formulaId,
          formulaVersion: proof.formulaVersion,
          transformations: ["same-tenant scheduled invoices less recorded payments"],
        },
        warnings: [],
      },
      dueObligations: null,
    }));
    return buildLiquiditySnapshot({
      id: "liquidity:" + data.asOf,
      generatedAt: data.asOf,
      asOf: data.asOf,
      period: data.period,
      evidenceRecords: data.evidenceRecords,
      currencies,
    });
  }, [data]);
  const deadStockReport = useMemo(() => {
    if (!inventoryData) return null;
    return buildDeadStockReport({
      id: "dead-stock:" + inventoryData.asOf,
      asOf: inventoryData.asOf,
      period: inventoryData.period,
      evidenceRecords: inventoryData.evidenceRecords,
      products: inventoryData.deadStockProducts,
      rule: {
        id: "dead-stock-days",
        version: "1.0.0",
        activeWithinDays: 30,
        stagnantAfterDays: 90,
        lowTurnoverRatio: 0.1,
        turnoverWindowDays: 92,
      },
    });
  }, [inventoryData]);
  const stockDecisionActions = useMemo<EvidenceBackedAction[]>(() => {
    if (!inventoryData || !deadStockReport) return [];
    return deadStockReport.items.flatMap((item) => {
      if (!["STAGNANT","ZERO_MOVEMENT"].includes(item.classification) ||
          item.movementStatus !== "VERIFIED" || item.availableQuantity === null || item.availableQuantity <= 0 ||
          !item.evidenceIds.length) return [];
      const source = inventoryData.deadStockProducts.find(product => product.productRef === item.productRef);
      if (!source) return [];
      const priority = item.classification === "ZERO_MOVEMENT" ? "P1" as const : "P2" as const;
      const sourceMetricIds = [source.availableQuantity.id, ...(source.unitCost ? [source.unitCost.id] : [])];
      const impact = item.exposureStatus === "VERIFIED" && item.financialExposure !== null && item.currency
        ? { value: item.financialExposure, unit: "CURRENCY", currency: item.currency,
            formulaId: item.formulaId, formulaVersion: item.formulaVersion, sourceMetricIds }
        : null;
      const id = ("inventory.dead-stock:" + item.productRef.slice(0,80) + ":" + deadStockReport.asOf.slice(0,10)).slice(0,150);
      const proofEvidence = [...new Set(item.evidenceIds)].slice(0,500);
      const formulaVersions = [...new Set([
        item.formulaId + "@" + item.formulaVersion,
        source.availableQuantity.lineage.formulaId + "@" + source.availableQuantity.lineage.formulaVersion,
        ...(source.unitCost ? [source.unitCost.lineage.formulaId + "@" + source.unitCost.lineage.formulaVersion] : []),
      ])].slice(0,50);
      const decision: DecisionCandidate = {
        id, ruleId:"inventory.dead-stock.remediation", ruleVersion:"1.0.0",
        priority, priorityScore:priority==="P1"?300:200,
        what:"إيقاف إعادة شراء الصنف الراكد مؤقتاً ومراجعة تصريف المخزون · "+item.productRef,
        why:item.classification==="ZERO_MOVEMENT"
          ?"لا توجد حركة موثقة للصنف خلال نافذة التحليل المكتملة البالغة 92 يوماً."
          :"الصنف مصنف راكداً وفق آخر حركة مثبتة منذ "+(item.daysSinceMovement??"مدة غير محددة")+" يوماً.",
        soWhat:"استمرار الشراء دون مراجعة الطلب يرفع تجميد رأس المال ومخاطر تراكم المخزون؛ لا يُنفذ إيقاف آلي.",
        impact, impactStatus:impact?"CALCULATED":"WITHHELD",
        impactReason:impact?null:(item.warnings[0]??"UNIT_COST_OR_CURRENCY_NOT_VERIFIED"),
        whatNext:"راجع الرصيد الفعلي والطلبات المفتوحة، أوقف إعادة الطلب يدوياً بعد الاعتماد، وحدد خطة تصريف أو إرجاع موثقة.",
        proof:{evidenceIds:proofEvidence,metricKeys:[source.availableQuantity.key,...(source.unitCost?[source.unitCost.key]:[])],
          asOf:deadStockReport.asOf,formulaVersions},
        owner:"مسؤول المشتريات والمخزون",
        expectedOutcome:"خفض المخزون الراكد ومنع شراء مكرر حتى مراجعة الطلب والاستهلاك.",
        createdAt:deadStockReport.asOf,expiresAt:null,
      };
      return [{ decision, proof:null, candidateId:id }];
    });
  }, [inventoryData, deadStockReport]);

  const dailyDecisionActions = useMemo(() => [...evidenceBackedActions, ...stockDecisionActions]
    .sort((left,right) => right.decision.priorityScore-left.decision.priorityScore ||
      (left.decision.impact && right.decision.impact &&
       left.decision.impact.currency===right.decision.impact.currency
        ? Math.abs(right.decision.impact.value)-Math.abs(left.decision.impact.value) : 0) ||
      left.candidateId.localeCompare(right.candidateId)).slice(0,10),
  [evidenceBackedActions, stockDecisionActions]);

  const replenishmentReport = useMemo(() => {
    if (!inventoryData) return null;
    return buildReplenishmentRecommendations({
      id: "replenishment:" + inventoryData.asOf,
      asOf: inventoryData.asOf,
      period: inventoryData.period,
      evidenceRecords: inventoryData.evidenceRecords,
      products: inventoryData.replenishmentProducts,
    });
  }, [inventoryData]);
  const inventoryViewState = inventoryLoading
    ? "loading"
    : inventoryResult?.ok
      ? "ready"
      : inventoryResult?.status === "UNAVAILABLE"
        ? "unavailable"
        : "error";

  const businessHealthMap = useMemo<BusinessHealthMapResult | null>(() => {
    if (!inventoryData || !deadStockReport || !replenishmentReport) return null;
    try {
      return buildBusinessHealthMap({
        id: "business-health-map:" + inventoryData.asOf,
        generatedAt: inventoryData.asOf,
        asOf: inventoryData.asOf,
        period: inventoryData.period,
        cashflow: data?.asOf === inventoryData.asOf ? cashflowForecast : null,
        deadStock: deadStockReport,
        retention: customerRetention?.asOf === inventoryData.asOf ? customerRetention : null,
        replenishment: {
          id: "business-health-replenishment:" + inventoryData.asOf,
          asOf: inventoryData.asOf,
          period: inventoryData.period,
          recommendations: replenishmentReport.recommendations,
        },
      });
    } catch {
      return null;
    }
  }, [inventoryData, deadStockReport, replenishmentReport, customerRetention, data, cashflowForecast]);

  const businessHealthMapState = inventoryLoading
    ? "loading"
    : businessHealthMap
      ? "ready"
      : inventoryResult && !inventoryResult.ok &&
        (inventoryResult.status === "DENIED" || inventoryResult.status === "ERROR")
        ? "error"
        : "unavailable";
  const decisionMemoryBook = useMemo(() => {
    if (!outcomeResult?.ok) return null;
    try {
      return buildDecisionMemoryBook({
        generatedAt: snapshotAt.current.toISOString(),
        outcomes: outcomeResult.items,
        // P2 has not yet delivered the immutable decision-memory snapshot read contract.
        // Keep these empty until the server returns actual persisted snapshots.
        snapshots: [],
        totalOutcomes: outcomeResult.total,
      });
    } catch {
      return null;
    }
  }, [outcomeResult]);
  const decisionMemoryState = outcomesLoading
    ? "loading"
    : outcomeResult && !outcomeResult.ok
      ? outcomeResult.status === "UNAVAILABLE" ? "unavailable" : "error"
      : outcomeResult?.ok
        ? outcomeResult.items.length ? "ready" : "empty"
        : "unavailable";
  const verified = Boolean(
    data &&
    data.status === "OK" &&
    data.schedule.status === "VERIFIED" &&
    data.schedule.completeness === "COMPLETE" &&
    data.schedule.quality === "ACCEPTABLE",
  );
  const totals = useMemo(() => {
    const grouped = new Map<string, number>();
    if (!verified || !data) return grouped;
    for (const entry of data.schedule.entries) {
      const currency = entry.amount.currency;
      grouped.set(currency, (grouped.get(currency) ?? 0) + (entry.direction === "INFLOW" ? entry.amount.value : -entry.amount.value));
    }
    return grouped;
  }, [verified, data]);

  useEffect(() => {
    const metrics = data?.measurementMetrics ?? [];
    if (metrics.length && !metrics.some((metric) => metric.currency === proposalCurrency)) {
      setProposalCurrency(metrics[0].currency);
    }
  }, [data, proposalCurrency]);

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || !user?.profileId || !proposalCurrency || !proposalExpected.trim()) return;
    const proof = data.measurementMetrics.find((item) => item.currency === proposalCurrency);
    if (!proof) {
      setOutcomeMessage("لا يمكن إنشاء متابعة مالية دون مؤشر تحصيل موثق للعملة والفترة المختارتين.");
      return;
    }
    setOutcomeBusyId("new");
    setOutcomeMessage(null);
    const created = await createDecisionOutcomeProposal({
      candidateId: candidateIdFor(proof.currency, proof.period),
      ruleId: "cashflow.collection.followup",
      ruleVersion: "1.0.0",
      ownerProfileId: user.profileId,
      expectedOutcome: proposalExpected.trim(),
      reason: proposalReason.trim(),
    });
    setOutcomeBusyId(null);
    if (!created.ok) {
      setOutcomeMessage(created.message);
      return;
    }
    setProposalReason("");
    setOutcomeMessage(created.duplicate ? "هذا المقترح محفوظ مسبقاً؛ تم استرجاع نسخته الحالية." : "تم حفظ المقترح وسجل حدثه على الخادم.");
    if (!created.duplicate && outcomeOffset > 0) setOutcomeOffset(0);
    else await loadOutcomes();
  };

  const persistEvidenceBackedAction = async (decision: DecisionCandidate, candidateId: string) => {
    if (!data || !user?.profileId || outcomeBusyId !== null) return;
    setOutcomeBusyId("candidate:" + candidateId.slice(0,60));
    setOutcomeMessage(null);
    const candidateSnapshot = {
      schemaVersion:"1.0.0" as const,candidateId,ruleId:decision.ruleId,ruleVersion:decision.ruleVersion,
      priority:decision.priority,priorityScore:decision.priorityScore,what:decision.what,why:decision.why,
      risk:decision.soWhat,soWhat:decision.soWhat,whatNext:decision.whatNext,owner:decision.owner,
      expectedOutcome:decision.expectedOutcome,
      impact:decision.impact ? {...decision.impact,currency:decision.impact.currency??null} : null,
      impactStatus:decision.impactStatus,
      impactReason:decision.impactReason,proof:decision.proof,createdAt:decision.createdAt,expiresAt:decision.expiresAt,
    };
    const created = await createDecisionOutcomeProposal({
      candidateId,
      ruleId: decision.ruleId,
      ruleVersion: decision.ruleVersion,
      ownerProfileId: user.profileId,
      expectedOutcome: decision.expectedOutcome,
      reason: decision.why.slice(0, 2000),
      candidateSnapshot,
    });
    setOutcomeBusyId(null);
    if (!created.ok) {
      setOutcomeMessage(created.message);
      return;
    }
    setOutcomeMessage(created.duplicate
      ? "هذا الإجراء محفوظ مسبقاً؛ تم استرجاع نسخته الحالية."
      : "تم حفظ الإجراء المقترح وسجل حدثه على الخادم.");
    if (!created.duplicate && outcomeOffset > 0) setOutcomeOffset(0);
    else await loadOutcomes();
  };

  const runTransition = async (
    outcome: DecisionOutcomeView,
    eventType: Exclude<DecisionOutcomeEventType, "DEFER" | "RESUBMIT_FOR_REVIEW">,
    options: { reason?: string; ownerProfileId?: string; proof?: CashflowMeasurementProof } = {},
  ) => {
    if (outcomeBusyId) return;
    if ((eventType === "APPROVE" || eventType === "REJECT") && !options.reason?.trim()) {
      setOutcomeMessage("أدخل سبب الاعتماد أو الرفض قبل إرسال الأمر.");
      return;
    }
    setOutcomeBusyId(outcome.id);
    setOutcomeMessage(null);
    const measuredOutcome = options.proof
      ? { ...options.proof, measuredAt: new Date().toISOString() }
      : undefined;
    const updated = await commandDecisionOutcome({
      outcomeId: outcome.id,
      expectedVersion: outcome.version,
      eventType,
      ...(options.reason ? { reason: options.reason.trim() } : {}),
      ...(options.ownerProfileId ? { ownerProfileId: options.ownerProfileId } : {}),
      ...(measuredOutcome ? { measuredOutcome } : {}),
    });
    setOutcomeBusyId(null);
    if (!updated.ok) {
      setOutcomeMessage(updated.message);
      if (updated.status === "STALE" || updated.status === "CONFLICT") await loadOutcomes();
      return;
    }
    setOutcomeMessage(updated.duplicate ? "تم التعرف على إعادة إرسال الأمر دون إنشاء حدث مكرر." : "تم تسجيل انتقال القرار وإثباته في سجل التدقيق.");
    setOutcomeReasons((current) => ({ ...current, [outcome.id]: "" }));
    await loadOutcomes();
  };

  return (
    <section dir="rtl" className="space-y-4">
      {!canManage ? (
        <section className="panel" role="alert">
          <h1>صلاحية غير متاحة</h1>
          <p>تقتصر شاشة ذكاء الأعمال ودورة القرارات على المدير ومدير المؤسسة المالية. لم يُرسل طلب بيانات إلى الخادم.</p>
        </section>
      ) : (
        <>
          <header className="panel">
            <div className="panel-head">
              <div>
                <div className="flex items-center gap-2"><BrainCircuit size={22} /><h1>ذكاء الأعمال والتحصيلات والقرارات</h1></div>
                <p className="report-note">يعرض الاستحقاقات من سجلات المؤسسة، ويحفظ دورة القرار وأحداثها في قاعدة البيانات.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => {
                setRefreshKey((value) => value + 1);
                setShiftRefreshKey((value) => value + 1);
                setProcessRefreshKey((value) => value + 1);
                setSupplierPerformanceRefreshKey((value) => value + 1);
                setCustomerQuotePipelineRefreshKey((value) => value + 1);
                setTaskPerformanceRefreshKey((value) => value + 1);
              }} disabled={loading || outcomesLoading || inventoryLoading || shiftLoading || processLoading || supplierPerformanceLoading || customerQuotePipelineLoading || taskPerformanceLoading}>
                <RefreshCw size={16} /> تحديث
              </button>
            </div>
            <p className="text-sm text-muted-foreground">تُقرأ تغطية الاستحقاقات لمدة 90 يوماً مرة واحدة، ويعرض المحرك نوافذ 7 و30 و90 يوماً كلٌّ على حدة وبالعملة نفسها.</p>
          </header>

          <NaturalLanguageAssistant
            onOpenSupplierInvoice={onOpenSupplierInvoice}
            onOpenPurchaseOrder={onOpenPurchaseOrder}
          />

          <section className="panel space-y-3" aria-label="مركز الوردية وإجراءاتها">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2>مركز الوردية وإقفال اليوم</h2>
                <p className="report-note">قراءة من RPC الخادم فقط. لا يُغلق هذا المركز القيود أو الصندوق ولا ينفذ حركة مخزون تلقائياً.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setShiftRefreshKey((value) => value + 1)} disabled={shiftLoading || shiftActionBusy}>
                <RefreshCw size={16} /> تحديث الوردية
              </button>
            </div>
            <ShiftOperationsCenter
              result={shiftWorkspace?.result ?? null}
              state={shiftViewState}
              onRetry={() => setShiftRefreshKey((value) => value + 1)}
              onOpenItem={onOpenShiftItem}
            />
            {shiftResponse && !shiftResponse.ok && shiftResponse.status !== "NOT_FOUND" ? (
              <p role="alert" className="rounded-lg border p-3 text-sm">{shiftResponse.message}</p>
            ) : null}
            {shiftResponse && !shiftResponse.ok && shiftResponse.status === "NOT_FOUND" ? (
              <form className="grid gap-3 rounded-lg border p-3 md:grid-cols-2" onSubmit={submitStartShift}>
                <div className="md:col-span-2">
                  <h3 className="font-semibold">فتح وردية جديدة</h3>
                  <p className="report-note">لا توجد وردية محفوظة لهذا التاريخ. راجع تاريخ العمل والمنطقة الزمنية الفعلية للمؤسسة قبل الحفظ؛ القيمة الافتراضية أدناه مأخوذة من إعداد المتصفح وليست إعداداً معتمداً للمؤسسة. قاعدة البيانات تربط الوردية تلقائياً بآخر وردية سابقة للمؤسسة إن وُجدت.</p>
                </div>
                <label className="grid gap-1 text-sm">تاريخ العمل
                  <input type="date" className="rounded-lg border bg-background p-2" value={shiftBusinessDate} onChange={(event) => setShiftBusinessDate(event.target.value)} required />
                </label>
                <label className="grid gap-1 text-sm">اسم الوردية
                  <input className="rounded-lg border bg-background p-2" value={shiftLabel} maxLength={80} onChange={(event) => setShiftLabel(event.target.value)} required />
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">منطقة المؤسسة الزمنية (IANA)
                  <input className="rounded-lg border bg-background p-2" value={shiftTimeZone} maxLength={80} onChange={(event) => setShiftTimeZone(event.target.value)} placeholder="Asia/Aden" required />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">تتحقق قاعدة البيانات من صحة المنطقة الزمنية وتطبق صلاحيات المؤسسة ومنع التكرار.</span>
                  <button className="btn primary" type="submit" disabled={shiftActionBusy || shiftBusinessDate === "" || shiftLabel.trim().length < 2 || shiftTimeZone.trim() === ""}>فتح الوردية</button>
                </div>
              </form>
            ) : null}
            {shiftWorkspace ? (
              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">إجراءات الوردية المحفوظة في الخادم</h3>
                  <span className="text-xs text-muted-foreground">{shiftWorkspace.snapshot.businessDate} · {shiftWorkspace.snapshot.organizationTimeZone}</span>
                </div>
                <form className="grid gap-3 rounded-lg border p-3 md:grid-cols-2" onSubmit={submitShiftCashCount}>
                  <h4 className="font-semibold md:col-span-2">تسجيل العد النقدي</h4>
                  <label className="grid gap-1 text-sm">مرحلة العد
                    <select className="rounded-lg border bg-background p-2" value={shiftCashPhase} onChange={(event) => setShiftCashPhase(event.target.value as "OPENING" | "CLOSING")}>
                      <option value="OPENING">افتتاح الوردية</option>
                      <option value="CLOSING">إقفال الوردية</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">العملة (ISO 4217)
                    <input className="rounded-lg border bg-background p-2 uppercase" value={shiftCashCurrency} maxLength={3} pattern="[A-Za-z]{3}" onChange={(event) => setShiftCashCurrency(event.target.value.toUpperCase())} required />
                  </label>
                  <label className="grid gap-1 text-sm">المبلغ المعدود
                    <input type="number" min="0" step="0.01" className="rounded-lg border bg-background p-2" value={shiftCashAmount} onChange={(event) => setShiftCashAmount(event.target.value)} required />
                  </label>
                  <label className="grid gap-1 text-sm">ملاحظة العد
                    <input className="rounded-lg border bg-background p-2" value={shiftCashNote} maxLength={1000} onChange={(event) => setShiftCashNote(event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">سبب التصحيح (إلزامي عند تعديل عد مسجل)
                    <input className="rounded-lg border bg-background p-2" value={shiftCashCorrectionReason} maxLength={500} onChange={(event) => setShiftCashCorrectionReason(event.target.value)} required={cashCountAlreadyExists} />
                  </label>
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{cashCountAlreadyExists ? "يوجد عد سابق لهذه العملة والمرحلة؛ أدخل سبب التصحيح. سيُحفظ الحدث دون حذف السجل السابق." : "العد يُحفظ كسجل إضافي؛ لا تُعدّل الأرصدة أو قيود المحاسبة تلقائياً."}</span>
                    <button className="btn primary" type="submit" disabled={shiftActionBusy || shiftCashAmount.trim() === "" || (cashCountAlreadyExists && !shiftCashCorrectionReason.trim())}>حفظ العد النقدي</button>
                  </div>
                </form>
                <div className="grid gap-3 md:grid-cols-2">
                  <section className="rounded-lg border p-3 space-y-2">
                    <h4 className="font-semibold">لقطات الأدلة</h4>
                    <p className="report-note">كل لقطة غير قابلة للاستبدال وتحفظ بصمة للمصادر وقت الالتقاط.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn secondary" onClick={() => captureShiftSnapshot("OPENING")} disabled={shiftActionBusy}>حفظ لقطة الافتتاح</button>
                      <button type="button" className="btn secondary" onClick={() => captureShiftSnapshot("CLOSEOUT")} disabled={shiftActionBusy}>حفظ لقطة الإقفال</button>
                    </div>
                  </section>
                  <section className="rounded-lg border p-3 space-y-2">
                    <h4 className="font-semibold">محضر تسليم الوردية</h4>
                    <p className="text-xs text-muted-foreground">العناصر المفتوحة الظاهرة في العرض الحالي: {openShiftItems.length} · المراجع الفريدة الجاهزة للإرسال: {handoverRefs.length}</p>
                    <label className="grid gap-1 text-sm">سبب التسليم
                      <input className="rounded-lg border bg-background p-2" value={shiftHandoverReason} maxLength={500} onChange={(event) => setShiftHandoverReason(event.target.value)} />
                    </label>
                    <label className="grid gap-1 text-sm">ملاحظة التسليم
                      <textarea className="min-h-20 rounded-lg border bg-background p-2" value={shiftHandoverNote} maxLength={2000} onChange={(event) => setShiftHandoverNote(event.target.value)} />
                    </label>
                    {shiftWorkspace.snapshot.previousShiftId &&
                      shiftWorkspace.result.handover.state === "PENDING" &&
                      shiftWorkspace.result.handover.incomingOwnerProfileId === user?.profileId &&
                      shiftHandoverId ? (
                      <button type="button" className="btn primary" onClick={acceptShiftHandover} disabled={shiftActionBusy}>
                        قبول محضر التسليم (المستلم)
                      </button>
                    ) : null}
                    {shiftWorkspace.snapshot.previousShiftId && shiftWorkspace.result.handover.state !== "ACCEPTED" && !shiftHandoverId ? (
                      <>
                        <button type="button" className="btn primary" onClick={submitShiftHandover} disabled={shiftActionBusy || handoverRefs.length === 0 || handoverRefs.length > 200 || (shiftWorkspace.result.handover.state === "PENDING" && shiftHandoverReason.trim().length < 5)}>
                          {shiftWorkspace.result.handover.state === "PENDING" ? "إعادة إصدار محضر التسليم بسبب" : "تسجيل محضر التسليم"}
                        </button>
                        {shiftWorkspace.result.handover.state === "PENDING" ? <p className="text-xs text-muted-foreground">يوجد محضر سابق ينتظر قبول المستلم؛ إعادة الإصدار تحفظ حدثاً إضافياً وتتطلب سبباً لا يقل عن خمسة أحرف.</p> : null}
                      </>
                    ) : null}
                    {!shiftWorkspace.snapshot.previousShiftId ? <p className="text-xs text-muted-foreground">لا توجد وردية سابقة مرتبطة؛ لا ينطبق محضر التسليم.</p> : null}
                    {shiftWorkspace.snapshot.previousShiftId && shiftWorkspace.result.handover.state === "PENDING" && !shiftHandoverId ? <p className="text-xs text-muted-foreground">عقد قراءة الوردية يعرض حالة المحضر دون معرّف الحدث؛ لا يمكن قبول المحضر القديم من هذه الجلسة. أعد إصداره بسبب موثق من المالك السابق أو المدير للحصول على مرجع قبول جديد. لا يظهر زر القبول إلا لحساب المستلم المسجل.</p> : null}
                    <p className="text-xs text-muted-foreground">تتحقق قاعدة البيانات من المالك السابق والمستلم وكل مرجع وصلاحيته للمؤسسة. قبول التسليم حدث مستقل ينفذه حساب المستلم.</p>
                  </section>
                </div>
              </div>
            ) : null}
            {shiftActionMessage ? <p role="status" aria-live="polite" className="rounded-lg border p-3 text-sm">{shiftActionMessage}</p> : null}
          </section>

          <section className="panel space-y-3" aria-label="تحليل الاختناقات وزمن دورة العملية">
            <div>
              <h2>تحليل الاختناقات وزمن دورة العملية</h2>
              <p className="report-note">مقاييس وصفية من أحداث النظام الفعلية، وليست تقييماً لأداء الموظفين أو إثباتاً لسبب التأخير. الفترات ومناطقها الزمنية UTC.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">من تاريخ
                <input type="date" className="rounded-lg border bg-background p-2" value={processFrom} onChange={(event) => setProcessFrom(event.target.value)} required />
              </label>
              <label className="grid gap-1 text-sm">إلى تاريخ
                <input type="date" className="rounded-lg border bg-background p-2" value={processTo} onChange={(event) => setProcessTo(event.target.value)} required />
              </label>
              <label className="flex items-center gap-2 text-sm self-end rounded-lg border p-3">
                <input type="checkbox" checked={processCompare} onChange={(event) => setProcessCompare(event.target.checked)} />
                مقارنة بالفترة السابقة المماثلة
              </label>
            </div>
            {processCompare && processFrom <= processTo ? (
              <p className="text-xs text-muted-foreground">الفترة الحالية: {processFrom} — {processTo} · الفترة السابقة المتساوية: {previousMatchingPeriod(processFrom, processTo)?.from ?? "غير متاحة"} — {previousMatchingPeriod(processFrom, processTo)?.to ?? "غير متاحة"}</p>
            ) : <p className="text-xs text-muted-foreground">عند تعطيل المقارنة يقرأ المحرك الفترة الحالية فقط.</p>}
            {!processLoading && processResponse && !processResponse.ok ? <p role="alert" className="text-sm">{processResponse.message}</p> : null}
            <ProcessBottlenecksPanel
              result={processResponse?.ok ? processResponse.result : null}
              state={processViewState}
              onRetry={() => setProcessRefreshKey((value) => value + 1)}
            />
            <button type="button" className="btn secondary self-start" onClick={() => setProcessRefreshKey((value) => value + 1)} disabled={processLoading}>تحديث تحليل العمليات</button>
            <div className="border-t pt-4 space-y-3">
              <div>
                <h2>أداء الموردين والتزام التوريد</h2>
                <p className="report-note">تستخدم هذه اللوحة نفس فترة التاريخ أعلاه (UTC). يعتمد زمن التوريد على أوامر مكتملة الاستلام فقط، والالتزام على مدة توريد صريحة في عرض سعر ممنوح؛ ولا تعرض أسعار الشراء أو الديون أو المدفوعات.</p>
              </div>
              {supplierPerformanceResponse && !supplierPerformanceResponse.ok ? (
                <p role="alert" className="text-sm">{supplierPerformanceResponse.message}</p>
              ) : null}
              <SupplierPerformancePanel
                result={supplierPerformanceResponse?.ok ? supplierPerformanceResponse.result : null}
                state={supplierPerformanceViewState}
                onRetry={() => setSupplierPerformanceRefreshKey((value) => value + 1)}
                onOpenPurchaseOrder={onOpenPurchaseOrder}
              />
            </div>
            <section className="border-t pt-4 space-y-3" aria-label="مسار عروض أسعار العملاء">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2>مسار عروض أسعار العملاء</h2>
                  <p className="report-note">يعرض دورة عروض الأسعار المنشأة في فترة UTC المحددة أعلاه، مع الحالة الحالية كما قرأها الخادم. قبول العرض ليس طلب بيع ولا يثبت التحويل إلى فاتورة.</p>
                </div>
                <button type="button" className="btn secondary" onClick={() => setCustomerQuotePipelineRefreshKey((value) => value + 1)} disabled={customerQuotePipelineLoading}>
                  <RefreshCw size={15} /> تحديث مسار العروض
                </button>
              </header>
              {customerQuotePipelineResponse && !customerQuotePipelineResponse.ok ? <p role="alert" className="text-sm">{customerQuotePipelineResponse.message}</p> : null}
              {customerQuotePipelineViewState === "loading" ? (
                <p role="status" className="rounded-lg border p-3 text-sm">جارٍ تحميل مسار عروض العملاء من سجلات المؤسسة…</p>
              ) : customerQuotePipelineResponse?.ok ? (
                <CustomerQuotePipelineSummary result={customerQuotePipelineResponse.result} />
              ) : (
                <p role="status" className="rounded-lg border p-3 text-sm">
                  {customerQuotePipelineViewState === "unavailable" ? "مصدر مسار عروض العملاء غير متاح حتى تطبيق ترحيله في بيئة التشغيل." : "لم تُعرض مؤشرات لمسار العروض؛ لم تُستخدم أرقام بديلة."}
                </p>
              )}
            </section>
          </section>

          <section className="panel space-y-3" aria-label="مؤشرات أداء المهام">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2>مؤشرات أداء المهام</h2>
                <p className="report-note">ملخص الخادم للمهام المرئية ضمن أدوار الحساب فقط. تُعرض حدود اكتمال سجل إعادة الفتح والمؤشرات غير المتاحة صراحةً؛ لا توجد مقارنة بين الموظفين.</p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setTaskPerformanceRefreshKey((value) => value + 1)}
                disabled={taskPerformanceLoading}
              >
                <RefreshCw size={15} /> تحديث المؤشرات
              </button>
            </header>
            <TaskPerformanceScorecard
              scorecard={taskPerformanceResponse?.ok ? taskPerformanceResponse.scorecard : null}
              state={taskPerformanceLoading
                ? "loading"
                : taskPerformanceResponse?.ok
                  ? "ready"
                  : taskPerformanceResponse?.status === "UNAVAILABLE"
                    ? "unavailable"
                    : "error"}
              errorMessage={taskPerformanceResponse && !taskPerformanceResponse.ok
                ? taskPerformanceResponse.message
                : "تعذر تحميل بطاقة أداء المهام من قاعدة البيانات."}
              onRetry={() => setTaskPerformanceRefreshKey((value) => value + 1)}
            />
          </section>

          <CommercePolicyGovernancePanel />

          <section className="panel space-y-3">
            <div>
              <h2>خريطة صحة الأعمال ورأس المال المعرض للمخاطر</h2>
              <p className="report-note">تجمع أدلة حركة المخزون وتوصيات إعادة التوريد مع نوافذ التدفق النقدي عند تطابق توقيت اللقطة. لا تحسب رأس مال إجمالياً متداخلاً، ولا تعرض رصيداً نقدياً أو ذمماً غير موجودة في مصدر مكتمل متوافق.</p>
            </div>
            <BusinessHealthMap
              result={businessHealthMap}
              state={businessHealthMapState}
              onRetry={() => setRefreshKey((value) => value + 1)}
            />
            {businessHealthMap && (
              <p className="report-note">اللقطة: {businessHealthMap.asOf} · نافذة المخزون: {businessHealthMap.period.from} — {businessHealthMap.period.to} · سياسة الدمج: {businessHealthMap.policyVersion}. يُعرض تركيز العملاء فقط عندما تصل مبيعات موثقة؛ وتظل دورة التحويل النقدي والمؤشرات غير المدعومة محجوبة.</p>
            )}
          </section>

          {loading ? <div className="panel" role="status">جارٍ تحميل بيانات التحصيل من قاعدة البيانات...</div> : null}
          {!loading && result && !result.ok ? <div className="panel" role="alert"><p>{result.message}</p></div> : null}

          <section className="panel space-y-3">
            <div>
              <h2>الاحتفاظ بالعملاء وتكرار الشراء</h2>
              <p className="report-note">قراءة المجتمع الكامل للعملاء من أوامر المؤسسة النشطة غير الملغاة، لفترتين متتاليتين متساويتين. يعرض النظام المجاميع فقط؛ لا يعرض أسماء أو هواتف أو أسعار فئات العملاء.</p>
            </div>
            {retentionLoading ? <p role="status" className="text-sm">جار تحميل مجتمع العملاء...</p> : null}
            {!retentionLoading && retentionResult && !retentionResult.ok ? (
              <div role="alert" className="rounded-lg border p-3 text-sm">
                <p>{retentionResult.message}</p>
                <button type="button" className="btn secondary mt-2" onClick={() => setRefreshKey((value) => value + 1)}>إعادة تحميل مؤشرات العملاء</button>
              </div>
            ) : null}
            {customerRetention ? (
              <>
                <div className="report-grid">
                  <article className="report-metric"><span>مجتمع العملاء</span><strong>{customerRetention.population.total ?? "غير متاح"}</strong><small>تغطية: {customerRetention.status === "VERIFIED" ? "مكتملة وموثقة" : "تحتاج مراجعة"}</small></article>
                  <article className="report-metric"><span>عملاء نشطون في الفترة</span><strong>{customerRetention.population.activeCurrentPeriod ?? "غير متاح"}</strong><small>لديهم طلب واحد على الأقل</small></article>
                  <article className="report-metric"><span>عملاء مستمرون</span><strong>{customerRetention.population.retainedCustomers ?? "غير متاح"}</strong><small>عادوا للشراء من مجتمع الفترة السابقة</small></article>
                  <article className="report-metric"><span>عملاء متكررون</span><strong>{customerRetention.population.repeatPurchaseCustomers ?? "غير متاح"}</strong><small>طلبان أو أكثر في الفترة الحالية</small></article>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">معدل الاحتفاظ</p><strong className="text-xl">{customerRetention.retentionRate === null ? "غير متاح" : customerRetention.retentionRate.toFixed(1) + "%"}</strong><p className="text-xs text-muted-foreground">من عملاء الفترة السابقة</p></article>
                  <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">معدل تكرار الشراء</p><strong className="text-xl">{customerRetention.repeatPurchaseRate === null ? "غير متاح" : customerRetention.repeatPurchaseRate.toFixed(1) + "%"}</strong><p className="text-xs text-muted-foreground">من العملاء النشطين حالياً</p></article>
                  <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">متوسط الطلبات لكل عميل نشط</p><strong className="text-xl">{customerRetention.averageOrdersPerActiveCustomer === null ? "غير متاح" : customerRetention.averageOrdersPerActiveCustomer.toFixed(2)}</strong><p className="text-xs text-muted-foreground">طلب لكل عميل نشط</p></article>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {[
                    ["نشط خلال 30 يوماً", customerRetention.activity.active30Days],
                    ["فتور 31–60 يوماً", customerRetention.activity.cooling31To60Days],
                    ["معرض للخمول 61–90", customerRetention.activity.atRisk61To90Days],
                    ["خامل أكثر من 90", customerRetention.activity.inactiveOver90Days],
                    ["تاريخ آخر طلب غير متاح", customerRetention.activity.noOrderDate],
                  ].map(([label, value]) => (
                    <article key={String(label)} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <strong className="text-lg">{value === null ? "غير متاح" : value}</strong>
                    </article>
                  ))}
                </div>
                <p className="report-note">الفترة الحالية: {customerRetention.period.from} — {customerRetention.period.to} · السابقة: {customerRetention.previousPeriod.from} — {customerRetention.previousPeriod.to} · اللقطة: {customerRetention.asOf}. لم يرسل مصدر الاحتفاظ مبيعات أو أرصدة أو أسعاراً؛ لذلك يظل تركيز المبيعات حسب العميل خارج الحساب.</p>
                {customerRetention.warnings.length > 0 && <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">{customerRetention.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                <GrowthOpportunityRadar
                  result={retentionResult?.ok ? retentionResult.growthRadar : null}
                  state={retentionLoading ? "loading" : retentionResult?.ok
                    ? "ready"
                    : retentionResult?.status === "DENIED" ? "error" : "unavailable"}
                  onRetry={() => setRefreshKey((value) => value + 1)}
                  onOpenRecord={onOpenRecord}
                />
              </>
            ) : null}
          </section>

          {!loading && data ? (
            <>
              <div className="report-grid">
                <article className="report-metric"><span>عدد الاستحقاقات المعروضة</span><strong>{data.schedule.entries.length}</strong><small>من {formatDay(data.period.from)} إلى {formatDay(data.period.to)}</small></article>
                <article className="report-metric"><span>أدلة المصدر</span><strong>{data.evidenceCount}</strong><small>فواتير ومدفوعات من نفس المؤسسة</small></article>
                <article className="report-metric"><span>حالة التغطية</span><strong>{data.schedule.completeness === "COMPLETE" ? "مكتملة" : data.schedule.completeness === "PARTIAL" ? "جزئية" : "غير معروفة"}</strong><small>{data.schedule.status === "VERIFIED" ? "موثقة" : "تحتاج مراجعة"}</small></article>
              </div>

              {verified ? (
                <section className="panel">
                  <h2>صافي التحصيلات المجدولة بحسب العملة</h2>
                  {totals.size === 0 ? <p className="report-note">لا توجد فواتير مستحقة ضمن الفترة المحددة.</p> : (
                    <div className="report-grid">
                      {[...totals.entries()].map(([currency, amount]) => (
                        <article className="report-metric" key={currency}><span>{currency}</span><strong>{formatMoney(amount, currency)}</strong><small>الاستحقاقات الداخلة المسجلة دون افتراض نسبة تحصيل</small></article>
                      ))}
                    </div>
                  )}
                </section>
              ) : (
                <div className="panel" role="status"><strong>تم حجب الإجمالي والتوقع.</strong><p className="report-note">توجد فاتورة مستحقة بلا تاريخ استحقاق صالح أو تغطية غير مكتملة؛ لم تُحوّل البيانات المجهولة إلى صفر.</p></div>
              )}

              <section className="panel">
                <h2>سجل الاستحقاقات</h2>
                {data.schedule.entries.length === 0 ? <p className="report-note">لا توجد سجلات قابلة للعرض؛ راجع حالة التغطية والتنبيهات.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr><th className="text-right">تاريخ الاستحقاق</th><th className="text-right">الاتجاه</th><th className="text-right">المبلغ</th><th className="text-right">مرجع الإثبات</th></tr></thead>
                      <tbody>
                        {data.schedule.entries.map((entry) => (
                          <tr key={entry.id} className="border-t">
                            <td className="p-2">{formatDay(entry.dueDate)}</td>
                            <td className="p-2">{entry.direction === "INFLOW" ? "تحصيل مستحق" : "التزام مجدول"}</td>
                            <td className="p-2 font-semibold">{formatMoney(entry.amount.value, entry.amount.currency)}</td>
                            <td className="p-2 text-muted-foreground">{entry.amount.lineage.evidenceIds.length} دليل · {entry.amount.lineage.formulaId}@{entry.amount.lineage.formulaVersion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel space-y-3">
                <div className="flex items-center gap-2"><Workflow size={18} /><h2>إنشاء متابعة تحصيل</h2></div>
                <p className="report-note">لا تُنشأ متابعة مالية إلا من إجمالي تحصيل مثبت وبأدلة كاملة للعملة والفترة المختارتين. إنشاء المقترح لا يسجل دفعة أو قيداً محاسبياً.</p>
                {data.measurementMetrics.length ? (
                  <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void createProposal(event)}>
                    <label className="grid gap-1 text-sm">العملة
                      <select className="rounded-lg border bg-background p-2" value={proposalCurrency} onChange={(event) => setProposalCurrency(event.target.value)}>
                        {data.measurementMetrics.map((proof) => <option key={proof.currency} value={proof.currency}>{proof.currency} · {formatMoney(proof.value, proof.currency)}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">النتيجة المتوقعة
                      <input className="rounded-lg border bg-background p-2" value={proposalExpected} maxLength={2000} onChange={(event) => setProposalExpected(event.target.value)} required />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">سبب المتابعة
                      <input className="rounded-lg border bg-background p-2" value={proposalReason} maxLength={2000} onChange={(event) => setProposalReason(event.target.value)} placeholder="سبب إداري مختصر (اختياري)" />
                    </label>
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">النطاق: {data.period.from} — {data.period.to} · {user?.name}</span>
                      <button className="btn primary" type="submit" disabled={!proposalCurrency || !proposalExpected.trim() || outcomeBusyId !== null}>
                        {outcomeBusyId === "new" ? "جارٍ الحفظ..." : "حفظ مقترح المتابعة"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-lg border p-3 text-sm" role="status">لا يوجد إجمالي عملة موثق صالح للقياس في الفترة الحالية؛ إنشاء متابعات مالية محجوب حتى اكتمال الأدلة.</div>
                )}
              </section>
            </>
          ) : null}

                    <DecisionCyclePanel
            outcomeResult={outcomeResult}
            outcomesLoading={outcomesLoading}
            outcomeOffset={outcomeOffset}
            onPageChange={setOutcomeOffset}
            onRetry={() => void loadOutcomes()}
            outcomeReasons={outcomeReasons}
            outcomeBusyId={outcomeBusyId}
            measurementMetrics={data?.measurementMetrics ?? []}
            profileId={user?.profileId}
            onReasonChange={(id, value) => setOutcomeReasons((current) => ({ ...current, [id]: value }))}
            onTransition={runTransition}
          />
          <DecisionMemoryBook
            result={decisionMemoryBook}
            state={decisionMemoryState}
            onRetry={() => void loadOutcomes()}
          />

          {outcomeMessage ? <div className="panel" role="status">{outcomeMessage}</div> : null}
          {[...data?.warnings ?? [], ...data?.schedule.warnings ?? []].length ? (
            <section className="panel" role="status"><h2>تنبيهات جودة البيانات</h2><ul className="list-disc space-y-1 ps-5">{[...new Set([...(data?.warnings ?? []), ...(data?.schedule.warnings ?? [])])].map((warning) => <li key={warning}>{warning}</li>)}</ul></section>
          ) : null}
          <p className="report-note">وقت الاحتساب: {data?.asOf ?? "غير متاح"} · مصدر الهوية والصلاحية والنطاق: الخادم. لا يرسل المتصفح معرّف المؤسسة أو الدور في طلبات البيانات.</p>

          <section className="panel space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2>تحليل المخزون والاحتياج للتوريد</h2><p className="report-note">نافذة الحركة والمبيعات 92 يوماً حتى تاريخ الاحتساب؛ الكميات الحالية لقطات مخزون وليست متوسطات تاريخية.</p></div>
              <span className="text-xs text-muted-foreground">{inventoryData ? inventoryData.totalProducts + " منتجاً · " + inventoryData.evidenceRecords.length + " دليلاً" : "مصدر المؤسسة"}</span>
            </div>
            {!inventoryLoading && inventoryResult && !inventoryResult.ok ? (
              <div role="alert" className="rounded-lg border p-3 text-sm">
                <p>{inventoryResult.message}</p>
                <button type="button" className="btn secondary mt-2" onClick={() => setRefreshKey((value) => value + 1)}>إعادة تحميل المخزون</button>
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <DeadStockCard report={deadStockReport} state={inventoryViewState} onRetry={() => setRefreshKey((value) => value + 1)} />
              <ReplenishmentCard recommendations={replenishmentReport?.recommendations ?? null} state={inventoryViewState} canManagePurchases={canManage} onRetry={() => setRefreshKey((value) => value + 1)} />
            </div>
            <p className="report-note">التعرض المالي للمخزون غير متاح لأن سجلات تكلفة الشراء لا تحتوي رمز عملة موثقاً، ومتوسط المخزون التاريخي غير متاح لعدم وجود لقطات أرصدة يومية. مهلة التوريد لا تُحسب إلا من تواريخ أوامر الشراء والاستلام الفعلية؛ لا ينشئ النظام أمراً تلقائياً.</p>
          </section>
          <BusinessHealthMap
            result={businessHealthMap}
            state={loading || inventoryLoading || retentionLoading ? "loading" : businessHealthMapState}
            onRetry={() => setRefreshKey((value) => value + 1)}
          />
          <ExecutiveLiquidityCommandCenter refreshKey={refreshKey} onDecisionSaved={() => setRefreshKey(value => value + 1)} />
          <section className="panel space-y-3">
            <h2>التحصيلات المجدولة والتوقع النقدي</h2>
            <p className="report-note">تعرض لوحة القيادة أعلاه الحركات الفعلية والالتزامات المثبتة والذمم كلّاً حسب عملته. تعرض هذه البطاقة التحصيلات المدينة المجدولة فقط؛ لا يوجد رصيد افتتاحي موثق أو جدول مكتمل لمواعيد دفع التزامات الموردين والمصروفات المستقبلية، ولذلك تبقى الأرصدة المتوقعة وصافي السيولة محجوبة. لا تُستبدل الذمم برصيد نقدي، ولا يُفترض أن غياب الحركة يساوي صفراً.</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <EvidencePassport
                passport={evidencePassport}
                state={loading ? "loading" : evidencePassport ? (evidencePassport.metrics.length ? "ready" : "empty") : cashflowDenied ? "error" : "unavailable"}
                errorMessage={result && !result.ok ? result.message : undefined}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
              <LiquiditySummary
                snapshot={liquiditySnapshot}
                state={liquiditySnapshot ? "ready" : loading ? "loading" : "unavailable"}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
              <CashflowForecastCard
                forecast={cashflowForecast}
                state={loading ? "loading" : cashflowForecast ? (cashflowForecast.points.length ? "ready" : "empty") : cashflowDenied ? "error" : "unavailable"}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
              <div className="space-y-3">
                {dailyDecisionActions.length ? dailyDecisionActions.map(({ decision, candidateId }) => (
                  <ActionCard
                    key={candidateId}
                    decision={decision}
                    state="ready"
                    ctaLabel="حفظ الإجراء في دورة القرارات"
                    onContinue={(candidate) => void persistEvidenceBackedAction(candidate, candidateId)}
                  />
                )) : (
                  <ActionCard
                    state={loading ? "loading" : data ? "empty" : cashflowDenied ? "error" : "unavailable"}
                    errorMessage={result && !result.ok ? result.message : undefined}
                    onRetry={() => setRefreshKey((value) => value + 1)}
                  />
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}