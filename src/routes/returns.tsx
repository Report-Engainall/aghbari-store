import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerReturnsPage } from "@/components/CustomerReturnsPage";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "مرتجعاتي | الأغبري" },
      { name: "description", content: "متابعة طلبات الإرجاع المسجلة على طلبات حسابك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل سجل المرتجعات...</main>}>
      <CustomerReturnsPage />
    </ClientOnly>
  ),
});
