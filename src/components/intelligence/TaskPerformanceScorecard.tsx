import { TaskQualityReviewMetrics } from "./TaskQualityReviewMetrics";
import type {
  TaskPerformanceScorecard as ScorecardData,
  TaskPerformanceGroup,
  TaskPerformanceUnavailableMetric,
} from "@/lib/intelligence/task-performance-scorecard";

export type TaskPerformanceScorecardState =
  | "loading"
  | "unavailable"
  | "error"
  | "ready";

export interface TaskPerformanceScorecardProps {
  scorecard?: ScorecardData | null;
  state?: TaskPerformanceScorecardState;
  errorMessage?: string;
  onRetry?: () => void;
}

const roleLabels: Record<string, string> = {
  sales: "المبيعات",
  accountant: "المحاسبة والتحصيل",
  warehouse: "المخازن",
  purchasing: "المشتريات",
  management: "الإدارة",
  operations: "العمليات",
};

const unavailableLabels: Record<TaskPerformanceUnavailableMetric, string> = {
  REOPEN_RATE: "معدل إعادة الفتح الكامل",
  DUPLICATE_REPLAY_RATE: "معدل محاولات التكرار الممنوعة",
  ACTIONABILITY_RATE: "نسبة المهام القابلة للتنفيذ",
  FALSE_ALARM_RATE: "نسبة الإنذارات الكاذبة بعد المراجعة",
  REPEATED_CAUSE_RATE: "معدل الأسباب المتكررة",
  WAITING_ON_OTHER_PARTY: "المهام المنتظرة من طرف آخر",
  IMPROVEMENT_OUTCOMES: "نتائج التحسين مقارنة بخط الأساس",
  PRINT_SUCCESS_RATE: "نجاح الطباعة",
  EMPLOYEE_COMPARISON: "مقارنة أداء الموظفين",
};

function number(value: number): string {
  return value.toLocaleString("ar-YE", { maximumFractionDigits: 2 });
}

function percent(value: number | null): string {
  return value === null ? "غير متاح" : number(value) + "٪";
}

function duration(value: number | null): string {
  if (value === null) return "غير متاح";
  if (value < 60) return number(value) + " دقيقة";
  const hours = value / 60;
  if (hours < 48) return number(hours) + " ساعة";
  return number(hours / 24) + " يوم";
}

function StatePanel({
  state,
  errorMessage,
  onRetry,
}: {
  state: Exclude<TaskPerformanceScorecardState, "ready">;
  errorMessage: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <section dir="rtl" role="status" aria-busy="true" className="rounded-xl border p-4 text-sm">
        جارٍ تحميل بطاقة أداء المهام من قاعدة البيانات…
      </section>
    );
  }
  if (state === "unavailable") {
    return (
      <section dir="rtl" role="note" className="rounded-xl border p-4 text-sm">
        <h3 className="font-semibold">بطاقة أداء المهام</h3>
        <p className="mt-2">{errorMessage}</p>
        {onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-lg border px-3 py-2">إعادة المحاولة</button> : null}
      </section>
    );
  }
  return (
    <section dir="rtl" role="alert" className="rounded-xl border p-4 text-sm">
      <p>{errorMessage}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-lg border px-3 py-2">إعادة المحاولة</button> : null}
    </section>
  );
}

function GroupRow({ group }: { group: TaskPerformanceGroup }) {
  return (
    <tr className="border-t align-top">
      <td className="p-2">
        <div className="font-medium">{group.taskType}</div>
        <div className="text-xs text-muted-foreground">{roleLabels[group.taskRole]}</div>
      </td>
      <td className="p-2 text-center tabular-nums">{number(group.taskCount)}</td>
      <td className="p-2 text-center tabular-nums">{number(group.completedCount)}</td>
      <td className="p-2 text-center">
        <div className="tabular-nums">{duration(group.medianResolutionMinutes)}</div>
        <div className="text-xs text-muted-foreground">وسيط</div>
      </td>
      <td className="p-2 text-center">
        <div className="tabular-nums">{duration(group.p90ResolutionMinutes)}</div>
        <div className="text-xs text-muted-foreground">P90</div>
      </td>
      <td className="p-2 text-center">
        <div className="tabular-nums">{percent(group.traceabilityCoveragePercent)}</div>
        <div className="text-xs text-muted-foreground">
          {number(group.traceableTaskCount)} / {number(group.sourceLinkedTaskCount)}
        </div>
      </td>
    </tr>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

export function TaskPerformanceScorecard({
  scorecard,
  state = "ready",
  errorMessage = "تعذر تحميل بطاقة أداء المهام.",
  onRetry,
}: TaskPerformanceScorecardProps) {
  if (state !== "ready") {
    return <StatePanel state={state} errorMessage={errorMessage} onRetry={onRetry} />;
  }
  if (!scorecard) {
    return (
      <section dir="rtl" role="status" className="rounded-xl border p-4 text-sm">
        بطاقة الأداء غير متاحة. لا توجد بيانات موثوقة لعرضها.
      </section>
    );
  }

  const unavailable = scorecard.unavailableMetrics;
  return (
    <section dir="rtl" aria-label="بطاقة أداء المهام" className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">بطاقة أداء المهام</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            لقطة شاملة للمهام المرئية حسب صلاحيات الدور، كما في {new Date(scorecard.asOf).toLocaleString("ar-YE")}
          </p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs">
          {scorecard.status === "EMPTY" ? "لا توجد مهام" : "بيانات المصدر محمّلة"}
        </span>
      </header>

      {scorecard.status === "EMPTY" ? (
        <p role="status" className="rounded-lg border p-3 text-sm">
          لا توجد سجلات مهام ضمن الأدوار المتاحة لهذا الحساب. لا يعني ذلك عدم وجود مهام في أدوار محجوبة.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="المهام ضمن النطاق"
          value={number(scorecard.scope.visibleTaskCount)}
          detail="كل السجلات المرئية للأدوار المصرّح بها"
        />
        <SummaryCard
          title="تغطية مفتاح منع التكرار"
          value={percent(scorecard.coverage.idempotencyKeyCoveragePercent)}
          detail={number(scorecard.coverage.idempotencyKeyCount) + " من " + number(scorecard.coverage.sourceLinkedTaskCount) + " مهمة مرتبطة بمصدر"}
        />
        <SummaryCard
          title="قابلية تتبع المصدر"
          value={percent(scorecard.coverage.traceabilityCoveragePercent)}
          detail={number(scorecard.coverage.traceableTaskCount) + " سجل يملك مفتاحاً ونوع مصدر ومعرّف كيان"}
        />
        <SummaryCard
          title="عينة زمن الإكمال"
          value={number(scorecard.resolution.sampleCount)}
          detail={
            number(scorecard.resolution.completedTaskCount) +
            " مكتملة؛ المستبعد بسبب طابع زمني ناقص/غير صالح: " +
            number(scorecard.resolution.excludedCount)
          }
        />
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">إعادة الفتح والتدقيق</h4>
        {scorecard.audit.completeness === "WINDOW_COMPLETE" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              title="معدل إعادة الفتح داخل نافذة التدقيق"
              value={percent(scorecard.audit.reopenRatePercent)}
              detail={
                number(scorecard.audit.reopenedTaskCount) + " من " +
                number(scorecard.audit.firstCompletedTaskCount ?? 0) +
                " مهمة اكتملت أول مرة بعد بدء التغطية"
              }
            />
            <SummaryCard
              title="انتقالات إعادة الفتح"
              value={number(scorecard.audit.reopenEventCount)}
              detail="عدد أحداث completed إلى pending / in progress داخل النافذة"
            />
            <SummaryCard
              title="بداية التغطية الكاملة"
              value={scorecard.audit.windowStartedAt
                ? new Date(scorecard.audit.windowStartedAt).toLocaleDateString("ar-YE")
                : "غير متاح"}
              detail="لا تشمل هذه النسبة أي تاريخ يسبق تفعيل سجل الانتقالات المركزي"
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">انتقالات إعادة الفتح المرصودة في سجل التدقيق</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{number(scorecard.audit.reopenEventCount)}</p>
              <p className="text-xs text-muted-foreground">
                حد أدنى مرصود يخص {number(scorecard.audit.reopenedTaskCount)} مهمة مميزة
              </p>
            </div>
            <p className="text-sm">
              <strong>معدل إعادة الفتح الكامل: غير متاح.</strong> سجل الانتقالات قبل تفعيل التدقيق المركزي غير مكتمل؛ لذلك لا تُعرض نسبة تاريخية مضللة.
            </p>
          </div>
        )}
      </div>

      <TaskQualityReviewMetrics quality={scorecard.quality} />

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">زمن الإكمال حسب نوع المهمة والدور</h4>
        <p className="text-xs text-muted-foreground">
          يقاس من created_at إلى completed_at للسجلات المكتملة حالياً ذات الطوابع الصالحة. لا يُنسب تلقائياً إلى موظف؛ بعض المهام تغلقها أحداث نظامية.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th scope="col" className="p-2 text-right">نوع المهمة / الدور</th>
                <th scope="col" className="p-2 text-center">الإجمالي</th>
                <th scope="col" className="p-2 text-center">مكتملة</th>
                <th scope="col" className="p-2 text-center">وسيط الحل</th>
                <th scope="col" className="p-2 text-center">P90 للحل</th>
                <th scope="col" className="p-2 text-center">تتبع المصدر</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.groups.map(group => (
                <GroupRow key={group.taskRole + "::" + group.taskType} group={group} />
              ))}
              {scorecard.groups.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">لا توجد مجموعات مهام ضمن النطاق.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-semibold">مؤشرات غير متاحة حالياً</h4>
        <p className="text-xs text-muted-foreground">
          لا تُعرض هذه المؤشرات بصفر ولا تُستنتج من نص المهمة أو الأولوية؛ تحتاج أحداثاً أو حقولاً معيارية مستقلة.
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {unavailable.map(metric => (
            <li key={metric} className="rounded-md border p-2">{unavailableLabels[metric]}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
