import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardCheck, FileSpreadsheet, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { cancelStockCount, completeStockCount, fetchActiveInventoryWarehouses, fetchOpenStockCountForWarehouse, fetchStockCountLines, setStockCountLine, startStockCount } from '@/lib/api';
import type { ActiveInventoryWarehouse, InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';
import { downloadStockCountWorkbookXlsx } from '@/lib/stock-count-xlsx';
import { useAuth } from '@/lib/auth';
import { projectStockCountPrintDocument } from '@/lib/stock-count-print';
const q = (v: number | null | undefined) => v == null || !Number.isFinite(Number(v)) ? '—' : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(Number(v));
const idempotencyKey = () => 'stock-count-' + crypto.randomUUID().replace(/-/g, '');
function StockCountLineRow({
  line,
  draft,
  busy,
  saving,
  savingAny,
  onDraftChange,
  onSave,
}: {
  line: InventoryStockCountLine;
  draft: string;
  busy: boolean;
  saving: boolean;
  savingAny: boolean;
  onDraftChange: (productId: string, value: string) => void;
  onSave: (line: InventoryStockCountLine) => void;
}) {
  const parsed = draft.trim() === "" ? null : Number(draft);
  const delta = parsed === null || !Number.isFinite(parsed) ? line.variance : parsed - line.expected_quantity;
  const formattedDelta = delta == null || !Number.isFinite(delta) ? "—" : (delta > 0 ? "+" : "") + q(delta);
  const saveLabel = saving ? "جار الحفظ…" : line.counted_quantity === null ? "حفظ العد" : "تحديث العد";

  return (
    <tr>
      <td>{line.product_code}</td>
      <td><strong>{line.product_name}</strong></td>
      <td>{line.unit ?? "—"}</td>
      <td>{q(line.expected_quantity)}</td>
      <td>{q(line.expected_reserved_quantity)}</td>
      <td>
        <input
          type="number"
          min="0"
          max="999999999999.999"
          step="0.001"
          value={draft}
          aria-label={"الكمية المعدودة " + line.product_name}
          onChange={(event) => onDraftChange(line.product_id, event.target.value)}
          disabled={busy}
        />
      </td>
      <td>{formattedDelta}</td>
      <td className="stock-count-no-print">
        <button className="btn outline" onClick={() => onSave(line)} disabled={busy || savingAny}>
          {saveLabel}
        </button>
      </td>
    </tr>
  );
}

function renderStockCountWarehouseOptions(warehouses: ActiveInventoryWarehouse[]) {
  return warehouses.map((warehouse) => (
    <option key={warehouse.id} value={warehouse.id}>
      {warehouse.name}{warehouse.code ? ' · ' + warehouse.code : ''}
    </option>
  ));
}

export function InventoryStockCountPage() {
  const { user } = useAuth();
  const canFinalize = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [warehouses, setWarehouses] = useState<ActiveInventoryWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [session, setSession] = useState<InventoryStockCountSession | null>(null);
  const [lines, setLines] = useState<InventoryStockCountLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const beginRequestRef = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetchActiveInventoryWarehouses().then((items) => {
      if (!active) return;
      setWarehouses(items);
      setWarehouseId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل المستودعات.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!warehouseId) { setSession(null); setLines([]); setDrafts({}); return; }
    let active = true;
    setLoading(true); setError('');
    fetchOpenStockCountForWarehouse(warehouseId).then(async (current) => {
      if (!active) return;
      if (!current) { setSession(null); setLines([]); setDrafts({}); return; }
      const rows = await fetchStockCountLines(current.id);
      if (!active) return;
      setSession(current); setLines(rows);
      setDrafts(Object.fromEntries(rows.filter((line) => line.counted_quantity !== null).map((line) => [line.product_id, String(line.counted_quantity)])));
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل جلسة الجرد.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [warehouseId, refreshKey]);
  const counted = useMemo(() => lines.filter((line) => line.counted_quantity !== null).length, [lines]);
  const netVariance = useMemo(() => lines.reduce((sum, line) => sum + (line.variance ?? 0), 0), [lines]);
  const printDocument = useMemo(() => {
    if (!session) return null;
    const warehouse = warehouses.find((item) => item.id === session.warehouse_id);
    return projectStockCountPrintDocument(session, lines, warehouse?.name ?? null, Boolean(user?.isStaff));
  }, [session, lines, warehouses, user?.isStaff]);
  async function begin() {
    if (!warehouseId || busy) return;
    const signature = JSON.stringify([warehouseId, notes.trim() || null]);
    let request = beginRequestRef.current;
    if (!request || request.signature !== signature) {
      request = { signature, key: idempotencyKey() };
      beginRequestRef.current = request;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      // Keep the key until the command and session readback both succeed.
      // If the server committed but the response/readback was interrupted, retry the same payload.
      const created = await startStockCount(warehouseId, request.key, notes);
      const rows = await fetchStockCountLines(created.id);
      setSession(created); setLines(rows); setDrafts({}); setCancelReason('');
      beginRequestRef.current = null;
      setNotice(created.replayed ? 'استُعيدت الجلسة نفسها دون تكرارها.' : 'بدأت جلسة جرد فعلية من أرصدة المستودع المثبتة.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر بدء الجرد؛ تحقق من وجود أرصدة مثبتة.'); }
    finally { setBusy(false); }
  }
  async function save(line: InventoryStockCountLine) {
    const raw = drafts[line.product_id];
    if (raw === undefined || raw.trim() === '') { setError('أدخل العد الفعلي للصنف؛ الصفر قيمة صالحة.'); return; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 999999999999.999 || !Number.isSafeInteger(Math.round(value * 1000)) || Math.round(value * 1000) !== value * 1000) { setError('الكمية يجب أن تكون غير سالبة وبحد أقصى ثلاث منازل عشرية.'); return; }
    if (!session || savingLine) return;
    setSavingLine(line.product_id); setError(''); setNotice('');
    try {
      const saved = await setStockCountLine(session.id, line.product_id, value);
      const alreadyCounted = lines.some((row) => row.product_id === line.product_id && row.counted_quantity !== null);
      setLines((current) => current.map((row) => row.product_id === line.product_id ? { ...row, ...saved } : row));
      setSession((current) => current ? { ...current, counted_lines: Math.min(current.total_lines, current.counted_lines + (alreadyCounted ? 0 : 1)) } : current);
      setNotice('تم حفظ عدّ ' + line.product_name + '.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ العد الفعلي.'); }
    finally { setSavingLine(null); }
  }
  async function finalize() {
    if (!session || busy || !lines.length || counted !== lines.length || !canFinalize) return;
    if (!window.confirm('سيُعتمد العد وتُطبّق الفروقات في معاملة خادمية واحدة. هل راجعت جميع الأصناف؟')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await completeStockCount(session.id);
      setNotice('اكتمل الجرد. الأصناف المعدلة: ' + result.adjusted_lines + '؛ الزيادة: ' + q(result.positive_adjustment) + '؛ النقص: ' + q(result.negative_adjustment) + '.');
      setSession(null); setLines([]); setDrafts({}); setNotes(''); setRefreshKey((v) => v + 1);
    } catch (e) { setError((e instanceof Error ? e.message : 'تعذر اعتماد الجرد.') + ' إذا تغير الرصيد بعد اللقطة، ألغِ الجلسة بسبب موثق وابدأ لقطة جديدة.'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!session || busy || !canFinalize) return;
    if (cancelReason.trim().length < 3) { setError('سبب إلغاء الجلسة مطلوب.'); return; }
    if (!window.confirm('إلغاء الجلسة دون تطبيق أي فرق؟')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await cancelStockCount(session.id, cancelReason);
      setNotice('أُلغيت الجلسة وسُجل السبب في التدقيق.');
      setSession(null); setLines([]); setDrafts({}); setRefreshKey((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إلغاء الجلسة.'); }
    finally { setBusy(false); }
  }
  async function exportWorkbook() {
    if (!session) return;
    const warehouse = warehouses.find((item) => item.id === session.warehouse_id);
    if (!warehouse) { setError('تعذر تحديد المستودع المرتبط بلقطة الجرد.'); return; }
    setError(''); setNotice('');
    try {
      const started = downloadStockCountWorkbookXlsx(session, lines, warehouse.name);
      if (!started) { setError('تنزيل ملف Excel غير متاح في هذه البيئة.'); return; }
      setNotice('تم تصدير لقطة الجرد والعدود المحفوظة فقط؛ أي تعديل لم يُحفظ غير مدرج في الملف.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف Excel للجرد.');
    }
  }

  return <section className="stock-count-page" dir="rtl">
    <style>{`
      .stock-count-print-document { display:none; }
      @media print {
        @page { size:A4 landscape; margin:10mm; }
        body * { visibility:hidden !important; }
        .stock-count-print-document, .stock-count-print-document * { visibility:visible !important; }
        .stock-count-print-document {
          display:block !important; position:absolute; inset:0; width:100%;
          padding:0; direction:rtl; font-family:Arial,sans-serif;
          color:#000 !important; background:#fff !important;
        }
        .stock-count-no-print { display:none !important; }
        .stock-count-print-document header { margin-bottom:12px; }
        .stock-count-print-document h1 { margin:0 0 5px; font-size:18pt; }
        .stock-count-print-document h2 { margin:0 0 8px; font-size:13pt; }
        .stock-count-print-document .print-meta {
          display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
          gap:6px 18px; margin:10px 0 14px;
        }
        .stock-count-print-document table { width:100%; border-collapse:collapse; font-size:10px; }
        .stock-count-print-document thead { display:table-header-group; }
        .stock-count-print-document tr { break-inside:avoid; page-break-inside:avoid; }
        .stock-count-print-document th,.stock-count-print-document td {
          border:1px solid #999 !important; padding:5px;
          color:#000 !important; text-align:right; white-space:normal;
        }
        .stock-count-print-document .print-footer { margin-top:10px; font-size:9px; }
      }
    `}</style>
    <header className="heading"><div className="heading-icon"><ClipboardCheck size={24} /></div><div><span>الأصناف والمخزون</span><h1>الجرد الفعلي</h1><p>لقطة محفوظة، عدّ لكل صنف، واعتماد إداري للفروقات دون الكتابة فوق حركة مخزون أحدث.</p></div></header>
    <section className="panel">
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <label>المستودع النشط<select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={loading || busy || Boolean(session)}><option value="">اختر المستودع</option>{renderStockCountWarehouseOptions(warehouses)}</select></label>
        {!session && <label>ملاحظات بداية الجرد (اختياري)<input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="سبب الجرد أو رقم محضر العد" disabled={busy || !warehouseId} /></label>}
        <div className="toolbar-actions stock-count-no-print">
          <button className="btn outline" onClick={() => setRefreshKey((v) => v + 1)} disabled={loading || busy}><RefreshCw size={16} /> تحديث</button>
          {session && <button className="btn secondary stock-count-no-print" onClick={() => void exportWorkbook()} disabled={busy || savingLine !== null || !lines.length}><FileSpreadsheet size={16} /> تصدير الجرد إلى Excel</button>}
          {session && printDocument && <button className="btn outline" onClick={() => window.print()} disabled={busy}><Printer size={16} /> طباعة ورقة الجرد</button>}
          {!session && <button className="btn primary" onClick={() => void begin()} disabled={loading || !warehouseId || busy}><ClipboardCheck size={16} /> بدء جلسة جرد فعلية</button>}
        </div>
      </div>
      <p className="text-muted">لا تُنشأ أصناف أو أرصدة أو عمليات تاريخية تلقائيًا؛ تبدأ الجلسة من الأرصدة الموجودة في المستودع المحدد فقط.</p>
    </section>
    {error && <div className="form-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
    {notice && <div className="data-status success" role="status"><Check size={16} /> {notice}</div>}
    {loading && <section className="panel">جار تحميل بيانات الجرد المحفوظة…</section>}
    {!loading && !warehouses.length && <section className="panel">لا توجد مستودعات نشطة متاحة لهذا الحساب ضمن المؤسسة الحالية.</section>}
    {!loading && warehouseId && !session && warehouses.length > 0 && <section className="panel"><ShieldCheck size={22} /><h2>لا توجد جلسة جرد مفتوحة</h2><p className="text-muted">ابدأ جلسة لحفظ لقطة النظام ثم أدخل الكمية المعدودة لكل صنف؛ اعتماد الفروقات يحتاج صلاحية المدير.</p></section>}
    {session && <section className="panel stock-count-no-print">
      <div className="panel-head"><div><h2>جلسة الجرد المفتوحة</h2><p className="text-muted">بدأت: {new Date(session.started_at).toLocaleString('ar-YE')}</p></div><span className="badge warning">بانتظار الاعتماد</span></div>
      <div className="report-grid"><article className="report-metric"><span>أصناف اللقطة</span><strong>{q(session.total_lines)}</strong></article><article className="report-metric"><span>تم حفظ عدها</span><strong>{q(counted)} / {q(lines.length)}</strong></article><article className="report-metric"><span>صافي الفروقات المسجلة</span><strong>{q(netVariance)}</strong></article></div>
      <p className="text-muted">رصيد اللقطة يمثل كمية النظام عند البداية. إذا تغيرت الأرصدة أو الحجوزات بعد اللقطة، سيرفض الخادم الإقفال بدل الكتابة فوق حركة أحدث.</p>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th><th>رصيد اللقطة</th><th>محجوز</th><th>العد الفعلي</th><th>الفرق</th><th className="stock-count-no-print">حفظ</th></tr></thead><tbody>
        {lines.map((line) => (
          <StockCountLineRow
            key={line.product_id}
            line={line}
            draft={drafts[line.product_id] ?? (line.counted_quantity === null ? "" : String(line.counted_quantity))}
            busy={busy}
            saving={savingLine === line.product_id}
            savingAny={savingLine !== null}
            onDraftChange={(productId, value) => setDrafts((current) => ({ ...current, [productId]: value }))}
            onSave={(row) => void save(row)}
          />
        ))}
      </tbody></table></div>
      {!lines.length && <p className="text-muted">لا توجد أصناف في لقطة الجرد؛ لا تُستخدم بيانات تجريبية.</p>}
      <div className="toolbar-actions stock-count-no-print" style={{ marginTop: 16 }}><button className="btn primary" onClick={() => void finalize()} disabled={busy || !canFinalize || !lines.length || counted !== lines.length}><ShieldCheck size={16} /> {canFinalize ? 'اعتماد الجرد وتطبيق الفروقات' : 'بانتظار اعتماد المدير'}</button>{!canFinalize && <span className="text-muted">يمكنك إدخال العد؛ الإقفال النهائي محصور بالمدير أو مدير النظام.</span>}</div>
      {canFinalize && <div className="form-grid stock-count-no-print" style={{ marginTop: 12 }}><label>سبب إلغاء الجلسة<input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000} placeholder="سبب موثق؛ مطلوب للإلغاء" disabled={busy} /></label><button className="btn outline" onClick={() => void cancel()} disabled={busy || cancelReason.trim().length < 3}>إلغاء الجلسة دون تعديل الرصيد</button></div>}
    </section>}
    {printDocument && <section className="stock-count-print-document" dir="rtl" aria-label="ورقة الجرد المطبوعة">
      <header>
        <h1>متجر الأغبري | Aghbari Commerce</h1>
        <h2>ورقة الجرد الفعلي</h2>
        <div className="print-meta">
          <span><strong>المستودع:</strong> {printDocument.warehouseName}</span>
          <span><strong>حالة الجلسة:</strong> {printDocument.statusLabel}</span>
          <span><strong>وقت بدء الجرد:</strong> {new Date(printDocument.startedAt).toLocaleString('ar-YE')}</span>
          <span><strong>الأصناف المعدودة:</strong> {q(printDocument.countedLines)} / {q(printDocument.totalLines)}</span>
        </div>
      </header>
      <table>
        <thead><tr>
          <th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th><th>رصيد اللقطة</th>
          <th>المحجوز</th><th>العد المحفوظ</th><th>الفرق المحفوظ</th>
        </tr></thead>
        <tbody>{printDocument.items.map((item) => (
          <tr key={item.itemCode + '-' + item.productName}>
            <td>{item.itemCode}</td><td>{item.productName}</td><td>{item.unit ?? '—'}</td>
            <td>{q(item.expectedQuantity)}</td><td>{q(item.reservedQuantity)}</td>
            <td>{item.countedQuantity === null ? 'غير معدود' : q(item.countedQuantity)}</td>
            <td>{item.variance === null ? '—' : (item.variance > 0 ? '+' : '') + q(item.variance)}</td>
          </tr>
        ))}</tbody>
      </table>
      {!printDocument.items.length && <p>لا توجد أصناف في لقطة الجرد.</p>}
      <p className="print-footer">تتضمن هذه الورقة القيم المحفوظة لدى الخادم فقط؛ التعديلات غير المحفوظة في شاشة العد غير مدرجة.</p>
    </section>}
  </section>;
}
