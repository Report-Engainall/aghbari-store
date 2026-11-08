import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { startOperationalShift } from "@/lib/intelligence/shift-operations-client";

export interface StartFirstOperationalShiftFormProps {
  businessDate: string;
  onStarted: () => void;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function StartFirstOperationalShiftForm({
  businessDate,
  onStarted,
}: StartFirstOperationalShiftFormProps) {
  const { user } = useAuth();
  const [shiftLabel, setShiftLabel] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [date, setDate] = useState(businessDate);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const authorizedUi = Boolean(user?.isStaff || user?.roles.some(role =>
    role === "admin" || role === "manager" || role === "accountant"
  ));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!authorizedUi) {
      setError("بدء الوردية متاح للمستخدمين المخولين فقط؛ يتحقق الخادم من الصلاحية أيضاً.");
      return;
    }
    if (!DAY.test(date) || shiftLabel.trim().length < 2 ||
        timeZone.trim().length < 1 || timeZone.trim().length > 80) {
      setError("أدخل تاريخاً صحيحاً واسم وردية ومنطقة زمنية بصيغة IANA.");
      return;
    }

    const key = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(key);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await startOperationalShift({
        businessDate: date,
        shiftLabel: shiftLabel.trim(),
        timeZone: timeZone.trim(),
        previousShiftId: null,
        idempotencyKey: key,
      });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setIdempotencyKey(null);
      setNotice(
        "أكد الخادم بدء الوردية " + response.data.shiftLabel +
        " بتاريخ " + response.data.businessDate +
        (response.data.idempotentReplay ? "؛ الطلب مطابق لمحاولة محفوظة." : "، وتم حفظ سجلها."),
      );
      onStarted();
    } catch {
      setError("تعذر بدء الوردية؛ لم يُعرض نجاح محلي.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-3" aria-label="بدء أول وردية">
      <div>
        <h3 className="font-semibold">إنشاء الوردية الأولى</h3>
        <p className="text-xs text-muted-foreground">
          لم يعثر المصدر على وردية لهذا التاريخ. أدخل المنطقة الزمنية المعتمدة للمؤسسة؛ لا تُستنتج من موقع الجهاز.
          سيُنشئ الخادم سجل الوردية ويربطه بآخر وردية سابقة إن وجدت.
        </p>
      </div>
      {!authorizedUi ? (
        <p role="alert" className="text-sm">يلزم حساب موظف أو دور مالي مخول لبدء الوردية.</p>
      ) : (
        <form onSubmit={event => void submit(event)} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            تاريخ العمل
            <input type="date" required value={date}
              onChange={event => { setIdempotencyKey(null); setDate(event.target.value); }}
              className="rounded-lg border bg-background p-2" />
          </label>
          <label className="grid gap-1 text-sm">
            اسم الوردية
            <input required minLength={2} maxLength={80} value={shiftLabel}
              onChange={event => { setIdempotencyKey(null); setShiftLabel(event.target.value); }}
              placeholder="مثال: الوردية الصباحية"
              className="rounded-lg border bg-background p-2" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            المنطقة الزمنية للمؤسسة (IANA)
            <input required maxLength={80} value={timeZone}
              onChange={event => { setIdempotencyKey(null); setTimeZone(event.target.value); }}
              placeholder="مثال: Asia/Aden"
              className="rounded-lg border bg-background p-2" />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          {notice ? <p role="status" className="text-sm sm:col-span-2">{notice}</p> : null}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || shiftLabel.trim().length < 2 || !date || !timeZone.trim()}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "جارٍ إنشاء الوردية…" : "إنشاء الوردية وفتح مركزها"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
