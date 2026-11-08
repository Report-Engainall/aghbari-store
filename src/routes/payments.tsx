import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerPaymentsPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "دفعاتي | الأغبري" },
      { name: "description", content: "عرض حركات الدفعات المسجلة في دفتر حسابك بمتجر الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل سجل الدفعات...</main>}>
      <CustomerPaymentsPage />
    </ClientOnly>
  ),
});
