import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
import { OnyxInventoryReconciliationWorkspace } from "@/components/OnyxInventoryReconciliationWorkspace";

export const Route = createFileRoute("/admin_/data")({
  head: () => ({ meta: [{ title: "مركز البيانات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={<AdminRouteFallback />}>
      <>
        <AdminApp initialView="data" />
        <OnyxInventoryReconciliationWorkspace />
      </>
    </ClientOnly>
  ),
});
