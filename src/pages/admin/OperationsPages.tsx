import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, ArrowLeftRight, Boxes, Building2, ClipboardCheck, CreditCard, FileText, Plus, RefreshCw, Search, ShieldCheck, Truck, Wallet, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency, formatDate } from '@/lib/utils'

type Row = Record<string, unknown>
type Column = { key: string; label: string; kind?: 'date' | 'currency' | 'status' | 'quantity' }

type WorkspaceConfig = {
  title: string
  description: string
  table: string
  icon: typeof Activity
  columns: Column[]
  tenantScoped?: boolean
  readOnlyNote?: string
}

function displayValue(value: unknown, kind?: Column['kind']) {
  if (value === null || value === undefined || value === '') return '—'
  if (kind === 'date' && typeof value === 'string') return formatDate(value)
  if (kind === 'currency' && (typeof value === 'number' || typeof value === 'string')) {
    const number = Number(value)
    return Number.isFinite(number) ? formatCurrency(number) : String(value)
  }
  if (kind === 'status') {
    const text = String(value)
    const known: Record<string, string> = {
      active: 'نشط', inactive: 'غير نشط', pending: 'قيد الانتظار', posted: 'مرحّل',
      draft: 'مسودة', paid: 'مدفوع', unpaid: 'غير مدفوع', failed: 'فشل',
      processing: 'قيد المعالجة', completed: 'مكتمل', cancelled: 'ملغى',
      invited: 'دعوة معلقة', suspended: 'موقوف', received: 'مستلم',
    }
    return known[text] || text
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function OperationalWorkspace({ config }: { config: WorkspaceConfig }) {
  const { organization } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const Icon = config.icon

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      let query = supabase.from(config.table).select('*').limit(200).order('created_at', { ascending: false })
      if (config.tenantScoped && organization?.id) query = query.eq('organization_id', organization.id)
      const { data, error: queryError } = await query
      if (queryError) throw queryError
      setRows((data || []) as Row[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات الوحدة')
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [config.table, config.tenantScoped, organization?.id])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return rows
    return rows.filter(row => Object.values(row).some(value => displayValue(value).toLocaleLowerCase().includes(term)))
  }, [rows, search])

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Icon className="h-5 w-5" /></div>
          <div><h1 className="text-2xl font-bold text-neutral-900">{config.title}</h1><p className="mt-1 text-sm text-neutral-500">{config.description}</p></div>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center justify-center gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> تحديث البيانات
        </button>
      </div>
      {config.readOnlyNote && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{config.readOnlyNote}</div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-neutral-500">السجلات المحمّلة</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : rows.length}</p></div>
        <div className="card p-4"><p className="text-sm text-neutral-500">نتائج البحث</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : filtered.length}</p></div>
        <div className="card p-4"><p className="text-sm text-neutral-500">نطاق البيانات</p><p className="mt-1 text-sm font-semibold">{config.tenantScoped ? 'المؤسسة الحالية + RLS' : 'صلاحيات قاعدة البيانات (RLS)'}</p></div>
      </div>
      <div className="card mb-4 flex items-center gap-3 p-3">
        <Search className="h-5 w-5 shrink-0 text-neutral-400" />
        <input className="min-w-0 flex-1 border-0 bg-transparent outline-none focus:ring-0" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث ضمن السجلات المعروضة..." aria-label="بحث في السجلات" />
        {search && <button type="button" onClick={() => setSearch('')} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="مسح البحث"><X className="h-4 w-4" /></button>}
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">تعذر تحميل بيانات {config.title}</p><p className="mt-1 break-words">{error}</p><button type="button" onClick={() => void load(true)} className="mt-3 font-semibold underline">إعادة المحاولة</button></div>}
      {loading ? <div className="card p-10 text-center text-sm text-neutral-500">جارٍ تحميل البيانات الفعلية…</div>
        : !error && filtered.length === 0 ? <div className="card p-10 text-center"><p className="font-semibold text-neutral-700">{search ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات متاحة'}</p><p className="mt-1 text-sm text-neutral-500">{search ? 'جرّب كلمة بحث أخرى.' : 'ستظهر هنا السجلات التي تسمح بها صلاحيات مؤسستك.'}</p></div>
        : !error && <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{config.columns.map(col => <th key={col.key} className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-600">{col.label}</th>)}</tr></thead><tbody>{filtered.map((row, idx) => <tr key={String(row.id || row.reference_id || idx)} className="border-t border-neutral-100 hover:bg-neutral-50/70">{config.columns.map(col => <td key={col.key} className="max-w-[320px] px-4 py-3 text-neutral-700"><span className="block truncate" title={displayValue(row[col.key], col.kind)}>{displayValue(row[col.key], col.kind)}</span></td>)}</tr>)}</tbody></table><p className="border-t border-neutral-100 px-4 py-3 text-xs text-neutral-400">يعرض ما يصل إلى 200 سجل من المصدر المباشر؛ تُفرض صلاحيات الصفوف في قاعدة البيانات.</p></div>}
    </div>
  )
}

export function Inventory() {
  return <OperationalWorkspace config={{
    title: 'المخزون', description: 'الأرصدة الفعلية والحجز والكمية المتاحة ونقطة إعادة الطلب.',
    table: 'inventory_balances', icon: Boxes,
    columns: [
      { key: 'product_id', label: 'معرّف المنتج' }, { key: 'warehouse_id', label: 'المستودع' },
      { key: 'quantity_on_hand', label: 'الرصيد الفعلي', kind: 'quantity' },
      { key: 'quantity_reserved', label: 'المحجوز', kind: 'quantity' },
      { key: 'quantity_available', label: 'المتاح', kind: 'quantity' },
      { key: 'reorder_point', label: 'حد إعادة الطلب', kind: 'quantity' },
    ],
    readOnlyNote: 'عرض المخزون هنا للقراءة فقط. لا يتم تعديل الرصيد أو التسويات مباشرة من المتصفح؛ النقل والجرد يجب أن يمرّا بعمليات خادمية ذرية تحفظ سجل الحركة.',
  }} />
}

export function Warehouses() {
  return <OperationalWorkspace config={{
    title: 'المستودعات', description: 'مواقع التخزين التابعة للمؤسسة وحالتها.',
    table: 'warehouses', icon: Building2, tenantScoped: true,
    columns: [{ key: 'name', label: 'المستودع' }, { key: 'code', label: 'الرمز' }, { key: 'branch_id', label: 'الفرع' }, { key: 'is_active', label: 'الحالة', kind: 'status' }, { key: 'created_at', label: 'تاريخ الإنشاء', kind: 'date' }],
  }} />
}

export function StockMovements() {
  return <OperationalWorkspace config={{
    title: 'حركات المخزون', description: 'سجل حركات الرصيد المسجلة فعلياً.',
    table: 'inventory_movements', icon: ArrowLeftRight,
    columns: [{ key: 'created_at', label: 'التاريخ', kind: 'date' }, { key: 'movement_type', label: 'نوع الحركة', kind: 'status' }, { key: 'product_id', label: 'المنتج' }, { key: 'warehouse_id', label: 'المستودع' }, { key: 'quantity', label: 'الكمية', kind: 'quantity' }, { key: 'balance_after', label: 'الرصيد بعد الحركة', kind: 'quantity' }, { key: 'reference_id', label: 'مرجع العملية' }],
  }} />
}

export function Suppliers() {
  const { organization } = useAuth()
  const { show } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let query = supabase.from('suppliers').select('*').order('name')
      if (organization?.id) query = query.eq('organization_id', organization.id)
      const { data, error: loadError } = await query
      if (loadError) throw loadError
      setRows((data || []) as Row[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الموردين')
      setRows([])
    } finally { setLoading(false) }
  }, [organization?.id])
  useEffect(() => { void load() }, [load])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!organization?.id) { show('error', 'لا توجد مؤسسة نشطة', 'اختر مؤسسة قبل إضافة المورد.'); return }
    if (!name.trim() || !code.trim()) { show('error', 'بيانات ناقصة', 'اسم المورد والرمز مطلوبان.'); return }
    setSubmitting(true)
    const { error: insertError } = await supabase.from('suppliers').insert({
      organization_id: organization.id, name: name.trim(), supplier_code: code.trim(),
      contact_name: contact.trim() || null, phone: phone.trim() || null, email: email.trim() || null, status: 'active',
    })
    setSubmitting(false)
    if (insertError) { show('error', 'تعذر حفظ المورد', insertError.message); return }
    show('success', 'تم حفظ المورد', 'تمت قراءة النتيجة من قاعدة البيانات بعد الإضافة.')
    setOpen(false); setName(''); setCode(''); setContact(''); setPhone(''); setEmail('')
    await load()
  }

  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Truck className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold">الموردون</h1><p className="mt-1 text-sm text-neutral-500">سجل الموردين المرتبطين بالمؤسسة الحالية.</p></div></div>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" /> إضافة مورد</button>
    </div>
    <div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="card p-4"><p className="text-sm text-neutral-500">إجمالي الموردين</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : rows.length}</p></div><div className="card p-4"><p className="text-sm text-neutral-500">المؤسسة</p><p className="mt-1 truncate font-semibold">{organization?.name || 'غير محددة'}</p></div></div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => void load()} className="mr-3 font-bold underline">إعادة المحاولة</button></div>}
    {loading ? <div className="card p-10 text-center text-sm text-neutral-500">جارٍ تحميل الموردين…</div> : !error && rows.length === 0 ? <div className="card p-10 text-center"><p className="font-semibold">لا يوجد موردون مسجلون</p><p className="mt-1 text-sm text-neutral-500">أضف الموردين الذين تتعامل معهم المؤسسة.</p></div> : !error && <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['الرمز','اسم المورد','جهة الاتصال','الهاتف','البريد','الحالة'].map(x=><th key={x} className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-600">{x}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={String(row.id)} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono text-xs">{displayValue(row.supplier_code)}</td><td className="px-4 py-3 font-semibold">{displayValue(row.name)}</td><td className="px-4 py-3">{displayValue(row.contact_name)}</td><td className="px-4 py-3">{displayValue(row.phone)}</td><td className="px-4 py-3">{displayValue(row.email)}</td><td className="px-4 py-3">{displayValue(row.status, 'status')}</td></tr>)}</tbody></table></div>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title"><div className="mb-4 flex items-start justify-between"><div><h2 id="supplier-form-title" className="text-lg font-bold">إضافة مورد</h2><p className="mt-1 text-sm text-neutral-500">سيُحفظ في المؤسسة النشطة مع تطبيق RLS.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-neutral-100" aria-label="إغلاق"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">اسم المورد *<input autoFocus required value={name} onChange={e=>setName(e.target.value)} className="input mt-1" maxLength={160}/></label><label className="text-sm font-medium">رمز المورد *<input required value={code} onChange={e=>setCode(e.target.value)} className="input mt-1" maxLength={60}/></label><label className="text-sm font-medium">جهة الاتصال<input value={contact} onChange={e=>setContact(e.target.value)} className="input mt-1" maxLength={160}/></label><label className="text-sm font-medium">الهاتف<input value={phone} onChange={e=>setPhone(e.target.value)} className="input mt-1" maxLength={60}/></label><label className="text-sm font-medium sm:col-span-2">البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="input mt-1" maxLength={254}/></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={()=>setOpen(false)} disabled={submitting}>إلغاء</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'جارٍ الحفظ…' : 'حفظ المورد'}</button></div></form></div>}
  </div>
}

export function AdminInvoices() {
  return <OperationalWorkspace config={{ title: 'الفواتير', description: 'فواتير المؤسسة وحالات إصدارها وسدادها.', table: 'invoices', icon: FileText, tenantScoped: true, columns: [{key:'invoice_number',label:'رقم الفاتورة'},{key:'organization_id',label:'المؤسسة'},{key:'status',label:'الحالة',kind:'status'},{key:'total',label:'الإجمالي',kind:'currency'},{key:'currency',label:'العملة'},{key:'created_at',label:'التاريخ',kind:'date'}] }} />
}
type AdminPaymentRow = {
  id: string
  invoice_id: string
  amount: number
  method: string | null
  status: string
  reference: string | null
  notes: string | null
  created_at: string
  paid_date: string | null
}

export function AdminPayments() {
  const { organization } = useAuth()
  const { show } = useToast()
  const [rows, setRows] = useState<AdminPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ payment: AdminPaymentRow; approve: boolean } | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (!organization?.id) { setRows([]); setLoading(false); return }
    if (refresh) setRefreshing(true); else setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase.from('payments')
        .select('id,invoice_id,amount,method,status,reference,notes,created_at,paid_date')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false }).limit(500)
      if (queryError) throw queryError
      setRows((data || []) as AdminPaymentRow[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المدفوعات')
      setRows([])
    } finally { setLoading(false); setRefreshing(false) }
  }, [organization?.id])

  useEffect(() => { void load() }, [load])

  const openReview = (payment: AdminPaymentRow, approve: boolean) => {
    setNotes(approve ? 'تم التحقق من إثبات السداد.' : 'لم يثبت السداد.')
    setPending({ payment, approve })
  }

  const submitReview = async (event: FormEvent) => {
    event.preventDefault()
    if (!pending || !organization?.id) return
    if (!notes.trim()) { show('error', 'سبب المراجعة مطلوب', 'أدخل ملاحظة موجزة تدعم قرار المراجعة.'); return }
    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('confirm_order_payment', {
      p_payment_id: pending.payment.id,
      p_confirm: pending.approve,
      p_admin_notes: notes.trim(),
    })
    setSubmitting(false)
    if (rpcError) { show('error', pending.approve ? 'تعذر تأكيد الدفع' : 'تعذر رفض الدفع', rpcError.message); return }
    const result = data as { status?: string; result?: string } | null
    show('success', pending.approve ? 'تم قبول مراجعة الدفع' : 'تم رفض طلب الدفع', `نتيجة العملية المسجلة: ${result?.result || result?.status || 'تم التحديث'}`)
    setPending(null); setNotes('')
    await load(true)
  }

  const statusLabel = (status: string) => ({
    pending: 'بانتظار المراجعة', confirmed: 'مؤكد', rejected: 'مرفوض',
    failed: 'فشل', refunded: 'مسترد',
  } as Record<string,string>)[status] || status

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><CreditCard className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold text-neutral-900">مراجعة المدفوعات</h1><p className="mt-1 text-sm text-neutral-500">قبول أو رفض إثبات السداد عبر RPC خادمية تتحقق من المؤسسة والطلب والفاتورة وتحدّث سجل التدقيق وصندوق الأحداث.</p></div></div>
      <button type="button" onClick={()=>void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/>تحديث</button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={()=>void load(true)} className="mt-2 font-bold underline">إعادة المحاولة</button></div>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p className="text-sm text-neutral-500">كل الطلبات</p><p className="mt-1 text-2xl font-bold">{loading?'—':rows.length}</p></div><div className="card p-4"><p className="text-sm text-neutral-500">بانتظار المراجعة</p><p className="mt-1 text-2xl font-bold">{loading?'—':rows.filter(row=>row.status==='pending').length}</p></div><div className="card p-4"><p className="text-sm text-neutral-500">مؤكدة</p><p className="mt-1 text-2xl font-bold">{loading?'—':rows.filter(row=>row.status==='confirmed').length}</p></div></div>
    {loading ? <div className="card p-10 text-center text-sm text-neutral-500">جارٍ تحميل المدفوعات…</div>
      : rows.length===0 ? <div className="card p-10 text-center text-sm text-neutral-500">لا توجد طلبات دفع مسجلة للمؤسسة الحالية.</div>
      : <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['مرجع الدفع','الفاتورة','المبلغ','الوسيلة','مرجع التحويل','الحالة','تاريخ الإرسال','الإجراء'].map(label=><th key={label} className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-600">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono text-xs">{row.id.slice(0,12)}</td><td className="px-4 py-3 font-mono text-xs">{row.invoice_id.slice(0,12)}</td><td className="px-4 py-3 font-semibold">{formatCurrency(Number(row.amount)||0)}</td><td className="px-4 py-3">{row.method||'—'}</td><td className="px-4 py-3">{row.reference||'—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status==='confirmed'?'bg-emerald-50 text-emerald-700':row.status==='pending'?'bg-amber-50 text-amber-800':'bg-neutral-100 text-neutral-600'}`}>{statusLabel(row.status)}</span></td><td className="px-4 py-3">{formatDate(row.created_at)}</td><td className="px-4 py-3">{row.status==='pending'?<div className="flex gap-2"><button type="button" onClick={()=>openReview(row,true)} className="btn-primary whitespace-nowrap">تأكيد</button><button type="button" onClick={()=>openReview(row,false)} className="btn-secondary whitespace-nowrap">رفض</button></div>:'—'}</td></tr>)}</tbody></table></div>}
    {pending && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitReview} role="dialog" aria-modal="true" aria-labelledby="payment-review-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><h2 id="payment-review-title" className="text-lg font-bold">{pending.approve?'تأكيد استلام الدفعة':'رفض طلب الدفع'}</h2><p className="mt-1 text-sm leading-6 text-neutral-500">سيُراجع الخادم أن الدفعة ما زالت معلّقة، وأن الفاتورة والطلب قابلان لهذا الانتقال. لا يُغيَّر الرصيد أو حالة الطلب مباشرة من المتصفح.</p><div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm"><p>الدفعة: <span className="font-mono">{pending.payment.id}</span></p><p className="mt-1">المبلغ: <strong>{formatCurrency(Number(pending.payment.amount)||0)}</strong></p></div><label className="mt-4 block text-sm font-semibold">ملاحظة المراجعة *<textarea className="input mt-1.5 min-h-24" value={notes} onChange={e=>setNotes(e.target.value)} required maxLength={2000}/></label><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={()=>setPending(null)} disabled={submitting}>إلغاء</button><button type="submit" disabled={submitting} className={pending.approve?'btn-primary':'btn-secondary'}>{submitting?'جارٍ إرسال القرار…':pending.approve?'تأكيد الدفع':'رفض الدفع'}</button></div></form></div>}
  </div>
}

type StatementRow = {
  id: string
  statement_number: string
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  total_invoiced: number | null
  total_paid: number | null
  status: string
  created_at: string
}

export function AdminStatements() {
  const { organization } = useAuth()
  const { show } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 8)}01`)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [rows, setRows] = useState<StatementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (refresh = false) => {
    if (!organization?.id) { setRows([]); setLoading(false); return }
    if (refresh) setRefreshing(true); else setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase.from('statements')
        .select('id,statement_number,period_start,period_end,opening_balance,closing_balance,total_invoiced,total_paid,status,created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false }).limit(200)
      if (queryError) throw queryError
      setRows((data || []) as StatementRow[])
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل كشوف الحساب')
    } finally { setLoading(false); setRefreshing(false) }
  }, [organization?.id])

  useEffect(() => { void load() }, [load])

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    if (!organization?.id) { show('error', 'المؤسسة غير محددة', 'اختر مؤسسة نشطة أولًا.'); return }
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      show('error', 'الفترة غير صحيحة', 'يجب أن يكون تاريخ البداية في أو قبل تاريخ النهاية.'); return
    }
    setGenerating(true)
    const { data, error: rpcError } = await supabase.rpc('generate_organization_statement', {
      p_organization_id: organization.id,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    })
    setGenerating(false)
    if (rpcError) { show('error', 'تعذر إنشاء كشف الحساب', rpcError.message); return }
    show('success', 'تم تثبيت كشف الحساب', `مرجع الكشف: ${String(data)}. تم حسابه من الفواتير والمدفوعات المسجلة، واستدعاء نفس الفترة يعيد الكشف نفسه.`)
    await load(true)
  }

  const statusLabel = (status: string) => ({
    generated: 'تم التوليد', sent: 'تم الإرسال', acknowledged: 'تم الإقرار', disputed: 'متنازع عليه',
  } as Record<string,string>)[status] || status

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><Wallet className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold text-neutral-900">كشوف الحساب</h1><p className="mt-1 text-sm leading-6 text-neutral-500">أنشئ لقطة مالية للفترة المختارة من الفواتير والمدفوعات المؤكدة، مع حفظ الرصيد الافتتاحي والإجمالي والرصيد الختامي وسجل تدقيق.</p></div></div>
      <button type="button" onClick={()=>void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/>تحديث</button>
    </div>
    <form onSubmit={generate} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block text-sm font-semibold">بداية الفترة<input className="input mt-1.5" type="date" value={periodStart} max={periodEnd || undefined} onChange={e=>setPeriodStart(e.target.value)} required/></label>
      <label className="block text-sm font-semibold">نهاية الفترة<input className="input mt-1.5" type="date" value={periodEnd} min={periodStart || undefined} onChange={e=>setPeriodEnd(e.target.value)} required/></label>
      <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2" disabled={generating}><Plus className="h-4 w-4"/>{generating?'جارٍ حساب الفترة…':'توليد كشف حساب'}</button>
      <p className="text-xs leading-5 text-neutral-500 sm:col-span-3">التوليد مقصور على مالك/مدير المؤسسة ويُنفّذ خادميًا. الفترة الواحدة تُثبّت مرة واحدة؛ لا يجري تعديل الكشف التاريخي بصمت عند إعادة الطلب.</p>
    </form>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={()=>void load(true)} className="mt-2 font-bold underline">إعادة المحاولة</button></div>}
    {loading ? <div className="card p-10 text-center text-sm text-neutral-500">جارٍ تحميل كشوف الحساب…</div>
      : rows.length===0 ? <div className="card p-10 text-center"><p className="font-semibold text-neutral-700">لا توجد كشوف حساب محفوظة</p><p className="mt-1 text-sm text-neutral-500">اختر فترة ثم ولّد كشفًا من السجلات المالية الحقيقية.</p></div>
      : <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['رقم الكشف','من','إلى','الرصيد الافتتاحي','فواتير الفترة','مدفوعات الفترة','الرصيد الختامي','الحالة','تاريخ التوليد'].map(label=><th key={label} className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-600">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono text-xs">{row.statement_number}</td><td className="px-4 py-3">{formatDate(row.period_start)}</td><td className="px-4 py-3">{formatDate(row.period_end)}</td><td className="px-4 py-3">{formatCurrency(Number(row.opening_balance)||0)}</td><td className="px-4 py-3">{formatCurrency(Number(row.total_invoiced)||0)}</td><td className="px-4 py-3">{formatCurrency(Number(row.total_paid)||0)}</td><td className="px-4 py-3 font-semibold">{formatCurrency(Number(row.closing_balance)||0)}</td><td className="px-4 py-3">{statusLabel(row.status)}</td><td className="px-4 py-3">{formatDate(row.created_at)}</td></tr>)}</tbody></table><p className="border-t border-neutral-100 px-4 py-3 text-xs text-neutral-400">كشوف محفوظة غير قابلة للتعديل المباشر عبر المتصفح. التوليد المتكرر للفترة نفسها يعيد معرف الكشف السابق.</p></div>}
  </div>
}

type OrganizationRoleRow = {
  id: string
  user_id: string
  role: string
  status: string
  created_at: string
}

const editableOrganizationRoles = [
  { value: 'admin', label: 'مدير' },
  { value: 'manager', label: 'مشرف' },
  { value: 'warehouse', label: 'المخزون' },
  { value: 'accountant', label: 'محاسب' },
  { value: 'sales', label: 'مبيعات' },
  { value: 'customer_manager', label: 'إدارة العملاء' },
  { value: 'customer', label: 'عميل' },
]

export function AdminRoles() {
  const { organization, isAdmin } = useAuth()
  const { show } = useToast()
  const [rows, setRows] = useState<OrganizationRoleRow[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (refresh = false) => {
    if (!organization?.id) { setRows([]); setLoading(false); return }
    if (refresh) setRefreshing(true); else setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('organization_members')
      .select('id,user_id,role,status,created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (queryError) {
      setRows([])
      setError(queryError.message)
    } else {
      const nextRows = (data || []) as OrganizationRoleRow[]
      setRows(nextRows)
      setEdits(Object.fromEntries(nextRows.map(row => [row.user_id, row.role])))
    }
    setLoading(false)
    setRefreshing(false)
  }, [organization?.id])

  useEffect(() => { void load() }, [load])

  const saveRole = async (row: OrganizationRoleRow) => {
    if (!organization?.id || !isAdmin) {
      show('error', 'تغيير الدور غير مسموح', 'تتطلب هذه العملية صلاحية مالك المؤسسة أو مديرها.');
      return
    }
    if (row.role === 'owner') {
      show('error', 'دور المالك محمي', 'لا يمكن تغيير دور المالك من هذه الشاشة.');
      return
    }
    const role = edits[row.user_id] || row.role
    if (role === row.role) return
    setSavingId(row.user_id)
    const { data, error: rpcError } = await supabase.rpc('update_organization_member_role', {
      p_organization_id: organization.id,
      p_target_user_id: row.user_id,
      p_new_role: role,
    })
    setSavingId('')
    if (rpcError) {
      show('error', 'تعذر حفظ الدور', rpcError.message)
      return
    }
    const result = data as { status?: string; new_role?: string } | null
    show('success', 'تم حفظ الدور', `الدور الجديد: ${editableOrganizationRoles.find(option => option.value === result?.new_role)?.label || role}. سُجل التغيير في سجل التدقيق.`)
    await load(true)
  }

  const roleLabel = (role: string) => editableOrganizationRoles.find(option => option.value === role)?.label || (role === 'owner' ? 'مالك المؤسسة' : role)
  const active = rows.filter(row => row.status === 'active').length

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><ShieldCheck className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold text-neutral-900">الأدوار والصلاحيات</h1><p className="mt-1 text-sm leading-6 text-neutral-500">إدارة عضويات المؤسسة الحالية. تغيير الدور يمر عبر RPC خادمية تتحقق من المالك/المدير وتمنع تعديل دور المستخدم لنفسه أو إنشاء مالك جديد، ثم تسجل العملية في سجل التدقيق.</p></div></div>
      <button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/>تحديث</button>
    </div>
    {!isAdmin && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">تستطيع مراجعة عضويات مؤسستك، لكن تغيير الأدوار يتطلب صلاحية مالك المؤسسة أو مديرها.</div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" className="mt-2 font-bold underline" onClick={() => void load(true)}>إعادة المحاولة</button></div>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p className="text-sm text-neutral-500">إجمالي العضويات</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : rows.length}</p></div><div className="card p-4"><p className="text-sm text-neutral-500">عضويات نشطة</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : active}</p></div><div className="card p-4"><p className="text-sm text-neutral-500">تغييرات معلّقة</p><p className="mt-1 text-2xl font-bold">{loading ? '—' : rows.filter(row => row.role !== (edits[row.user_id] || row.role)).length}</p></div></div>
    {loading ? <div className="card p-10 text-center text-sm text-neutral-500">جارٍ تحميل عضويات المؤسسة…</div>
      : rows.length === 0 ? <div className="card p-10 text-center text-sm text-neutral-500">لا توجد عضويات مرئية للمؤسسة الحالية، أو لا تتوفر صلاحية القراءة.</div>
      : <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['معرّف المستخدم','الدور الحالي','الدور الجديد','الحالة','تاريخ الانضمام','الإجراء'].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-600">{label}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className="border-t border-neutral-100">
          <td className="px-4 py-3 font-mono text-xs">{row.user_id}</td>
          <td className="px-4 py-3">{roleLabel(row.role)}</td>
          <td className="px-4 py-3"><select className="input min-w-36" aria-label={`الدور الجديد للمستخدم ${row.user_id}`} value={edits[row.user_id] || row.role} disabled={!isAdmin || row.role === 'owner' || row.status !== 'active' || Boolean(savingId)} onChange={event => setEdits(current => ({ ...current, [row.user_id]: event.target.value }))}>
            {row.role === 'owner' && <option value="owner">مالك المؤسسة (محمي)</option>}
            {editableOrganizationRoles.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select></td>
          <td className="px-4 py-3">{row.status === 'active' ? 'نشط' : row.status}</td>
          <td className="px-4 py-3 text-neutral-500">{formatDate(row.created_at)}</td>
          <td className="px-4 py-3"><button type="button" className="btn-primary whitespace-nowrap" disabled={!isAdmin || row.role === 'owner' || row.status !== 'active' || Boolean(savingId) || (edits[row.user_id] || row.role) === row.role} onClick={() => void saveRole(row)}>{savingId === row.user_id ? 'جارٍ الحفظ…' : 'حفظ الدور'}</button></td>
        </tr>)}
      </tbody></table></div>}
    <p className="text-xs leading-5 text-neutral-500">لا يتم تغيير الأدوار مباشرة عبر PostgREST. المنح المباشر لدور المالك غير متاح من هذه الشاشة، وجميع التغييرات تمر عبر تحقق خادمي وسجل تدقيق.</p>
  </div>
}

export function AdminOutbox() {
  return <OperationalWorkspace config={{ title: 'صندوق الأحداث', description: 'مراقبة الأحداث المسجلة للتسليم والتكاملات.', table: 'outbox_events', icon: Activity, tenantScoped: true, columns: [{key:'event_type',label:'نوع الحدث'},{key:'aggregate_id',label:'الكيان'},{key:'status',label:'الحالة',kind:'status'},{key:'attempts',label:'المحاولات',kind:'quantity'},{key:'last_attempt_at',label:'آخر محاولة',kind:'date'},{key:'created_at',label:'تاريخ التسجيل',kind:'date'}], readOnlyNote:'التسليم وإعادة المحاولة لا ينفذان من الواجهة حتى يتوفر عامل تسليم موثوق مع قفل وتراجع وDLQ.' }} />
}
export function AdminIdempotency() {
  return <OperationalWorkspace config={{ title: 'مفاتيح منع التكرار', description: 'سجل عمليات منع التكرار ونتائجها حسب المؤسسة.', table: 'idempotency_keys', icon: ClipboardCheck, tenantScoped: true, columns: [{key:'operation',label:'العملية'},{key:'idempotency_key',label:'المفتاح'},{key:'status',label:'الحالة',kind:'status'},{key:'created_at',label:'تاريخ الإنشاء',kind:'date'},{key:'expires_at',label:'انتهاء الصلاحية',kind:'date'}] }} />
}
