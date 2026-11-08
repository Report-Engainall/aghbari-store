import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { MAX_CATALOG_SEARCH_LENGTH } from "@/lib/commerce-utils";

type CatalogSearch = { q?: string; category?: string; available?: "1" };

export const Route = createFileRoute("/catalog")({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => {
    const parsed: CatalogSearch = {};
    if (typeof search.q === "string" && search.q.trim()) parsed.q = search.q.slice(0, MAX_CATALOG_SEARCH_LENGTH);
    if (typeof search.category === "string" && search.category.trim()) parsed.category = search.category.slice(0, 128);
    if (search.available === "1") parsed.available = "1";
    return parsed;
  },
  head: () => ({
    meta: [
      { title: "الكتالوج | متجر الأغبري" },
      { name: "description", content: "كتالوج حي لأصناف متجر الأغبري مع بحث وتصنيف وفق بيانات الخادم." },
    ],
  }),
  component: CatalogPage,
});

function CatalogLoadingState() {
  return (
    <main className="storefront" dir="rtl" role="status">
      جار تحميل الكتالوج...
    </main>
  );
}

type CatalogStorefrontProps = {
  query: string;
  categoryId?: string;
  availableOnly: boolean;
  onExit: () => void;
};

function CatalogStorefront({ query, categoryId, availableOnly, onExit }: CatalogStorefrontProps) {
  return (
    <Storefront
      initialQuery={query}
      initialCategoryId={categoryId}
      initialAvailableOnly={availableOnly}
      onExit={onExit}
    />
  );
}

function CatalogPage() {
  const navigate = useNavigate();
  const { q, category, available } = Route.useSearch();
  const onExit = () => void navigate({ to: "/admin" });

  return (
    <ClientOnly fallback={<CatalogLoadingState />}>
      <CatalogStorefront
        query={q ?? ""}
        categoryId={category}
        availableOnly={available === "1"}
        onExit={onExit}
      />
    </ClientOnly>
  );
}
