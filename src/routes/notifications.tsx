import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerNotificationCenter } from "@/components/CustomerNotificationCenter";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "التنبيهات | متجر الأغبري" },
      { name: "description", content: "تنبيهات الطلبات والتحديثات المرتبطة بحسابك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل التنبيهات...</main>}>
      <CustomerNotificationCenter />
    </ClientOnly>
  ),
});
