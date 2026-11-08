import type { TaskQualityMetrics, TaskQualityReasonCode } from "@/lib/intelligence/task-quality-reviews";
import { TaskQualityInsightsPanel } from "./TaskQualityInsightsPanel";

export interface TaskQualityReviewMetricsProps {
  quality: TaskQualityMetrics;
}

const reasonLabels: Record<TaskQualityReasonCode, string> = {
  SOURCE_MISSING: "دليل المصدر غير موجود",
  SOURCE_INCOMPLETE: "بيانات المصدر غير مكتملة",
  SOURCE_STALE: "بيانات المصدر قديمة",
  SOURCE_MISMATCH: "عدم تطابق مع المصدر",
  ALREADY_RESOLVED: "المهمة حُلّت بالفعل",
  DUPLICATE_RECOMMENDATION: "توصية مكررة",
  OUT_OF_SCOPE: "خارج النطاق التشغيلي",
  POLICY_CONFLICT: "تعارض مع سياسة معتمدة",
  RESOURCE_UNAVAILABLE: "الموارد غير متاحة",
  TIMING_NOT_APPROPRIATE: "التوقيت غير مناسب",
  LOW_EXPECTED_IMPACT: "الأثر المتوقع منخفض",
  BUDGET_CONSTRAINT: "قيد الميزانية",
  THRESHOLD_NOT_MET: "الحد المعتمد لم يتحقق",
  OTHER: "سبب آخر موضح",
};

function number(value: number): string {
  return value.toLocaleString("ar-YE", { maximumFractionDigits: 2 });
}
function percent(value: number | null): string {
  return value === null ? "غير متاح" : number(value) + "٪";
}
function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}
function ReasonRows({ items }: { items: { reasonCode: TaskQualityReasonCode; reviewCount: number; affectedTaskCount: number }[] }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">لا توجد أسباب مسجلة ضمن هذه الفئة.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map(item => (
        <li key={item.reasonCode} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
          <span>{reasonLabels[item.reasonCode]}</span>
          <span className="tabular-nums text-muted-foreground">{number(item.affectedTaskCount)} مهمة · {number(item.reviewCount)} مراجعة</span>
        </li>
      ))}
    </ul>
  );
}

export function TaskQualityReviewMetrics({ quality }: TaskQualityReviewMetricsProps) {
  if (quality.status === "RESTRICTED") {
    return (
      <section dir="rtl" className="space-y-2 rounded-lg border p-3" aria-label="مؤشرات جودة المهام">
        <h4 className="font-semibold">جودة المهام والتوصيات</h4>
        <p className="text-sm">تفاصيل قرارات المراجعة وأسبابها متاحة للمدير والمسؤول فقط.</p>
      </section>
    );
  }
  if (quality.status === "UNAVAILABLE") {
    return (
      <section dir="rtl" className="space-y-2 rounded-lg border p-3" aria-label="مؤشرات جودة المهام">
        <h4 className="font-semibold">جودة المهام والتوصيات</h4>
        <p className="text-sm">مؤشرات الجودة غير متاحة من المصدر المعتمد حالياً؛ لا تُعرض أصفار بديلة.</p>
        <p className="text-xs text-muted-foreground">{quality.reasonCode === "QUALITY_REVIEW_MIGRATION_PENDING" ? "ترحيل خدمة المراجعات لم يُطبق بعد." : "استجابة مصدر الجودة غير صالحة أو غير مكتملة."}</p>
      </section>
    );
  }
  if (quality.status === "EMPTY") {
    return (
      <section dir="rtl" className="space-y-2 rounded-lg border p-3" aria-label="مؤشرات جودة المهام">
        <h4 className="font-semibold">جودة المهام والتوصيات</h4>
        <p className="text-sm">لم تُسجل مراجعات جودة بعد. لا يعني ذلك أن كل المهام قابلة للتنفيذ أو أن التنبيهات صحيحة.</p>
        <p className="text-xs text-muted-foreground">المهام المرئية: {number(quality.scope.visibleTaskCount)} · مهام تمت مراجعتها: {number(quality.scope.reviewedTaskCount)}.</p>
      </section>
    );
  }
  return (
    <section dir="rtl" className="space-y-3 rounded-lg border p-3" aria-label="مؤشرات جودة المهام والتوصيات">
      <div>
        <h4 className="font-semibold">جودة المهام والتوصيات</h4>
        <p className="text-xs text-muted-foreground">المؤشرات من أحدث مراجعة محفوظة لكل مهمة/قرار ونوع مراجعة؛ المؤجّل و«يحتاج مراجعة» خارج مقامات النسب.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="قابلية التنفيذ" value={percent(quality.actionability.actionableRatePercent)} detail={number(quality.actionability.actionableCount) + " من " + number(quality.actionability.rateDenominator) + " تقييم حاسم"} />
        <MetricCard title="التوصيات المقبولة" value={number(quality.disposition.approvedCount)} detail="قرارات قبول محفوظة من المراجعين المخولين." />
        <MetricCard title="رفض التوصيات" value={number(quality.disposition.rejectedCount)} detail={number(quality.disposition.reviewedCount) + " مراجعة قرار"} />
        <MetricCard title="تأجيل التوصيات" value={number(quality.disposition.deferredCount)} detail={number(quality.actionability.deferredCount) + " مهام مؤجلة أيضاً"} />
        <MetricCard title="الإنذارات الكاذبة" value={percent(quality.alerts.falseAlarmRatePercent)} detail={number(quality.alerts.falsePositiveCount) + " من " + number(quality.alerts.falseAlarmDenominator) + " تنبيه صحيح/كاذب تمت مراجعته"} />
        <MetricCard title="التنبيهات الصحيحة" value={number(quality.alerts.truePositiveCount)} detail="أثبتت المراجعة أن التنبيه مدعوم بالمصدر." />
        <MetricCard title="تنبيهات بانتظار المراجعة" value={number(quality.alerts.needsReviewCount)} detail="مستبعدة من مقام نسبة الإنذارات الكاذبة حتى حسمها." />
        <MetricCard title="الأسباب المتكررة" value={number(quality.repeatedCauses.length)} detail={number(quality.causeReviewCount) + " مراجعة سلبية مصنفة"} />
        <MetricCard title="المهام التي تمت مراجعتها" value={number(quality.scope.reviewedTaskCount)} detail={"من " + number(quality.scope.visibleTaskCount) + " مهمة مرئية للمدير"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><h5 className="text-sm font-semibold">أسباب عدم قابلية التنفيذ</h5><ReasonRows items={quality.actionability.notActionableReasons} /></div>
        <div className="space-y-2"><h5 className="text-sm font-semibold">أسباب رفض التوصيات</h5><ReasonRows items={quality.disposition.rejectionReasons} /></div>
        <div className="space-y-2"><h5 className="text-sm font-semibold">أسباب التأجيل</h5><ReasonRows items={quality.disposition.deferralReasons} /></div>
        <div className="space-y-2">
          <h5 className="text-sm font-semibold">الأسباب المتكررة عبر مهام مختلفة</h5>
          {quality.repeatedCauses.length ? <ReasonRows items={quality.repeatedCauses} /> : <p className="text-xs text-muted-foreground">لا يوجد سبب متكرر بين مهام مختلفة ضمن عينة المراجعات الحالية.</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">هذه النسب تقيس أحكام المراجعين المحفوظة، لا نجاح الإجراء أو سببيته. قياس التحسن التشغيلي يحتاج خط أساس ونتيجة فعلية موثقة ومقارنة متوافقة.</p>
      <TaskQualityInsightsPanel quality={quality} />
    </section>
  );
}
