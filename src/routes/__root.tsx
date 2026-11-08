import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { RefreshCw, X } from "lucide-react";
import appCss from "../styles.css?url";
import { reportRuntimeError } from "../lib/runtime-error-reporting";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BUSINESS_BRAND_NAME, BUSINESS_META_DESCRIPTION, BUSINESS_PWA_THEME_COLOR } from "@/lib/brand";
import { clearLegacyOfflineCatalogCache, clearOfflineCatalogCache } from "@/lib/offline-catalog-cache";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportRuntimeError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          تعذر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ غير متوقع. حاول مرة أخرى أو عد للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { title: BUSINESS_BRAND_NAME },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: BUSINESS_BRAND_NAME },
      { name: "description", content: BUSINESS_META_DESCRIPTION },
      { name: "theme-color", content: BUSINESS_PWA_THEME_COLOR },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: BUSINESS_BRAND_NAME },
      { property: "og:title", content: BUSINESS_BRAND_NAME },
      { property: "og:description", content: BUSINESS_META_DESCRIPTION },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: BUSINESS_BRAND_NAME },
      { name: "twitter:description", content: BUSINESS_META_DESCRIPTION },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthHealthNotice() {
  const { configurationError } = useAuth();
  if (!configurationError) return null;
  return (
    <div role="alert" dir="rtl" style={{
      position: "relative", zIndex: 1000, padding: "12px 16px",
      background: "#fff3cd", color: "#664d03", borderBottom: "1px solid #ffecb5",
      fontFamily: "Cairo, system-ui, sans-serif", fontSize: 14, lineHeight: 1.8,
    }}>
      <strong>تعذر الاتصال بالخدمات الخلفية.</strong>
      <span style={{ marginInlineStart: 8 }}>{configurationError}</span>
    </div>
  );
}

// Use layout effects in the browser so cached private data is removed before the next identity can paint;
 // fall back to a passive effect during SSR.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AuthScopedOutlet() {
  const { user, sessionRevision = 0 } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const effectiveRoles: string[] = user && Array.isArray(user.roles)
    ? user.roles.filter((role): role is string => typeof role === "string")
    : [];
  const identityScopeKey = user
    ? [user.id, user.profileId, user.isStaff ? "staff" : "customer", [...effectiveRoles].sort().join("\u001e")].join("\u001f")
    : "anonymous";
  // A refreshed session may change server-derived organization/warehouse access while the
  // profile and role tuple stays identical. Include the revision in the boundary key so cached
  // queries and route-local state are cleared before that scope is allowed to paint.
  const identityKey = [identityScopeKey, "session", sessionRevision].join("\u001f");
  const previousIdentityKey = useRef<string | undefined>(undefined);
  const previousIdentityScopeKey = useRef<string | undefined>(undefined);
  const previousProfileId = useRef<string | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    const previous = previousIdentityKey.current;
    const previousScope = previousIdentityScopeKey.current;
    const departingProfileId = previousProfileId.current;
    previousIdentityKey.current = identityKey;
    previousIdentityScopeKey.current = identityScopeKey;
    previousProfileId.current = user?.profileId;
    if (previous === undefined || previous === identityKey) return;

    // A session revision can change server-derived tenant access without changing profile/roles.
    // When offline we cannot revalidate that scope, so invalidate the last cached catalog before paint.
    if (
      typeof window !== "undefined" &&
      (previousScope !== identityScopeKey || !navigator.onLine)
    ) {
      clearLegacyOfflineCatalogCache(window.localStorage);
      if (departingProfileId) {
        clearOfflineCatalogCache(window.localStorage, departingProfileId);
      }
      // Neither the departing nor the incoming profile's previously cached catalog
      // can be re-authorized while offline after an identity/session boundary.
      if (!navigator.onLine && user?.profileId) {
        clearOfflineCatalogCache(window.localStorage, user.profileId);
      }
    }

    // TanStack Query data and mutation state may contain tenant-specific finance or inventory results.
    // Drop all cached query state and force active route loaders to re-check the new auth context.
    queryClient.clear();
    void router.invalidate().catch(() => undefined);
  }, [identityKey, identityScopeKey, user?.profileId, queryClient, router]);

  // Remount active route-local state on logout, account switch, profile change or effective-role change.
  return <Outlet key={identityKey} />;
}


const ROOT_NAV_ITEMS = [
  ["/", "المتجر"],
  ["/orders", "طلباتي"],
  ["/returns", "مرتجعاتي"],
  ["/payments", "دفعاتي"],
  ["/help", "المساعدة"],
  ["/admin", "لوحة الإدارة"],
  ["/profile", "الحساب"],
] as const;

type RootNavigationItem = typeof ROOT_NAV_ITEMS[number];

function RootNavigationLink({ item }: { item: RootNavigationItem }) {
  return (
    <Link
      to={item[0]}
      activeOptions={{ exact: item[0] === "/" }}
      style={{ color: "var(--background, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" }}
      activeProps={{ style: { background: "var(--primary, #0e7c66)", color: "var(--primary-foreground, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" } }}
    >
      {item[1]}
    </Link>
  );
}

function RootNavigation() {
  const { user } = useAuth();
  return (
    <nav className="no-print" aria-label="التنقل الرئيسي" style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", padding: "6px 10px", background: "var(--foreground, #0f172a)", fontSize: 13 }}>
      {ROOT_NAV_ITEMS.map((item) => <RootNavigationLink key={item[0]} item={item} />)}
      {user?.roles?.includes("customer") ? (
        <a href="/service-cases" style={{ color: "var(--background, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" }}>خدمة العملاء</a>
      ) : null}
      {user ? (
        <a
          href="/notifications"
          style={{ color: "var(--background, #fff)", padding: "4px 12px", borderRadius: 999, textDecoration: "none" }}
        >
          التنبيهات
        </a>
      ) : null}
    </nav>
  );
}

type DeferredPwaInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredPwaInstallPrompt | null>(null);
  const reloadAfterControllerChange = useRef(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredPwaInstallPrompt);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let mounted = true;
    let activeRegistration: ServiceWorkerRegistration | null = null;

    const announceWaitingWorker = () => {
      if (!mounted || !activeRegistration?.waiting || !navigator.serviceWorker.controller) return;
      setRegistration(activeRegistration);
      setAvailable(true);
    };

    const onUpdateFound = () => {
      const installing = activeRegistration?.installing;
      if (!installing) return;
      const onStateChange = () => {
        if (installing.state === "installed") announceWaitingWorker();
      };
      installing.addEventListener("statechange", onStateChange);
    };

    const onControllerChange = () => {
      if (reloadAfterControllerChange.current && typeof window !== "undefined") {
        window.location.reload();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRegistration) {
        void activeRegistration.update().catch(() => undefined);
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void navigator.serviceWorker.register("/sw.js")
      .then((nextRegistration) => {
        if (!mounted) return;
        activeRegistration = nextRegistration;
        setRegistration(nextRegistration);
        nextRegistration.addEventListener("updatefound", onUpdateFound);
        announceWaitingWorker();
        if (document.visibilityState === "visible") {
          void nextRegistration.update().catch(() => undefined);
        }
      })
      .catch(() => {
        // PWA registration failure must not block the storefront.
      });

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      activeRegistration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  function applyUpdate() {
    if (!registration?.waiting || applying) return;
    setApplying(true);
    reloadAfterControllerChange.current = true;
    registration.waiting.postMessage({ type: "AGHBARI_ACTIVATE_UPDATE" });
  }

  async function installApp() {
    const deferred = installPrompt;
    if (!deferred) return;
    setInstallPrompt(null);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // The browser may dismiss or reject its native installation prompt.
    }
  }

  const hasWaitingUpdate = available && Boolean(registration?.waiting);
  if (!hasWaitingUpdate && !installPrompt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="no-print"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "#e8f3ed",
        color: "#164734",
        borderBottom: "1px solid #b8d6c6",
        fontFamily: "Cairo, system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {installPrompt ? (
        <>
          <span>ثبّت متجر الأغبري على جهازك للوصول إليه كتطبيق.</span>
          <button
            type="button"
            onClick={() => void installApp()}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-800 px-3 py-2 font-semibold text-white"
          >
            تثبيت التطبيق
          </button>
        </>
      ) : null}
      {hasWaitingUpdate ? (
        <>
          <span>تحديث جديد لمتجر الأغبري جاهز. احفظ العمل الجاري قبل التحديث؛ سيُعاد تحميل الصفحة بعد تفعيل النسخة الجديدة.</span>
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applying}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-800 px-3 py-2 font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw size={15}/>
            {applying ? "جارٍ تطبيق التحديث..." : "تحديث التطبيق"}
          </button>
          <button
            type="button"
            onClick={() => setAvailable(false)}
            disabled={applying}
            aria-label="تأجيل تحديث التطبيق"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/30 px-2 py-2 disabled:opacity-60"
          >
            <X size={14}/>
            لاحقاً
          </button>
        </>
      ) : null}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AuthProvider>
        <PwaUpdatePrompt />
        <AuthHealthNotice />
        <RootNavigation />
        <AuthScopedOutlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
