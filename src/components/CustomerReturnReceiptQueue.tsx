import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, PackageCheck, Printer, RefreshCw, Warehouse } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildCustomerReturnReceiptLines,
  createReturnReceiptIdempotencyKey,
  readCustomerReturnReceiptQueue,
  readCustomerReturnReceiptPrintData,
  readCustomerReturnReceiptPrintHistory,
  readReturnReceiptMutationResult,
  type CustomerReturnReceiptHistoryEntry,
  type CustomerReturnReceiptDraft,
  type CustomerReturnReceiptQueue,
  type CustomerReturnReceiptRequest,
} from "@/lib/customer-return-receipts";

const panel: React.CSSProperties = {
  marginTop: 22, border: "1px solid #dce7e8", borderRadius: 14, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 13,
};
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #ccdadd", borderRadius: 8, padding: "8px 11px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: "#fff", color: "#24464a", font: "inherit", fontWeight: 750, cursor: "pointer",
};
const primary: React.CSSProperties = { ...button, color: "#fff", background: "#176b55", borderColor: "#176b55" };
const muted: React.CSSProperties = { margin: 0, color: "#64787c", fontSize: 13, lineHeight: 1.7 };

function toSavedReturnReceipt(persistedReceipt: ReturnType<typeof readCustomerReturnReceiptPrintData>): SavedReturnReceipt {
  return {
    receiptNumber: persistedReceipt.receipt_number,
    requestNumber: persistedReceipt.request_number,
    orderNumber: persistedReceipt.order_number,
    customerName: persistedReceipt.customer_name,
    warehouseName: persistedReceipt.warehouse_name,
    generatedAt: persistedReceipt.received_at,
    notes: persistedReceipt.notes ?? "",
    receivedLineCount: persistedReceipt.received_line_count,
    receivedQuantity: persistedReceipt.received_quantity,
    restockableQuantity: persistedReceipt.restockable_quantity,
    defectiveQuantity: persistedReceipt.defective_quantity,
    lines: persistedReceipt.lines.map((line) => ({
      itemCode: line.item_code,
      productName: line.product_name,
      unit: line.unit,
      receivedQuantity: line.received_quantity,
      restockableQuantity: line.restockable_quantity,
      defectiveQuantity: line.defective_quantity,
    })),
  };
}

type SavedReturnReceipt = {
  receiptNumber: string;
  requestNumber: string;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  generatedAt: string;
  notes: string;
  receivedLineCount: number;
  receivedQuantity: number;
  restockableQuantity: number;
  defectiveQuantity: number;
  lines: Array<{
    itemCode: string | null;
    productName: string;
    unit: string | null;
    receivedQuantity: number;
    restockableQuantity: number;
    defectiveQuantity: number;
  }>;
};


function ReturnReceiptItemEditor({requestId,item,draft,busy,onDraftChange}:{
  requestId:string; item:CustomerReturnReceiptRequest["items"][number]; draft:CustomerReturnReceiptDraft;
  busy:boolean; onDraftChange:(requestId:string,itemId:string,fieldName:keyof CustomerReturnReceiptDraft,value:string)=>void;
}) {
  const defective=Math.max(0,Number(draft.received_quantity)-Number(draft.restockable_quantity));
  const showDefective=draft.received_quantity.trim()!==""&&draft.restockable_quantity.trim()!=="";
  return <div style={{display:"grid",gridTemplateColumns:"minmax(180px,2fr) repeat(2,minmax(110px,1fr))",gap:9,alignItems:"end"}}>
    <div><strong style={{fontSize:13}}>{item.product_name}</strong>
      <p style={muted}>الرمز {item.item_code??"غير مسجل"} · المتبقي {item.remaining_quantity.toLocaleString("ar-YE")} {item.unit??""}</p>
      {!item.product_id&&<p style={{...muted,color:"#805413"}}>لا يوجد ربط بمنتج؛ لا يمكن إضافة هذا الصنف إلى المخزون.</p>}
    </div>
    <label style={{display:"grid",gap:5,fontSize:12,fontWeight:750}}>الكمية المستلمة
      <input type="number" min="0.001" max={item.remaining_quantity} step="0.001" inputMode="decimal" value={draft.received_quantity}
        onChange={(event)=>onDraftChange(requestId,item.request_item_id,"received_quantity",event.target.value)} style={field} disabled={busy}/>
    </label>
    <label style={{display:"grid",gap:5,fontSize:12,fontWeight:750}}>الصالح للمخزون
      <input type="number" min="0" max={draft.received_quantity||item.remaining_quantity} step="0.001" inputMode="decimal" value={draft.restockable_quantity}
        onChange={(event)=>onDraftChange(requestId,item.request_item_id,"restockable_quantity",event.target.value)} style={field} disabled={busy}/>
    </label>
    {showDefective&&<p style={{...muted,gridColumn:"1 / -1"}}>الكمية التالفة المحسوبة: {defective.toLocaleString("ar-YE")} {item.unit??""}</p>}
  </div>;
}

function ReturnReceiptRequestCard({request,drafts,notes,busy,disabled,onDraftChange,onNotesChange,onReceive}:{
  request:CustomerReturnReceiptRequest; drafts:Record<string,CustomerReturnReceiptDraft>; notes:string;
  busy:boolean; disabled:boolean;
  onDraftChange:(requestId:string,itemId:string,fieldName:keyof CustomerReturnReceiptDraft,value:string)=>void;
  onNotesChange:(requestId:string,value:string)=>void; onReceive:(request:CustomerReturnReceiptRequest)=>void;
}) {
  return <article style={{display:"grid",gap:12,padding:14,border:"1px solid #e1e9ea",borderRadius:11}}>
    <header style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div><h3 style={{margin:0,fontSize:16}}>{request.request_number}</h3>
        <p style={muted}>الطلب {request.order_number} · العميل {request.customer_name} · {new Date(request.created_at).toLocaleString("ar-YE")}</p></div>
      <span style={{background:"#fff4df",color:"#805413",borderRadius:20,padding:"4px 9px",fontSize:12,fontWeight:800}}>بانتظار الاستلام</span>
    </header>
    {request.items.map(item=><ReturnReceiptItemEditor key={item.request_item_id} requestId={request.id} item={item}
      draft={drafts[item.request_item_id]??{received_quantity:"",restockable_quantity:""}} busy={busy} onDraftChange={onDraftChange}/>)}
    <label style={{display:"grid",gap:6,fontSize:13,fontWeight:750}}>ملاحظة الاستلام (اختياري)
      <textarea rows={2} maxLength={2000} value={notes} onChange={(event)=>onNotesChange(request.id,event.target.value)}
        style={{...field,resize:"vertical"}} disabled={busy}/>
    </label>
    <footer style={{display:"flex",flexWrap:"wrap",gap:8}}>
      <button type="button" style={primary} disabled={disabled} onClick={()=>onReceive(request)}><ClipboardCheck size={16}/> تسجيل الاستلام والفحص</button>
    </footer>
  </article>;
}

function ReturnReceiptHistoryDetails({ receipt }: { receipt: CustomerReturnReceiptHistoryEntry }) {
  return (
    <div>
      <strong>{receipt.receipt_number}</strong>
      <p style={muted}>طلب المرتجع {receipt.request_number} · الطلب الأصلي {receipt.order_number}</p>
      <p style={muted}>العميل {receipt.customer_name} · المخزن {receipt.warehouse_name}</p>
      <p style={muted}>{new Date(receipt.received_at).toLocaleString("ar-YE")} · {receipt.received_line_count} بند</p>
      <p style={muted}>المستلم {receipt.received_quantity.toLocaleString("ar-YE")} · الصالح {receipt.restockable_quantity.toLocaleString("ar-YE")} · التالف {receipt.defective_quantity.toLocaleString("ar-YE")}</p>
    </div>
  );
}

function ReturnReceiptHistoryCard({receipt,busy,disabled,onPrepare}:{
  receipt:CustomerReturnReceiptHistoryEntry; busy:boolean; disabled:boolean;
  onPrepare:(receipt:CustomerReturnReceiptHistoryEntry)=>void;
}) {
  return <article style={{display:"grid",gap:6,padding:12,border:"1px solid #e1e9ea",borderRadius:9}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <ReturnReceiptHistoryDetails receipt={receipt} />
      <button type="button" style={button} disabled={disabled} aria-label={"إعادة تجهيز الإيصال للطباعة "+receipt.receipt_number} onClick={()=>onPrepare(receipt)}>
        <Printer size={14}/> {busy?"جار تحميل النسخة...":"إعادة تجهيز للطباعة"}
      </button>
    </div>
  </article>;
}

async function loadValidatedReturnReceipt(
  receiptId: string,
  expected: ReturnType<typeof readReturnReceiptMutationResult>,
): Promise<ReturnType<typeof readCustomerReturnReceiptPrintData>> {
  const { data, error } = await supabase.rpc("get_customer_return_receipt_print_data", {
    p_receipt_id: receiptId,
  });
  if (error) throw new Error(error.message || "تعذر قراءة نسخة الإيصال المحفوظة.");

  const persisted = readCustomerReturnReceiptPrintData(data);
  const sameQuantity = (left: number, right: number) =>
    Math.round(left * 1000) === Math.round(right * 1000);
  const matchesMutation =
    persisted.receipt_number === expected.receipt_number &&
    persisted.received_line_count === expected.received_line_count &&
    sameQuantity(persisted.received_quantity, expected.received_quantity) &&
    sameQuantity(persisted.restockable_quantity, expected.restockable_quantity) &&
    sameQuantity(persisted.defective_quantity, expected.defective_quantity);

  if (!matchesMutation) {
    throw new Error("ملخص نسخة الإيصال لا يطابق تأكيد عملية الاستلام؛ تم منع الطباعة.");
  }
  return persisted;
}

export function CustomerReturnReceiptQueue({ onNotice }: { onNotice: (message: string) => void }) {
  const [queue, setQueue] = useState<CustomerReturnReceiptQueue>({ warehouses: [], requests: [] });
  const [warehouseId, setWarehouseId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, CustomerReturnReceiptDraft>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [retryKeys, setRetryKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedReceipt, setSavedReceipt] = useState<SavedReturnReceipt | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<CustomerReturnReceiptHistoryEntry[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const historyRequestId = useRef(0);

  const loadReceiptHistory = useCallback(async (offset = 0) => {
    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryOffset(offset);
    try {
      const { data, error: rpcError } = await supabase.rpc("list_customer_return_receipt_print_history", { p_limit: 50, p_offset: offset });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل سجل إيصالات المرتجعات المحفوظة.");
      const result = readCustomerReturnReceiptPrintHistory(data);
      if (requestId !== historyRequestId.current) return;
      if (result.offset !== offset) throw new Error("أعاد الخادم صفحة إيصالات مختلفة عن الصفحة المطلوبة.");
      setReceiptHistory(result.receipts);
      setHistoryHasMore(result.has_more);
    } catch {
      if (requestId !== historyRequestId.current) return;
      setReceiptHistory([]);
      setHistoryHasMore(false);
      setHistoryError("تعذر تحميل سجل الإيصالات من الخادم؛ لم تُستخدم بيانات محلية بديلة.");
    } finally {
      if (requestId === historyRequestId.current) setHistoryLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_customer_return_receipt_queue", { p_limit: 50 });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل قائمة الاستلام والفحص.");
      const result = readCustomerReturnReceiptQueue(data);
      setQueue(result);
      setWarehouseId((current) => current && result.warehouses.some((warehouse) => warehouse.id === current)
        ? current : (result.warehouses[0]?.id ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة الاستلام والفحص.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); void loadReceiptHistory(); }, [load, loadReceiptHistory]);

  async function prepareHistoricalReceipt(receipt: CustomerReturnReceiptHistoryEntry) {
    if (busyId !== null || historyBusyId !== null) return;
    setHistoryBusyId(receipt.receipt_id);
    setHistoryError("");
    setSavedReceipt(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_customer_return_receipt_print_data",
        { p_receipt_id: receipt.receipt_id },
      );
      if (rpcError) throw new Error(rpcError.message || "تعذر قراءة الإيصال المحفوظ.");
      const persisted = readCustomerReturnReceiptPrintData(data);
      const sameQuantity = (left: number, right: number) => Math.round(left * 1000) === Math.round(right * 1000);
      if (
        persisted.receipt_number !== receipt.receipt_number ||
        persisted.request_number !== receipt.request_number ||
        persisted.order_number !== receipt.order_number ||
        persisted.customer_name !== receipt.customer_name ||
        persisted.warehouse_name !== receipt.warehouse_name ||
        persisted.received_line_count !== receipt.received_line_count ||
        !sameQuantity(persisted.received_quantity, receipt.received_quantity) ||
        !sameQuantity(persisted.restockable_quantity, receipt.restockable_quantity) ||
        !sameQuantity(persisted.defective_quantity, receipt.defective_quantity) ||
        persisted.received_at !== receipt.received_at
      ) {
        throw new Error("تفاصيل الإيصال المعاد تحميله لا تطابق سجل الإيصالات المحفوظة؛ تم منع الطباعة.");
      }
      setSavedReceipt(toSavedReturnReceipt(persisted));
      onNotice("تم تحميل الإيصال المحفوظ " + persisted.receipt_number + "؛ راجع النسخة ثم اضغط طباعة.");
    } catch {
      setSavedReceipt(null);
      setHistoryError("تعذر تأكيد نسخة الإيصال المحفوظة للطباعة. أعد تحديث السجل؛ لم تُعرض نسخة قديمة.");
    } finally {
      setHistoryBusyId(null);
    }
  }

  function updateDraft(requestId: string, itemId: string, fieldName: keyof CustomerReturnReceiptDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        [itemId]: {
          received_quantity: current[requestId]?.[itemId]?.received_quantity ?? "",
          restockable_quantity: current[requestId]?.[itemId]?.restockable_quantity ?? "",
          [fieldName]: value,
        },
      },
    }));
  }

  async function receive(request: CustomerReturnReceiptRequest) {
    setError("");
    if (!warehouseId) {
      setError("لا يوجد مخزن نشط متاح في المؤسسة لاستلام المرتجع.");
      return;
    }
    let lines;
    try {
      lines = buildCustomerReturnReceiptLines(drafts[request.id] ?? {}, request.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "راجع كميات الاستلام والفحص.");
      return;
    }
    const key = retryKeys[request.id] ?? createReturnReceiptIdempotencyKey();
    setRetryKeys((current) => ({ ...current, [request.id]: key }));
    setBusyId(request.id);
    try {
      const { data, error: rpcError } = await supabase.rpc("receive_customer_return", {
        p_return_request_id: request.id,
        p_warehouse_id: warehouseId,
        p_lines: lines,
        p_notes: (notes[request.id] ?? "").trim() || null,
        p_idempotency_key: key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر حفظ الاستلام الفعلي.");
      const result = readReturnReceiptMutationResult(data);
      // The old printable receipt must not remain available after a new receipt has saved.
      // If its persisted snapshot cannot be fetched, fail closed instead of leaving stale print evidence.
      setSavedReceipt(null);
      void loadReceiptHistory(0);
      let persistedReceipt: ReturnType<typeof readCustomerReturnReceiptPrintData>;
      try {
        persistedReceipt = await loadValidatedReturnReceipt(result.receipt_id, result);
      } catch {
        const message = "تم حفظ الاستلام " + result.receipt_number +
          " في الخادم، لكن تعذر تحميل تفاصيل الإيصال المحفوظة للطباعة. أعد المحاولة بالمفتاح نفسه؛ لا تنشئ عملية استلام جديدة.";
        setError(message);
        onNotice(message);
        return;
      }
      setSavedReceipt(toSavedReturnReceipt(persistedReceipt));
      onNotice(
        "تم حفظ " + persistedReceipt.receipt_number + " — المستلم " +
        persistedReceipt.received_quantity.toLocaleString("ar-YE") + "، الصالح للمخزون " +
        persistedReceipt.restockable_quantity.toLocaleString("ar-YE") + "، والتالف " +
        persistedReceipt.defective_quantity.toLocaleString("ar-YE") + ". " +
        (result.idempotent_replay ? "أعيدت نتيجة العملية السابقة دون تكرار حركة المخزون." : "حُفظ سجل الاستلام وحركة المخزون الصالحة فقط."),
      );
      setDrafts((current) => { const next = { ...current }; delete next[request.id]; return next; });
      setNotes((current) => { const next = { ...current }; delete next[request.id]; return next; });
      setRetryKeys((current) => { const next = { ...current }; delete next[request.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر حفظ الاستلام الفعلي.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={panel} dir="rtl" aria-labelledby="return-receipt-heading">
      <style>{`@page { size: A4 portrait; margin: 12mm; }
      @media print {
        body * { visibility: hidden !important; }
        .return-receipt-print, .return-receipt-print * { visibility: visible !important; }
        .return-receipt-print { position: absolute !important; inset: 0 !important; width: 100% !important; color: #172f32 !important; background: #fff !important; padding: 0 !important; }
        .return-receipt-print table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 14px; }
        .return-receipt-print th, .return-receipt-print td { border: 1px solid #aab9bb !important; padding: 7px; text-align: right; color: #172f32 !important; }
      }`}</style>
      {savedReceipt && <article className="return-receipt-print" dir="rtl" aria-label="نسخة إيصال المرتجع المحفوظ">
        <header style={{ borderBottom: "2px solid #176b55", paddingBottom: 12, marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 23, color: "#176b55" }}>الأغبري</h1>
          <h2 style={{ margin: "8px 0 4px", fontSize: 19 }}>إيصال استلام وفحص مرتجع</h2>
          <p style={{ margin: 0 }}>رقم الإيصال: <strong>{savedReceipt.receiptNumber}</strong></p>
          <p style={{ ...muted, marginTop: 4 }}>وقت إعداد النسخة المطبوعة: {new Date(savedReceipt.generatedAt).toLocaleString("ar-YE")}</p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <p>طلب المرتجع: <strong>{savedReceipt.requestNumber}</strong></p>
          <p>الطلب الأصلي: <strong>{savedReceipt.orderNumber}</strong></p>
          <p>العميل: <strong>{savedReceipt.customerName}</strong></p>
          <p>مخزن الاستلام: <strong>{savedReceipt.warehouseName}</strong></p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBlock: 12 }}>
          <div style={{ border: "1px solid #ccd8d9", padding: 9 }}><small>إجمالي المستلم</small><h3 style={{ margin: "5px 0" }}>{savedReceipt.receivedQuantity.toLocaleString("ar-YE")}</h3></div>
          <div style={{ border: "1px solid #ccd8d9", padding: 9 }}><small>الصالح للمخزون</small><h3 style={{ margin: "5px 0" }}>{savedReceipt.restockableQuantity.toLocaleString("ar-YE")}</h3></div>
          <div style={{ border: "1px solid #ccd8d9", padding: 9 }}><small>التالف</small><h3 style={{ margin: "5px 0" }}>{savedReceipt.defectiveQuantity.toLocaleString("ar-YE")}</h3></div>
        </div>
        <table><thead><tr><th>كود الصنف</th><th>الصنف</th><th>المستلم</th><th>الصالح للمخزون</th><th>التالف</th></tr></thead>
          <tbody>{savedReceipt.lines.map((line, index) => <tr key={index}>
            <td>{line.itemCode ?? "غير مسجل"}</td><td>{line.productName}{line.unit ? " — " + line.unit : ""}</td>
            <td>{line.receivedQuantity.toLocaleString("ar-YE")}</td><td>{line.restockableQuantity.toLocaleString("ar-YE")}</td><td>{line.defectiveQuantity.toLocaleString("ar-YE")}</td>
          </tr>)}</tbody>
        </table>
        <p style={{ marginTop: 12 }}>عدد البنود المستلمة وفق نتيجة الخادم: <strong>{savedReceipt.receivedLineCount}</strong></p>
        {savedReceipt.notes && <p style={{ marginTop: 8 }}>ملاحظة الاستلام: {savedReceipt.notes}</p>}
        <p style={{ marginTop: 18, borderTop: "1px solid #ccd8d9", paddingTop: 9, fontSize: 10 }}>
          المستند يثبت الاستلام والفحص المسجلين. لا ينشئ إشعارًا دائنًا أو قيدًا ماليًا، ولا يُعدّ إثباتًا لصرف أو رد مبلغ.
        </p>
      </article>}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="return-receipt-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <PackageCheck size={19} /> استلام المرتجعات وفحصها
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            يسجّل الموظف الكمية المستلمة ويحدد الصالح لإعادة المخزون. الباقي يسجّل تالفًا ولا يدخل الرصيد المتاح. لا يصدر إشعار دائن أو قيد محاسبي تلقائيًا.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {savedReceipt && <button type="button" style={primary} onClick={() => window.print()}>
            <Printer size={15} /> طباعة الإيصال {savedReceipt.receiptNumber}
          </button>}
          <button type="button" style={button} onClick={() => { void load(); void loadReceiptHistory(); }} disabled={loading || historyLoading || busyId !== null || historyBusyId !== null}>
            <RefreshCw size={15} /> تحديث
          </button>
        </div>
      </header>

      <label style={{ display: "grid", gap: 6, maxWidth: 540, fontSize: 13, fontWeight: 750 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Warehouse size={15} /> مخزن الاستلام النشط</span>
        <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} style={field} disabled={loading || busyId !== null || queue.warehouses.length === 0}>
          {queue.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? " · " + warehouse.code : ""}</option>)}
        </select>
      </label>

      {loading && <p role="status" style={muted}>جارٍ تحميل طلبات المرتجعات المعتمدة...</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", padding: 10, borderRadius: 8, background: "#fff1f1" }}>{error}</p>}
      {!loading && !error && queue.warehouses.length === 0 && <p style={muted}>لا يوجد مخزن نشط متاح في المؤسسة؛ لم يُنشأ أي استلام.</p>}
      {!loading && !error && queue.requests.length === 0 && <p style={muted}>لا توجد مرتجعات معتمدة بانتظار الاستلام الفعلي.</p>}

      {queue.requests.map((request) => (
        <ReturnReceiptRequestCard key={request.id} request={request} drafts={drafts[request.id]??{}}
          notes={notes[request.id]??""} busy={busyId===request.id}
          disabled={busyId!==null||loading||queue.warehouses.length===0}
          onDraftChange={updateDraft}
          onNotesChange={(requestId,value)=>setNotes(current=>({...current,[requestId]:value}))}
          onReceive={selectedRequest=>void receive(selectedRequest)}/>
      ))}

      <section aria-labelledby="return-receipt-history-heading" style={{ display: "grid", gap: 10, paddingTop: 16, borderTop: "1px solid #e1e9ea" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 id="return-receipt-history-heading" style={{ margin: 0, fontSize: 16 }}>سجل إيصالات الاستلام المحفوظة</h3>
            <p style={muted}>إعادة تجهيز للطباعة من النسخة المحفوظة في قاعدة البيانات، لا من تفاصيل قائمة العمل الحالية.</p>
          </div>
          <button type="button" style={button} onClick={() => void loadReceiptHistory(historyOffset)} disabled={historyLoading || historyBusyId !== null || busyId !== null}>
            <RefreshCw size={14} /> تحديث سجل الإيصالات
          </button>
        </div>
        {historyLoading && <p role="status" style={muted}>جار تحميل سجل الإيصالات المحفوظة...</p>}
        {historyError && <p role="alert" style={{ ...muted, color: "#a32929" }}>{historyError}</p>}
        {!historyLoading && !historyError && receiptHistory.length === 0 && <p style={muted}>لا توجد إيصالات محفوظة متاحة لإعادة الطباعة.</p>}
        {receiptHistory.map(receipt=>(
          <ReturnReceiptHistoryCard key={receipt.receipt_id} receipt={receipt}
            busy={historyBusyId===receipt.receipt_id}
            disabled={busyId!==null||historyLoading||historyBusyId!==null}
            onPrepare={selectedReceipt=>void prepareHistoricalReceipt(selectedReceipt)}/>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <p style={muted}>الصفحة {Math.floor(historyOffset / 50) + 1} · السجلات {historyOffset + 1}–{historyOffset + receiptHistory.length}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button} onClick={() => void loadReceiptHistory(Math.max(0, historyOffset - 50))}
              disabled={historyLoading || historyBusyId !== null || busyId !== null || historyOffset === 0}>
              السجلات الأحدث
            </button>
            <button type="button" style={button} onClick={() => void loadReceiptHistory(historyOffset + 50)}
              disabled={historyLoading || historyBusyId !== null || busyId !== null || !historyHasMore}>
              السجلات الأقدم
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
