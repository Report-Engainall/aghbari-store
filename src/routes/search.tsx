import { ClientOnly, createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { MAX_CATALOG_SEARCH_LENGTH } from "@/lib/commerce-utils";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.q === "string" && search.q.trim()
      ? { q: search.q.slice(0, MAX_CATALOG_SEARCH_LENGTH) }
      : {},
  head: () => ({
    meta: [
      {
        title: "البحث | متجر الأغبري",
        description: "ابحث بالاسم أو رمز الصنف ضمن الكتالوج المنشور.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { q } = Route.useSearch();

  // Vite may nest /search/advanced under this file-based route. Render the
  // nested page there, while keeping /search itself as the existing Storefront.
  const isSearchIndex = location.pathname.replace(/\/+$/, "") === "/search";
  if (!isSearchIndex) return <Outlet />;

  return (
    <ClientOnly
      fallback={
        <main className="storefront" dir="rtl" role="status">
          جار فتح البحث…
        </main>
      }
    >
      <Storefront
        initialQuery={q ?? ""}
        onExit={() => void navigate({ to: "/admin" })}
      />
    </ClientOnly>
  );
}
