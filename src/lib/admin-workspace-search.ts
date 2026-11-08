import { supabase } from "@/lib/supabase";

export type AdminWorkspaceSearchKind = "product" | "customer" | "order" | "supplier" | "invoice" | "decision" | "audit" | "purchase_order" | "task" | "import";
export type AdminWorkspaceSearchItem = {
  id: string;
  kind: AdminWorkspaceSearchKind;
  title: string;
  subtitle: string;
  status: string | null;
  route: string;
  createdAt: string | null;
};

const ROUTES: Record<AdminWorkspaceSearchKind, string> = {
  product: "/admin/products",
  customer: "/admin/customers",
  order: "/admin/orders",
  supplier: "/admin/suppliers",
  invoice: "/admin/finance",
  decision: "/admin/intelligence",
  audit: "/admin/audit",
  purchase_order: "/admin/purchase-orders",
  task: "/admin/tasks",
  import: "/admin/data",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseSearchItem(value: unknown): AdminWorkspaceSearchItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim() ||
      typeof value.kind !== "string" || !Object.prototype.hasOwnProperty.call(ROUTES, value.kind) ||
      typeof value.title !== "string" || !value.title.trim() ||
      typeof value.subtitle !== "string") return null;
  const kind = value.kind as AdminWorkspaceSearchKind;
  if (value.route !== ROUTES[kind]) return null;
  if (value.status !== null && typeof value.status !== "string") return null;
  if (value.created_at !== null && typeof value.created_at !== "string") return null;
  return {
    id: value.id, kind, title: value.title, subtitle: value.subtitle,
    status: value.status as string | null, route: ROUTES[kind], createdAt: value.created_at as string | null,
  };
}

/** Read-only, bounded reference search. Financial values and protected record payloads are never returned. */
export async function searchAdminWorkspaceRecords(query: string, limit = 30): Promise<AdminWorkspaceSearchItem[]> {
  if (typeof query !== "string") throw new Error("عبارة البحث غير صالحة.");
  const normalized = query.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length < 2) return [];
  if (normalized.length > 120) throw new Error("عبارة البحث تتجاوز الحد المسموح (120 حرفًا).");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("حجم نتائج البحث خارج النطاق المسموح.");

  const { data, error } = await supabase.rpc("search_admin_workspace", {
    p_query: normalized, p_limit: limit,
  });
  if (error) throw new Error(error.message || "تعذر تنفيذ البحث الموحد.");
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("أعاد الخادم نتيجة بحث غير مكتملة.");
  if (data.items.length > limit) throw new Error("تجاوزت نتيجة البحث الحد المطلوب.");
  const items = data.items.map(parseSearchItem);
  if (items.some((item) => item === null)) throw new Error("تحتوي نتيجة البحث على مرجع غير صالح؛ لم تُعرض النتائج الجزئية.");
  return items as AdminWorkspaceSearchItem[];
}
