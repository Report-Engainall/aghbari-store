import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, AlertTriangle, BarChart3, Bell, Brain, CheckCircle2, CreditCard, Database, FileText, HeartPulse, Package, Plus, RefreshCw, UserPlus, Search, Settings as SettingsIcon, ShoppingCart, Shield, Upload, Users, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, LoadingOverlay } from '@/components/ui/Loader'
import type { Order, Product } from '@/types'
import { useCommercePolicies } from '@/lib/useCommercePolicies'
import { processCsvToSnapshot, type CsvImportProgress, type CsvImportProfile } from '@/lib/csvImportPipeline'

function AdminPage({ title, description, icon: Icon, children, action }: { title: string; description: string; icon: typeof Activity; children: ReactNode; action?: ReactNode }) { return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6"><div className="flex items-start gap-3"><div className="h-11 w-11 shrink-0 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center"><Icon className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-neutral-900">{title}</h1><p className="text-sm text-neutral-500 mt-1">{description}</p></div></div>{action}</div>{children}</div> }
function Notice({ message }: { message: string }) { return <div className="card p-5 text-center text-neutral-600">{message}</div> }
function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr>{headers.map(header => <th className="p-4 text-neutral-500 whitespace-nowrap" key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div> }
function useCount(table: string, filter?: { column: string; value: string }) { const [count, setCount] = useState(0); useEffect(() => { let query = supabase.from(table).select('id', { count: 'exact', head: true }); if (filter) query = query.eq(filter.column, filter.value); query.then(({ count: value }) => setCount(value || 0)) }, [table, filter?.column, filter?.value]); return count }

export function Dashboard() {
  const { organization } = useAuth()
  const products = useCount('products', { column: 'is_active', value: 'true' })
  const orders = useCount('orders', organization ? { column: 'organization_id', value: organization.id } : undefined)
  const customers = useCount('organization_members', organization ? { column: 'organization_id', value: organization.id } : undefined)
  const [recent, setRecent] = useState<Order[]>([])
  const [lowStock, setLowStock] = useState<Product[]>([])
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    if (!organization) return
    supabase.from('orders').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(5).then(({ data }) => setRecent(data as Order[] || []))
    supabase.from('products').select('*').eq('is_active', true).lte('stock_quantity', 10).order('stock_quantity').limit(5).then(({ data }) => setLowStock(data as Product[] || []))
    supabase.from('ai_alerts').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(5).then(({ data }) => setAlerts(data as Record<string, unknown>[] || []))
  }, [organization])
  const metrics = [
    { label: 'العملاء', value: customers, icon: Users, tone: 'text-primary-700 bg-primary-50' },
    { label: 'المنتجات', value: products, icon: Package, tone: 'text-accent-700 bg-accent-50' },
    { label: 'الطلبات', value: orders, icon: ShoppingCart, tone: 'text-success-700 bg-success-50' },
    { label: 'الطلبات الجديدة', value: recent.filter(order => order.status === 'pending').length, icon: FileText, tone: 'text-warning-700 bg-warning-50' },
    { label: 'المبيعات', value: recent.length ? formatCurrency(recent.reduce((sum, order) => sum + Number(order.total || 0), 0)) : '—', icon: BarChart3, tone: 'text-primary-700 bg-primary-50' },
    { label: 'أصناف منخفضة', value: lowStock.length, icon: AlertTriangle, tone: 'text-error-700 bg-error-50' },
    { label: 'تنبيهات ذكية', value: alerts.length, icon: Brain, tone: 'text-accent-700 bg-accent-50' },
    { label: 'حالة النظام', value: 'سليم', icon: Activity, tone: 'text-success-700 bg-success-50' },
  ]
  const quickActions = [
    { label: 'إضافة طلب جديد', to: '/admin/orders', icon: Plus },
    { label: 'إضافة عميل', to: '/admin/customers', icon: UserPlus },
    { label: 'إضافة صنف', to: '/admin/catalog', icon: Package },
    { label: 'محرك التسعير الذكي', to: '/admin/pricing', icon: FileText },
    { label: 'محرك الاستيراد الموحد', to: '/admin/import', icon: Upload },
    { label: 'مركز البيانات الموحد', to: '/admin/data-center', icon: Database },
  ]
  return <AdminPage title="لوحة المعلومات" description="نظرة تشغيلية مباشرة على أعمالك وبياناتك" icon={BarChart3} action={<div className="flex flex-wrap gap-2"><Link to="/admin/import" className="btn-primary btn-sm"><Upload className="h-4 w-4" /> استيراد بيانات</Link><Link to="/admin/orders" className="btn-secondary btn-sm"><Plus className="h-4 w-4" /> طلب جديد</Link></div>}>
    <div className="mb-5 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-900"><strong>مصدر الحقيقة الموحد:</strong> تعتمد هذه الشاشة على البيانات المباشرة لحركة التطبيق من الطلبات والمنتجات والعملاء والمخزون.</div>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{metrics.map(metric => <div key={metric.label} className="card group p-4 transition-all hover:-translate-y-1 hover:shadow-card-hover"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.tone}`}><metric.icon className="h-4 w-4" /></div><p className="mt-3 truncate text-xs text-neutral-500">{metric.label}</p><p className="mt-1 truncate text-xl font-bold text-neutral-900">{metric.value}</p></div>)}</div>
    <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="card overflow-hidden xl:col-span-1"><div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><h2 className="font-bold">أحدث الطلبات</h2><Link to="/admin/orders" className="text-xs font-semibold text-primary-700">عرض الكل</Link></div>{recent.length ? <div className="divide-y divide-neutral-100">{recent.map(order => <Link key={order.id} to={`/admin/order/${order.id}`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-neutral-50"><div className="min-w-0"><p className="truncate text-sm font-bold">#{order.order_number}</p><p className="mt-1 text-xs text-neutral-500">{formatDate(order.created_at)}</p></div><div className="text-left"><p className="text-xs text-neutral-500">{formatCurrency(order.total)}</p><StatusBadge status={order.status} /></div></Link>)}</div> : <Notice message="لا توجد طلبات حتى الآن" />}</section>
      <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><h2 className="font-bold">المخزون والسعر الأساسي</h2><Link to="/admin/catalog" className="text-xs font-semibold text-primary-700">إدارة الكتالوج</Link></div>{lowStock.length ? <div className="divide-y divide-neutral-100">{lowStock.map(product => <div key={product.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-bold">{product.name_ar || product.name}</p><p className="mt-1 text-xs text-neutral-500">SKU: {product.sku}</p></div><span className="badge-error">{product.stock_quantity} متبقي</span></div>)}</div> : <div className="p-8 text-center text-sm text-success-700"><CheckCircle2 className="mx-auto mb-2 h-7 w-7" />المخزون مستقر</div>}</section>
      <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><h2 className="font-bold">تنبيهات الذكاء الاصطناعي</h2><Link to="/admin/ai/alerts" className="text-xs font-semibold text-primary-700">عرض الكل</Link></div>{alerts.length ? <div className="divide-y divide-neutral-100">{alerts.map(alert => <Link key={String(alert.id)} to="/admin/ai/alerts" className="flex items-start gap-3 px-5 py-4 transition hover:bg-neutral-50"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" /><div className="min-w-0"><p className="truncate text-sm font-bold">{String(alert.title || alert.name || 'تنبيه تشغيلي')}</p><p className="mt-1 line-clamp-2 text-xs text-neutral-500">{String(alert.description || alert.body || 'توجد ملاحظة تحتاج إلى مراجعة.')}</p></div></Link>)}</div> : <div className="p-8 text-center text-sm text-neutral-500"><Brain className="mx-auto mb-2 h-7 w-7 text-accent-600" />لا توجد تنبيهات جديدة</div>}</section>
    </div>
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-neutral-900">أقسام النظام</h2><span className="badge-info">الوصول السريع</span></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{quickActions.map(action => <Link key={action.to} to={action.to} className="card-hover group flex items-center justify-between p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white"><action.icon className="h-5 w-5" /></div><div><h3 className="font-bold text-neutral-900">{action.label}</h3><p className="mt-1 text-xs text-neutral-500">فتح مساحة العمل وإدارة التفاصيل</p></div></div><span className="text-neutral-300 transition group-hover:text-primary-600">←</span></Link>)}</div></section>
  </AdminPage>
}

export function Orders() { const { organization } = useAuth(); const [rows, setRows] = useState<Order[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const load = () => { if (!organization) return; setLoading(true); supabase.from('orders').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data, error: dbError }) => { if (dbError) setError(dbError.message); else setRows(data as Order[] || []); setLoading(false) }) }; useEffect(load, [organization]); const filtered = useMemo(() => rows.filter(row => `${row.order_number} ${row.status}`.toLowerCase().includes(query.toLowerCase())), [rows, query]); return <AdminPage title="الطلبات" description="مراجعة الطلبات ومتابعة حالتها" icon={ShoppingCart} action={<button onClick={load} className="btn-secondary btn-sm"><RefreshCw className="h-4 w-4" /> تحديث</button>}><div className="mb-4 relative max-w-sm"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" /><input className="input pr-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث برقم الطلب أو الحالة" /></div>{loading ? <LoadingOverlay /> : error ? <ErrorState description={error} onRetry={load} /> : filtered.length ? <Table headers={['رقم الطلب', 'التاريخ', 'الإجمالي', 'الدفع', 'الحالة', '']} >{filtered.map(order => <tr className="border-t border-neutral-100 hover:bg-neutral-50" key={order.id}><td className="p-4 font-semibold">{order.order_number}</td><td className="p-4 text-neutral-500">{formatDate(order.created_at)}</td><td className="p-4">{formatCurrency(order.total)}</td><td className="p-4"><StatusBadge status={order.payment_status} /></td><td className="p-4"><StatusBadge status={order.status} /></td><td className="p-4"><Link className="text-primary-600 hover:underline" to={`/admin/order/${order.id}`}>فتح</Link></td></tr>)}</Table> : <EmptyState title="لا توجد طلبات" description="ستظهر الطلبات الجديدة هنا." />}</AdminPage> }
export function OrderDetail() {
  const { id } = useParams()
  const { organization } = useAuth()
  const { show } = useToast()
  const { policies } = useCommercePolicies()
  const [order, setOrder] = useState<Order | null>(null)
  const [invoice, setInvoice] = useState<Record<string, unknown> | null>(null)
  const [payments, setPayments] = useState<Record<string, unknown>[]>([])
  const [saving, setSaving] = useState(false)
  const [editingItems, setEditingItems] = useState<Record<string, number>>({})
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const itemRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const dirty = Object.keys(editingItems).length > 0

  const load = async () => {
    if (!id || !organization) return
    const { data, error } = await supabase.from('orders')
      .select('*, items:order_items(*)')
      .eq('id', id).eq('organization_id', organization.id).maybeSingle()
    if (error) { show('error', 'تعذر تحميل الطلب', error.message); return }
    setOrder(data as Order || null)
    if (data?.customer_adjustment_note) setAdjustmentNote(data.customer_adjustment_note)
    const { data: invoiceRow } = await supabase.from('invoices').select('*').eq('order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setInvoice(invoiceRow as Record<string, unknown> | null)
    if (invoiceRow?.id) {
      const { data: paymentRows } = await supabase.from('payments').select('*').eq('invoice_id', invoiceRow.id).order('created_at', { ascending: false })
      setPayments(paymentRows as Record<string, unknown>[] || [])
    } else setPayments([])
  }
  useEffect(() => { void load() }, [id, organization?.id])

  useEffect(() => {
    if (!dirty || !policies.require_quantity_approval) return
    const guardNavigation = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.getAttribute('target') === '_blank') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      show('warning', 'اعتماد الكميات مطلوب', 'احفظ واعتمد الكميات الحالية قبل الانتقال إلى قسم آخر.')
    }
    const guardUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    document.addEventListener('click', guardNavigation, true)
    window.addEventListener('beforeunload', guardUnload)
    return () => {
      document.removeEventListener('click', guardNavigation, true)
      window.removeEventListener('beforeunload', guardUnload)
    }
  }, [dirty, policies.require_quantity_approval, show])

  const update = async (status: string) => {
    if (!id || !organization) return
    if (dirty && policies.require_quantity_approval) {
      show('warning', 'اعتمد الكميات أولاً', 'لا يمكن تغيير حالة الطلب مع وجود كميات غير معتمدة.')
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('admin_update_order_status', { p_order_id: id, p_status: status })
    setSaving(false)
    if (error) {
      const friendly = error.message.includes('quantity_approval_required')
        ? 'اعتمد جميع الكميات أولاً قبل تحويل الطلب إلى معتمد.'
        : error.message.includes('admin_required') ? 'هذه العملية تتطلب صلاحية مسؤول.'
        : error.message
      show('error', 'تعذر تحديث حالة الطلب', friendly)
    } else { show('success', 'تم تحديث حالة الطلب'); await load() }
  }

  const handleItemEnter = (event: React.KeyboardEvent, itemId: string, itemIds: string[]) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const idx = itemIds.indexOf(itemId)
    if (idx >= 0 && idx < itemIds.length - 1) itemRefs.current[itemIds[idx + 1]]?.focus()
  }

  const approveQuantities = async () => {
    if (!id || !order || !organization) return
    const items = order.items || []
    if (!items.length) { show('warning', 'لا توجد أصناف لاعتمادها'); return }
    const quantities: Record<string, number> = {}
    for (const item of items) {
      const requested = Number(item.quantity)
      const approved = editingItems[item.id] ?? Number(item.approved_quantity ?? item.quantity)
      if (!Number.isFinite(approved) || approved < 0 || !Number.isInteger(approved) || approved > requested) {
        show('warning', 'كمية غير صالحة', 'الكمية المعتمدة يجب أن تكون عدداً صحيحاً من صفر حتى الكمية المطلوبة.')
        return
      }
      quantities[item.id] = approved
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('approve_order_quantities', {
      p_order_id: id,
      p_quantities: quantities,
    })
    setSaving(false)
    if (error) {
      const friendly = error.message.includes('admin_required') ? 'يلزم أن تكون مسؤولاً عن المؤسسة لاعتماد الكميات.'
        : error.message.includes('approved_quantity_exceeds_requested') ? 'لا يمكن اعتماد كمية أعلى من الكمية المطلوبة.'
        : error.message.includes('invalid_approved_quantity') ? 'توجد كمية غير صحيحة. راجع القيم ثم أعد المحاولة.'
        : error.message
      show('error', 'تعذر اعتماد الكميات', friendly)
      return
    }
    setEditingItems({})
    show('success', 'تم اعتماد الكميات', typeof data === 'object' && data && 'changed' in data && data.changed ? 'تم تحديث الإجمالي التشغيلي وإشعار العميل بتعديلات الكمية.' : 'تم تسجيل الاعتماد.')
    await load()
  }

  const reviewPayment = async (paymentId: string, confirm: boolean) => {
    if (!id) return
    setSaving(true)
    const { error } = await supabase.rpc('confirm_order_payment', {
      p_payment_id: paymentId,
      p_confirm: confirm,
      p_admin_notes: confirm ? 'تم التحقق من استلام المبلغ من الإدارة.' : 'تعذر التحقق من الدفعة؛ يلزم التواصل مع العميل.',
    })
    setSaving(false)
    if (error) {
      const friendly = error.message.includes('payment_exceeds_invoice_total')
        ? 'إجمالي الدفعات المؤكدة يتجاوز قيمة الفاتورة؛ راجع المبلغ.'
        : error.message.includes('payment_already_reviewed') ? 'تمت مراجعة هذه الدفعة من قبل.'
        : error.message.includes('admin_required') ? 'يلزم حساب مسؤول للمراجعة.'
        : error.message
      show('error', confirm ? 'تعذر تأكيد الدفعة' : 'تعذر رفض الدفعة', friendly)
    } else {
      show('success', confirm ? 'تم تسجيل قرار الدفعة' : 'تم رفض الدفعة')
      await load()
    }
  }

  const saveAdjustment = async () => {
    if (!id || !organization || !adjustmentNote.trim()) return
    setSaving(true)
    const { error } = await supabase.rpc('admin_set_order_adjustment_note', { p_order_id: id, p_note: adjustmentNote.trim() })
    setSaving(false)
    if (error) show('error', 'تعذر حفظ التنبيه', error.message)
    else { show('success', 'تم حفظ تنبيه التعديل'); await load() }
  }

  if (!order) return <AdminPage title="تفاصيل الطلب" description="جاري تحميل البيانات" icon={Package}><LoadingOverlay /></AdminPage>
  const STEPS = [{ key: 'pending', label: 'تم استلام الطلب' }, { key: 'review', label: 'قيد المراجعة' }, { key: 'approved', label: 'تم الاعتماد' }, { key: 'processing', label: 'قيد التجهيز' }, { key: 'dispatched', label: 'تم الشحن' }, { key: 'delivered', label: 'تم التوصيل' }]
  const currentIdx = STEPS.findIndex(step => step.key === order.status)
  const isCancelled = order.status === 'cancelled' || order.status === 'rejected'
  const itemIds = order.items?.map(item => item.id) || []
  const toneClass = policies.quantity_input_tone === 'mint' ? 'quantity-input--mint'
    : policies.quantity_input_tone === 'slate' ? 'quantity-input--slate' : 'quantity-input--sky'

  return <AdminPage title={`الطلب ${order.order_number}`} description="تفاصيل الطلب ومسار المعالجة" icon={Package}>
    <div className="card p-6 mb-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        {STEPS.map((step, idx) => <div key={step.key} className="flex-1 flex flex-col items-center"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isCancelled ? 'bg-error-100 text-error-600' : idx <= currentIdx ? 'bg-success-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{idx <= currentIdx && !isCancelled ? '✓' : idx + 1}</div><p className={`text-xs mt-2 text-center ${idx <= currentIdx && !isCancelled ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{step.label}</p></div>)}
      </div>
      {isCancelled && <p className="text-center text-error-600 font-semibold mt-3">تم إلغاء هذا الطلب</p>}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="card p-5 lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold">أصناف الطلب</h2><p className="mt-1 text-xs text-neutral-500">الكمية المطلوبة محفوظة كما أرسلها العميل، والكمية المعتمدة منفصلة عنها.</p></div>
          {policies.require_quantity_approval && <span className="badge-info">اعتماد صريح مطلوب</span>}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-3 text-neutral-500">الصنف</th><th className="p-3 text-neutral-500">الكمية المطلوبة</th><th className="p-3 text-neutral-500">الكمية المعتمدة</th><th className="p-3 text-neutral-500">السعر (للإدارة)</th></tr></thead>
          <tbody>{order.items?.map(item => {
            const currentApproved = Number(item.approved_quantity ?? item.quantity)
            const edited = editingItems[item.id] !== undefined
            return <tr key={item.id} className="border-t border-neutral-100">
              <td className="p-3 font-medium">{item.product_name_snapshot || item.name}</td>
              <td className="p-3 text-neutral-500 tabular-nums">{item.quantity}</td>
              <td className="p-3"><input ref={element => { itemRefs.current[item.id] = element }} type="number" min="0" max={item.quantity} step="1" value={edited ? editingItems[item.id] : currentApproved}
                onChange={event => setEditingItems(previous => ({ ...previous, [item.id]: event.target.value === '' ? 0 : Number(event.target.value) }))}
                onKeyDown={event => handleItemEnter(event, item.id, itemIds)}
                aria-label={`الكمية المعتمدة للصنف ${item.product_name_snapshot || item.name}`}
                disabled={!["pending", "review"].includes(order.status)}
                className={`input quantity-input ${toneClass} w-24 py-1 text-center disabled:opacity-60`} /></td>
              <td className="p-3 tabular-nums">{formatCurrency(item.unit_price_snapshot || item.unit_price)}</td>
            </tr>
          })}</tbody></table></div>
        <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-3"><p className="text-sm font-medium text-sky-900">التغييرات لا تُحفظ عند الخروج من الحقل. استخدم زر «اعتماد الكميات» لتسجيلها خادمياً.</p><p className="mt-1 text-xs text-sky-800">زر Enter ينقلك إلى الصف التالي. عند وجود تغييرات غير معتمدة، يمنع النظام التنقل حتى حفظها أو إلغاء التغييرات.</p></div>
        {dirty && <div className="mt-4 flex flex-wrap gap-2"><button disabled={saving} onClick={() => void approveQuantities()} className="btn-primary"><CheckCircle2 className="h-4 w-4" />{saving ? 'جارٍ الاعتماد…' : 'اعتماد الكميات وحفظها'}</button><button disabled={saving} onClick={() => setEditingItems({})} className="btn-secondary">إلغاء التعديلات المعلقة</button></div>}
        {!dirty && <button disabled={saving || !order.items?.length || !["pending", "review"].includes(order.status)} onClick={() => void approveQuantities()} className="btn-primary mt-4"><CheckCircle2 className="h-4 w-4" />{saving ? 'جارٍ الاعتماد…' : 'تسجيل اعتماد الكميات'}</button>}
        <div className="mt-6 space-y-2"><label className="label">تنبيه تعديل الأصناف (يظهر للعميل)</label><textarea value={adjustmentNote} onChange={event => setAdjustmentNote(event.target.value)} className="input min-h-20" placeholder="تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة." /><button onClick={() => void saveAdjustment()} disabled={saving || !adjustmentNote.trim()} className="btn-secondary btn-sm">حفظ التنبيه</button></div>
        {invoice && <section className="mt-6 border-t border-neutral-100 pt-5">
          <div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary-700" /><h3 className="font-bold">الدفعات والفاتورة</h3></div>
          <p className="text-xs text-neutral-500 mb-3">نوع المستند: {String(invoice.invoice_kind || 'sales') === 'proforma' ? 'فاتورة أولية غير نهائية' : 'فاتورة بيع'} · الحالة: {String(invoice.status || '—')}</p>
          {payments.length ? <div className="space-y-3">{payments.map(payment => <div className="rounded-xl border border-neutral-200 p-3" key={String(payment.id)}>
            <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{String(payment.payment_number || payment.id)}</span><StatusBadge status={String(payment.status || 'pending')} /></div>
            <p className="mt-1 text-sm text-neutral-600">المبلغ المسجل للإدارة: {formatCurrency(Number(payment.amount || 0))} · الطريقة: {String(payment.method || '—')}</p>
            {payment.reference && <p className="mt-1 text-xs text-neutral-500">المرجع: {String(payment.reference)}</p>}
            {payment.status === 'pending' && <div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => void reviewPayment(String(payment.id), true)} className="btn-primary btn-sm">تأكيد استلام المبلغ</button><button disabled={saving} onClick={() => void reviewPayment(String(payment.id), false)} className="btn-secondary btn-sm">رفض الدفعة</button></div>}
          </div>)}</div> : <p className="text-sm text-neutral-500">لا توجد دفعات مسجلة.</p>}
          {String(invoice.invoice_kind || '') === 'proforma' && <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">لن تتحول الفاتورة الأولية إلى فاتورة بيع رسمية إلا بعد تأكيد الإدارة للدفعات التي تساوي إجمالي المبلغ المستحق.</p>}
        </section>}
        <h3 className="font-bold mt-6 mb-3">إجراءات الطلب</h3>
        <div className="flex flex-wrap gap-2">{['review', 'approved', 'processing', 'dispatched', 'delivered', 'cancelled'].map(status => <button key={status} disabled={saving || status === order.status || (dirty && policies.require_quantity_approval)} onClick={() => void update(status)} className="btn-secondary btn-sm"><StatusBadge status={status} /></button>)}</div>
      </div>
      <div className="card p-5"><h2 className="font-bold mb-3">بيانات الطلب</h2><p className="text-sm text-neutral-500">تاريخ الإنشاء</p><p className="mb-3">{formatDate(order.created_at)}</p><p className="text-sm text-neutral-500">الإجمالي (للإدارة)</p><p className="text-xl font-bold text-primary-700 mb-3">{formatCurrency(order.total ?? order.total_amount)}</p><p className="text-sm text-neutral-500">ملاحظات</p><p className="text-sm">{order.notes || 'لا توجد ملاحظات'}</p></div>
    </div>
  </AdminPage>
}

export function Customers() { const { organization } = useAuth(); const [rows, setRows] = useState<{ id: string; user_id: string; role: string; status: string; created_at: string }[]>([]); useEffect(() => { if (organization) supabase.from('organization_members').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data as any || [])) }, [organization]); return <AdminPage title="العملاء وأعضاء الشركة" description="إدارة الوصول إلى حساب المؤسسة" icon={Users}><Table headers={['المستخدم', 'الدور', 'الحالة', 'تاريخ الانضمام']}>{rows.map(row => <tr className="border-t border-neutral-100" key={row.id}><td className="p-4 font-mono text-xs">{row.user_id}</td><td className="p-4"><StatusBadge status={row.role} /></td><td className="p-4"><StatusBadge status={row.status} /></td><td className="p-4 text-neutral-500">{formatDate(row.created_at)}</td></tr>)}</Table></AdminPage> }

export function Catalog() { const [rows, setRows] = useState<Product[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const load = () => { setLoading(true); supabase.from('products').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => { setRows(data as Product[] || []); setLoading(false) }) }; useEffect(load, []); const filtered = rows.filter(row => `${row.name} ${row.sku}`.toLowerCase().includes(query.toLowerCase())); return <AdminPage title="الكتالوج" description="إدارة المنتجات والأسعار والمخزون" icon={Package} action={<button onClick={load} className="btn-secondary btn-sm"><RefreshCw className="h-4 w-4" /> تحديث</button>}><div className="mb-4 max-w-sm"><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="بحث بالاسم أو SKU" /></div>{loading ? <LoadingOverlay /> : <Table headers={['المنتج', 'SKU', 'السعر الأساسي', 'التجزئة', 'الجملة', 'المخزون', 'الحالة']} >{filtered.map(row => <tr className="border-t border-neutral-100" key={row.id}><td className="p-4 font-semibold">{row.name_ar || row.name}</td><td className="p-4 font-mono text-xs">{row.sku}</td><td className="p-4">{formatCurrency(row.base_price || row.price)}</td><td className="p-4">{formatCurrency(row.retail_price || row.price)}</td><td className="p-4">{formatCurrency(row.wholesale_price || row.bulk_price)}</td><td className="p-4">{row.stock_quantity}</td><td className="p-4"><StatusBadge status={row.is_active ? 'active' : 'inactive'} /></td></tr>)}</Table>}</AdminPage> }
export function Pricing() {
  const { organization, isAdmin } = useAuth()
  const { show } = useToast()
  const [rules, setRules] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', calculation_method: 'markup_percent', value: '', price_level: 'both', min_quantity: '1', priority: '100' })
  const load = async () => {
    if (!organization?.id) { setRules([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('pricing_rules').select('*')
      .eq('organization_id', organization.id)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) show('error', 'تعذر تحميل قواعد التسعير', error.message)
    else setRules(data || [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [organization?.id])
  const createRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization?.id || !form.name.trim() || form.value.trim() === '') { show('warning', 'أدخل اسم القاعدة وقيمتها'); return }
    const value = Number(form.value)
    const minQuantity = Number(form.min_quantity)
    const priority = Number(form.priority)
    if (!Number.isFinite(value) || !Number.isFinite(minQuantity) || minQuantity < 1 || !Number.isInteger(minQuantity) || !Number.isInteger(priority)) {
      show('warning', 'تحقق من القيمة والحد الأدنى والمرتبة'); return
    }
    if (form.calculation_method === 'margin_percent' && (value < 0 || value >= 100)) {
      show('warning', 'هامش الربح يجب أن يكون من 0 إلى أقل من 100%'); return
    }
    if (form.calculation_method !== 'amount_adjustment' && value < 0) {
      show('warning', 'لا يمكن أن تكون قيمة طريقة الاحتساب المحددة سالبة'); return
    }
    const { error } = await supabase.from('pricing_rules').insert({
      organization_id: organization.id,
      name: form.name.trim(),
      calculation_method: form.calculation_method,
      value,
      price_level: form.price_level,
      min_quantity: minQuantity,
      priority,
      active: true,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) show('error', 'تعذر إنشاء قاعدة التسعير', error.message)
    else {
      show('success', 'تم إنشاء قاعدة التسعير', 'سيعيد الخادم احتساب أسعار الجملة والتجزئة وفق القاعدة ذات الأولوية الأعلى.')
      setShowForm(false)
      setForm({ name: '', calculation_method: 'markup_percent', value: '', price_level: 'both', min_quantity: '1', priority: '100' })
      await load()
    }
  }
  const toggleRule = async (id: string, active: boolean) => {
    const { error } = await supabase.from('pricing_rules').update({ active: !active }).eq('id', id).eq('organization_id', organization?.id)
    if (error) show('error', 'تعذر تحديث القاعدة', error.message)
    else { show('success', !active ? 'تم تفعيل القاعدة' : 'تم إيقاف القاعدة'); await load() }
  }
  const deleteRule = async (id: string) => {
    const { error } = await supabase.from('pricing_rules').delete().eq('id', id).eq('organization_id', organization?.id)
    if (error) show('error', 'تعذر حذف القاعدة', error.message)
    else { show('success', 'تم حذف القاعدة', 'يعيد الخادم الأسعار إلى السعر الأساسي أو إلى القاعدة النشطة التالية.'); await load() }
  }
  const methodLabels: Record<string, string> = {
    markup_percent: 'نسبة إضافة % على الأساس',
    margin_percent: 'هامش ربح % من سعر البيع',
    fixed_price: 'سعر ثابت',
    amount_adjustment: 'إضافة/خصم مبلغ',
  }
  const levelLabels: Record<string, string> = { both: 'التجزئة والجملة', retail: 'التجزئة فقط', wholesale: 'الجملة فقط' }
  return <AdminPage title="محرك التسعير" description="قواعد مؤسسة محددة مع احتساب خادمي لأسعار الجملة والتجزئة" icon={FileText} action={<button disabled={!isAdmin || !organization} onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm"><Plus className="h-4 w-4" /> قاعدة جديدة</button>}>
    <div className="card p-4 mb-4 bg-primary-50 border-primary-200"><p className="text-sm text-primary-800">السعر الأساسي هو الأصل المرجعي. يطبق الخادم القاعدة النشطة ذات الأولوية الأصغر على مستوى السعر المحدد؛ وعند غياب القاعدة النشطة تعود أسعار الجملة والتجزئة إلى السعر الأساسي.</p></div>
    {showForm && <form onSubmit={createRule} className="card p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><label className="label">اسم القاعدة</label><input required className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={120} placeholder="مثال: تسعير التجزئة" /></div>
      <div><label className="label">طريقة الاحتساب</label><select className="input" value={form.calculation_method} onChange={e => setForm(f => ({ ...f, calculation_method: e.target.value }))}><option value="markup_percent">نسبة إضافة % على الأساس</option><option value="margin_percent">هامش ربح % من سعر البيع</option><option value="fixed_price">سعر ثابت</option><option value="amount_adjustment">إضافة/خصم مبلغ</option></select></div>
      <div><label className="label">القيمة</label><input required type="number" step="0.01" className="input" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} /></div>
      <div><label className="label">تطبيق القاعدة على</label><select className="input" value={form.price_level} onChange={e => setForm(f => ({ ...f, price_level: e.target.value }))}><option value="both">التجزئة والجملة</option><option value="retail">التجزئة فقط</option><option value="wholesale">الجملة فقط</option></select></div>
      <div><label className="label">الحد الأدنى للكمية</label><input required min="1" step="1" type="number" className="input" value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))} /><p className="mt-1 text-xs text-neutral-500">يُحفظ الحد ضمن القاعدة؛ تطبيقه على شرائح كميات الطلب ما زال بحاجة إلى ربط منفصل في اختيار سعر الطلب.</p></div>
      <div><label className="label">الأولوية (الأصغر أولاً)</label><input required step="1" type="number" className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} /></div>
      <div className="sm:col-span-2 flex gap-2"><button type="submit" className="btn-primary">حفظ القاعدة</button><button type="button" onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button></div>
    </form>}
    {loading ? <LoadingOverlay /> : rules.length ? <Table headers={['القاعدة', 'طريقة الاحتساب', 'القيمة', 'مستوى السعر', 'الأولوية', 'الحالة', 'إجراءات']}>{rules.map(row => <tr key={String(row.id)} className="border-t border-neutral-100"><td className="p-4 font-semibold">{String(row.name)}</td><td className="p-4">{methodLabels[String(row.calculation_method)] || String(row.calculation_method)}</td><td className="p-4 tabular-nums">{String(row.value)}</td><td className="p-4">{levelLabels[String(row.price_level)] || String(row.price_level)}</td><td className="p-4">{String(row.priority ?? 100)}</td><td className="p-4"><StatusBadge status={row.active ? 'active' : 'inactive'} /></td><td className="p-4"><div className="flex gap-2"><button disabled={!isAdmin} onClick={() => void toggleRule(String(row.id), Boolean(row.active))} className="btn-secondary btn-sm">{row.active ? 'إيقاف' : 'تفعيل'}</button><button disabled={!isAdmin} onClick={() => void deleteRule(String(row.id))} className="btn-danger btn-sm">حذف</button></div></td></tr>)}</Table> : <EmptyState title="لا توجد قواعد تسعير" description="بدون قواعد نشطة يعيد الخادم سعري الجملة والتجزئة إلى السعر الأساسي." />}
  </AdminPage>
}
export function DataCenter() { return <AdminPage title="مركز البيانات" description="مصادر البيانات وجودتها" icon={Database}><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[['الكتالوج', 'products'], ['الطلبات', 'orders'], ['المستخدمون', 'organization_members']].map(([label, table]) => <div className="card p-5" key={table}><Database className="h-6 w-6 text-primary-600" /><h3 className="font-bold mt-3">{label}</h3><p className="text-sm text-neutral-500 mt-1">متصل بقاعدة البيانات</p></div>)}</div></AdminPage> }
export function Import() {
  const { organization, isAdmin } = useAuth()
  const { show } = useToast()
  const { policies } = useCommercePolicies()
  const [file, setFile] = useState<File | null>(null)
  const [profiles, setProfiles] = useState<Record<string, unknown>[]>([])
  const [profileId, setProfileId] = useState('')
  const [uploads, setUploads] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<CsvImportProgress | null>(null)
  const [duplicate, setDuplicate] = useState<{ fileHash: string; profileId: string; uploadId?: string; status?: string } | null>(null)
  const [paused, setPaused] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pausedRef = useRef(false)
  const resumeRef = useRef<(() => void) | null>(null)
  const waitIfPaused = async () => {
    while (pausedRef.current && !abortControllerRef.current?.signal.aborted) {
      await new Promise<void>(resolve => { resumeRef.current = resolve })
    }
  }
  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    if (!next) {
      resumeRef.current?.()
      resumeRef.current = null
    }
  }
  const cancelImport = () => {
    pausedRef.current = false
    setPaused(false)
    resumeRef.current?.()
    resumeRef.current = null
    abortControllerRef.current?.abort()
  }

  const load = async () => {
    if (!organization?.id) return
    const [p, u] = await Promise.all([
      supabase.from('import_profiles').select('*').eq('organization_id', organization.id).eq('status', 'active').order('profile_name'),
      supabase.from('import_uploads').select('*').eq('organization_id', organization.id).order('uploaded_at', { ascending: false }).limit(10),
    ])
    if (p.error) setMessage(p.error.message)
    else {
      const list = p.data as Record<string, unknown>[] || []
      setProfiles(list)
      if (!profileId && list.length) setProfileId(String(list[0].id))
    }
    if (u.error) setMessage(u.error.message)
    else setUploads(u.data as Record<string, unknown>[] || [])
  }
  useEffect(() => { void load() }, [organization?.id])

  const createProfile = async () => {
    if (!organization?.id || !isAdmin) return
    const { data, error } = await supabase.from('import_profiles').insert({
      organization_id: organization.id, profile_name: 'استيراد عام', report_type: 'generic_catalog',
      source: 'manual', version: 1, required_columns: ['item_code'],
      optional_columns: ['name', 'name_ar', 'base_price', 'retail_price', 'wholesale_price', 'stock_quantity'],
      ignored_columns: [], synonyms: { item_code: ['sku', 'رمز الصنف', 'كود الصنف'] },
      transformation_rules: {}, validation_rules: { item_code: 'required_string' },
      matching_key: 'item_code', merge_strategy: 'manual_review', date_rules: {}, status: 'active',
    }).select('*').single()
    if (error) setMessage(error.message)
    else { setProfiles([data as Record<string, unknown>]); setProfileId(String(data.id)); show('success', 'تم إنشاء ملف التعريف') }
  }

  const hashFile = async (selected: File) => {
    const digest = await crypto.subtle.digest('SHA-256', await selected.arrayBuffer())
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }

  const createProfileVersion = async () => {
    if (!organization?.id || !isAdmin || !duplicate) return
    const current = profiles.find(entry => String(entry.id) === duplicate.profileId)
    if (!current) { setMessage('ملف التعريف الأصلي غير موجود.'); return }
    setBusy(true)
    try {
      const name = String(current.profile_name || 'استيراد عام')
      const nextVersion = Math.max(0, ...profiles.filter(entry => String(entry.profile_name) === name).map(entry => Number(entry.version) || 0)) + 1
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) throw new Error('انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.')
      const { data, error } = await supabase.from('import_profiles').insert({
        organization_id: organization.id, profile_name: name,
        report_type: current.report_type, source: current.source, version: nextVersion,
        required_columns: current.required_columns, optional_columns: current.optional_columns,
        ignored_columns: current.ignored_columns, synonyms: current.synonyms,
        transformation_rules: current.transformation_rules, validation_rules: current.validation_rules,
        matching_key: current.matching_key, merge_strategy: current.merge_strategy,
        date_rules: current.date_rules, status: 'active', created_by: authData.user.id,
      }).select('*').single()
      if (error) throw error
      setProfiles(previous => [...previous, data as Record<string, unknown>])
      setProfileId(String(data.id))
      setDuplicate(null)
      setMessage('تم إنشاء إصدار v' + nextVersion + '. أعد فحص الملف لتسجيل نسخة مستقلة بهذا الإصدار.')
      show('success', 'تم إنشاء إصدار جديد لملف التعريف', 'لم يتم دمج بيانات الملف أو استبدال النسخة السابقة.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'تعذر إنشاء إصدار جديد.')
    } finally {
      abortControllerRef.current = null
      pausedRef.current = false
      setPaused(false)
      resumeRef.current = null
      setBusy(false)
    }
  }

  const retryFailedImport = async () => {
    if (!file || !organization?.id || !profileId || !duplicate?.uploadId) return
    const selectedProfile = profiles.find(entry => String(entry.id) === profileId)
    if (!selectedProfile) { setMessage('ملف التعريف المحدد غير متاح.'); return }
    if (file.name.split('.').pop()?.toLowerCase() !== 'csv') { setMessage('إعادة المحاولة متاحة حالياً لمعالجة CSV فقط.'); return }
    setBusy(true); setMessage(''); setProgress(null)
    abortControllerRef.current = new AbortController()
    pausedRef.current = false
    setPaused(false)
    try {
      const verifiedHash = await hashFile(file)
      if (verifiedHash !== duplicate.fileHash) throw new Error('FILE_HASH_CHANGED')
      const result = await processCsvToSnapshot({
        file,
        organizationId: organization.id,
        profile: selectedProfile as unknown as CsvImportProfile,
        fileHash: duplicate.fileHash,
        existingUploadId: duplicate.uploadId,
        policies,
        signal: abortControllerRef.current.signal,
        waitIfPaused,
        onProgress: next => setProgress(next),
      })
      const summary = 'الصفوف: ' + result.totalRows + '؛ المقبولة: ' + result.acceptedRows + '؛ التحذيرات: ' + result.warningRows + '؛ المرفوضة: ' + result.rejectedRows + '؛ المكررة: ' + result.duplicateRows + '؛ DQS: ' + (result.qualityScore ?? 'غير متاح') + '/100. ' + result.message
      setMessage(summary)
      show(result.status === 'rejected' ? 'warning' : 'success', 'انتهت إعادة معالجة CSV', summary)
      setDuplicate(null)
      setFile(null)
      await load()
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'تعذر إعادة المعالجة.'
      const cancelled = reason === 'IMPORT_CANCELLED'
      setMessage(cancelled ? 'أُلغيت المعالجة. السجلات الجزئية ستُنظف قبل المحاولة التالية.' : reason === 'FILE_HASH_CHANGED' ? 'الملف المختار لا يطابق البصمة الأصلية.' : reason)
      show(cancelled ? 'warning' : 'error', cancelled ? 'أُلغيت المعالجة' : 'تعذرت إعادة المعالجة')
      await load()
    } finally {
      abortControllerRef.current = null
      pausedRef.current = false
      setPaused(false)
      resumeRef.current = null
      setBusy(false)
      setProgress(null)
    }
  }

  const stage = async () => {
    if (!file || !organization?.id || !profileId) { setMessage('اختر ملفاً وملف تعريف أولاً.'); return }
    if (file.size <= 0 || file.size > policies.max_file_size_mb * 1024 * 1024) { setMessage('حجم الملف يجب ألا يتجاوز ' + policies.max_file_size_mb + ' ميجابايت وأن يكون أكبر من صفر.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext)) { setMessage('الأنواع المسموحة: CSV وExcel وPDF.'); return }
    const profile = profiles.find(entry => String(entry.id) === profileId)
    if (!profile) { setMessage('ملف التعريف المحدد غير متاح.'); return }
    setBusy(true); setMessage(''); setProgress(null)
    try {
      const fileHash = await hashFile(file)
      const { data: existing, error: checkError } = await supabase.from('import_uploads').select('id, file_name, status')
        .eq('organization_id', organization.id).eq('profile_id', profileId).eq('file_hash', fileHash)
        .is('period_start', null).is('period_end', null).maybeSingle()
      if (checkError) throw checkError
      if (existing) {
        if (String(existing.status) === 'failed' && ext === 'csv') {
          setDuplicate({ fileHash, profileId, uploadId: String(existing.id), status: String(existing.status) })
          setMessage('يوجد تشغيل سابق فاشل لهذا الملف؛ يمكنك إعادة المعالجة من البداية مع حذف سجلات Snapshot الجزئية الخاصة بذلك التشغيل.')
        } else {
          setDuplicate({ fileHash, profileId, status: String(existing.status) })
          setMessage('الملف مكرر بالبصمة نفسها: ' + existing.file_name + '. اختر تجاهله أو إنشاء نسخة جديدة من ملف التعريف.')
        }
        return
      }

      if (ext === 'csv') {
        abortControllerRef.current = new AbortController()
        pausedRef.current = false
        setPaused(false)
        const result = await processCsvToSnapshot({
          file, organizationId: organization.id,
          profile: profile as unknown as CsvImportProfile, fileHash,
          policies,
          signal: abortControllerRef.current.signal,
          waitIfPaused,
          onProgress: next => setProgress(next),
        })
        const summary = `الصفوف: ${result.totalRows}؛ المقبولة: ${result.acceptedRows}؛ التحذيرات: ${result.warningRows}؛ المرفوضة: ${result.rejectedRows}؛ المكررة: ${result.duplicateRows}؛ DQS: ${result.qualityScore ?? 'غير متاح'}/100. ${result.message}`
        setMessage(summary)
        show(result.status === 'rejected' ? 'warning' : 'success', 'انتهى فحص CSV', summary)
      } else {
        const { error } = await supabase.from('import_uploads').insert({
          organization_id: organization.id, profile_id: profileId,
          file_name: file.name, file_type: ext, file_size: file.size, file_hash: fileHash,
          expires_at: new Date(Date.now() + policies.import_retention_days * 86400000).toISOString(),
          status: 'manual_review', error_code: 'PARSER_NOT_AVAILABLE',
          error_message: ext === 'pdf'
            ? 'لم يتم ربط مستخرج الجداول من PDF بعد. يتطلب الملف تعييناً ومراجعة يدوية ولا تُولد صفوف مفترضة.'
            : 'لم يتم ربط قارئ Excel بعد. سُجل الملف كبصمة وبيانات وصفية فقط ولم تتم معالجته.',
        })
        if (error) throw error
        const note = ext === 'pdf'
          ? 'يتطلب PDF مراجعة يدوية؛ لم يُستخرج جدول ولم تُخمن بيانات.'
          : 'تم تسجيل الملف؛ قارئ Excel غير موصول، ولم تُعلن المعالجة مكتملة.'
        setMessage(note)
        show('warning', 'تم تسجيل الملف للمراجعة', note)
      }
      setFile(null)
      setProgress(null)
      await load()
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'تعذر معالجة الملف.'
      setMessage(reason); show('error', 'تعذر تسجيل أو معالجة الملف', reason)
    } finally {
      setBusy(false)
    }
  }

  return <AdminPage title="محرك الاستيراد الموحد" description="فحص CSV فعلياً على دفعات، وتوجيه Excel/PDF للمراجعة دون تخمين" icon={Upload}>
    <div className="card mb-5 max-w-2xl p-6">
      <div className="mb-4 rounded-xl border border-warning-200 bg-warning-50 p-4"><p className="font-bold text-warning-900">حدود المعالجة المعلنة</p><p className="mt-1 text-sm leading-6 text-warning-800">CSV يُحلّل تدريجياً إلى دفعات بحجم ${policies.processing_chunk_size} سجل مع التطبيع والتحقق وكشف التكرار ودرجة جودة Snapshot. لا يتم دمج السجلات تلقائياً في البيانات التشغيلية. ملفات Excel وPDF تبقى للمراجعة لأن قارئهما لم يُربط بعد؛ لن تظهر نسبة تقدم مصطنعة أو حالة «مكتمل».</p></div>
      {profiles.length ? <div className="mb-4"><label className="label">ملف تعريف الاستيراد</label><select className="input" value={profileId} onChange={e => setProfileId(e.target.value)}>{profiles.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.profile_name)} v{String(p.version)}</option>)}</select></div> : <button type="button" disabled={!isAdmin || busy} className="btn-secondary mb-4" onClick={() => void createProfile()}>إنشاء ملف تعريف أساسي</button>}
      <label className="label">ملف CSV أو Excel أو PDF</label><input type="file" accept=".csv,.xlsx,.xls,.pdf" className="input" onChange={e => { setFile(e.target.files?.[0] || null); setDuplicate(null); setMessage('') }} />
      <p className="mt-3 text-xs leading-5 text-neutral-500">حد الملف {policies.max_file_size_mb} ميجابايت؛ حد CSV هو {policies.max_import_rows.toLocaleString('en-US')} صف و{policies.max_import_columns} عمود و{policies.max_cell_length} حرف للخلية. تُحفظ بصمة SHA-256 والسجلات المنظمة وبيان Snapshot، ولا يُرفع الملف الخام إلى Storage.</p>
      {progress && <div role="status" className="mt-4 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900"><p className="font-semibold">{progress.stage}</p><p className="mt-1">تم فحص {progress.processedRows.toLocaleString('en-US')} صف؛ تُحفظ الدفعات كل 500 سجل.</p><div className="mt-2 h-1.5 animate-pulse rounded bg-primary-200" /></div>}
      {message && <p role="status" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm leading-6">{message}</p>}
      {duplicate && <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-4">
        <p className="font-semibold text-warning-900">إجراء الملف المكرر</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => { setDuplicate(null); setFile(null); setMessage('تم تجاهل الملف المكرر.'); }} className="btn-secondary btn-sm">تجاهل</button>
          {duplicate.status === 'failed' && duplicate.uploadId && <button type="button" disabled={busy || !isAdmin || !file} onClick={() => void retryFailedImport()} className="btn-primary btn-sm">إعادة محاولة CSV</button>}
          <button type="button" disabled={busy || !isAdmin} onClick={() => void createProfileVersion()} className="btn-primary btn-sm">إنشاء نسخة جديدة</button>
          <button type="button" disabled title="يتطلب محرك استبدال ذري" className="btn-secondary btn-sm opacity-50">استبدال النسخة (غير متاح)</button>
          <button type="button" disabled title="يتطلب محرك دمج فعلي" className="btn-secondary btn-sm opacity-50">دمج (غير متاح)</button>
        </div>
        <p className="mt-2 text-xs text-warning-800">الاستبدال والدمج متوقفان حتى وجود تنفيذ خادمي ذري؛ لن يظهرا كوظيفتين شكليتين.</p>
      </div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={!file || !profileId || busy || !isAdmin || !!duplicate} onClick={() => void stage()} className="btn-primary">{busy ? (paused ? 'المعالجة متوقفة مؤقتاً' : 'جارٍ الفحص والمعالجة…') : 'فحص / تسجيل الملف'}</button>
        {busy && abortControllerRef.current && <button type="button" onClick={togglePause} className="btn-secondary">{paused ? 'متابعة المعالجة' : 'إيقاف مؤقت'}</button>}
        {busy && abortControllerRef.current && <button type="button" onClick={cancelImport} className="btn-danger">إلغاء المعالجة</button>}
      </div>
    </div>
    {uploads.length > 0 && <Table headers={['الملف', 'النوع', 'الحالة', 'الجودة', 'SHA-256', 'التاريخ']}>{uploads.map(row => <tr key={String(row.id)} className="border-t border-neutral-100"><td className="p-4">{String(row.file_name || '—')}</td><td className="p-4">{String(row.file_type || '—')}</td><td className="p-4"><StatusBadge status={String(row.status)} /></td><td className="p-4">{row.quality_score != null ? `${row.quality_score}/100` : '—'}</td><td className="p-4 font-mono text-xs">{String(row.file_hash || '—').slice(0, 16)}…</td><td className="p-4 text-neutral-500">{row.uploaded_at ? formatDate(String(row.uploaded_at)) : '—'}</td></tr>)}</Table>}
  </AdminPage>
}
export function ImportLogs() { const { organization } = useAuth(); const [rows, setRows] = useState<Record<string, unknown>[]>([]); useEffect(() => { if (organization) supabase.from('import_uploads').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data as any || [])) }, [organization]); return <AdminPage title="سجلات الاستيراد" description="تاريخ عمليات إدخال البيانات" icon={FileText}>{rows.length ? <Table headers={['الملف', 'النوع', 'الحالة', 'الجودة', 'التاريخ']}>{rows.map(row => <tr className="border-t border-neutral-100" key={String(row.id)}><td className="p-4">{String(row.file_name || '—')}</td><td className="p-4">{String(row.file_type || '—')}</td><td className="p-4"><StatusBadge status={String(row.status)} /></td><td className="p-4">{row.quality_score != null ? `${row.quality_score}/100` : '—'}</td><td className="p-4">{row.created_at ? formatDate(String(row.created_at)) : '—'}</td></tr>)}</Table> : <EmptyState title="لا توجد عمليات استيراد" description="ستظهر السجلات بعد تشغيل أول عملية استيراد." />}</AdminPage> }
export function AI() { return <AdminPage title="مركز الذكاء الاصطناعي" description="تنبيهات ومهام ذكية مبنية على بيانات المنصة" icon={Brain}><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[{ label: 'التنبيهات', to: '/admin/ai/alerts', Icon: AlertTriangle }, { label: 'التقارير', to: '/admin/ai/reports', Icon: BarChart3 }, { label: 'المهام', to: '/admin/ai/tasks', Icon: CheckCircle2 }].map(item => <Link to={item.to} className="card-hover p-5" key={item.to}><item.Icon className="h-7 w-7 text-primary-600" /><h3 className="font-bold mt-4">{item.label}</h3><p className="text-sm text-neutral-500 mt-1">فتح مساحة العمل</p></Link>)}</div></AdminPage> }
function AiList({ table, title, icon: Icon }: { table: string; title: string; icon: typeof AlertTriangle }) { const { organization } = useAuth(); const [rows, setRows] = useState<Record<string, unknown>[]>([]); useEffect(() => { if (organization) supabase.from(table).select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => setRows(data as any || [])) }, [organization, table]); return <AdminPage title={title} description="بيانات النظام الفعلية" icon={Icon}>{rows.length ? <div className="space-y-3">{rows.map(row => <div className="card p-4 flex items-start gap-3" key={String(row.id)}><Icon className="h-5 w-5 text-warning-500 mt-0.5" /><div className="flex-1"><h3 className="font-semibold">{String(row.title || row.name || 'سجل')}</h3><p className="text-sm text-neutral-500 mt-1">{String(row.description || row.body || row.result || 'لا توجد تفاصيل إضافية')}</p></div><StatusBadge status={String(row.status || row.severity || 'info')} /></div>)}</div> : <EmptyState title={`لا توجد ${title}`} description="لا توجد سجلات مطابقة حالياً." />}</AdminPage> }
export function AIReports() { return <AiList table="ai_reports" title="تقارير AI" icon={BarChart3} /> }
export function AIAlerts() { return <AiList table="ai_alerts" title="تنبيهات AI" icon={AlertTriangle} /> }
export function AITasks() { return <AiList table="ai_tasks" title="مهام AI" icon={Brain} /> }
export function Reports() { return <AdminPage title="التقارير" description="ملخصات الأداء التجاري" icon={BarChart3}><Notice message="ستُعرض التقارير المتاحة من بيانات الطلبات والفواتير عند توفرها في الحساب." /></AdminPage> }
export function UsersPage() { const { organization } = useAuth(); const [rows, setRows] = useState<Record<string, unknown>[]>([]); useEffect(() => { if (organization) supabase.from('organization_members').select('*').eq('organization_id', organization.id).then(({ data }) => setRows(data as any || [])) }, [organization]); return <AdminPage title="المستخدمون" description="المستخدمون والأدوار داخل المؤسسة" icon={Shield}><Table headers={['معرّف المستخدم', 'الدور', 'الحالة', 'التاريخ']}>{rows.map(row => <tr className="border-t border-neutral-100" key={String(row.id)}><td className="p-4 font-mono text-xs">{String(row.user_id)}</td><td className="p-4"><StatusBadge status={String(row.role)} /></td><td className="p-4"><StatusBadge status={String(row.status)} /></td><td className="p-4">{row.created_at ? formatDate(String(row.created_at)) : '—'}</td></tr>)}</Table></AdminPage> }
export function Audit() { return <AdminPage title="سجل النظام" description="العمليات المسجلة على الحساب" icon={FileText}><Notice message="لا توجد سجلات قابلة للعرض حالياً." /></AdminPage> }
export function AdminNotifications() { return <AiList table="notifications" title="الإشعارات" icon={Bell} /> }
export function Health() { return <AdminPage title="صحة النظام" description="حالة الخدمات الأساسية" icon={HeartPulse}><div className="card divide-y divide-neutral-100">{[{ label: 'قاعدة البيانات', value: 'متصلة', Icon: CheckCircle2 }, { label: 'المصادقة', value: 'متاحة', Icon: CheckCircle2 }, { label: 'الكتالوج', value: 'متاح', Icon: CheckCircle2 }].map(item => <div className="p-4 flex items-center justify-between" key={item.label}><div className="flex items-center gap-3"><item.Icon className="h-5 w-5 text-success-500" /><span>{item.label}</span></div><span className="text-sm text-success-700">{item.value}</span></div>)}</div></AdminPage> }
export function Settings() { const { organization } = useAuth(); const { show } = useToast(); const [name, setName] = useState(organization?.name || ''); const save = async () => { if (!organization) return; const { error } = await supabase.from('organizations').update({ name }).eq('id', organization.id); show(error ? 'error' : 'success', error ? 'تعذر الحفظ' : 'تم حفظ الإعدادات', error?.message) }; return <AdminPage title="الإعدادات" description="إعدادات المؤسسة الأساسية" icon={SettingsIcon}><div className="card p-6 max-w-xl space-y-4"><div><label className="label">اسم المؤسسة</label><input className="input" value={name} onChange={event => setName(event.target.value)} /></div><button className="btn-primary" onClick={save}>حفظ التغييرات</button></div></AdminPage> }
