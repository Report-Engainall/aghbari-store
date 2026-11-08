import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export function CustomerAccountPasswordPage() {
  const { user, ready } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  if (!ready) return <main className="storefront" dir="rtl" role="status">جارٍ التحقق من الحساب...</main>;
  if (!user) return <Login />;
  const activeUser = user;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    setError("");
    setNotice("");
    if (password.length < 8) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
      return;
    }
    if (password.trim() !== password || /\s/.test(password)) {
      setError("لا تستخدم مسافات في بداية كلمة المرور أو داخلها.");
      return;
    }
    if (password !== confirmation) {
      setError("تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const message = updateError.message.toLowerCase();
        if (message.includes("reauth") || message.includes("recent")) {
          throw new Error("تتطلب حماية الحساب إعادة التحقق من الجلسة. سجّل الخروج ثم استخدم «نسيت كلمة المرور؟» لإكمال التحقق.");
        }
        if (message.includes("password") || message.includes("weak")) {
          throw new Error("رفض موفر المصادقة كلمة المرور الجديدة. استخدم كلمة مرور أطول وأكثر صعوبة.");
        }
        throw new Error("تعذر تحديث كلمة المرور. تحقق من اتصال المصادقة ثم أعد المحاولة.");
      }
      if (data.user?.id !== activeUser.id) {
        throw new Error("لم يؤكد موفر المصادقة تحديث كلمة مرور الحساب الحالي.");
      }
      setPassword("");
      setConfirmation("");
      setNotice("تم تحديث كلمة المرور للحساب الحالي.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث كلمة المرور.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" dir="rtl">
      <header className="mb-5 rounded-2xl border bg-card p-5 sm:p-7">
        <Link to="/" className="text-sm text-primary hover:underline">العودة إلى المتجر</Link>
        <div className="mt-4 flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><KeyRound size={24}/></span>
          <div>
            <h1 className="text-2xl font-bold">تغيير كلمة المرور</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              تحديث كلمة مرور جلسة الحساب الحالية عبر خدمة المصادقة. لا تُحفظ كلمة المرور في ملف العميل أو في قاعدة بيانات المتجر.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="block">الحساب الحالي</strong>
            <span className="text-sm text-muted-foreground" dir="ltr">{user.email.trim() || "حساب مرتبط برقم هاتف"}</span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck size={15}/> جلسة مصادقة نشطة
          </span>
        </div>

        {notice ? <p role="status" className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        {error ? <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

        <form onSubmit={event => { void submit(event); }} className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">
            كلمة المرور الجديدة
            <span className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <Lock size={16} className="shrink-0 text-muted-foreground"/>
              <input
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                disabled={busy}
                required
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              <button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} disabled={busy}>
                {visible ? <EyeOff size={17}/> : <Eye size={17}/>}
              </button>
            </span>
            <span className="font-normal text-xs text-muted-foreground">8 أحرف على الأقل، دون مسافات.</span>
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            تأكيد كلمة المرور الجديدة
            <span className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <Lock size={16} className="shrink-0 text-muted-foreground"/>
              <input
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                minLength={8}
                maxLength={128}
                disabled={busy}
                required
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <button type="submit" className="btn primary" disabled={busy || !password || !confirmation}>
              <KeyRound size={16}/>{busy ? "جارٍ تحديث كلمة المرور..." : "حفظ كلمة المرور الجديدة"}
            </button>
            <a href="/forgot-password" className="text-sm text-primary hover:underline">استخدام استعادة كلمة المرور بدلاً من ذلك</a>
          </div>
        </form>
      </section>
    </main>
  );
}
