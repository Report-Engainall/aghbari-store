import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AsyncExportCenter } from "@/components/AsyncExportCenter";

export const Route = createFileRoute("/admin_/exports")({
  head: () => ({ meta: [{ title: "تصدير الطلبات | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={
      <main dir="rtl" role="status" aria-live="polite" className="mx-auto max-w-7xl p-6">
        جارٍ تهيئة مركز تصدير الطلبات…
      </main>
    }>
      <AsyncExportCenter />
    </ClientOnly>
  ),
});
