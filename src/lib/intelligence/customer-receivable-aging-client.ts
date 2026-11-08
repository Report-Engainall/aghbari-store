import { supabase } from "@/lib/supabase";

export type CustomerReceivableBucketName =
  | "NOT_DUE" | "OVERDUE_1_30" | "OVERDUE_31_60" | "OVERDUE_61_90" | "OVERDUE_90_PLUS" | "UNKNOWN_DUE_DATE";
export interface CustomerReceivableAgingBucket {
  bucket: CustomerReceivableBucketName;
  amount: number;
  invoiceCount: number;
  partiallyPaidCount: number;
  oldestAgeDays: number | null;
  evidenceIds: string[];
}
export interface CustomerReceivableAgingItem {
  customerName: string;
  customerNameStatus: "VERIFIED" | "NEEDS_REVIEW";
  currency: string;
  totalOutstanding: number;
  overdueAmount: number;
  invoiceCount: number;
  partiallyPaidCount: number;
  oldestAgeDays: number | null;
  status: "VERIFIED" | "NEEDS_REVIEW";
  agingBuckets: CustomerReceivableAgingBucket[];
  asOf: string;
  formulaId: string;
  formulaVersion: string;
  calculatedAt: string;
  warnings: string[];
}
export type CustomerReceivableAgingResult =
  | { ok: true; data: { status: "VERIFIED" | "PARTIAL"; asOf: string; complete: boolean; totalGroups: number; returnedGroups: number; unresolvedRows: number; items: CustomerReceivableAgingItem[]; warnings: string[] } }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
const isRecord = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 500): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const numeric = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER ? parsed : null;
};
const buckets = new Set<CustomerReceivableBucketName>(["NOT_DUE","OVERDUE_1_30","OVERDUE_31_60","OVERDUE_61_90","OVERDUE_90_PLUS","UNKNOWN_DUE_DATE"]);
const statuses = new Set(["VERIFIED","NEEDS_REVIEW"]);
function parseItem(value: unknown, asOf: string): CustomerReceivableAgingItem | null {
  if (!isRecord(value)) return null;
  const total = numeric(value.totalOutstanding), overdue = numeric(value.overdueAmount);
  const warnings = Array.isArray(value.warnings) && value.warnings.every(item => text(item,500)) ? value.warnings as string[] : null;
  if (!text(value.customerName,200) || !statuses.has(String(value.customerNameStatus)) ||
      !text(value.currency,3) || !/^[A-Z]{3}$/.test(value.currency) ||
      total === null || total < 0 || overdue === null || overdue < 0 ||
      !Number.isSafeInteger(value.invoiceCount) || (value.invoiceCount as number) < 1 ||
      !Number.isSafeInteger(value.partiallyPaidCount) || (value.partiallyPaidCount as number) < 0 ||
      (value.partiallyPaidCount as number) > (value.invoiceCount as number) ||
      (value.oldestAgeDays !== null && (!Number.isSafeInteger(value.oldestAgeDays) || (value.oldestAgeDays as number) < 0)) ||
      !statuses.has(String(value.status)) || value.asOf !== asOf ||
      !text(value.formulaId,150) || !text(value.formulaVersion,80) || !time(value.calculatedAt) ||
      !Array.isArray(value.agingBuckets) || value.agingBuckets.length > 6 || !warnings) return null;
  const parsedBuckets: CustomerReceivableAgingBucket[] = [];
  const seen = new Set<string>();
  for (const raw of value.agingBuckets) {
    if (!isRecord(raw) || typeof raw.bucket !== "string" || !buckets.has(raw.bucket as CustomerReceivableBucketName) || seen.has(raw.bucket)) return null;
    const amount = numeric(raw.amount);
    const evidence = Array.isArray(raw.evidenceIds) && raw.evidenceIds.length <= 50 && raw.evidenceIds.every(id => text(id,500)) ? raw.evidenceIds as string[] : null;
    if (amount === null || amount < 0 || !Number.isSafeInteger(raw.invoiceCount) || (raw.invoiceCount as number) < 0 ||
        !Number.isSafeInteger(raw.partiallyPaidCount) || (raw.partiallyPaidCount as number) < 0 ||
        (raw.partiallyPaidCount as number) > (raw.invoiceCount as number) ||
        (raw.oldestAgeDays !== null && (!Number.isSafeInteger(raw.oldestAgeDays) || (raw.oldestAgeDays as number) < 0)) || !evidence) return null;
    seen.add(raw.bucket);
    parsedBuckets.push({ bucket: raw.bucket as CustomerReceivableBucketName, amount, invoiceCount: raw.invoiceCount as number,
      partiallyPaidCount: raw.partiallyPaidCount as number, oldestAgeDays: raw.oldestAgeDays as number | null, evidenceIds: evidence });
  }
  const bucketTotal = parsedBuckets.reduce((sum,row)=>sum+row.amount,0);
  const overdueTotal = parsedBuckets.filter(row=>row.bucket.startsWith("OVERDUE_")).reduce((sum,row)=>sum+row.amount,0);
  if (Math.abs(bucketTotal-total)>0.011 || Math.abs(overdueTotal-overdue)>0.011) return null;
  return { customerName:value.customerName,customerNameStatus:value.customerNameStatus as CustomerReceivableAgingItem["customerNameStatus"],
    currency:value.currency,totalOutstanding:total,overdueAmount:overdue,invoiceCount:value.invoiceCount as number,
    partiallyPaidCount:value.partiallyPaidCount as number,oldestAgeDays:value.oldestAgeDays as number|null,
    status:value.status as CustomerReceivableAgingItem["status"],agingBuckets:parsedBuckets,asOf,
    formulaId:value.formulaId,formulaVersion:value.formulaVersion,calculatedAt:value.calculatedAt,warnings };
}
export async function fetchExecutiveCustomerReceivableAging(): Promise<CustomerReceivableAgingResult> {
  try {
    const { data, error } = await supabase.rpc("fetch_executive_receivable_customer_aging");
    if (error) {
      const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
      if (code === "42501") return { ok:false,status:"DENIED",message:"تتطلب قراءة أعمار الذمم صلاحية الإدارة المالية." };
      return { ok:false,status:"UNAVAILABLE",message:"تعذر تحميل أعمار الذمم على مستوى العميل من قاعدة البيانات." };
    }
    if (!isRecord(data) || !["VERIFIED","PARTIAL"].includes(String(data.status)) || !time(data.asOf) ||
        !Number.isSafeInteger(data.totalGroups) || (data.totalGroups as number)<0 ||
        !Number.isSafeInteger(data.returnedGroups) || (data.returnedGroups as number)<0 ||
        !Number.isSafeInteger(data.unresolvedRows) || (data.unresolvedRows as number)<0 ||
        typeof data.complete!=="boolean" || !Array.isArray(data.items) || data.items.length>2000 ||
        data.returnedGroups!==data.items.length ||
        !Array.isArray(data.warnings) || !data.warnings.every(item=>text(item,500))) {
      return { ok:false,status:"ERROR",message:"استجابة أعمار الذمم غير مكتملة أو غير متصالحة؛ أُوقف العرض." };
    }
    const items=data.items.map(item=>parseItem(item,data.asOf as string));
    if(items.some(item=>item===null)) return { ok:false,status:"ERROR",message:"تعذر التحقق من صفوف أعمار الذمم؛ لم تُعرض بيانات جزئية غير متصالحة." };
    const seen=new Set<string>();
    for(const item of items as CustomerReceivableAgingItem[]){const key=item.customerName+"|"+item.currency;if(seen.has(key))return {ok:false,status:"ERROR",message:"تكرر العميل والعملة في استجابة أعمار الذمم."};seen.add(key);}
    if(data.complete && (data.status!=="VERIFIED" || data.unresolvedRows!==0 || data.returnedGroups!==data.totalGroups)) return {ok:false,status:"ERROR",message:"حالة اكتمال أعمار الذمم لا تتفق مع التغطية الفعلية."};
    return {ok:true,data:{status:data.status as "VERIFIED"|"PARTIAL",asOf:data.asOf as string,complete:data.complete,
      totalGroups:data.totalGroups as number,returnedGroups:data.returnedGroups as number,unresolvedRows:data.unresolvedRows as number,
      items:items as CustomerReceivableAgingItem[],warnings:data.warnings as string[]}};
  } catch { return {ok:false,status:"UNAVAILABLE",message:"تعذر الاتصال بخدمة أعمار الذمم."}; }
}
