import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AmendmentStatus = "pending_review" | "approved" | "rejected";
type AmendmentLine = {
  orderItemId: string;
  productName: string;
  itemCode: string | null;
  unit: string | null;
  previousQuantity: number;
  proposedQuantity: number;
};
type AmendmentVersion = {
  id: string;
  status: AmendmentStatus;
  note: string | null;
  reviewNote: string | null;
  submittedAt: string;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  lines: AmendmentLine[];
};
type AmendmentReturnEvent = {
  changedAt: string;
  changedBy: string | null;
  reason: string | null;
};
type AmendmentHistory = {
  orderStatus: string;
  returnEvents: AmendmentReturnEvent[];
  versions: AmendmentVersion[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_LABEL: Record<AmendmentStatus, string> = {
  pending_review: "بانتظار مراجعة الإدارة",
  approved: "اعتمدت الإدارة التعديل",
  rejected: "رفضت الإدارة التعديل",
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending: "بانتظار المراجعة",
  returned: "معاد للتعديل",
  needs_customer_amendment: "بانتظار تعديل العميل",
  returned_for_adjustment: "أُعيد للتعديل",
  confirmed: "مؤكد بعد المراجعة",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function optionalText(value: unknown, max = 1000): string | null {
  return value === null || value === undefined
    ? null
    : typeof value === "string" && value.length <= max
      ? value
      : null;
}
function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 &&
    value <= 10000 && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
}
function parseHistory(value: unknown, orderId: string): AmendmentHistory | null {
  if (!isRecord(value) || value.order_id !== orderId ||
      typeof value.order_status !== "string" ||
      !Array.isArray(value.amendments) || value.amendments.length > 500) return null;

  const rawReturnEvents = value.return_events === undefined ? [] : value.return_events;
  if (!Array.isArray(rawReturnEvents) || rawReturnEvents.length > 100) return null;
  const returnEvents: AmendmentReturnEvent[] = [];
  for (const rawEvent of rawReturnEvents) {
    if (!isRecord(rawEvent) || !validTimestamp(rawEvent.changed_at)) return null;
    returnEvents.push({
      changedAt: rawEvent.changed_at,
      changedBy: optionalText(rawEvent.changed_by, 200),
      reason: optionalText(rawEvent.reason, 2000),
    });
  }

  const seenVersions = new Set<string>();
  const versions: AmendmentVersion[] = [];
  for (const rawVersion of value.amendments) {
    if (!isRecord(rawVersion) || typeof rawVersion.amendment_id !== "string" ||
        !UUID.test(rawVersion.amendment_id) || seenVersions.has(rawVersion.amendment_id) ||
        !["pending_review", "approved", "rejected"].includes(String(rawVersion.status)) ||
        !validTimestamp(rawVersion.submitted_at) ||
        !Number.isInteger(rawVersion.line_count) || Number(rawVersion.line_count) < 1 ||
        !Array.isArray(rawVersion.lines) || rawVersion.lines.length !== rawVersion.line_count ||
        rawVersion.lines.length > 500) return null;

    seenVersions.add(rawVersion.amendment_id);
    const seenLines = new Set<string>();
    const lines: AmendmentLine[] = [];
    for (const rawLine of rawVersion.lines) {
      if (!isRecord(rawLine) || typeof rawLine.order_item_id !== "string" ||
          !UUID.test(rawLine.order_item_id) || seenLines.has(rawLine.order_item_id) ||
          typeof rawLine.product_name !== "string" || rawLine.product_name.length < 1 ||
          rawLine.product_name.length > 300 ||
          !validQuantity(rawLine.previous_quantity) || !validQuantity(rawLine.proposed_quantity)) return null;
      seenLines.add(rawLine.order_item_id);
      lines.push({
        orderItemId: rawLine.order_item_id,
        productName: rawLine.product_name,
        itemCode: optionalText(rawLine.item_code, 120),
        unit: optionalText(rawLine.unit, 80),
        previousQuantity: rawLine.previous_quantity,
        proposedQuantity: rawLine.proposed_quantity,
      });
    }

    const reviewedAt = rawVersion.reviewed_at;
    if (reviewedAt !== null && reviewedAt !== undefined && !validTimestamp(reviewedAt)) return null;
    versions.push({
      id: rawVersion.amendment_id,
      status: rawVersion.status as AmendmentStatus,
      note: optionalText(rawVersion.note),
      reviewNote: optionalText(rawVersion.review_note),
      submittedAt: rawVersion.submitted_at,
      submittedBy: optionalText(rawVersion.submitted_by, 200),
      reviewedAt: typeof reviewedAt === "string" ? reviewedAt : null,
      reviewedBy: optionalText(rawVersion.reviewed_by, 200),
      lines,
    });
  }
  return { orderStatus: value.order_status, returnEvents, versions };
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function quantityLabel(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value);
}

export function CustomerOrderAmendmentHistory({
  orderId,
  refreshKey = "",
}: {
  orderId: string;
  refreshKey?: string;
}) {
  const [history, setHistory] = useState<AmendmentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("list_customer_order_amendment_history", {
      p_order_id: orderId,
    });
    if (rpcError) {
      setHistory(null);
      setError("تعذر تحميل سجل نسخ التعديل من الخادم. حدّث الصفحة أو أعد المحاولة.");
      setLoading(false);
      return;
    }
    const parsed = parseHistory(data, orderId);
    if (!parsed) {
      setHistory(null);
      setError("أعاد الخادم سجل تعديل غير مكتمل أو غير مطابق للطلب؛ تم إخفاء البيانات غير الموثوقة.");
      setLoading(false);
      return;
    }
    setHistory(parsed);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, retry]);

  const latestVersion = history?.versions[history.versions.length - 1];

  return (
    <section className="mt-4 rounded-xl border bg-card p-4 text-card-foreground" dir="rtl"
      aria-labelledby={"customer-order-amendment-history-" + orderId}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={"customer-order-amendment-history-" + orderId} className="font-semibold">
            سجل تعديلات الطلب وإعادة التقديم
          </h2>
          {history && (
            <p className="mt-1 text-xs text-muted-foreground">
              حالة الطلب: {latestVersion?.status === "pending_review"
                ? "أُعيد تقديم التعديل إلى الإدارة — بانتظار المراجعة"
                : ORDER_STATUS_LABEL[history.orderStatus] ?? history.orderStatus}
            </p>
          )}
        </div>
        <button type="button" className="btn secondary btn-sm" onClick={() => setRetry((value) => value + 1)}
          disabled={loading} aria-label="تحديث سجل تعديلات الطلب">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث السجل
        </button>
      </header>

      {loading ? <p role="status" className="mt-3 text-sm text-muted-foreground">جارٍ تحميل سجل النسخ...</p> : null}
      {error ? <div role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm">
        {error}
        <button type="button" className="ms-2 underline" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button>
      </div> : null}
      {!loading && !error && history?.versions.length === 0 && history.returnEvents.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">لا توجد أحداث إرجاع أو نسخ تعديل مسجلة لهذا الطلب حتى الآن.</p>
      ) : null}

      {history && history.returnEvents.length > 0 ? (
        <section className="mt-4 rounded-lg border border-amber-300/60 p-3" aria-label="سجل إعادة الطلب إلى العميل">
          <h3 className="font-semibold">سجل إعادة الطلب إلى العميل</h3>
          <ol className="mt-2 space-y-2">
            {history.returnEvents.map((event, index) => (
              <li key={event.changedAt + ":" + index} className="text-sm">
                <p className="text-xs text-muted-foreground">
                  أعاد الطلب: {event.changedBy ?? "مستخدم غير متاح"} · {dateLabel(event.changedAt)}
                </p>
                {event.reason ? <p className="mt-1 leading-6">{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {history && history.versions.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {history.versions.map((version, index) => (
            <li key={version.id} className="rounded-lg border p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <strong>النسخة {index + 1}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    أرسلها: {version.submittedBy ?? "مستخدم غير متاح"} · {dateLabel(version.submittedAt)}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-xs font-semibold">
                  {STATUS_LABEL[version.status]}
                </span>
              </header>
              {version.note ? <p className="mt-2 text-sm">ملاحظة العميل: {version.note}</p> : null}
              {version.reviewedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  راجعها: {version.reviewedBy ?? "مستخدم غير متاح"} · {dateLabel(version.reviewedAt)}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">لم يُسجل قرار الإدارة بعد.</p>
              )}
              {version.reviewNote ? <p className="mt-2 rounded-md bg-muted p-2 text-sm">ملاحظة الإدارة: {version.reviewNote}</p> : null}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b text-right text-muted-foreground">
                    <th className="p-2">الصنف</th><th className="p-2">الرمز / الوحدة</th>
                    <th className="p-2">الكمية الأصلية</th><th className="p-2">الكمية المقترحة</th>
                  </tr></thead>
                  <tbody>
                    {version.lines.map((line) => {
                      const changed = line.previousQuantity !== line.proposedQuantity;
                      return <tr key={line.orderItemId} className="border-b last:border-0">
                        <td className="p-2 font-medium">{line.productName}</td>
                        <td className="p-2 text-muted-foreground">{line.itemCode ?? "—"} / {line.unit ?? "—"}</td>
                        <td className="p-2 tabular-nums">{quantityLabel(line.previousQuantity)}</td>
                        <td className={"p-2 tabular-nums font-semibold " + (changed ? "text-primary" : "text-muted-foreground")}>
                          {quantityLabel(line.proposedQuantity)} {changed ? "" : "(دون تغيير)"}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        كل نسخة مرتبطة بالطلب الأصلي ومحفوظة مستقلة. الإرسال لا يعتمد الكميات ولا يغيّر المخزون أو الفاتورة؛ الاعتماد النهائي من الإدارة فقط.
      </p>
    </section>
  );
}
