import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Login } from "@/components/Login";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "إنشاء حساب تجاري | الأغبري" },
      { name: "description", content: "أنشئ حسابك التجاري في متجر الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل إنشاء الحساب...</main>}>
      <Login initialMode="register" onDone={() => void navigate({ to: "/" })} />
    </ClientOnly>
  );
}
