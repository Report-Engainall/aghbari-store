import { useState, type FormEvent } from 'react'
import { Download, FileSpreadsheet, PackageSearch, RefreshCw, ScanLine, Search, Warehouse } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency } from '@/lib/utils'

type ProductResult = {
  id: string
  sku: string | null
  item_code: string | null
  name: string
  name_ar: string | null
  barcode: string | null
  unit: string | null
  is_active: boolean
  stock_quantity: number | null
  min_stock: number | null
}
type BalanceResult = { warehouse_id: string; quantity_on_hand: number; quantity_reserved: number; quantity_available: number }
type WarehouseResult = { id: string; name: string; code: string | null }
type ExportKind = 'products' | 'orders' | 'customers' | 'invoices'
type CsvRow = Record<string, unknown>

const exportLabels: Record<ExportKind, string> = {
  products: 'المنتجات',
  orders: 'الطلبات',
  customers: 'العملاء',
  invoices: 'الفواتير',
}
const csvFields: Record<ExportKind, { key: string; label: string }[]> = {
  products: [
    { key: 'sku', label: 'SKU' }, { key: 'item_code', label: 'رمز الصنف' },
    { key: 'name', label: 'اسم المنتج' }, { key: 'name_ar', label: 'الاسم العربي' },
    { key: 'barcode', label: 'الباركود' }, { key: 'unit', label: 'الوحدة' },
    { key: 'is_active', label: 'نشط' }, { key: 'stock_quantity', label: 'كمية النظام' },
  ],
  orders: [
    { key: 'order_number', label: 'رقم الطلب' }, { key: 'status', label: 'الحالة' },
    { key: 'payment_status', label: 'حالة الدفع' }, { key: 'total_amount', label: 'الإجمالي' },
    { key: 'created_at', label: 'تاريخ الإنشاء' },
  ],
  customers: [
    { key: 'customer_code', label: 'رمز العميل' }, { key: 'business_name', label: 'اسم العميل/الشركة' },
    { key: 'tier', label: 'الشريحة' }, { key: 'status', label: 'الحالة' },
    { key: 'phone', label: 'الهاتف' }, { key: 'email', label: 'البريد الإلكتروني' },
    { key: 'created_at', label: 'تاريخ الإنشاء' },
  ],
  invoices: [
    { key: 'invoice_number', label: 'رقم الفاتورة' }, { key: 'invoice_kind', label: 'نوع الفاتورة' },
    { key: 'status', label: 'الحالة' }, { key: 'total', label: 'الإجمالي' },
    { key: 'created_at', label: 'تاريخ الإنشاء' },
  ],
}

async function queryExportPage(kind: ExportKind, organizationId: string, from: number, to: number) {
  switch (kind) {
    case 'products':
      return supabase.from('products').select('sku,item_code,name,name_ar,barcode,unit,is_active,stock_quantity,created_at')
        .eq('organization_id', organizationId).order('created_at').range(from, to)
    case 'orders':
      return supabase.from('orders').select('order_number,status,payment_status,total_amount,created_at')
        .eq('organization_id', organizationId).order('created_at').range(from, to)
    case 'customers':
      return supabase.from('customers').select('customer_code,business_name,tier,status,phone,email,created_at')
        .eq('organization_id', organizationId).order('created_at').range(from, to)
    case 'invoices':
      return supabase.from('invoices').select('invoice_number,invoice_kind,status,total,created_at')
        .eq('organization_id', organizationId).order('created_at').range(from, to)
  }
}

function csvEscape(value: unknown) {
  let text: string
  if (value === null || value === undefined) text = ''
  else if (typeof value === 'object') text = JSON.stringify(value)
  else text = String(value)
  return '"' + text.replace(/"/g, '""') + '"'
}

export function BarcodeLookup() {
  const { organization } = useAuth()
  const [barcode, setBarcode] = useState('')
  const [product, setProduct] = useState<ProductResult | null>(null)
  const [balances, setBalances] = useState<(BalanceResult & { warehouse?: WarehouseResult })[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchedCode, setSearchedCode] = useState('')

  const lookup = async (event: FormEvent) => {
    event.preventDefault()
    const code = barcode.trim()
    setProduct(null); setBalances([]); setError(''); setSearchedCode(code)
    if (!organization?.id) { setError('لا توجد مؤسسة نشطة مرتبطة بهذا المستخدم.'); return }
    if (!code) { setError('أدخل الباركود أو امسحه باستخدام قارئ الباركود المتصل كلوحة مفاتيح.'); return }
    setLoading(true)
    try {
      const { data, error: productError } = await supabase.from('products')
        .select('id,sku,item_code,name,name_ar,barcode,unit,is_active,stock_quantity,min_stock')
        .eq('organization_id', organization.id).eq('barcode', code).maybeSingle()
      if (productError) throw productError
      if (!data) { setError('لم يُعثر على منتج بهذا الباركود ضمن المؤسسة الحالية.'); return }
      const found = data as ProductResult
      setProduct(found)
      const { data: balanceData, error: balanceError } = await supabase.from('inventory_balances')
        .select('warehouse_id,quantity_on_hand,quantity_reserved,quantity_available').eq('product_id', found.id)
      if (balanceError) throw balanceError
      const rows = (balanceData || []) as BalanceResult[]
      if (rows.length) {
        const ids = rows.map(row => row.warehouse_id)
        const { data: warehouseData, error: warehouseError } = await supabase.from('warehouses').select('id,name,code').in('id', ids)
        if (warehouseError) throw warehouseError
        const names = new Map(((warehouseData || []) as WarehouseResult[]).map(row => [row.id, row]))
        setBalances(rows.map(row => ({ ...row, warehouse: names.get(row.warehouse_id) })))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر قراءة المنتج والمخزون من قاعدة البيانات.')
    } finally { setLoading(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><ScanLine className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold">ماسح الباركود</h1><p className="mt-1 text-sm text-neutral-500">يقبل قارئ الباركود الذي يكتب في حقل الإدخال أو إدخال الرمز يدويًا. البحث معزول بالمؤسسة ويقرأ الرصيد الفعلي من قاعدة البيانات.</p></div></div>
    <form onSubmit={lookup} className="card flex flex-col gap-3 p-4 sm:flex-row">
      <label className="min-w-0 flex-1"><span className="mb-1.5 block text-sm font-semibold">الباركود / SKU</span><input autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} className="input font-mono" value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="امسح الرمز هنا ثم اضغط Enter" aria-label="الباركود" /></label>
      <div className="flex items-end gap-2"><button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={loading}><Search className="h-4 w-4"/>{loading?'جارٍ البحث…':'بحث'}</button><button type="button" className="btn-secondary" disabled={loading} onClick={()=>{setBarcode('');setProduct(null);setBalances([]);setError('');setSearchedCode('')}} aria-label="مسح البحث">مسح</button></div>
    </form>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    {loading && <div className="card flex items-center justify-center gap-2 p-8 text-sm text-neutral-500"><RefreshCw className="h-4 w-4 animate-spin"/>جارٍ قراءة المنتج وأرصدته…</div>}
    {product && !loading && <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs text-neutral-500">نتيجة مطابقة مباشرة</p><h2 className="mt-1 text-xl font-bold">{product.name_ar || product.name}</h2><p className="mt-1 text-sm text-neutral-500">{product.name}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.is_active?'bg-emerald-50 text-emerald-700':'bg-neutral-100 text-neutral-600'}`}>{product.is_active?'نشط':'غير نشط'}</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">الباركود</p><p className="mt-1 break-all font-mono font-semibold">{product.barcode || searchedCode}</p></div><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">SKU / رمز الصنف</p><p className="mt-1 font-mono font-semibold">{product.sku || product.item_code || '—'}</p></div><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">كمية النظام</p><p className="mt-1 text-lg font-bold">{product.stock_quantity ?? '—'} {product.unit || ''}</p></div></div>
      <div className="mt-5"><h3 className="mb-3 font-bold">الأرصدة حسب المستودع</h3>{balances.length===0?<div className="rounded-xl border border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-500">لا توجد أرصدة مستودعات مسجلة لهذا المنتج.</div>:<div className="overflow-x-auto rounded-xl border border-neutral-200"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['المستودع','الرصيد الفعلي','المحجوز','المتاح'].map(x=><th className="whitespace-nowrap px-4 py-3" key={x}>{x}</th>)}</tr></thead><tbody>{balances.map(row=><tr className="border-t border-neutral-100" key={row.warehouse_id}><td className="px-4 py-3 font-medium">{row.warehouse?.name || row.warehouse_id.slice(0,8)}{row.warehouse?.code?' · '+row.warehouse.code:''}</td><td className="px-4 py-3">{row.quantity_on_hand}</td><td className="px-4 py-3">{row.quantity_reserved}</td><td className="px-4 py-3 font-semibold">{row.quantity_available}</td></tr>)}</tbody></table></div>}</div>
    </section>}
  </div>
}

export function DataExports() {
  const { organization } = useAuth()
  const [kind, setKind] = useState<ExportKind>('products')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ kind: ExportKind; count: number; filename: string } | null>(null)

  const exportData = async () => {
    setError(''); setResult(null)
    if (!organization?.id) { setError('لا توجد مؤسسة نشطة. لم يتم إنشاء أي ملف.'); return }
    setLoading(true)
    try {
      const rows: CsvRow[] = []
      const pageSize = 500
      for (let from=0; ; from += pageSize) {
        const { data, error: queryError } = await queryExportPage(kind, organization.id, from, from + pageSize - 1)
        if (queryError) throw queryError
        const page = (data || []) as unknown as CsvRow[]
        rows.push(...page)
        if (page.length < pageSize) break
        if (rows.length >= 20000) throw new Error('وصل التصدير إلى حد 20,000 سجل في الملف الواحد. استخدم مرشحًا أضيق أو صدّر على دفعات.')
      }
      const fields = csvFields[kind]
      const lines = [fields.map(field=>csvEscape(field.label)).join(','), ...rows.map(row=>fields.map(field=>csvEscape(row[field.key])).join(','))]
      const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
      const filename = `aghbari-${kind}-${new Date().toISOString().slice(0,10)}.csv`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename; anchor.style.display = 'none'
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
      setResult({ kind, count: rows.length, filename })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فشل تصدير البيانات. لم يتم تنزيل ملف.')
    } finally { setLoading(false) }
  }

  return <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><FileSpreadsheet className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold">تصدير البيانات</h1><p className="mt-1 text-sm text-neutral-500">تصدير CSV للمؤسسة النشطة، باستخدام أعمدة محددة وطلبات صفحات متتابعة. لا تُحمّل مفاتيح خاصة أو أعمدة غير لازمة.</p></div></div>
    <div className="card space-y-4 p-5">
      <label className="block text-sm font-semibold">نوع البيانات<select className="input mt-1.5" value={kind} onChange={e=>{setKind(e.target.value as ExportKind);setResult(null);setError('')}}>{(Object.keys(exportLabels) as ExportKind[]).map(key=><option value={key} key={key}>{exportLabels[key]}</option>)}</select></label>
      <div className="rounded-xl border border-neutral-200 p-4"><p className="font-semibold">نطاق التصدير</p><p className="mt-1 text-sm leading-6 text-neutral-500">المؤسسة الحالية فقط، مع تطبيق صلاحيات RLS، وبحد أقصى 20,000 سجل لكل ملف. قد تتطلب جداول الفواتير والطلبات صلاحية مالية مناسبة.</p><p className="mt-2 text-xs text-neutral-400">الأعمدة: {csvFields[kind].map(f=>f.label).join('، ')}</p></div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {result && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">تم إنشاء ملف {exportLabels[result.kind]} من {result.count.toLocaleString('en-US')} سجل: <strong>{result.filename}</strong></div>}
      <button type="button" onClick={()=>void exportData()} disabled={loading} className="btn-primary inline-flex items-center gap-2"><Download className="h-4 w-4"/>{loading?'جارٍ جلب الصفحات وإنشاء CSV…':'تصدير CSV'}</button>
    </div>
    <div className="flex items-start gap-2 rounded-xl bg-neutral-50 p-4 text-sm leading-6 text-neutral-600"><Warehouse className="mt-0.5 h-4 w-4 shrink-0"/><p>تصدير المخزون التفصيلي حسب المستودع ليس ضمن هذا الملف العام حاليًا؛ اعتمد صفحة المخزون التي تحترم صلاحيات المستودعات حتى لا تتجاوز حدود المؤسسة أو الأدوار.</p></div>
  </div>
}
