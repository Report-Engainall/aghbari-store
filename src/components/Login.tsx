import { useState, type FormEvent } from 'react';
import { Activity, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { normalizeAuthPhoneIdentifier, useAuth } from '@/lib/auth';

type Mode = 'login' | 'register' | 'forgot';

function LoginBrand() {
  return (
    <div className="login-brand">
      <div className="login-brand-icon"><Activity size={28} /></div>
      <div><strong>الأغبري</strong><span>Aghbari Commerce</span></div>
    </div>
  );
}

function LoginMarketingPanel() {
  return (
    <div className="login-left">
      <LoginBrand />
      <div className="login-hero">
        <h2>منصة تجارة الجملة والتوزيع الذكية</h2>
        <p>اطلب بالجملة، تابع طلباتك، وأدر عملياتك التجارية من مكان واحد.</p>
      </div>
      <div className="login-features">
        <div className="login-feature"><ShieldCheck size={20} /> <span>دخول آمن وصلاحيات حسب الدور</span></div>
        <div className="login-feature"><Activity size={20} /> <span>أسعار ومخزون محدّث مباشرة</span></div>
        <div className="login-feature"><Lock size={20} /> <span>بياناتك التجارية محمية</span></div>
      </div>
    </div>
  );
}

function LoginNameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="login-field">
      <span>الاسم الكامل</span>
      <div className="login-input-wrap">
        <User size={18} />
        <input value={value} onChange={(event) => onChange(event.target.value)} autoComplete="name" required />
      </div>
    </label>
  );
}

function LoginEmailField({
  value,
  onChange,
  mode,
  phoneLogin,
  onPhoneLoginChange,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: Mode;
  phoneLogin: boolean;
  onPhoneLoginChange: (value: boolean) => void;
}) {
  const isPhone = mode === "login" && phoneLogin;
  return (
    <label className="login-field">
      <span>{isPhone ? "رقم الهاتف" : "البريد الإلكتروني"}</span>
      <div className="login-input-wrap">
        {isPhone ? <User size={18} /> : <Mail size={18} />}
        <input
          type={isPhone ? "tel" : "email"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={isPhone ? "tel" : "email"}
          placeholder={isPhone ? "+967 7xxxxxxxx أو 7xxxxxxxx" : "name@example.com"}
          dir="ltr"
          required
        />
      </div>
      {mode === "login" ? (
        <button
          type="button"
          className="sf-link"
          onClick={() => onPhoneLoginChange(!phoneLogin)}
        >
          {phoneLogin ? "تسجيل الدخول بالبريد الإلكتروني" : "تسجيل الدخول برقم الهاتف"}
        </button>
      ) : null}
    </label>
  );
}
function LoginPasswordField({
  value,
  visible,
  mode,
  onChange,
  onToggleVisibility,
}: {
  value: string;
  visible: boolean;
  mode: Exclude<Mode, 'forgot'>;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
}) {
  return (
    <label className="login-field">
      <span>كلمة المرور</span>
      <div className="login-input-wrap">
        <Lock size={18} />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
        />
        <button
          type="button"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          onClick={onToggleVisibility}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

function LoginFormIntro({ mode, title }: { mode: Mode; title: string }) {
  const description = mode === 'register'
    ? 'أنشئ حسابك للطلب من متجر الأغبري'
    : mode === 'forgot'
      ? 'سنرسل لك رابطاً لتعيين كلمة مرور جديدة'
      : 'أدخل بياناتك للمتابعة';

  return (
    <>
      <h1>{title}</h1>
      <p>{description}</p>
    </>
  );
}

function LoginFeedback({ error, info }: { error: string; info: string }) {
  return (
    <>
      {error ? <div className="login-error" role="alert">{error}</div> : null}
      {info ? <div className="login-hint" role="status">{info}</div> : null}
    </>
  );
}

function LoginModeActions({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  return (
    <div className="login-hint" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
      {mode !== 'login' ? (
        <button type="button" className="sf-link" onClick={() => onModeChange('login')}>
          لديك حساب؟ سجّل الدخول
        </button>
      ) : null}
      {mode !== 'register' ? (
        <button type="button" className="sf-link" onClick={() => onModeChange('register')}>
          إنشاء حساب جديد
        </button>
      ) : null}
      {mode === 'login' ? (
        <button type="button" className="sf-link" onClick={() => onModeChange('forgot')}>
          نسيت كلمة المرور؟
        </button>
      ) : null}
    </div>
  );
}

function loginTitle(mode: Mode): string {
  if (mode === 'login') return 'تسجيل الدخول';
  if (mode === 'register') return 'إنشاء حساب تجاري';
  return 'استعادة كلمة المرور';
}

function validateLoginInput(mode: Mode, name: string, email: string, password: string, phoneLogin: boolean): string {
  if (mode === "login" && phoneLogin) {
    if (!normalizeAuthPhoneIdentifier(email)) return "أدخل رقماً يمنياً يبدأ بـ7 أو رقماً دولياً بصيغة +رمز الدولة.";
  } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return "أدخل بريداً إلكترونياً صحيحاً";
  }
  if (mode === "forgot") return "";
  if (password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  if (mode === "register" && name.trim().length < 2) return "أدخل الاسم الكامل";
  return "";
}

export function Login({
  onDone,
  initialMode = 'login',
}: {
  onDone?: () => void;
  initialMode?: Mode;
}) {
  const { signIn, signUp, resetPassword, loading } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneLogin, setPhoneLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');

    const validationError = validateLoginInput(mode, name, email, password, phoneLogin);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      if (mode === 'forgot') {
        await resetPassword(email);
        setInfo('أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك');
        return;
      }

      if (mode === 'register') {
        const { needsConfirmation } = await signUp(email, password, name);
        if (needsConfirmation) {
          setInfo('تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل ثم سجّل الدخول.');
          setMode('login');
          return;
        }
      } else {
        await signIn(email, password);
      }

      onDone?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إكمال العملية');
    }
  }

  return (
    <div className="login-screen" dir="rtl">
      <LoginMarketingPanel />
      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <LoginFormIntro mode={mode} title={loginTitle(mode)} />
          {mode === 'register' ? <LoginNameField value={name} onChange={setName} /> : null}
          <LoginEmailField value={email} onChange={setEmail} mode={mode} phoneLogin={phoneLogin} onPhoneLoginChange={(next) => { setPhoneLogin(next); setEmail(""); setError(""); setInfo(""); }} />
          {mode !== 'forgot' ? (
            <LoginPasswordField
              value={password}
              visible={show}
              mode={mode}
              onChange={setPassword}
              onToggleVisibility={() => setShow((value) => !value)}
            />
          ) : null}
          <LoginFeedback error={error} info={info} />
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'جارٍ المعالجة...' : mode === 'login' ? 'دخول' : mode === 'register' ? 'إنشاء الحساب' : 'إرسال الرابط'}
          </button>
          <LoginModeActions mode={mode} onModeChange={(next) => { setMode(next); setPhoneLogin(false); setEmail(""); setError(""); setInfo(""); }} />
        </form>
      </div>
    </div>
  );
}
