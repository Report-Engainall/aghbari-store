import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, SlidersHorizontal } from "lucide-react";
import { fetchCategories } from "@/lib/api";
import { MAX_CATALOG_SEARCH_LENGTH, normalizeCatalogSearchQuery } from "@/lib/commerce-utils";
import { useFetch } from "@/lib/useFetch";

type SearchCategoryOption = {
  id: string;
  name: string;
  parent_id?: string | null;
};

function SearchPageHeader() {
  return (
    <header style={{ marginBottom: 20 }}>
      <Link to="/store" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#087f8d", textDecoration: "none" }}>
        <ArrowLeft size={16} /> العودة للمتجر
      </Link>
      <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 5px" }}>
        <SlidersHorizontal size={25} /> البحث المتقدم
      </h1>
      <p style={{ color: "#526b70", margin: 0 }}>
        تُطبّق الشروط على نتائج الكتالوج نفسه؛ المخزون المجهول لا يُحسب متاحًا في فلتر المتوفر فقط.
      </p>
    </header>
  );
}

function SearchTextField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      اسم الصنف أو رمزه أو الباركود
      <input
        value={value}
        onChange={(event) => onChange(normalizeCatalogSearchQuery(event.target.value))}
        maxLength={MAX_CATALOG_SEARCH_LENGTH}
        autoComplete="off"
        placeholder="مثال: سكر أو SKU-002"
        style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbdad9", borderRadius: 9 }}
      />
    </label>
  );
}

function SearchCategoryOption({ category }: { category: SearchCategoryOption }) {
  return (
    <option value={category.id}>
      {category.parent_id ? "↳ " : ""}{category.name}
    </option>
  );
}

function SearchCategorySelect({
  categories,
  value,
  disabled,
  onChange,
}: {
  categories: SearchCategoryOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      التصنيف
      <select
        id="advanced-storefront-category"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{ width: "100%", padding: 12, border: "1px solid #cbdad9", borderRadius: 9 }}
      >
        <option value="">كل التصنيفات</option>
        {categories.map((category) => <SearchCategoryOption key={category.id} category={category} />)}
      </select>
    </label>
  );
}

function CategoryQueryNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <p role="status">جار تحميل التصنيفات...</p>;
  if (!error) return null;

  return (
    <div role="alert" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }}>تعذر تحميل التصنيفات: {error}. يمكنك البحث بالاسم أو الرمز.</p>
      <button type="button" className="sf-btn-secondary" onClick={onRetry}>
        إعادة تحميل التصنيفات
      </button>
    </div>
  );
}

function SearchAvailabilityField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      عرض الأصناف ذات الرصيد المتاح المعروف فقط
    </label>
  );
}

function SearchFormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert">{message}</p>;
}

function AdvancedSearchForm({
  query,
  categoryId,
  availableOnly,
  formError,
  categoryLoading,
  categoryError,
  categories,
  onQueryChange,
  onCategoryChange,
  onAvailabilityChange,
  onCategoryRetry,
  onSubmit,
}: {
  query: string;
  categoryId: string;
  availableOnly: boolean;
  formError: string;
  categoryLoading: boolean;
  categoryError: string | null;
  categories: SearchCategoryOption[];
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onAvailabilityChange: (checked: boolean) => void;
  onCategoryRetry: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} style={{ background: "#fff", border: "1px solid #dce9e8", borderRadius: 15, padding: 18, display: "grid", gap: 15 }}>
      <SearchTextField value={query} onChange={onQueryChange} />
      <SearchCategorySelect
        categories={categories}
        value={categoryId}
        disabled={categoryLoading || Boolean(categoryError)}
        onChange={onCategoryChange}
      />
      <CategoryQueryNotice loading={categoryLoading} error={categoryError} onRetry={onCategoryRetry} />
      <SearchAvailabilityField checked={availableOnly} onChange={onAvailabilityChange} />
      <SearchFormError message={formError} />
      <button type="submit" className="sf-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
        <Search size={17} /> عرض النتائج
      </button>
    </form>
  );
}

export function AdvancedStorefrontSearchPage() {
  const navigate = useNavigate();
  const categoryQuery = useFetch(fetchCategories);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [formError, setFormError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = normalizeCatalogSearchQuery(query).trim();
    if (!normalizedQuery && !categoryId && !availableOnly) {
      setFormError("أدخل اسمًا أو رمز صنف أو اختر تصنيفًا أو فعّل فلتر المتوفر فقط.");
      return;
    }

    setFormError("");
    void navigate({
      to: "/catalog",
      search: {
        ...(normalizedQuery ? { q: normalizedQuery } : {}),
        ...(categoryId ? { category: categoryId } : {}),
        ...(availableOnly ? { available: "1" as const } : {}),
      },
    });
  }

  const activeCategories = (categoryQuery.data ?? []).filter((category) => category.is_active !== false);

  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 920, margin: "0 auto" }}>
      <SearchPageHeader />
      <AdvancedSearchForm
        query={query}
        categoryId={categoryId}
        availableOnly={availableOnly}
        formError={formError}
        categoryLoading={categoryQuery.loading}
        categoryError={categoryQuery.error}
        categories={activeCategories}
        onQueryChange={setQuery}
        onCategoryChange={setCategoryId}
        onAvailabilityChange={setAvailableOnly}
        onCategoryRetry={() => void categoryQuery.refetch()}
        onSubmit={submit}
      />
    </main>
  );
}
