import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { AdminApp } from '@/components/AghbariApp';

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute('/admin_/inventory-transfers')({
  head: () => ({ meta: [{ title: 'سجل تحويلات المخزون | متجر الأغبري' }, { name: 'robots', content: 'noindex' }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="inventory-transfers" /></ClientOnly>,
});
