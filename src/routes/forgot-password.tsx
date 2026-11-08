import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/Login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور | الأغبري" },
      { name: "description", content: "اطلب رابطاً آمناً لإعادة تعيين كلمة مرور حسابك." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل استعادة كلمة المرور...</main>}>
      <Login initialMode="forgot" />
    </ClientOnly>
  );
}
