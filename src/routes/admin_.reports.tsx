import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";

export const Route = createFileRoute("/admin_/reports")({
  head: () => ({ meta: [{ title: "التقارير | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly
      fallback={
        <main className="storefront" dir="rtl" role="status" aria-live="polite">
          جار تحميل التقارير...
        </main>
      }
    >
      <div>
        <div dir="rtl" className="mx-auto max-w-6xl px-4 pt-4">
          <a href="/admin/exports" className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            مركز تصدير الطلبات CSV
          </a>
        </div>
        <AdminApp initialView="reports" />
      </div>
    </ClientOnly>
  ),
});
