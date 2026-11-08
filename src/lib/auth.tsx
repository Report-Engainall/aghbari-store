import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { getAuthEmailRedirectUrl } from './auth-redirect';

export type AuthUser = { id: string; profileId: string; email: string; name: string; roles: string[]; isStaff: boolean };

type AuthContextType = {
  user: AuthUser | null;
  sessionRevision: number;
  loading: boolean;
  ready: boolean;
  configurationError: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutOtherSessions: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STAFF_ROLES = ['admin', 'manager', 'staff', 'accountant', 'customer_manager'];

export function normalizeAuthPhoneIdentifier(value: string): string | null {
  const compact = value.trim().replace(/[()\s-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  const digits = compact.replace(/\D/g, "");
  if (/^00967\d{9}$/.test(digits)) return "+" + digits.slice(2);
  if (/^967\d{9}$/.test(digits)) return "+" + digits;
  const local = digits.startsWith("0") ? digits.slice(1) : digits;
  return /^7\d{8}$/.test(local) ? "+967" + local : null;
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'بيانات الدخول غير صحيحة؛ تحقق من البريد أو الهاتف وكلمة المرور';
  if (m.includes('unsupported phone provider') || (m.includes('phone') && (m.includes('not enabled') || m.includes('disabled')))) return 'تسجيل الدخول برقم الهاتف غير مفعّل في إعدادات موفر المصادقة لهذا المشروع.';
  if (m.includes('phone not confirmed') || m.includes('phone is not confirmed')) return 'رقم الهاتف غير مؤكد لدى موفر المصادقة. أكمل التحقق أولاً.';
  if (m.includes('email not confirmed')) return 'يرجى تأكيد بريدك الإلكتروني أولاً من الرابط المرسل إليك';
  if (m.includes('already registered')) return 'هذا البريد مسجل مسبقاً، سجّل الدخول بدلاً من ذلك';
  if (m.includes('password')) return 'كلمة المرور ضعيفة: استخدم 8 أحرف على الأقل';
  if (m.includes('rate limit')) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
  return 'تعذر إكمال العملية، حاول مرة أخرى';
}

async function loadProfile(): Promise<AuthUser | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;
  const { data, error } = await supabase.rpc('ensure_profile', { _full_name: (session.user.user_metadata?.['full_name'] as string | undefined) ?? '' });
  if (error || !data) throw new Error('تعذر تحميل ملف المستخدم');
  const p = data as { profile_id: string; full_name: string; email: string; roles: string[] };
  return { id: session.user.id, profileId: p.profile_id, email: p.email, name: p.full_name, roles: p.roles, isStaff: p.roles.some((r) => STAFF_ROLES.includes(r)) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Invalidate auth-scoped client state when server membership/scope may have changed.
  const [sessionRevision, setSessionRevision] = useState(0);
  // Ignore profile reads that finish after a newer auth event changed the session scope.
  const refreshGeneration = useRef(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const nextUser = await loadProfile();
      if (generation === refreshGeneration.current) setUser(nextUser);
    } catch {
      if (generation === refreshGeneration.current) setUser(null);
    } finally {
      if (generation === refreshGeneration.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        // Identity/roles can remain unchanged while server-side company or warehouse access changes.
        if (
          event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' ||
          event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' ||
          event === 'PASSWORD_RECOVERY' || event === 'MFA_CHALLENGE_VERIFIED'
        ) {
          // Invalidate any in-flight profile read before processing this session boundary.
          refreshGeneration.current += 1;
          setSessionRevision((revision) => revision + 1);
        }
        if (
          event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY' ||
          event === 'MFA_CHALLENGE_VERIFIED'
        ) {
          setTimeout(refresh, 0);
        }
        if (event === 'SIGNED_OUT') setUser(null);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      setConfigurationError(null);
      void refresh();
    } catch (cause) {
      // Do not let failed database/auth bootstrapping escape the root React tree.
      // The application remains navigable, while the root banner identifies the configuration blocker.
      const detail = cause instanceof Error ? cause.message : String(cause);
      const missingConfig = /Missing (?:database|Supabase) environment variable|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY|Bolt Database/i.test(detail);
      setConfigurationError(
        missingConfig
          ? 'إعداد قاعدة البيانات والمصادقة غير مكتمل. استخدم قاعدة البيانات المدمجة في Bolt، وأكمل متغيرات الاتصال العامة وأسرار الخادم التي يوفرها المشروع.'
          : 'تعذر تهيئة جلسة الحساب. أعد المحاولة، وإذا استمر العطل فتحقق من إعدادات اتصال قاعدة البيانات.',
      );
      setUser(null);
      setReady(true);
      console.error('[AuthProvider] Supabase initialization failed:', cause);
    }
    return () => unsubscribe?.();
  }, [refresh]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    setLoading(true);
    try {
      const normalized = identifier.trim();
      const credentials = normalized.includes("@")
        ? { email: normalized, password }
        : { phone: normalizeAuthPhoneIdentifier(normalized) ?? "", password };
      if ("phone" in credentials && !credentials.phone) {
        throw new Error("أدخل رقماً يمنياً صحيحاً يبدأ بـ7 أو رقماً دولياً بصيغة +رمز الدولة.");
      }
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw new Error(translateAuthError(error.message));
      await refresh();
    } finally { setLoading(false); }
  }, [refresh]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          // Keep the verified invitation token through email confirmation; redirects are limited to this fixed in-app path.
          emailRedirectTo: getAuthEmailRedirectUrl(
            window.location.origin,
            window.location.pathname,
            window.location.search,
          ),
          data: { full_name: fullName.trim() },
        },
      });
      if (error) throw new Error(translateAuthError(error.message));
      if (data.session) await refresh();
      return { needsConfirmation: !data.session };
    } finally { setLoading(false); }
  }, [refresh]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error(translateAuthError(error.message));
    setUser(null);
  }, []);

  const signOutOtherSessions = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOutEverywhere = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw new Error(translateAuthError(error.message));
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, sessionRevision, loading, ready, configurationError, signIn, signUp, resetPassword, signOut, signOutOtherSessions, signOutEverywhere }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
