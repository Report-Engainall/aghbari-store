import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { ReorderWorkspacePage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/reorder")({
  head: () => ({ meta: [{ title: "إعادة الطلب | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل قائمة إعادة الطلب...</main>}><ReorderWorkspacePage /></ClientOnly>,
});
