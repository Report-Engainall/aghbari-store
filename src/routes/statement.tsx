import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { CustomerStatementPage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/statement")({
  head: () => ({ meta: [{ title: "كشف الحساب | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل كشف الحساب...</main>}><CustomerStatementPage /></ClientOnly>,
});
