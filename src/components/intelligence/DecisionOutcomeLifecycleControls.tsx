import { useState } from "react";
import {
  createCashflowScheduleRequestForPeriod,
  fetchCashflowSchedule,
  type CashflowMeasurementProof,
} from "@/lib/intelligence/cashflow-schedule-client";
import type { DecisionMemoryMetricResult } from "@/lib/intelligence/decision-memory";
import {
  commandDecisionOutcome,
  deferDecisionOutcome,
  resumeDeferredDecisionOutcome,
  type DecisionOutcomeEventType,
  type DecisionOutcomeState,
} from "@/lib/intelligence/decision-outcome-client";

export interface DecisionOutcomeLifecycleControlsProps {
  outcomeId: string;
  state: DecisionOutcomeState;
  version: number;
  ownerProfileId: string | null;
  expectedMetric: DecisionMemoryMetricResult | null;
  onChanged?: () => void;
}

interface PendingCommand {
  eventType: DecisionOutcomeEventType;
  expectedVersion: number;
  reason: string;
  eventId: string;
  idempotencyKey: string;
  measuredOutcome?: CashflowMeasurementProof & { measuredAt: string };
}

const labels: Partial<Record<DecisionOutcomeEventType, string>> = {
  SUBMIT_FOR_REVIEW: "إرسال للمراجعة",
  APPROVE: "اعتماد القرار",
  REJECT: "رفض القرار",
  DEFER: "تأجيل القرار مع حفظ السبب",
  RESUBMIT_FOR_REVIEW: "إعادة القرار للمراجعة بسبب موثق",
  ASSIGN: "تثبيت المسؤول المعتمد",
  START_EXECUTION: "بدء التنفيذ",
  COMPLETE_EXECUTION: "تسجيل اكتمال التنفيذ",
};

function allowedEvents(state: DecisionOutcomeState, ownerProfileId: string | null): DecisionOutcomeEventType[] {
  if (state === "PROPOSED") return ["SUBMIT_FOR_REVIEW"];
  if (state === "IN_REVIEW") return ["APPROVE", "REJECT", "DEFER"];
  if (state === "DEFERRED") return ["RESUBMIT_FOR_REVIEW"];
  if (state === "APPROVED") return ownerProfileId ? ["ASSIGN"] : [];
  if (state === "ASSIGNED") return ["START_EXECUTION"];
  if (state === "EXECUTING") return ["COMPLETE_EXECUTION"];
  return [];
}

export function DecisionOutcomeLifecycleControls({
  outcomeId,
  state,
  version,
  ownerProfileId,
  expectedMetric,
  onChanged,
}: DecisionOutcomeLifecycleControlsProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [measurementProof, setMeasurementProof] = useState<CashflowMeasurementProof | null>(null);
  const [proofStatus, setProofStatus] = useState<"IDLE" | "LOADING" | "READY" | "DENIED" | "UNAVAILABLE" | "ERROR" | "WITHHELD">("IDLE");
  const events = allowedEvents(state, ownerProfileId);

  async function loadMeasurementProof() {
    if (busy || pending || state !== "EXECUTED") return;
    setProofStatus("LOADING");
    setMeasurementProof(null);
    setFeedback("");
    setFeedbackError(false);
    if (!expectedMetric ||
        expectedMetric.metricKey !== "cashflow.expected_collections" ||
        expectedMetric.unit !== "CURRENCY" ||
        !expectedMetric.currency ||
        expectedMetric.formulaId !== "nasr1.receivables-outstanding" ||
        expectedMetric.formulaVersion !== "1") {
      setProofStatus("WITHHELD");
      setFeedback("لا يوجد خط أساس موثوق لمقياس التحصيلات المتوقعة بهذه المعادلة والعملة؛ بقي القياس محجوباً.");
      setFeedbackError(true);
      return;
    }
    try {
      const request = createCashflowScheduleRequestForPeriod({
        period: expectedMetric.period,
        currency: expectedMetric.currency,
      });
      if (Date.parse(request.asOf) <= Date.parse(expectedMetric.asOf)) {
        setProofStatus("WITHHELD");
        setFeedback("وقت القياس الحالي لا يتجاوز وقت خط الأساس؛ لا يمكن احتساب نتيجة لاحقة.");
        setFeedbackError(true);
        return;
      }
      const result = await fetchCashflowSchedule(request);
      if (!result.ok) {
        setProofStatus(result.status);
        setFeedback(result.message);
        setFeedbackError(true);
        return;
      }
      const snapshot = result.data;
      const matches = snapshot.measurementMetrics.filter(metric =>
        metric.metricKey === "cashflow.expected_collections" &&
        metric.currency === expectedMetric.currency);
      if (snapshot.status !== "OK" ||
          snapshot.completeness !== "COMPLETE" ||
          snapshot.quality !== "ACCEPTABLE" ||
          snapshot.schedule.status !== "VERIFIED" ||
          snapshot.schedule.completeness !== "COMPLETE" ||
          snapshot.schedule.quality !== "ACCEPTABLE" ||
          matches.length !== 1) {
        setProofStatus("WITHHELD");
        setFeedback("لم يُرجع مصدر التدفق النقدي دليلاً كاملاً ومقبول الجودة لهذه الفترة والعملة؛ لا يمكن تسجيل القياس.");
        setFeedbackError(true);
        return;
      }
      const metric = matches[0];
      const uniqueEvidence = new Set(metric.evidenceIds);
      if (metric.asOf !== request.asOf ||
          metric.period.from !== expectedMetric.period.from ||
          metric.period.to !== expectedMetric.period.to ||
          metric.formulaId !== expectedMetric.formulaId ||
          metric.formulaVersion !== expectedMetric.formulaVersion ||
          metric.evidenceIds.length === 0 ||
          uniqueEvidence.size !== metric.evidenceIds.length ||
          metric.evidenceIds.some(id => !snapshot.evidenceRecords.some(evidence => evidence.id === id))) {
        setProofStatus("WITHHELD");
        setFeedback("رفض التحقق المحلي تطابق الفترة أو المعادلة أو مراجع الأدلة؛ لم يُنشأ أمر قياس.");
        setFeedbackError(true);
        return;
      }
      setMeasurementProof(metric);
      setProofStatus("READY");
      setFeedback("تم جلب إثبات مصدر رصيد الذمم للفترة والعملة وخط الأساس نفسيهما. سيعيد الخادم مطابقة مجموعة الفواتير والمدفوعات بالكامل قبل الحفظ.");
      setFeedbackError(false);
    } catch {
      setProofStatus("WITHHELD");
      setFeedback("لا يمكن قراءة إثبات لهذه الفترة؛ قد يكون خط الأساس قديماً أو خارج نافذة المصدر المسموحة.");
      setFeedbackError(true);
    }
  }

  async function submit(eventType: DecisionOutcomeEventType, suppliedMeasurement?: CashflowMeasurementProof) {
    if (busy) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) {
      setFeedback("اكتب سبباً واضحاً من ثلاثة أحرف على الأقل قبل تغيير حالة القرار.");
      setFeedbackError(true);
      return;
    }
    if (pending && (pending.eventType !== eventType ||
        pending.expectedVersion !== version || pending.reason !== normalizedReason)) {
      setFeedback("هناك أمر سابق لم تُحسم استجابته. أعد المحاولة بنفس الإجراء والسبب أولاً.");
      setFeedbackError(true);
      return;
    }

    const selectedMeasurement = pending?.eventType === "MEASURE"
      ? pending.measuredOutcome
      : suppliedMeasurement;
    if (eventType === "MEASURE" && !selectedMeasurement) {
      setFeedback("لا يوجد إثبات قياس كامل؛ اقرأ المصدر أولاً.");
      setFeedbackError(true);
      return;
    }
    const command = pending ?? {
      eventType,
      expectedVersion: version,
      reason: normalizedReason,
      eventId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      ...(eventType === "MEASURE" && selectedMeasurement
        ? { measuredOutcome: { ...selectedMeasurement, measuredAt: new Date().toISOString() } }
        : {}),
    };
    setPending(command);
    setBusy(true);
    setFeedback("");
    setFeedbackError(false);
    try {
      const result = command.eventType === "DEFER"
        ? await deferDecisionOutcome({
            outcomeId,
            expectedVersion: command.expectedVersion,
            reason: command.reason,
            eventId: command.eventId,
            idempotencyKey: command.idempotencyKey,
          })
        : command.eventType === "RESUBMIT_FOR_REVIEW"
          ? await resumeDeferredDecisionOutcome({
              outcomeId,
              expectedVersion: command.expectedVersion,
              reason: command.reason,
              eventId: command.eventId,
              idempotencyKey: command.idempotencyKey,
            })
          : await commandDecisionOutcome({
            outcomeId,
            expectedVersion: command.expectedVersion,
            eventType: command.eventType,
            reason: command.reason,
            ...(command.eventType === "ASSIGN" && ownerProfileId ? { ownerProfileId } : {}),
            eventId: command.eventId,
            idempotencyKey: command.idempotencyKey,
            ...(command.measuredOutcome ? { measuredOutcome: command.measuredOutcome } : {}),
          });
      if (result.ok) {
        setPending(null);
        setReason("");
        setMeasurementProof(null);
        setProofStatus("IDLE");
        setFeedback(result.duplicate
          ? "أكد الخادم أن الأمر السابق محفوظ بالفعل؛ يجري تحديث السجل."
          : "أكد الخادم حفظ انتقال القرار؛ يجري تحديث السجل.");
        setFeedbackError(false);
        onChanged?.();
      } else {
        setFeedback(result.message);
        setFeedbackError(true);
        if (result.status !== "UNAVAILABLE") setPending(null);
      }
    } catch {
      setFeedback("تعذر تأكيد استجابة الخادم. أعد الأمر نفسه دون تغيير السبب لتفادي تكرار الأثر.");
      setFeedbackError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section dir="rtl" className="space-y-2 rounded-lg border p-3" aria-label="دورة اعتماد القرار وتنفيذه">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">دورة القرار</h4>
        <span className="text-xs text-muted-foreground">إصدار الخادم: {version}</span>
      </div>
      {events.length > 0 ? <>
        <label className="block space-y-1 text-sm">
          سبب الإجراء وسجل القرار
          <textarea
            className="w-full rounded-lg border bg-background p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            rows={2}
            maxLength={2000}
            value={reason}
            disabled={busy || pending !== null}
            onChange={event => setReason(event.target.value)}
            placeholder="اكتب مبرر المراجعة أو الاعتماد أو الرفض أو التأجيل أو إعادة المراجعة أو التنفيذ..."
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {events.map(eventType => (
            <button
              key={eventType}
              type="button"
              className="rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              disabled={busy || (pending !== null && pending.eventType !== eventType)}
              onClick={() => void submit(eventType)}
            >
              {busy && pending?.eventType === eventType
                ? "جارٍ الإرسال..."
                : pending?.eventType === eventType
                  ? "إعادة المحاولة بنفس الأمر"
                  : labels[eventType]}
            </button>
          ))}
        </div>
        {pending ? <p className="text-xs text-muted-foreground">حُفظ مفتاح الأمر لهذه المحاولة؛ لا تغيّر السبب أو الإجراء حتى يؤكد الخادم النتيجة.</p> : null}
      </> : state === "APPROVED" && !ownerProfileId ? (
        <p className="text-sm text-muted-foreground">لا يمكن تثبيت الإسناد: لم يرجع المصدر معرف مسؤول موثوقاً لهذا القرار.</p>
      ) : state === "EXECUTED" ? (
        <div className="space-y-2 rounded-lg border p-3">
          <h5 className="text-sm font-semibold">قياس رصيد التحصيلات المستحقة — لا يمثل المقبوضات البنكية</h5>
          {expectedMetric?.metricKey === "cashflow.expected_collections" ? (
            <p className="text-xs text-muted-foreground">
              خط الأساس: {expectedMetric.value.toLocaleString("ar-YE")} {expectedMetric.currency} ·
              الفترة: {expectedMetric.period.from} — {expectedMetric.period.to} ·
              المعادلة: {expectedMetric.formulaId}@{expectedMetric.formulaVersion}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد خط أساس معتمد من مقياس التحصيلات لهذه الدورة؛ ستظل النتيجة غير مقاسة.</p>
          )}
          <button type="button" className="rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" disabled={busy || pending !== null || !expectedMetric} onClick={() => void loadMeasurementProof()}>
            {proofStatus === "LOADING" ? "جارٍ قراءة المصدر..." : "قراءة رصيد الذمم من المصدر"}
          </button>
          {proofStatus === "READY" && measurementProof ? (
            <div className="rounded-md border p-2 text-xs">
              <p>الرصيد المتبقي حسب المصدر: <strong>{measurementProof.value.toLocaleString("ar-YE")} {measurementProof.currency}</strong></p>
              <p>وقت المصدر: {measurementProof.asOf} · الأدلة: {measurementProof.evidenceIds.length}</p>
              <p>الفترة: {measurementProof.period.from} — {measurementProof.period.to}</p>
            </div>
          ) : null}
          <label className="block space-y-1 text-sm">
            سبب اعتماد القياس
            <textarea className="w-full rounded-lg border bg-background p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" rows={2} maxLength={2000}
              value={reason} disabled={busy || pending !== null}
              onChange={event => setReason(event.target.value)}
              placeholder="اشرح اعتماد هذا القياس أو سبب اختلاف الرصيد عن خط الأساس..." />
          </label>
          {pending?.eventType === "MEASURE" ? (
            <button type="button" className="rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" disabled={busy} onClick={() => void submit("MEASURE", pending.measuredOutcome)}>
              {busy ? "جارٍ إعادة المحاولة..." : "إعادة محاولة حفظ القياس بنفس الدليل"}
            </button>
          ) : (
            <button type="button" className="rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              disabled={busy || proofStatus !== "READY" || !measurementProof || reason.trim().length < 3}
              onClick={() => void submit("MEASURE", measurementProof ?? undefined)}>
              {busy ? "جارٍ حفظ القياس..." : "اعتماد النتيجة المصدرية"}
            </button>
          )}
          <p className="text-xs text-muted-foreground">هذه القيمة هي رصيد الفواتير غير المسدد المستحق ضمن الفترة وقت القياس، وليست مجموع المقبوضات البنكية أو كشف حركة التحصيل. يعيد الخادم احتساب مجموعة الفواتير والمدفوعات داخل المؤسسة ويرفض اختلاف الإجمالي أو العملة أو الفترة أو الأدلة؛ ولا ينشئ الأمر دفعة أو قيداً مالياً.</p>
        </div>
      ) : state === "MEASURED" ? (
        <p className="text-sm text-muted-foreground">اكتملت دورة القرار والقياس مسجل من مصدره. أي تصحيح لاحق يجب أن يبقى إلحاقياً في دفتر الذاكرة.</p>
      ) : state === "REJECTED" ? (
        <p className="text-sm text-muted-foreground">أُغلق القرار بالرفض؛ لا تتاح إعادة تشغيله أو تجاوز سجل الرفض من هذه البطاقة.</p>
      ) : state === "DEFERRED" ? (
        <p className="text-sm text-muted-foreground">تم تأجيل القرار مع حفظ السبب في سجل التدقيق؛ لا يُعاد إلى المراجعة تلقائياً.</p>
      ) : (
        <p className="text-sm text-muted-foreground">لا يوجد انتقال متاح لهذا الإصدار من القرار.</p>
      )}
      {feedback ? <p role="status" aria-live="polite" className={feedbackError ? "text-sm text-destructive" : "text-sm text-green-700"}>{feedback}</p> : null}
      <p className="text-xs text-muted-foreground">هذه الأوامر تسجل دورة القرار فقط؛ لا ترحّل قيوداً ولا تصدر مدفوعات ولا تعدّل أسعاراً أو مخزوناً. صلاحية التنفيذ والتحقق النهائي يفرضان من الخادم.</p>
    </section>
  );
}
