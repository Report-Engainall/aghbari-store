import { getCurrentTenantScope, supabase } from './supabase';

export type CustomerDirectoryRequest = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export interface CustomerDirectoryRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  customer_code: string | null;
  tier: string | null;
  current_balance?: number | null;
  credit_limit?: number | null;
  status: string;
  created_at: string;
  profile_id?: string | null;
}

export type CustomerDirectoryPage = {
  rows: CustomerDirectoryRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CUSTOMER_DIRECTORY_COLUMNS = 'id,business_name,contact_name,phone,email,customer_code,tier,current_balance,credit_limit,status,created_at,profile_id';

/**
 * The customer-manager RPC is expected to return a non-financial projection.
 * Enforce the same boundary in the client in case a future SQL change adds columns
 * accidentally. Do not replace omitted financial values with zero: they are not
 * part of this role's data contract.
 */
const CUSTOMER_MANAGER_DIRECTORY_FIELDS = [
  'contact_name', 'phone', 'email', 'customer_code', 'tier', 'status', 'created_at',
] as const;

function sanitizeCustomerManagerDirectoryRow(value: unknown): CustomerDirectoryRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.business_name !== 'string' ||
      typeof row.status !== 'string') return null;

  if (row.contact_name !== null && typeof row.contact_name !== "string") return null;
  if (row.phone !== null && typeof row.phone !== "string") return null;
  if (row.email !== null && typeof row.email !== "string") return null;
  if (row.customer_code !== null && typeof row.customer_code !== "string") return null;
  if (row.tier !== null && typeof row.tier !== "string") return null;
  const createdAt = row.created_at;
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) return null;
  if (row.current_balance !== undefined && row.current_balance !== null &&
      (typeof row.current_balance !== "number" || !Number.isFinite(row.current_balance))) return null;
  if (row.credit_limit !== undefined && row.credit_limit !== null &&
      (typeof row.credit_limit !== "number" || !Number.isFinite(row.credit_limit))) return null;
  if (row.profile_id !== undefined && row.profile_id !== null && typeof row.profile_id !== "string") return null;

  const safe: CustomerDirectoryRow = {
    id: row.id,
    business_name: row.business_name,
    contact_name: typeof row.contact_name === "string" ? row.contact_name : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    email: typeof row.email === "string" ? row.email : null,
    customer_code: typeof row.customer_code === "string" ? row.customer_code : null,
    tier: typeof row.tier === "string" ? row.tier : null,
    status: row.status,
    created_at: createdAt,
    ...(typeof row.current_balance === "number" || row.current_balance === null ? { current_balance: row.current_balance } : {}),
    ...(typeof row.credit_limit === "number" || row.credit_limit === null ? { credit_limit: row.credit_limit } : {}),
    ...(typeof row.profile_id === "string" || row.profile_id === null ? { profile_id: row.profile_id } : {}),
  };
  // The manager projection intentionally omits finance-only fields.
  return safe;
}


/** Remove PostgREST filter grammar and wildcard characters from user-provided search text. */
export function normalizeCustomerDirectorySearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 254);
}

/** Tenant-scoped server-side customer directory with exact count and bounded result pages. */
export async function fetchCustomerDirectoryPage(input: CustomerDirectoryRequest = {}): Promise<CustomerDirectoryPage> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('إعدادات دليل العملاء غير صالحة.');
  }
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('رقم صفحة العملاء غير صالح.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error('حجم صفحة العملاء خارج النطاق المسموح.');
  }
  if (input.search !== undefined && typeof input.search !== 'string') {
    throw new Error('عبارة البحث عن العملاء غير صالحة.');
  }

  const rawSearch = input.search ?? '';
  // Preserve partial email/domain input as well as complete addresses; otherwise punctuation
  // such as "." and "@" would be stripped and make searches like "@example.com" impossible.
  // This strict allowlist excludes PostgREST logic separators and filter operators.
  const emailLikeSearch = rawSearch.normalize('NFKC').trim().toLowerCase();
  const isEmailLikeSearch = emailLikeSearch.length <= 254 &&
    !/\s/.test(emailLikeSearch) &&
    /[@._]/.test(emailLikeSearch) &&
    /^[a-z0-9._+@-]+$/i.test(emailLikeSearch);
  const search = isEmailLikeSearch ? emailLikeSearch : normalizeCustomerDirectorySearch(rawSearch);
  const scope = await getCurrentTenantScope();
  if (!scope.organizationId) {
    throw new Error('صلاحية موظف المؤسسة مطلوبة لفتح دليل العملاء.');
  }
  if (!scope.isStaff && !scope.canManageCustomers) {
    throw new Error('صلاحية موظف المؤسسة مطلوبة لفتح دليل العملاء.');
  }

  // Customer managers must never read financial columns from the base customers table.
  if (!scope.isStaff && scope.canManageCustomers) {
    const { data, error } = await supabase.rpc('fetch_customer_manager_directory', {
      p_search: search,
      p_page: page,
      p_page_size: pageSize,
    });
    if (error) throw new Error('تعذر تحميل دليل العملاء: ' + error.message);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('أعاد الخادم استجابة غير صالحة لدليل العملاء.');
    }
    const payload = data as Record<string, unknown>;
    if (
      !Array.isArray(payload.rows) ||
      typeof payload.total_count !== 'number' ||
      !Number.isSafeInteger(payload.total_count) ||
      payload.total_count < 0 ||
      typeof payload.page !== 'number' ||
      !Number.isSafeInteger(payload.page) ||
      payload.page < 1 ||
      payload.page > Math.max(1, Math.ceil(payload.total_count / pageSize)) ||
      payload.page_size !== pageSize
    ) {
      throw new Error('لم يؤكد الخادم بيانات صفحات دليل العملاء.');
    }
    const sanitizedRows = payload.rows.map(sanitizeCustomerManagerDirectoryRow);
    const rows = sanitizedRows.filter((row): row is CustomerDirectoryRow => row !== null);
    if (rows.length !== payload.rows.length || rows.length > pageSize) {
      throw new Error('أعاد الخادم سجلات غير صالحة لدليل العملاء.');
    }
    return {
      rows,
      totalCount: payload.total_count,
      page: payload.page,
      pageSize,
    };
  }

  async function readPage(pageToRead: number): Promise<CustomerDirectoryPage> {
    let request = supabase
      .from('customers')
      .select(CUSTOMER_DIRECTORY_COLUMNS, { count: 'exact' })
      .eq('organization_id', scope.organizationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (search) {
      // Treat SQL LIKE wildcards as literal search characters, not user-controlled wildcards.
      const escapedSearch = search.replace(/[\\%_]/g, (character) => `\\${character}`);
      const pattern = `%${escapedSearch}%`;
      request = request.or([
        `business_name.ilike.${pattern}`,
        `contact_name.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `customer_code.ilike.${pattern}`,
      ].join(','));
    }

    const { data, error, count } = await request.range(
      (pageToRead - 1) * pageSize,
      pageToRead * pageSize - 1,
    );
    if (error) {
      throw new Error('تعذر تحميل دليل العملاء: ' + error.message);
    }
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('تعذر تأكيد إجمالي العملاء. أعد المحاولة قبل الاعتماد على القائمة.');
    }

    const rows: CustomerDirectoryRow[] = [];
    for (const [index, value] of (data ?? []).entries()) {
      const row = sanitizeCustomerManagerDirectoryRow(value);
      if (!row) throw new Error('أعاد دليل العملاء سجلاً لا يطابق عقد العرض المصرح به (' + (index + 1) + ').');
      rows.push(row);
    }
    return {
      rows,
      totalCount: count,
      page: pageToRead,
      pageSize,
    };
  }

  let requestedPage = page;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await readPage(requestedPage);
    const lastPage = Math.max(1, Math.ceil(result.totalCount / pageSize));
    if (requestedPage <= lastPage) return result;
    requestedPage = lastPage;
  }

  throw new Error('تغيّر عدد العملاء أثناء التصفح. اضغط تحديث لإعادة المحاولة.');
}
