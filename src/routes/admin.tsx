import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة تحكم الأغبري | مركز التشغيل" },
      { name: "description", content: "لوحة إدارة الأغبري: الطلبات والمنتجات والعملاء والتسعير والمخزون والتقارير." },
      { property: "og:title", content: "لوحة تحكم الأغبري" },
      { property: "og:description", content: "مركز تشغيل منصة الأغبري للتجارة بالجملة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp /></ClientOnly>,
});
