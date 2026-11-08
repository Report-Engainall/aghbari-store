import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerActivationInvitationPage } from "@/components/CustomerActivationInvitationPage";

export const Route = createFileRoute("/customer/activate/$token")({
  head: () => ({
    meta: [
      { title: "تفعيل حساب العميل | متجر الأغبري" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: CustomerActivationRoutePage,
});

function CustomerActivationRoutePage() {
  const { token } = Route.useParams();
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جارٍ التحقق من رابط التفعيل...</main>}>
      <CustomerActivationInvitationPage token={token} />
    </ClientOnly>
  );
}
