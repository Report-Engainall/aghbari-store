import { createFileRoute, useLocation } from "@tanstack/react-router";
import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

export const Route = createFileRoute("/category/$slug/subcategory/$subcategorySlug")({
  head: ({ params }) => ({ meta: [{ title: "التصنيف الفرعي | متجر الأغبري", description: "أصناف منشورة ضمن التصنيف الفرعي " + params.subcategorySlug }] }),
  component: SubcategoryPage,
});

function SubcategoryPage() {
  const { pathname } = useLocation();
  const { subcategorySlug } = Route.useParams();
  const segments = pathname.split("/").filter(Boolean);
  let categorySlug = "";
  try {
    categorySlug = segments[0] === "category" && segments[2] === "subcategory"
      ? decodeURIComponent(segments[1] ?? "")
      : "";
  } catch {
    categorySlug = "";
  }
  if (!categorySlug) {
    return <p role="alert" dir="rtl">تعذر تحديد التصنيف المطلوب. ارجع إلى قائمة التصنيفات وحاول مرة أخرى.</p>;
  }
  return <StorefrontCategoryLandingPage categorySlug={categorySlug} subcategorySlug={subcategorySlug} />;
}
