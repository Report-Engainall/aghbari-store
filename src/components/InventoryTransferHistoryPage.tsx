import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, FileSpreadsheet, Plus, Printer, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  fetchActiveInventoryWarehouses, fetchInventoryTransferHistory, fetchInventoryTransferProducts,
  transferInventoryBatch, type InventoryTransferHistoryRow,
} from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import {
  inventoryTransferBatchSignature, normalizeInventoryTransferBatchDraft,
  type InventoryTransferBatchDraft,
} from '@/lib/inventory-transfer-batch';
import { useAuth } from '@/lib/auth';
import { downloadInventoryTransferHistoryWorkbookXlsx } from '@/lib/inventory-transfer-history-xlsx';
import { projectInventoryTransferPrintRow } from '@/lib/inventory-transfer-history-print';

type DraftLine = { productId: string; quantity: string };
type TransferPreview = { signature: string; draft: ReturnType<typeof normalizeInventoryTransferBatchDraft> };
const quantityText = (value: number | null | undefined) => value == null || !Number.isFinite(Number(value))
  ? '—' : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(Number(value));
const dateText = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ar-YE', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};


type TransferWarehouse = Awaited<ReturnType<typeof fetchActiveInventoryWarehouses>>[number];
type TransferProduct = Awaited<ReturnType<typeof fetchInventoryTransferProducts>>[number];

function renderTransferWarehouseOptions(warehouses: TransferWarehouse[]) {
  return warehouses.map((warehouse) => (
    <option key={warehouse.id} value={warehouse.id}>
      {warehouse.name}{warehouse.code ? " — " + warehouse.code : ""}
    </option>
  ));
}

function renderDestinationWarehouseOptions(warehouses: TransferWarehouse[], sourceWarehouseId: string) {
  const eligibleWarehouses = warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId);
  return renderTransferWarehouseOptions(eligibleWarehouses);
}

function TransferPageHeading() {
  return (
    <header className="heading">
      <div className="heading-icon"><ClipboardList size={24} /></div>
      <div>
        <span>الأصناف والمخزون</span>
        <h1>سجل تحويلات المخزون</h1>
        <p>تحويل عدة أصناف بين مستودعين داخل المؤسسة في معاملة خادمية واحدة، مع حماية الحجوزات وسجل الحركات والتدقيق.</p>
      </div>
    </header>
  );
}

function TransferWarehouseFields({
  warehouses,
  sourceWarehouseId,
  destinationWarehouseId,
  reason,
  submitting,
  onSourceChange,
  onDestinationChange,
  onReasonChange,
}: {
  warehouses: TransferWarehouse[];
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  reason: string;
  submitting: boolean;
  onSourceChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onReasonChange: (value: string) => void;
}) {
  return (
    <div className="form-grid">
      <label>مستودع المصدر
        <select aria-label="المستودع المصدر" value={sourceWarehouseId} onChange={(event) => onSourceChange(event.target.value)} disabled={submitting}>
          <option value="">اختر المستودع المصدر</option>
          {renderTransferWarehouseOptions(warehouses)}
        </select>
      </label>
      <label>مستودع الوجهة
        <select aria-label="المستودع الوجهة" value={destinationWarehouseId} onChange={(event) => onDestinationChange(event.target.value)} disabled={submitting}>
          <option value="">اختر المستودع الوجهة</option>
          {renderDestinationWarehouseOptions(warehouses, sourceWarehouseId)}
        </select>
      </label>
      <label>سبب التحويل
        <input aria-label="سبب التحويل" maxLength={1000} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="مثال: تغذية فرع أو إعادة توزيع" disabled={submitting} />
      </label>
    </div>
  );
}

function TransferDraftLineRow({
  line,
  index,
  products,
  submitting,
  canRemove,
  onProductChange,
  onQuantityChange,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  products: TransferProduct[];
  submitting: boolean;
  canRemove: boolean;
  onProductChange: (index: number, value: string) => void;
  onQuantityChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <tr>
      <td>
        <select aria-label={"الصنف في الدفعة " + (index + 1)} value={line.productId} onChange={(event) => onProductChange(index, event.target.value)} disabled={submitting}>
          <option value="">اختر صنفًا</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.item_code ? product.item_code + " — " : ""}{product.name}</option>)}
        </select>
      </td>
      <td>
        <input aria-label={"الكمية في الدفعة " + (index + 1)} type="number" min="0.001" max="999999999999.999" step="0.001" value={line.quantity} onChange={(event) => onQuantityChange(index, event.target.value)} disabled={submitting} />
      </td>
      <td className="inventory-transfer-no-print">
        <button className="btn outline" onClick={() => onRemove(index)} disabled={submitting || !canRemove} aria-label={"حذف الصنف من الدفعة " + (index + 1)}>
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  );
}

function TransferDraftLinesTable({
  lines,
  products,
  submitting,
  onProductChange,
  onQuantityChange,
  onRemove,
}: {
  lines: DraftLine[];
  products: TransferProduct[];
  submitting: boolean;
  onProductChange: (index: number, value: string) => void;
  onQuantityChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table aria-label="أصناف دفعة التحويل">
        <thead><tr><th>الصنف</th><th>الكمية</th><th className="inventory-transfer-no-print">إجراء</th></tr></thead>
        <tbody>
          {lines.map((line, index) => (
            <TransferDraftLineRow
              key={index}
              line={line}
              index={index}
              products={products}
              submitting={submitting}
              canRemove={lines.length > 1}
              onProductChange={onProductChange}
              onQuantityChange={onQuantityChange}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransferPreviewPanel({
  preview,
  warehouses,
  products,
  submitting,
  onSubmit,
}: {
  preview: TransferPreview;
  warehouses: TransferWarehouse[];
  products: TransferProduct[];
  submitting: boolean;
  onSubmit: () => void;
}) {
  const sourceName = warehouses.find((warehouse) => warehouse.id === preview.draft.sourceWarehouseId)?.name ?? "المصدر";
  const destinationName = warehouses.find((warehouse) => warehouse.id === preview.draft.destinationWarehouseId)?.name ?? "الوجهة";

  return (
    <section className="panel" aria-label="معاينة دفعة التحويل" style={{ marginTop: 12 }}>
      <h3>معاينة قبل التنفيذ</h3>
      <p>{preview.draft.lines.length} صنفًا — من {sourceName} إلى {destinationName}.</p>
      <p>سبب التحويل: {preview.draft.reason}</p>
      <ul>
        {preview.draft.lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          const label = product?.item_code ? product.item_code + " — " : "";
          return <li key={line.productId}>{label}{product?.name ?? "صنف محدد"}: {quantityText(line.quantity)}</li>;
        })}
      </ul>
      <button className="btn primary" onClick={onSubmit} disabled={submitting}>
        {submitting ? "جار تنفيذ الدفعة..." : "اعتماد التحويل وتنفيذه"}
      </button>
    </section>
  );
}

function TransferBatchForm({
  warehouses,
  products,
  warehousesLoading,
  productsLoading,
  warehousesError,
  productsError,
  sourceWarehouseId,
  destinationWarehouseId,
  reason,
  draftLines,
  preview,
  submitting,
  error,
  notice,
  onSourceChange,
  onDestinationChange,
  onReasonChange,
  onProductChange,
  onQuantityChange,
  onRemoveLine,
  onAddLine,
  onPreview,
  onSubmit,
}: {
  warehouses: TransferWarehouse[];
  products: TransferProduct[];
  warehousesLoading: boolean;
  productsLoading: boolean;
  warehousesError: string | null;
  productsError: string | null;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  reason: string;
  draftLines: DraftLine[];
  preview: TransferPreview | null;
  submitting: boolean;
  error: string;
  notice: string;
  onSourceChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onProductChange: (index: number, value: string) => void;
  onQuantityChange: (index: number, value: string) => void;
  onRemoveLine: (index: number) => void;
  onAddLine: () => void;
  onPreview: () => void;
  onSubmit: () => void;
}) {
  const loading = warehousesLoading || productsLoading;
  const canPreview = !submitting && !loading && products.length > 0 && warehouses.length >= 2;

  return (
    <section className="panel inventory-transfer-no-print">
      <div className="panel-head">
        <div>
          <h2>تحويل دفعة أصناف</h2>
          <p className="text-muted">المعاينة لا تغيّر المخزون. التنفيذ النهائي يعيد التحقق خادميًا من المؤسسة والصلاحيات والكميات المتاحة.</p>
        </div>
        <ShieldCheck size={22} />
      </div>
      {loading ? <p className="text-muted">جار تحميل المستودعات والأصناف...</p> : null}
      {warehousesError || productsError ? <div className="form-error" role="alert">{warehousesError || productsError}</div> : null}
      <TransferWarehouseFields
        warehouses={warehouses}
        sourceWarehouseId={sourceWarehouseId}
        destinationWarehouseId={destinationWarehouseId}
        reason={reason}
        submitting={submitting}
        onSourceChange={onSourceChange}
        onDestinationChange={onDestinationChange}
        onReasonChange={onReasonChange}
      />
      <TransferDraftLinesTable
        lines={draftLines}
        products={products}
        submitting={submitting}
        onProductChange={onProductChange}
        onQuantityChange={onQuantityChange}
        onRemove={onRemoveLine}
      />
      <div className="toolbar-actions inventory-transfer-no-print" style={{ marginTop: 12 }}>
        <button className="btn outline" onClick={onAddLine} disabled={submitting || draftLines.length >= 200}>
          <Plus size={16} /> إضافة صنف للدفعة
        </button>
        <button className="btn outline" onClick={onPreview} disabled={!canPreview}>معاينة التحويل</button>
      </div>
      {!products.length && !productsLoading ? <p className="text-muted">لا توجد أصناف نشطة متاحة لإضافتها إلى التحويل.</p> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="data-status success" role="status">{notice}</div> : null}
      {preview ? <TransferPreviewPanel preview={preview} warehouses={warehouses} products={products} submitting={submitting} onSubmit={onSubmit} /> : null}
      <p className="text-muted">الدفعة الواحدة محدودة بـ200 صنف مختلف. تبقى الحجوزات كما هي، وتُرفض الدفعة كاملة إذا لم تتوفر كمية أحد الأصناف أو تغيّر رصيد المصدر أثناء التحقق.</p>
    </section>
  );
}

function TransferHistoryFilters({
  warehouses,
  search,
  warehouseFilter,
  dateFrom,
  dateTo,
  onSearch,
  onWarehouse,
  onDateFrom,
  onDateTo,
}: {
  warehouses: TransferWarehouse[];
  search: string;
  warehouseFilter: string;
  dateFrom: string;
  dateTo: string;
  onSearch: (value: string) => void;
  onWarehouse: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
}) {
  return (
    <div className="form-grid inventory-transfer-no-print">
      <label>بحث في الحركات
        <input aria-label="بحث في الحركات" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="الصنف، الرمز، المستودع، السبب أو المعرّف" />
      </label>
      <label>تصفية المستودع
        <select aria-label="تصفية المستودع" value={warehouseFilter} onChange={(event) => onWarehouse(event.target.value)}>
          <option value="all">كل المستودعات</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select>
      </label>
      <label>من تاريخ<input aria-label="من تاريخ" type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} /></label>
      <label>إلى تاريخ<input aria-label="إلى تاريخ" type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} /></label>
    </div>
  );
}

function InventoryTransferPrintRow({ sourceRow }: { sourceRow: InventoryTransferHistoryRow }) {
  const row = projectInventoryTransferPrintRow(sourceRow);
  return (
    <tr>
      <td>{dateText(row.created_at)}</td>
      <td>{row.item_code ?? "—"}</td>
      <td>{row.product_name ?? "صنف غير متاح"}{row.unit ? " (" + row.unit + ")" : ""}</td>
      <td>{row.source_warehouse_name ?? "مستودع غير متاح"}</td>
      <td>{row.destination_warehouse_name ?? "مستودع غير متاح"}</td>
      <td>{quantityText(row.quantity)}</td>
      <td>{row.transfer_type}</td>
      <td>{row.reason}</td>
    </tr>
  );
}

function InventoryTransferPrintSheet({
  rows,
  loading,
  error,
}: {
  rows: InventoryTransferHistoryRow[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="inventory-transfer-print" dir="rtl">
      <div>
        <h2>سجل تحويلات المخزون</h2>
        <p>عدد الحركات المطابقة للفلاتر: {rows.length} — وقت الطباعة: {dateText(new Date().toISOString())}</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="سجل تحويلات المخزون">
          <thead><tr><th>التاريخ</th><th>رمز الصنف</th><th>الصنف</th><th>من مستودع</th><th>إلى مستودع</th><th>الكمية</th><th>نوع التحويل</th><th>السبب</th></tr></thead>
          <tbody>{rows.map((row) => <InventoryTransferPrintRow key={row.id} sourceRow={row} />)}</tbody>
        </table>
      </div>
      {!loading && !error && rows.length === 0 ? <p className="text-muted">لا توجد حركات تحويل تطابق الفلاتر. لا تُنشأ بيانات تجريبية.</p> : null}
    </div>
  );
}

function InventoryTransferHistoryPanel({
  warehouses,
  rows,
  loading,
  error,
  exportError,
  onRefresh,
  onExport,
  onPrint,
  search,
  warehouseFilter,
  dateFrom,
  dateTo,
  onSearch,
  onWarehouse,
  onDateFrom,
  onDateTo,
}: {
  warehouses: TransferWarehouse[];
  rows: InventoryTransferHistoryRow[];
  loading: boolean;
  error: string | null;
  exportError: string;
  onRefresh: () => void;
  onExport: () => void;
  onPrint: () => void;
  search: string;
  warehouseFilter: string;
  dateFrom: string;
  dateTo: string;
  onSearch: (value: string) => void;
  onWarehouse: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head inventory-transfer-no-print">
        <div>
          <h2>الحركات المسجلة</h2>
          <p className="text-muted">آخر 500 حركة في المؤسسة الحالية؛ يُطبّق التصفية على البيانات التي أرجعها الخادم.</p>
        </div>
        <div className="toolbar-actions">
          <button className="btn outline" onClick={onRefresh} disabled={loading}><RefreshCw size={16} /> تحديث</button>
          <button className="btn outline" onClick={onExport} disabled={loading || Boolean(error) || !rows.length}><FileSpreadsheet size={16} /> تنزيل Excel للنتائج</button>
          <button className="btn outline" onClick={onPrint} disabled={!rows.length}><Printer size={16} /> طباعة النتائج المفلترة</button>
        </div>
      </div>
      <TransferHistoryFilters
        warehouses={warehouses}
        search={search}
        warehouseFilter={warehouseFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearch={onSearch}
        onWarehouse={onWarehouse}
        onDateFrom={onDateFrom}
        onDateTo={onDateTo}
      />
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {exportError ? <div className="form-error" role="alert">{exportError}</div> : null}
      {loading ? <p className="text-muted">جار تحميل سجل التحويلات المحفوظة...</p> : null}
      <InventoryTransferPrintSheet rows={rows} loading={loading} error={error} />
    </section>
  );
}

export function InventoryTransferHistoryPage() {
  const { user } = useAuth();
  const canView = Boolean(user?.isStaff);
  const { data: warehouses, loading: warehousesLoading, error: warehousesError } = useFetch(fetchActiveInventoryWarehouses);
  const { data: products, loading: productsLoading, error: productsError } = useFetch(fetchInventoryTransferProducts);
  const [historyVersion, setHistoryVersion] = useState(0);
  const { data: history, loading: historyLoading, error: historyError, refetch: refetchHistory } =
    useFetch(fetchInventoryTransferHistory, [historyVersion]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ productId: '', quantity: '1' }]);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retryIdentity = useRef<{ signature: string; key: string } | null>(null);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [historyExportError, setHistoryExportError] = useState('');

  useEffect(() => {
    const rows = warehouses ?? [];
    if (!rows.length) return;
    const nextSource = sourceWarehouseId && rows.some((row) => row.id === sourceWarehouseId)
      ? sourceWarehouseId : rows[0].id;
    setSourceWarehouseId(nextSource);
    setDestinationWarehouseId((old) => old && old !== nextSource && rows.some((row) => row.id === old)
      ? old : (rows.find((row) => row.id !== nextSource)?.id ?? ''));
  }, [warehouses, sourceWarehouseId]);

  const activeProducts = useMemo(
    () => (products ?? []).filter((product) => product.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [products],
  );
  function exportFilteredHistory() {
    setHistoryExportError('');
    try {
      downloadInventoryTransferHistoryWorkbookXlsx(filteredHistory, {
        generated_at: new Date().toISOString(),
        search: search.trim(),
        warehouse: warehouseFilter === 'all'
          ? 'كل المستودعات'
          : warehouses?.find((warehouse) => warehouse.id === warehouseFilter)?.name ?? 'مستودع محدد',
        date_from: dateFrom,
        date_to: dateTo,
        source_limit: 500,
      });
    } catch (cause) {
      setHistoryExportError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف Excel لسجل التحويلات.');
    }
  }

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar');
    return (history ?? []).filter((row) => {
      const text = [
        row.item_code, row.product_name, row.source_warehouse_name, row.destination_warehouse_name,
        row.reason, row.created_by, row.id, row.batch_id,
      ].filter(Boolean).join(' ').toLocaleLowerCase('ar');
      if (term && !text.includes(term)) return false;
      if (warehouseFilter !== 'all' && row.source_warehouse_id !== warehouseFilter && row.destination_warehouse_id !== warehouseFilter) return false;
      const day = row.created_at.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [history, search, warehouseFilter, dateFrom, dateTo]);

  function changeLines(next: DraftLine[] | ((current: DraftLine[]) => DraftLine[])) {
    setDraftLines(next);
    setPreview(null);
    setError('');
    setNotice('');
  }
  function buildDraft(): ReturnType<typeof normalizeInventoryTransferBatchDraft> {
    const input: InventoryTransferBatchDraft = {
      sourceWarehouseId, destinationWarehouseId, reason,
      lines: draftLines.map((line) => ({ productId: line.productId, quantity: line.quantity.trim() === '' ? Number.NaN : Number(line.quantity) })),
    };
    return normalizeInventoryTransferBatchDraft(input);
  }
  function createPreview() {
    setError(''); setNotice('');
    try {
      const normalized = buildDraft();
      setPreview({ signature: inventoryTransferBatchSignature(normalized), draft: normalized });
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'تعذر التحقق من دفعة التحويل.');
    }
  }
  async function submitBatch() {
    if (!preview || submitting) return;
    setError(''); setNotice('');
    let normalized: ReturnType<typeof normalizeInventoryTransferBatchDraft>;
    let signature: string;
    try {
      normalized = buildDraft();
      signature = inventoryTransferBatchSignature(normalized);
      if (signature !== preview.signature) {
        setPreview(null);
        setError('تغيرت بيانات التحويل بعد المعاينة؛ راجع الدفعة وعاينها مجددًا.');
        return;
      }
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'بيانات التحويل غير صالحة.');
      return;
    }
    const idempotencyKey = retryIdentity.current?.signature === signature
      ? retryIdentity.current.key : crypto.randomUUID().replace(/-/g, '');
    retryIdentity.current = { signature, key: idempotencyKey };
    setSubmitting(true);
    try {
      const result = await transferInventoryBatch({ ...normalized, idempotencyKey });
      setNotice(result.idempotent_replay
        ? 'أكد الخادم التحويل السابق دون تكرار حركات المخزون.'
        : 'تم تنفيذ دفعة التحويل وحفظ حركة مستقلة لكل صنف.');
      retryIdentity.current = null;
      setPreview(null);
      setDraftLines([{ productId: '', quantity: '1' }]);
      setReason('');
      setHistoryVersion((version) => version + 1);
      await refetchHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ دفعة التحويل.');
      // Keep the same key for an exact retry. Editing the payload yields a different signature/key.
    } finally {
      setSubmitting(false);
    }
  }

  const allWarehouses = warehouses ?? [];
  const allHistory = filteredHistory;

  const handleSourceChange = (value: string) => {
    setSourceWarehouseId(value);
    setPreview(null);
    setError("");
  };
  const handleDestinationChange = (value: string) => {
    setDestinationWarehouseId(value);
    setPreview(null);
    setError("");
  };
  const handleReasonChange = (value: string) => {
    setReason(value);
    setPreview(null);
    setError("");
  };
  const handleProductChange = (index: number, value: string) => {
    changeLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: value } : item));
  };
  const handleQuantityChange = (index: number, value: string) => {
    changeLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: value } : item));
  };
  const handleAddLine = () => {
    changeLines((current) => current.length >= 200 ? current : [...current, { productId: "", quantity: "1" }]);
  };
  const handleRemoveLine = (index: number) => {
    changeLines((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  if (!canView) {
    return (
      <section className="inventory-transfer-page" dir="rtl">
        <TransferPageHeading />
        <section className="panel" role="status">يلزم تسجيل الدخول بحساب موظف مخول للوصول إلى سجل التحويلات.</section>
      </section>
    );
  }

  return (
    <section className="inventory-transfer-page" dir="rtl">
      <style>{'@page { size: A4 landscape; margin: 10mm; } @media print { body * { visibility: hidden !important; } .inventory-transfer-print, .inventory-transfer-print * { visibility: visible !important; } .inventory-transfer-print { position: absolute; inset: 0; width: 100%; color: #000 !important; background: #fff !important; } .inventory-transfer-no-print { display: none !important; } .inventory-transfer-print table { width: 100%; border-collapse: collapse; font-size: 9px; } .inventory-transfer-print th, .inventory-transfer-print td { border: 1px solid #999 !important; padding: 5px; color: #000 !important; text-align: right; overflow-wrap: anywhere; } }'}</style>
      <TransferPageHeading />
      <TransferBatchForm
        warehouses={allWarehouses}
        products={activeProducts}
        warehousesLoading={warehousesLoading}
        productsLoading={productsLoading}
        warehousesError={warehousesError}
        productsError={productsError}
        sourceWarehouseId={sourceWarehouseId}
        destinationWarehouseId={destinationWarehouseId}
        reason={reason}
        draftLines={draftLines}
        preview={preview}
        submitting={submitting}
        error={error}
        notice={notice}
        onSourceChange={handleSourceChange}
        onDestinationChange={handleDestinationChange}
        onReasonChange={handleReasonChange}
        onProductChange={handleProductChange}
        onQuantityChange={handleQuantityChange}
        onRemoveLine={handleRemoveLine}
        onAddLine={handleAddLine}
        onPreview={createPreview}
        onSubmit={() => void submitBatch()}
      />
      <InventoryTransferHistoryPanel
        warehouses={allWarehouses}
        rows={allHistory}
        loading={historyLoading}
        error={historyError}
        exportError={historyExportError}
        onRefresh={() => setHistoryVersion((version) => version + 1)}
        onExport={exportFilteredHistory}
        onPrint={() => window.print()}
        search={search}
        warehouseFilter={warehouseFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearch={setSearch}
        onWarehouse={setWarehouseFilter}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
      />
    </section>
  );
}