import { Fragment, useMemo, useState } from "react";
import {
  ADMIN_ACCESS_ROLES, ADMIN_NAV_GROUPS, ADMIN_OPERATION_RULES,
  pageAccessReason, operationAllowed, operationDenialReason,
  type AdminRoleId, type AdminViewId,
} from "@/lib/admin-access-matrix";

type MatrixMode = "all" | "single";

const VIEW_LABELS: Record<string, string> = {
  dashboard: "لوحة المعلومات", products: "المنتجات", customers: "العملاء",
  "service-desk": "خدمة العملاء", orders: "الطلبات", pricing: "التسعير والمخزون",
  "stock-count": "الجرد الفعلي", "inventory-transfers": "تحويلات المخزون",
  offers: "العروض", suppliers: "الموردون", "purchase-orders": "أوامر الشراء",
  devices: "الأجهزة والجلسات", reports: "التقارير",
  intelligence: "ذكاء الأعمال والتحصيلات", ai: "مركز الذكاء", notifications: "التنبيهات",
  data: "مركز البيانات", operations: "العمليات الذكية", settings: "الإعدادات",
  quotes: "عروض الأسعار", finance: "الفواتير والتحصيل",
  tasks: "المهام التشغيلية والطباعة", audit: "سجل التدقيق",
};

function StatusLabel({ allowed }: { allowed: boolean }) {
  return (
    <span className={allowed
      ? "inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
      : "inline-flex whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800"}>
      {allowed ? "مسموح" : "ممنوع"}
    </span>
  );
}

function ComparisonCell({
  allowed,
  detail,
  testId,
}: {
  allowed: boolean;
  detail: string;
  testId: string;
}) {
  return (
    <td data-testid={testId} className="min-w-40 border-t p-3 align-top">
      <StatusLabel allowed={allowed} />
      <p className="mt-2 max-w-64 whitespace-normal text-xs leading-5 text-slate-600">{detail}</p>
    </td>
  );
}

function AllRolesComparison({ views }: { views: readonly AdminViewId[] }) {
  const rolePageCounts = useMemo(() => Object.fromEntries(ADMIN_ACCESS_ROLES.map((role) => [
    role.id,
    views.filter((view) => pageAccessReason(role.id, view).startsWith("مسموح")).length,
  ])) as Record<AdminRoleId, number>, [views]);

  const roleOperationCounts = useMemo(() => Object.fromEntries(ADMIN_ACCESS_ROLES.map((role) => [
    role.id,
    ADMIN_OPERATION_RULES.filter((item) => operationAllowed(role.id, item.id)).length,
  ])) as Record<AdminRoleId, number>, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_ACCESS_ROLES.map((role) => (
          <article key={role.id} className="rounded-lg border bg-white p-3">
            <h3 className="font-semibold">{role.label}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">{role.summary}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span><strong className="tabular-nums">{rolePageCounts[role.id]}</strong> مساحة من {views.length}</span>
              <span><strong className="tabular-nums">{roleOperationCounts[role.id]}</strong> عملية من {ADMIN_OPERATION_RULES.length}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">النطاق: {role.scope}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3" aria-labelledby="all-role-pages-title">
        <div>
          <h3 id="all-role-pages-title" className="font-semibold">مقارنة الوصول إلى الصفحات</h3>
          <p className="mt-1 text-xs text-slate-500">كل صف يمثل مساحة إدارية؛ سبب المنع ظاهر في خلية الدور غير المسموح له.</p>
        </div>
        <div role="region" aria-label="جدول مقارنة الوصول إلى الصفحات حسب الدور" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <table aria-label="مصفوفة وصول الصفحات حسب الدور" className="min-w-[1180px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-right">
              <tr>
                <th scope="col" className="sticky right-0 z-10 min-w-52 bg-slate-50 p-3">المساحة</th>
                {ADMIN_ACCESS_ROLES.map((role) => <th scope="col" key={role.id} className="min-w-40 p-3">{role.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ADMIN_NAV_GROUPS.map((group) => (
                <Fragment key={group.id}>
                  <tr className="bg-slate-100">
                    <th scope="rowgroup" colSpan={ADMIN_ACCESS_ROLES.length + 1} className="p-2 text-right text-xs font-bold text-slate-700">{group.label}</th>
                  </tr>
                  {group.views.map((view) => (
                    <tr key={view}>
                      <th scope="row" className="sticky right-0 z-10 border-t bg-white p-3 text-right font-medium">{VIEW_LABELS[view] ?? view}</th>
                      {ADMIN_ACCESS_ROLES.map((role) => {
                        const reason = pageAccessReason(role.id, view);
                        const allowed = reason.startsWith("مسموح");
                        return (
                          <ComparisonCell
                            key={role.id}
                            testId={`page-${view}-${role.id}`}
                            allowed={allowed}
                            detail={allowed ? "الوصول متاح ضمن نطاق الدور." : reason}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="all-role-operations-title">
        <div>
          <h3 id="all-role-operations-title" className="font-semibold">مقارنة العمليات وحدود التعديل</h3>
          <p className="mt-1 text-xs text-slate-500">تعرض حدود الأسعار والمخزون والمالية، وما يمنع كل دور من تنفيذ العملية.</p>
        </div>
        <div role="region" aria-label="جدول مقارنة العمليات وحدودها حسب الدور" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <table aria-label="مصفوفة العمليات وحدودها حسب الدور" className="min-w-[1180px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-right">
              <tr>
                <th scope="col" className="sticky right-0 z-10 min-w-64 bg-slate-50 p-3">العملية / المجال</th>
                {ADMIN_ACCESS_ROLES.map((role) => <th scope="col" key={role.id} className="min-w-40 p-3">{role.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ADMIN_OPERATION_RULES.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="sticky right-0 z-10 border-t bg-white p-3 text-right">
                    <strong>{item.label}</strong>
                    <span className="mt-1 block text-xs font-normal text-slate-500">{item.area}</span>
                  </th>
                  {ADMIN_ACCESS_ROLES.map((role) => {
                    const allowed = operationAllowed(role.id, item.id);
                    return (
                      <ComparisonCell
                        key={role.id}
                        testId={`operation-${item.id}-${role.id}`}
                        allowed={allowed}
                        detail={allowed ? item.limit : operationDenialReason(role.id, item.id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SingleRoleDetails({ selectedRole }: { selectedRole: AdminRoleId }) {
  const role = ADMIN_ACCESS_ROLES.find((item) => item.id === selectedRole) ?? ADMIN_ACCESS_ROLES[0];
  const pages = useMemo(() => ADMIN_NAV_GROUPS.flatMap((group) => group.views.map((view) => {
    const reason = pageAccessReason(selectedRole, view);
    return { group: group.label, view, reason, allowed: reason.startsWith("مسموح") };
  })), [selectedRole]);
  const allowedPages = pages.filter((item) => item.allowed).length;
  const allowedOperations = ADMIN_OPERATION_RULES.filter((item) => operationAllowed(selectedRole, item.id)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">الدور</p><strong>{role.label}</strong><p className="mt-1 text-xs text-slate-600">{role.scope}</p></article>
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">المساحات المتاحة</p><strong className="text-2xl tabular-nums">{allowedPages}</strong><p className="text-xs text-slate-600">من {pages.length} مساحة إدارية</p></article>
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">العمليات المتاحة</p><strong className="text-2xl tabular-nums">{allowedOperations}</strong><p className="text-xs text-slate-600">من {ADMIN_OPERATION_RULES.length} عملية موثقة</p></article>
      </div>

      <section className="space-y-3" aria-label="الصفحات المتاحة والممنوعة">
        <h3 className="font-semibold">الوصول إلى الصفحات</h3>
        {ADMIN_NAV_GROUPS.map((group) => <div key={group.id} className="rounded-lg border p-3">
          <h4 className="mb-2 text-sm font-semibold">{group.label}</h4>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pages.filter((item) => item.group === group.label).map((item) => (
              <article key={item.view} data-testid={`single-page-${item.view}`} className="rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between gap-2"><strong>{VIEW_LABELS[item.view] ?? item.view}</strong><StatusLabel allowed={item.allowed} /></div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.allowed ? "الوصول متاح ضمن نطاق الدور." : item.reason}</p>
              </article>
            ))}
          </div>
        </div>)}
      </section>

      <section className="space-y-3" aria-label="العمليات وحدود التعديل">
        <h3 className="font-semibold">العمليات وحدود تعديل الأسعار والمخزون والمالية</h3>
        <div role="region" aria-label="جدول عمليات الدور المحدد وحدوده" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-right"><tr><th className="p-3">المجال / العملية</th><th className="p-3">القرار</th><th className="p-3">الحد أو سبب الرفض</th></tr></thead>
            <tbody>{ADMIN_OPERATION_RULES.map((item) => {
              const allowed = operationAllowed(selectedRole, item.id);
              return <tr key={item.id} className="border-t align-top">
                <td className="p-3"><strong>{item.label}</strong><span className="mt-1 block text-xs text-slate-500">{item.area}</span></td>
                <td className="p-3"><StatusLabel allowed={allowed} /></td>
                <td className="max-w-xl p-3 leading-6 text-slate-700">{allowed ? item.limit : operationDenialReason(selectedRole, item.id)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function AdminAccessMatrix() {
  const [selectedRole, setSelectedRole] = useState<AdminRoleId>("admin");
  const [mode, setMode] = useState<MatrixMode>("all");

  return (
    <section dir="rtl" className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="admin-access-matrix-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-access-matrix-title" className="text-lg font-semibold">مصفوفة الوصول والعمليات حسب الدور</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            مقارنة موحدة لكل الأدوار وصفحاتها وعملياتها وحدودها. هذا عرض تفسيري لا ينشئ دورًا ولا يمنح صلاحية؛
            الخادم وواجهات RPC وسياسات RLS هي المرجع التنفيذي النهائي.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={mode === "all"} className={mode === "all" ? "btn primary" : "btn btn-outline"}
            onClick={() => setMode("all")}>مقارنة جميع الأدوار</button>
          <button type="button" aria-pressed={mode === "single"} className={mode === "single" ? "btn primary" : "btn btn-outline"}
            onClick={() => setMode("single")}>تفاصيل دور واحد</button>
        </div>
      </header>

      {mode === "single" && (
        <label className="grid max-w-xs gap-1 text-sm font-medium">
          الدور محل المراجعة
          <select aria-label="الدور محل المراجعة" className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as AdminRoleId)}>
            {ADMIN_ACCESS_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}

      {mode === "all"
        ? <AllRolesComparison views={ADMIN_NAV_GROUPS.flatMap((group) => group.views)} />
        : <SingleRoleDetails selectedRole={selectedRole} />}

      <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        أسباب المنع هنا خاصة بنطاق الدور. قد يرفض الخادم عملية مسموحة للدور بسبب المؤسسة أو المستودع أو حالة السجل أو الموافقة أو نقص السبب؛
        عندها تكون رسالة الخادم هي السبب التشغيلي الدقيق، ولا يجوز تفسير السماح في هذه المصفوفة كتجاوز لتلك الشروط.
      </p>
    </section>
  );
}
