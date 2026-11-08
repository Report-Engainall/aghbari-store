import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { QuoteWorkspacePage } from "@/components/CustomerWorkflows";

export const Route = createFileRoute("/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل عروض الأسعار...</main>}><QuoteWorkspacePage /></ClientOnly>,
});
