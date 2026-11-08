import { Link } from "@tanstack/react-router";
import { ArrowLeft, BadgePercent, CalendarDays, Package, RefreshCw, Tag } from "lucide-react";
import { fetchProducts, fetchStorefrontPromotions } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useFetch } from "@/lib/useFetch";

type StoreProduct = Awaited<ReturnType<typeof fetchProducts>>[number];
type StorePromotion = Awaited<ReturnType<typeof fetchStorefrontPromotions>>[number];

function OffersPageHeader({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <Link to="/store" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#087f8d", textDecoration: "none" }}>
          <ArrowLeft size={16} /> العودة للمتجر
        </Link>
        <h1 style={{ margin: "12px 0 4px" }}>العروض المنشورة</h1>
        <p style={{ margin: 0, color: "#526b70" }}>
          تعرض هذه الصفحة إعداد الحملات المنشورة من الخادم؛ لا تصنع خصومات أو أسعارًا بديلة عند تعذر بيانات الحملة.
        </p>
      </div>
      <button type="button" className="btn outline" disabled={loading} onClick={onRefresh}>
        <RefreshCw size={15} /> تحديث العروض
      </button>
    </header>
  );
}

function OffersLoadingState() {
  return <div className="sf-empty" role="status">جار تحميل العروض المنشورة…</div>;
}

function OffersErrorState({
  title,
  details,
  onRetry,
}: {
  title: string;
  details: string;
  onRetry: () => void;
}) {
  return (
    <div className="sf-empty" role="alert">
      <strong>{title}</strong>
      <small>{details}</small>
      <button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button>
    </div>
  );
}

function OffersEmptyState() {
  return (
    <div className="sf-empty" role="status">
      <Tag size={26} />
      <strong>لا توجد عروض منشورة حاليًا</strong>
      <small>لم يُرجع الخادم حملات فعالة ضمن نافذة النشر الحالية.</small>
      <Link to="/catalog">تصفح الكتالوج</Link>
    </div>
  );
}

function promotionDiscountLabel(promotion: StorePromotion): string {
  const value = Number(promotion.discount_value);
  if (!Number.isFinite(value) || value <= 0) return "تفاصيل الخصم غير متاحة";
  if (promotion.discount_type === "percentage") return "نسبة مسجلة: " + formatNumber(value) + "%";
  if (promotion.discount_type === "fixed") return "قيمة خصم ثابتة مسجلة: " + formatCurrency(value);
  return "نوع الخصم المسجل: " + promotion.discount_type;
}

function promotionProducts(promotion: StorePromotion, products: StoreProduct[]): StoreProduct[] {
  const productIds = promotion.product_ids ?? [];
  const categoryIds = promotion.category_ids ?? [];
  return products.filter((product) => {
    if (product.is_active === false || product.status === "inactive") return false;
    if (productIds.includes(product.id)) return true;
    return product.category_id !== null && categoryIds.includes(product.category_id);
  });
}

function OfferIncludedProductItem({ product }: { product: StoreProduct }) {
  return <li>{product.name} · {product.item_code}</li>;
}

function OfferIncludedProducts({
  targetProducts,
  hasExplicitScope,
}: {
  targetProducts: StoreProduct[];
  hasExplicitScope: boolean;
}) {
  if (targetProducts.length > 0) {
    return (
      <div>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800 }}>
          <Package size={16} /> الأصناف المشمولة في سجل الحملة
        </span>
        <ul>
          {targetProducts.slice(0, 5).map((product) => (
            <OfferIncludedProductItem key={product.id} product={product} />
          ))}
        </ul>
        {targetProducts.length > 5 ? (
          <small>عُرضت أول 5 أصناف من أصل {formatNumber(targetProducts.length)}.</small>
        ) : null}
      </div>
    );
  }

  if (hasExplicitScope) {
    return <p role="status">نطاق الحملة موجود لكن أصنافه غير متاحة ضمن الكتالوج المنشور للحساب الحالي.</p>;
  }

  return <p>النطاق المحدد في سجل الحملة لا يحتوي على قائمة أصناف أو تصنيفات صريحة.</p>;
}

function OfferCard({
  promotion,
  products,
}: {
  promotion: StorePromotion;
  products: StoreProduct[];
}) {
  const productIds = promotion.product_ids ?? [];
  const categoryIds = promotion.category_ids ?? [];
  const targetProducts = promotionProducts(promotion, products);

  return (
    <article style={{ border: "1px solid #eadfbf", background: "#fffdf7", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#805f1a" }}>
        <BadgePercent size={22} /> <strong>حملة منشورة</strong>
      </div>
      <h2 style={{ fontSize: 19, margin: 0 }}>{promotion.title}</h2>
      <p style={{ margin: 0, color: "#526b70" }}>
        {promotion.description || "لا يوجد وصف إضافي محفوظ للحملة."}
      </p>
      <strong>{promotionDiscountLabel(promotion)}</strong>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#526b70", fontSize: 13 }}>
        <CalendarDays size={15} />
        <span>الفترة المسجلة: {promotion.start_date} — {promotion.end_date}</span>
      </div>
      <OfferIncludedProducts
        targetProducts={targetProducts}
        hasExplicitScope={productIds.length > 0 || categoryIds.length > 0}
      />
      <Link to="/catalog" style={{ marginTop: "auto", textDecoration: "none", color: "#087f8d", fontWeight: 800, display: "inline-flex", gap: 7, alignItems: "center" }}>
        استعراض الكتالوج <ArrowLeft size={15} />
      </Link>
    </article>
  );
}

function OfferList({ promotions, products }: { promotions: StorePromotion[]; products: StoreProduct[] }) {
  return (
    <section aria-label="قائمة العروض المنشورة" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 14 }}>
      {promotions.map((promotion) => (
        <OfferCard key={promotion.id} promotion={promotion} products={products} />
      ))}
    </section>
  );
}

function OfferPricingDisclosure() {
  return (
    <p style={{ marginTop: 18, borderTop: "1px solid #e2eaea", paddingTop: 12, color: "#526b70", fontSize: 13 }}>
      الخصم الفعلي وسعر الفئة يُحسبان على الخادم عند إرسال الطلب، وتُحفظ لقطة الخصم على بنوده؛ ويخضع الخصم لمطابقة الحملة وحدود التكلفة، لذلك لا تمثل قيمة إعداد الحملة وحدها سعر الفاتورة النهائي.
    </p>
  );
}

export function StorefrontOffersPage() {
  const promotionsQuery = useFetch(fetchStorefrontPromotions);
  const productsQuery = useFetch(fetchProducts);
  const promotions = (promotionsQuery.data ?? []).filter((promotion) => promotion.is_active);
  const products = productsQuery.data ?? [];
  const loading = promotionsQuery.loading || productsQuery.loading;
  const error = promotionsQuery.error || productsQuery.error;
  const errorTitle = promotionsQuery.error && productsQuery.error
    ? "تعذر تحميل العروض والكتالوج"
    : promotionsQuery.error ? "تعذر تحميل العروض" : "تعذر تحميل كتالوج المنتجات";
  const errorDetails = [
    promotionsQuery.error ? "العروض: " + promotionsQuery.error : null,
    productsQuery.error ? "الكتالوج: " + productsQuery.error : null,
  ].filter((detail): detail is string => detail !== null).join(" — ");
  const refresh = () => {
    void promotionsQuery.refetch();
    void productsQuery.refetch();
  };

  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1180, margin: "0 auto" }}>
      <OffersPageHeader loading={loading} onRefresh={refresh} />
      {loading ? <OffersLoadingState /> : null}
      {!loading && error ? <OffersErrorState title={errorTitle} details={errorDetails || error} onRetry={refresh} /> : null}
      {!loading && !error && promotions.length === 0 ? <OffersEmptyState /> : null}
      {!loading && !error && promotions.length > 0 ? (
        <OfferList promotions={promotions} products={products} />
      ) : null}
      <OfferPricingDisclosure />
    </main>
  );
}
