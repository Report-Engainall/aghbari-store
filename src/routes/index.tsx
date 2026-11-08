import { createFileRoute, ClientOnly, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الأغبري | متجر الجملة للمواد الغذائية" },
      { name: "description", content: "متجر الأغبري للتجارة بالجملة: كتالوج المواد الغذائية، أسعار ومخزون مباشر، وطلب سريع للمنشآت." },
      { property: "og:title", content: "الأغبري | Aghbari Commerce" },
      { property: "og:description", content: "متجر الجملة B2B للمواد الغذائية مع أسعار ومخزون مباشر." },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<main className="storefront" dir="rtl" style={{ minHeight: "100vh" }} role="status">جار تحميل المتجر...</main>}>
      <Storefront onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
