import { useEffect, useState } from "react";
import {
  fetchAiGatewayBudget,
  type AiGatewayBudgetResult,
  type AiGatewayBudgetSnapshot,
} from "@/lib/intelligence/ai-gateway-operations-client";

function number(value: number): string {
  return value.toLocaleString("ar-YE", { maximumFractionDigits: 6 });
}
function tokens(value: number): string {
  return value.toLocaleString("ar-YE", { maximumFractionDigits: 0 });
}
function providerLabel(provider: AiGatewayBudgetSnapshot["primaryProvider"]): string {
  return provider === "gemini" ? "Gemini" : "واجهة متوافقة مع OpenAI";
}
function ratio(used: number, reserved: number, limit: number): number | null {
  if (limit <= 0) return null;
  const value = ((used + reserved) / limit) * 100;
  return Number.isFinite(value) ? value : null;
}
function Progress({
  label,
  used,
  reserved,
  limit,
  format,
}: {
  label: string;
  used: number;
  reserved: number;
  limit: number;
  format: (value: number) => string;
}) {
  const percent = ratio(used, reserved, limit);
  const total = used + reserved;
  return (
    <article className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{label}</h4>
        <span className="text-xs text-muted-foreground">
          {percent === null ? "الحد غير موجب أو غير مهيأ" : format(total) + " / " + format(limit)}
        </span>
      </div>
      <p className="mt-2 text-sm">
        المسجل: <strong className="tabular-nums">{format(used)}</strong>
        {" · "}المحجوز النشط: <strong className="tabular-nums">{format(reserved)}</strong>
      </p>
      {percent !== null ? (
        <>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(percent))}
          >
            <div
              className={["h-full rounded-full", percent > 100 ? "bg-destructive" : "bg-primary"].join(" ")}
              style={{ width: Math.min(100, percent) + "%" }}
            />
          </div>
          <p className={["mt-1 text-xs", percent > 100 ? "text-destructive" : "text-muted-foreground"].join(" ")}>
            {number(percent)}٪ من الحد بعد احتساب الحجوزات النشطة
            {percent > 100 ? " · تجاوز الحد المسجل" : ""}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          لا يمكن حساب نسبة الاستهلاك دون حد موجب موثوق.
        </p>
      )}
    </article>
  );
}

function BudgetState({ result, onRetry }: { result: Extract<AiGatewayBudgetResult, { ok: false }>; onRetry: () => void }) {
  return (
    <section dir="rtl" className="space-y-2 rounded-xl border p-4 text-sm" role={result.status === "DENIED" ? "note" : "alert"}>
      <h3 className="font-semibold">مركز تشغيل بوابة الذكاء</h3>
      <p>{result.message}</p>
      {result.status !== "DENIED" ? (
        <button type="button" className="rounded-lg border px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={onRetry}>
          إعادة تحميل ملخص التشغيل
        </button>
      ) : null}
    </section>
  );
}

export function AiGatewayOperationsPanel() {
  const [result, setResult] = useState<AiGatewayBudgetResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchAiGatewayBudget().then(value => {
      if (active) setResult(value);
    }).catch(() => {
      if (active) setResult({
        ok: false,
        status: "UNAVAILABLE",
        message: "تعذر تحميل ملخص تشغيل بوابة الذكاء.",
      });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  const retry = () => setRefreshKey(value => value + 1);
  if (loading && !result) {
    return (
      <section dir="rtl" aria-busy="true" role="status" className="rounded-xl border p-4 text-sm">
        جارٍ تحميل ملخص البوابة وحدود الاستخدام من الخادم…
      </section>
    );
  }
  if (!result) {
    return (
      <section dir="rtl" role="status" className="rounded-xl border p-4 text-sm">
        لا توجد لقطة تشغيل متاحة. لم تُعرض أرقام بديلة.
        <button type="button" className="mr-2 rounded-lg border px-3 py-2" onClick={retry}>إعادة المحاولة</button>
      </section>
    );
  }
  if (!result.ok) return <BudgetState result={result} onRetry={retry} />;

  const snapshot = result.data;
  const positiveCostAllowance = snapshot.limits.dailyCost > 0 ||
    snapshot.limits.monthlyCost > 0 || snapshot.limits.perRequestCost > 0;
  const hasRecordedCost = snapshot.usage.todayCost > 0 || snapshot.usage.monthCost > 0 ||
    snapshot.usage.activeReservedCost > 0;

  return (
    <section dir="rtl" aria-label="مركز تشغيل بوابة الذكاء" className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">مركز تشغيل بوابة الذكاء</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ملخص خادمي مجمّع لميزانية الاستخدام والحجوزات؛ وقت قراءة الواجهة: {new Date(result.readAt).toLocaleString("ar-YE")}
          </p>
        </div>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={retry} disabled={loading}>
          {loading ? "جارٍ التحديث…" : "تحديث"}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">حالة البوابة</p>
          <p className="mt-1 text-lg font-semibold">{snapshot.enabled ? "مفعّلة في الإعدادات" : "متوقفة"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshot.configured ? "يوجد إعداد محفوظ للمؤسسة" : "لا يوجد إعداد مخصص محفوظ"}
          </p>
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">المزود الأساسي المحفوظ</p>
          <p className="mt-1 text-lg font-semibold">{providerLabel(snapshot.primaryProvider)}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">{snapshot.primaryModel}</p>
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">المسار الاحتياطي</p>
          <p className="mt-1 text-lg font-semibold">{snapshot.fallbackEnabled ? "مفعّل بالإعداد" : "معطّل بالإعداد"}</p>
          {snapshot.fallbackEnabled ? (
            <p className="mt-1 text-xs text-muted-foreground">{providerLabel(snapshot.fallbackProvider)} · <span dir="ltr">{snapshot.fallbackModel}</span></p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">لن يُعرض مزود احتياطي باعتباره متاحاً.</p>
          )}
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">حماية مفاتيح المزود</p>
          <p className="mt-1 text-lg font-semibold">غير محفوظة في قاعدة البيانات</p>
          <p className="mt-1 text-xs text-muted-foreground">هذا هو الحقل الذي أكده عقد الخادم؛ لا تُعرض قيمة أي مفتاح أو عنوان اتصال.</p>
        </article>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold">الاستهلاك والحجوزات النشطة</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Progress label="تكلفة اليوم المسجلة + المحجوزة" used={snapshot.usage.todayCost} reserved={snapshot.usage.activeReservedCost} limit={snapshot.limits.dailyCost} format={number}/>
          <Progress label="تكلفة الشهر المسجلة + المحجوزة" used={snapshot.usage.monthCost} reserved={snapshot.usage.activeReservedCost} limit={snapshot.limits.monthlyCost} format={number}/>
          <Progress label="رموز اليوم المسجلة + المحجوزة" used={snapshot.usage.todayTokens} reserved={snapshot.usage.activeReservedTodayTokens} limit={snapshot.limits.dailyTokens} format={tokens}/>
          <Progress label="رموز الشهر المسجلة + المحجوزة" used={snapshot.usage.monthTokens} reserved={snapshot.usage.activeReservedMonthTokens} limit={snapshot.limits.monthlyTokens} format={tokens}/>
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <p>حد التكلفة لكل طلب: <strong className="tabular-nums">{number(snapshot.limits.perRequestCost)}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">لا يحدد عقد القراءة عملة مستقلة لقيم التكلفة؛ لذلك تعرض كما وردت دون إضافة رمز عملة.</p>
        </div>
      </section>

      {positiveCostAllowance ? (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          <h3 className="font-semibold">تنبيه حوكمة الإنفاق</h3>
          <p className="mt-1">توجد حدود تكلفة موجبة في إعداد البوابة. هذا لا يثبت وقوع إنفاق مدفوع، لكنه لا يثبت أيضاً أن حد الإنفاق المدفوع صفر؛ راجع حدود التكلفة قبل تمكين الاستخدام.</p>
        </div>
      ) : null}
      <div className="rounded-lg border p-3 text-sm">
        <h3 className="font-semibold">حدود ما تثبته هذه اللوحة</h3>
        <ul className="mt-2 list-disc space-y-1 pr-5 text-xs text-muted-foreground">
          <li>{hasRecordedCost ? "تظهر تكلفة الاستخدام كما سجلها مقياس البوابة؛ ليست فاتورة مزود أو إثبات تسوية مالية." : "لا توجد تكلفة موجبة ضمن المجاميع المعادة؛ لا يعني ذلك إثبات مجانية المزود."}</li>
          <li>عقد get_ai_gateway_budget لا يعيد free-tier verification أو حصة المزود المتبقية أو حالة cooldown أو سجل محاولات المزود؛ لذلك لا تُعرض هذه المعلومات كأنها متحققة.</li>
          <li>الأرقام مجاميع اليوم والشهر حسب ساعة قاعدة البيانات، وليست أحداثاً تفصيلية، ولا تعرض prompts أو ردوداً أو مفاتيح أو معرّفات المؤسسة.</li>
          <li>هذه لوحة قراءة فقط؛ لا تغيّر إعداد المزود، ولا تفتح اتصالاً به، ولا تحجز حصة أو ترسل طلباً خارجياً.</li>
        </ul>
      </div>
    </section>
  );
}
