import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CustomerAccountPasswordPage } from "@/components/CustomerAccountPasswordPage";

export const Route = createFileRoute("/account/password")({
  head: () => ({
    meta: [
      { title: "تغيير كلمة المرور | متجر الأغبري" },
      { name: "description", content: "تحديث كلمة مرور الحساب الحالي بأمان." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل إعدادات كلمة المرور...</main>}>
      <CustomerAccountPasswordPage />
    </ClientOnly>
  ),
});
