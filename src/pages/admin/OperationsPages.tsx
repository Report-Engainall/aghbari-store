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
export function AdminPayments() {
  return <OperationalWorkspace config={{ title: 'المدفوعات', description: 'طلبات السداد والتحقق من نتائجها.', table: 'payments', icon: CreditCard, tenantScoped: true, columns: [{key:'id',label:'مرجع الدفع'},{key:'status',label:'الحالة',kind:'status'},{key:'amount',label:'المبلغ',kind:'currency'},{key:'payment_method',label:'الوسيلة'},{key:'created_at',label:'التاريخ',kind:'date'}], readOnlyNote:'المراجعة وتأكيد الدفع عمليات مالية حساسة؛ لا يتم تغيير الحالة مباشرة من هذه القائمة.' }} />
}
export function AdminStatements() {
  return <OperationalWorkspace config={{ title: 'كشوف الحساب', description: 'ملخصات حساب المؤسسة المسموح بعرضها.', table: 'statements', icon: Wallet, tenantScoped: true, columns: [{key:'id',label:'مرجع الكشف'},{key:'period_start',label:'من',kind:'date'},{key:'period_end',label:'إلى',kind:'date'},{key:'opening_balance',label:'الرصيد الافتتاحي',kind:'currency'},{key:'closing_balance',label:'الرصيد الختامي',kind:'currency'},{key:'created_at',label:'التاريخ',kind:'date'}] }} />
}
export function AdminRoles() {
  return <OperationalWorkspace config={{ title: 'أعضاء المؤسسة والأدوار', description: 'أعضاء المؤسسة وتعيين الأدوار الممنوح من قاعدة البيانات.', table: 'organization_members', icon: ShieldCheck, tenantScoped: true, columns: [{key:'user_id',label:'معرّف المستخدم'},{key:'invited_email',label:'البريد المدعو'},{key:'role',label:'الدور',kind:'status'},{key:'status',label:'الحالة',kind:'status'},{key:'created_at',label:'تاريخ الإنشاء',kind:'date'}], readOnlyNote:'تغيير الأدوار ومنح الصلاحيات يتطلب تدفق تفويض مخصصاً واختبارات RLS؛ هذه الصفحة لا تعدّل الأدوار عبر المتصفح.' }} />
}
export function AdminOutbox() {
  return <OperationalWorkspace config={{ title: 'صندوق الأحداث', description: 'مراقبة الأحداث المسجلة للتسليم والتكاملات.', table: 'outbox_events', icon: Activity, tenantScoped: true, columns: [{key:'event_type',label:'نوع الحدث'},{key:'aggregate_id',label:'الكيان'},{key:'status',label:'الحالة',kind:'status'},{key:'attempts',label:'المحاولات',kind:'quantity'},{key:'last_attempt_at',label:'آخر محاولة',kind:'date'},{key:'created_at',label:'تاريخ التسجيل',kind:'date'}], readOnlyNote:'التسليم وإعادة المحاولة لا ينفذان من الواجهة حتى يتوفر عامل تسليم موثوق مع قفل وتراجع وDLQ.' }} />
}
export function AdminIdempotency() {
  return <OperationalWorkspace config={{ title: 'مفاتيح منع التكرار', description: 'سجل عمليات منع التكرار ونتائجها حسب المؤسسة.', table: 'idempotency_keys', icon: ClipboardCheck, tenantScoped: true, columns: [{key:'operation',label:'العملية'},{key:'idempotency_key',label:'المفتاح'},{key:'status',label:'الحالة',kind:'status'},{key:'created_at',label:'تاريخ الإنشاء',kind:'date'},{key:'expires_at',label:'انتهاء الصلاحية',kind:'date'}] }} />
}
