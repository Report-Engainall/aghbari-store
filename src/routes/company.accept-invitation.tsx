import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CompanyInvitationAcceptancePage } from "@/components/CustomerCompanyMembers";

function InvitationRouteLoadingState() {
  return (
    <div className="storefront" dir="rtl" role="status">
      جارٍ التحقق من الدعوة...
    </div>
  );
}

function CompanyInvitationRoute() {
  return (
    <ClientOnly fallback={<InvitationRouteLoadingState />}>
      <CompanyInvitationAcceptancePage />
    </ClientOnly>
  );
}

export const Route = createFileRoute("/company/accept-invitation")({
  head: () => ({
    meta: [
      { title: "قبول دعوة الشركة | الأغبري" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: CompanyInvitationRoute,
});
