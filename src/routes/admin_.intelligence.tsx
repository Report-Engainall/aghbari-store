import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin_/intelligence")({
  head: () => ({
    meta: [
      { title: "ذكاء الأعمال والتحصيلات | متجر الأغبري" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="intelligence" /></ClientOnly>,
});
