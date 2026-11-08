import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => ({ meta: [{ title: "التصنيف | متجر الأغبري", description: "أصناف منشورة ضمن التصنيف " + params.slug }] }),
  component: CategorySlugPage,
});

function CategorySlugPage() {
  const { slug } = Route.useParams();
  const { pathname } = useLocation();

  // The child category route is nested under /category/$slug in the file-route tree.
  // Render the nested outlet when the URL targets a child, otherwise render the parent
  // landing page. Without the outlet the parent route masks the child page on direct links.
  if (pathname.includes("/subcategory/")) return <Outlet />;
  return <StorefrontCategoryLandingPage categorySlug={slug} />;
}
