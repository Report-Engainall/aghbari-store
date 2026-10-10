import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeftRight, CheckCircle2, ClipboardCheck, Plus, RefreshCw, ReceiptText, ShoppingBag, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency, formatDate } from '@/lib/utils'

type ProductOption = { id: string; name: string; item_code?: string | null; sku?: string | null }
type WarehouseOption = { id: string; name: string; code?: string | null }
type SupplierOption = { id: string; name: string; supplier_code?: string | null; status?: string | null }
type PurchaseOrderRow = { id: string; purchase_number: string; status: string; warehouse_id: string; supplier_id: string; total_amount: number; created_at: string }
type PurchaseItemRow = { id: string; product_id: string; quantity_ordered: number; quantity_received: number; unit_cost: number }
type TransferRow = { id: string; transfer_number: string; status: string; from_warehouse_id: string; to_warehouse_id: string; created_at: string }
type StockCountRow = { id: string; count_number: string; warehouse_id: string; status: string; created_at: string }
type ExpenseRow = { id: string; expense_number: string; category: string; description: string; amount: number; currency: string; expense_date: string; status: string }

function FormShell({ title, description, icon: Icon, children, onSubmit, busy, submitLabel }: {
  title: string
  description: string
  icon: typeof ShoppingBag
  children: ReactNode
  onSubmit: (event: FormEvent) => void
  busy: boolean
  submitLabel: string
}) {
  return <form onSubmit={onSubmit} className="card p-4 sm:p-5">
    <div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-2.5 text-primary-700"><Icon className="h-5 w-5"/></div><div><h2 className="font-bold text-neutral-900">{title}</h2><p className="mt-1 text-sm text-neutral-500">{description}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    <div className="mt-5 flex justify-end"><button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={busy}>{busy ? <RefreshCw className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}{busy ? 'جارٍ تنفيذ العملية…' : submitLabel}</button></div>
  </form>
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-neutral-700 ${className}`}>{label}<div className="mt-1.5">{children}</div></label>
}

function PageFrame({ title, description, icon: Icon, children, refresh, refreshing = false }: {
  title: string
  description: string
  icon: typeof ShoppingBag
  children: ReactNode
  refresh: () => void
  refreshing?: boolean
}) {
  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary-50 p-3 text-primary-700"><Icon className="h-5 w-5"/></div><div><h1 className="text-2xl font-bold text-neutral-900">{title}</h1><p className="mt-1 text-sm text-neutral-500">{description}</p></div></div><button type="button" onClick={refresh} disabled={refreshing} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/>تحديث</button></div>
    {children}
  </div>
}

function Notice({ error, onRetry }: { error: string; onRetry: () => void }) {
  return error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><button type="button" onClick={onRetry} className="mr-3 font-bold underline">إعادة المحاولة</button></div> : null
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-8 text-center text-sm text-neutral-500">{children}</div>
}

function labelStatus(status: string) {
  const labels: Record<string, string> = {
    draft: 'مسودة', ordered: 'تم إصدار الطلب', partially_received: 'استلام جزئي',
    received: 'مستلم بالكامل', posted: 'مرحل', cancelled: 'ملغى', recorded: 'مسجل',
    voided: 'ملغى محاسبيًا',
  }
  return labels[status] || status
}

function SelectInput({ value, onChange, children, required = true }: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  required?: boolean
}) {
  return <select className="input w-full" value={value} required={required} onChange={e => onChange(e.target.value)}>{children}</select>
}

function useCatalogOptions() {
  const { organization } = useAuth()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!organization?.id) { setProducts([]); setWarehouses([]); setSuppliers([]); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [p, w, s] = await Promise.all([
        supabase.from('products').select('id,name,item_code,sku').eq('organization_id', organization.id).order('name').limit(1000),
        supabase.from('warehouses').select('id,name,code').eq('organization_id', organization.id).eq('is_active', true).order('name'),
        supabase.from('suppliers').select('id,name,supplier_code,status').eq('organization_id', organization.id).order('name'),
      ])
      const failed = [p.error, w.error, s.error].find(Boolean)
      if (failed) throw failed
      setProducts((p.data || []) as ProductOption[])
      setWarehouses((w.data || []) as WarehouseOption[])
      setSuppliers(((s.data || []) as SupplierOption[]).filter(x => !x.status || x.status === 'active' || x.status === 'approved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل القوائم المرجعية')
    } finally { setLoading(false) }
  }, [organization?.id])
  useEffect(() => { void load() }, [load])
  return { organization, products, warehouses, suppliers, loading, error, reload: load }
}

export function Purchasing() {
  const { organization, products, warehouses, suppliers, loading, error: optionError, reload: reloadOptions } = useCatalogOptions()
  const { show } = useToast()
  const [rows, setRows] = useState<PurchaseOrderRow[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ product_id: '', quantity_ordered: '1', unit_cost: '0' }])
  const [saving, setSaving] = useState(false)
  const [loadingRows, setLoadingRows] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!organization?.id) { setRows([]); setLoadingRows(false); return }
    setLoadingRows(true); setError('')
    const { data, error: dbError } = await supabase.from('purchase_orders').select('id,purchase_number,status,warehouse_id,supplier_id,total_amount,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(200)
    if (dbError) { setError(dbError.message); setRows([]) } else setRows((data || []) as PurchaseOrderRow[])
    setLoadingRows(false)
  }, [organization?.id])
  useEffect(() => { void load() }, [load])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!organization?.id) { show('error','المؤسسة غير محددة','اختر مؤسسة نشطة قبل إنشاء أمر الشراء.'); return }
    const payload = lines.map(line => ({ product_id: line.product_id, quantity_ordered: Number(line.quantity_ordered), unit_cost: Number(line.unit_cost) }))
    if (!supplierId || !warehouseId || payload.some(x => !x.product_id || !Number.isFinite(x.quantity_ordered) || x.quantity_ordered <= 0 || !Number.isFinite(x.unit_cost) || x.unit_cost < 0)) {
      show('error','تحقق من تفاصيل أمر الشراء','يجب تحديد المورد والمستودع والمنتج مع كمية موجبة وتكلفة صحيحة.'); return
    }
    setSaving(true)
    const { data, error: rpcError } = await supabase.rpc('create_purchase_order', { p_organization_id: organization.id, p_supplier_id: supplierId, p_warehouse_id: warehouseId, p_items: payload, p_notes: notes.trim() || null })
    setSaving(false)
    if (rpcError) { show('error','تعذر إنشاء أمر الشراء',rpcError.message); return }
    show('success','تم إنشاء أمر الشراء',`مرجع العملية: ${String(data)}`)
    setNotes(''); setLines([{ product_id: '', quantity_ordered: '1', unit_cost: '0' }]); await load()
  }
  const updateLine = (index: number, key: keyof typeof lines[number], value: string) => setLines(current => current.map((line,i) => i === index ? { ...line, [key]: value } : line))
  const total = useMemo(() => lines.reduce((sum,line) => sum + Math.max(0,Number(line.quantity_ordered)||0) * Math.max(0,Number(line.unit_cost)||0),0),[lines])
  return <PageFrame title="المشتريات وأوامر الشراء" description="أنشئ أمر شراء للمورد، ثم استلم الكميات الفعلية لتحديث المخزون عبر عملية خادمية ذرية." icon={ShoppingBag} refresh={() => { void reloadOptions(); void load() }}>
    <Notice error={optionError || error} onRetry={() => { void reloadOptions(); void load() }}/>
    {loading ? <Empty>جارٍ تحميل الموردين والمنتجات والمستودعات…</Empty> : <FormShell title="أمر شراء جديد" description="تُراجع صلاحية المؤسسة والمورد والمنتجات داخل قاعدة البيانات قبل الحفظ." icon={Plus} onSubmit={submit} busy={saving} submitLabel="إنشاء أمر الشراء">
      <Field label="المورد"><SelectInput value={supplierId} onChange={setSupplierId}><option value="">اختر المورد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.supplier_code || s.id.slice(0,8)}</option>)}</SelectInput></Field>
      <Field label="مستودع الاستلام"><SelectInput value={warehouseId} onChange={setWarehouseId}><option value="">اختر المستودع</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name} · {w.code || ''}</option>)}</SelectInput></Field>
      <Field label="ملاحظات" className="sm:col-span-2"><textarea className="input min-h-20" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} placeholder="تفاصيل الشراء أو شروط التسليم"/></Field>
      <div className="sm:col-span-2 rounded-xl border border-neutral-200 p-3">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-bold">بنود الأمر</h3><button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={()=>setLines(x=>[...x,{product_id:'',quantity_ordered:'1',unit_cost:'0'}])}><Plus className="h-4 w-4"/>إضافة بند</button></div>
        <div className="space-y-3">{lines.map((line,index)=><div key={index} className="grid gap-2 rounded-lg bg-neutral-50 p-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
          <Field label="المنتج"><SelectInput value={line.product_id} onChange={v=>updateLine(index,'product_id',v)}><option value="">اختر المنتج</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku || p.item_code || p.id.slice(0,8)}</option>)}</SelectInput></Field>
          <Field label="الكمية"><input className="input" type="number" min="0.001" step="0.001" required value={line.quantity_ordered} onChange={e=>updateLine(index,'quantity_ordered',e.target.value)}/></Field>
          <Field label="تكلفة الوحدة"><input className="input" type="number" min="0" step="0.0001" required value={line.unit_cost} onChange={e=>updateLine(index,'unit_cost',e.target.value)}/></Field>
          <div className="flex items-end"><button type="button" disabled={lines.length===1} onClick={()=>setLines(x=>x.filter((_,i)=>i!==index))} className="btn-secondary" aria-label="حذف البند">حذف</button></div>
        </div>)}</div>
        <p className="mt-3 text-sm text-neutral-600">الإجمالي التقديري: <strong>{formatCurrency(total)}</strong></p>
      </div>
    </FormShell>}
    <section className="space-y-3"><h2 className="font-bold">سجل أوامر الشراء</h2>{loadingRows ? <Empty>جارٍ تحميل أوامر الشراء…</Empty> : rows.length===0 ? <Empty>لا توجد أوامر شراء حتى الآن.</Empty> : <div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['المرجع','المورد','المستودع','الإجمالي','الحالة','تاريخ الإنشاء'].map(x=><th className="whitespace-nowrap px-4 py-3" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono">{r.purchase_number}</td><td className="px-4 py-3">{suppliers.find(s=>s.id===r.supplier_id)?.name || r.supplier_id.slice(0,8)}</td><td className="px-4 py-3">{warehouses.find(w=>w.id===r.warehouse_id)?.name || r.warehouse_id.slice(0,8)}</td><td className="px-4 py-3">{formatCurrency(Number(r.total_amount)||0)}</td><td className="px-4 py-3">{labelStatus(r.status)}</td><td className="px-4 py-3">{formatDate(r.created_at)}</td></tr>)}</tbody></table></div>}</section>
  </PageFrame>
}

export function Receiving() {
  const { organization, warehouses, loading, error: optionError, reload: reloadOptions } = useCatalogOptions()
  const { show } = useToast()
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([])
  const [selectedOrder, setSelectedOrder] = useState('')
  const [items, setItems] = useState<PurchaseItemRow[]>([])
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [receipts, setReceipts] = useState<Record<string, unknown>[]>([])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const chosenOrder = orders.find(o=>o.id===selectedOrder)
  const load = useCallback(async () => {
    if (!organization?.id) return
    setRefreshing(true); setError('')
    try {
      const [po, gr] = await Promise.all([
        supabase.from('purchase_orders').select('id,purchase_number,status,warehouse_id,supplier_id,total_amount,created_at').eq('organization_id',organization.id).in('status',['ordered','partially_received']).order('created_at',{ascending:false}),
        supabase.from('goods_receipts').select('id,receipt_number,status,purchase_order_id,created_at').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(100),
      ])
      if(po.error) throw po.error; if(gr.error) throw gr.error
      setOrders((po.data||[]) as PurchaseOrderRow[]); setReceipts((gr.data||[]) as Record<string,unknown>[])
      if(selectedOrder && !(po.data||[]).some(x=>x.id===selectedOrder)) setSelectedOrder('')
    } catch(e) { setError(e instanceof Error?e.message:'تعذر تحميل أوامر الاستلام') }
    finally { setRefreshing(false) }
  },[organization?.id,selectedOrder])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    let alive=true
    async function getItems(){
      if(!selectedOrder){setItems([]);setSelectedItem('');return}
      const {data,error}=await supabase.from('purchase_order_items').select('id,product_id,quantity_ordered,quantity_received,unit_cost').eq('purchase_order_id',selectedOrder).order('created_at')
      if(!alive)return
      if(error){setError(error.message);setItems([]);return}
      const ready=((data||[]) as PurchaseItemRow[]).filter(i=>Number(i.quantity_received)<Number(i.quantity_ordered))
      setItems(ready);setSelectedItem(ready[0]?.id||'')
    }
    void getItems()
    return ()=>{alive=false}
  },[selectedOrder])
  const chosenItem=items.find(i=>i.id===selectedItem)
  const remaining=chosenItem ? Number(chosenItem.quantity_ordered)-Number(chosenItem.quantity_received) : 0
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!organization?.id||!chosenOrder||!chosenItem){show('error','تعذر تحديد أمر الاستلام','اختر أمراً وبنداً به كمية متبقية.');return}
    const q=Number(quantity)
    if(!Number.isFinite(q)||q<=0||q>remaining){show('error','كمية غير صحيحة',`المتاح للاستلام لهذا البند: ${remaining}`);return}
    setSaving(true)
    const {data,error}=await supabase.rpc('receive_purchase_order',{p_organization_id:organization.id,p_purchase_order_id:chosenOrder.id,p_warehouse_id:chosenOrder.warehouse_id,p_items:[{purchase_order_item_id:chosenItem.id,quantity:q}],p_notes:notes.trim()||null})
    setSaving(false)
    if(error){show('error','تعذر ترحيل الاستلام',error.message);return}
    show('success','تم تسجيل الاستلام',`مرجع سند الاستلام: ${String(data)}`)
    setQuantity('1');setNotes('');await load();setSelectedOrder('')
  }
  const refresh=()=>{void reloadOptions();void load()}
  return <PageFrame title="استلام المشتريات" description="تسجيل الكمية المستلمة فعليًا؛ تحديث المخزون وسجل الحركة يتمان داخل معاملة واحدة." icon={Truck} refresh={refresh} refreshing={refreshing}>
    <Notice error={optionError||error} onRetry={refresh}/>
    <FormShell title="سند استلام جديد" description="لا يمكن تجاوز الكمية المتبقية من أمر الشراء، ويجب أن يطابق المستودع مستودع الأمر." icon={CheckCircle2} onSubmit={submit} busy={saving||loading} submitLabel="ترحيل الاستلام">
      <Field label="أمر الشراء"><SelectInput value={selectedOrder} onChange={setSelectedOrder}><option value="">اختر أمرًا غير مكتمل</option>{orders.map(o=><option key={o.id} value={o.id}>{o.purchase_number} · {labelStatus(o.status)}</option>)}</SelectInput></Field>
      <Field label="البند"><SelectInput value={selectedItem} onChange={setSelectedItem}><option value="">اختر بندًا</option>{items.map(i=><option key={i.id} value={i.id}>{i.product_id.slice(0,8)} · متبقٍ {Number(i.quantity_ordered)-Number(i.quantity_received)}</option>)}</SelectInput></Field>
      <Field label="كمية الاستلام"><input className="input" type="number" min="0.001" max={remaining||undefined} step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></Field>
      <Field label="المستودع"><input className="input" readOnly value={warehouses.find(w=>w.id===chosenOrder?.warehouse_id)?.name||'يحدده أمر الشراء'}/></Field>
      <Field label="ملاحظات الاستلام" className="sm:col-span-2"><textarea className="input min-h-16" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="اختلافات أو ملاحظات التسليم"/></Field>
    </FormShell>
    <section className="space-y-3"><h2 className="font-bold">سجل سندات الاستلام</h2>{receipts.length===0?<Empty>لا توجد سندات استلام مسجلة.</Empty>:<div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['رقم السند','أمر الشراء','الحالة','تاريخ التسجيل'].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{receipts.map(r=><tr key={String(r.id)} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono">{String(r.receipt_number||'—')}</td><td className="px-4 py-3">{orders.find(o=>o.id===r.purchase_order_id)?.purchase_number||String(r.purchase_order_id||'—').slice(0,8)}</td><td className="px-4 py-3">{labelStatus(String(r.status||''))}</td><td className="px-4 py-3">{formatDate(String(r.created_at||''))}</td></tr>)}</tbody></table></div>}</section>
  </PageFrame>
}

export function Transfers() {
  const { organization, products, warehouses, loading, error: optionError, reload: reloadOptions } = useCatalogOptions()
  const { show } = useToast()
  const [rows,setRows]=useState<TransferRow[]>([])
  const [fromId,setFromId]=useState('')
  const [toId,setToId]=useState('')
  const [items,setItems]=useState([{product_id:'',quantity:'1'}])
  const [notes,setNotes]=useState('')
  const [saving,setSaving]=useState(false)
  const [busyId,setBusyId]=useState('')
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    if(!organization?.id){setRows([]);return}
    setError('')
    const {data,error}=await supabase.from('inventory_transfers').select('id,transfer_number,status,from_warehouse_id,to_warehouse_id,created_at').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(200)
    if(error){setError(error.message);setRows([])} else setRows((data||[]) as TransferRow[])
  },[organization?.id])
  useEffect(()=>{void load()},[load])
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!organization?.id||!fromId||!toId||fromId===toId){show('error','تحقق من المستودعات','يجب اختيار مستودعين مختلفين.');return}
    const payload=items.map(i=>({product_id:i.product_id,quantity:Number(i.quantity)}))
    if(payload.some(i=>!i.product_id||!Number.isFinite(i.quantity)||i.quantity<=0)){show('error','بنود غير صحيحة','اختر منتجًا وحدد كمية موجبة لكل بند.');return}
    setSaving(true)
    const {data,error}=await supabase.rpc('create_inventory_transfer',{p_organization_id:organization.id,p_from_warehouse_id:fromId,p_to_warehouse_id:toId,p_items:payload,p_notes:notes.trim()||null})
    setSaving(false)
    if(error){show('error','تعذر إنشاء التحويل',error.message);return}
    show('success','تم إنشاء مسودة التحويل',`مرجع التحويل: ${String(data)}؛ يجب ترحيلها بعد مراجعة الكميات.`)
    setItems([{product_id:'',quantity:'1'}]);setNotes('');await load()
  }
  const post=async(row:TransferRow)=>{
    if(!organization?.id)return
    setBusyId(row.id)
    const {data,error}=await supabase.rpc('post_inventory_transfer',{p_organization_id:organization.id,p_transfer_id:row.id})
    setBusyId('')
    if(error){show('error','تعذر ترحيل التحويل',error.message);return}
    show('success','تم ترحيل التحويل',String((data as Record<string,unknown>)?.status||'posted'));await load()
  }
  const refresh=()=>{void reloadOptions();void load()}
  return <PageFrame title="تحويلات المخزون" description="مسودة أولًا، ثم ترحيل خادمي يتحقق من الرصيد المتاح ويكتب حركتي الصرف والإضافة ذريًا." icon={ArrowLeftRight} refresh={refresh}>
    <Notice error={optionError||error} onRetry={refresh}/>
    {loading?<Empty>جارٍ تحميل المنتجات والمستودعات…</Empty>:<FormShell title="إنشاء تحويل" description="لا يغيّر إنشاء المسودة الأرصدة. الترحيل هو الذي يحدّث المستودعين معًا." icon={Plus} onSubmit={submit} busy={saving} submitLabel="إنشاء المسودة">
      <Field label="من مستودع"><SelectInput value={fromId} onChange={setFromId}><option value="">اختر المصدر</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectInput></Field>
      <Field label="إلى مستودع"><SelectInput value={toId} onChange={setToId}><option value="">اختر الوجهة</option>{warehouses.filter(w=>w.id!==fromId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectInput></Field>
      <Field label="ملاحظات" className="sm:col-span-2"><input className="input" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000}/></Field>
      <div className="sm:col-span-2 space-y-3 rounded-xl border border-neutral-200 p-3"><div className="flex items-center justify-between"><h3 className="font-bold">البنود</h3><button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={()=>setItems(x=>[...x,{product_id:'',quantity:'1'}])}><Plus className="h-4 w-4"/>إضافة بند</button></div>{items.map((item,index)=><div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]"><Field label="المنتج"><SelectInput value={item.product_id} onChange={v=>setItems(cur=>cur.map((x,i)=>i===index?{...x,product_id:v}:x))}><option value="">اختر منتجًا</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||p.item_code||p.id.slice(0,8)}</option>)}</SelectInput></Field><Field label="الكمية"><input className="input" type="number" min="0.001" step="0.001" required value={item.quantity} onChange={e=>setItems(cur=>cur.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></Field><div className="flex items-end"><button type="button" className="btn-secondary" disabled={items.length===1} onClick={()=>setItems(cur=>cur.filter((_,i)=>i!==index))}>حذف</button></div></div>)}</div>
    </FormShell>}
    <section className="space-y-3"><h2 className="font-bold">سجل التحويلات</h2>{rows.length===0?<Empty>لا توجد تحويلات مسجلة.</Empty>:<div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['المرجع','المصدر','الوجهة','الحالة','التاريخ','الإجراء'].map(x=><th key={x} className="whitespace-nowrap px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono">{r.transfer_number}</td><td className="px-4 py-3">{warehouses.find(w=>w.id===r.from_warehouse_id)?.name||r.from_warehouse_id.slice(0,8)}</td><td className="px-4 py-3">{warehouses.find(w=>w.id===r.to_warehouse_id)?.name||r.to_warehouse_id.slice(0,8)}</td><td className="px-4 py-3">{labelStatus(r.status)}</td><td className="px-4 py-3">{formatDate(r.created_at)}</td><td className="px-4 py-3">{r.status==='draft'?<button type="button" onClick={()=>void post(r)} disabled={Boolean(busyId)} className="btn-primary">{busyId===r.id?'جارٍ الترحيل…':'ترحيل ذري'}</button>:'—'}</td></tr>)}</tbody></table></div>}</section>
  </PageFrame>
}

export function StockCounts() {
  const { organization, products, warehouses, loading, error: optionError, reload: reloadOptions } = useCatalogOptions()
  const { show } = useToast()
  const [rows,setRows]=useState<StockCountRow[]>([])
  const [warehouseId,setWarehouseId]=useState('')
  const [items,setItems]=useState([{product_id:'',counted_quantity:'0'}])
  const [notes,setNotes]=useState('')
  const [saving,setSaving]=useState(false)
  const [busyId,setBusyId]=useState('')
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    if(!organization?.id){setRows([]);return}
    const {data,error}=await supabase.from('stock_counts').select('id,count_number,warehouse_id,status,created_at').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(200)
    if(error){setError(error.message);setRows([])}else{setError('');setRows((data||[]) as StockCountRow[])}
  },[organization?.id])
  useEffect(()=>{void load()},[load])
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!organization?.id||!warehouseId){show('error','مستودع غير محدد','اختر المستودع قبل بدء الجرد.');return}
    const payload=items.map(i=>({product_id:i.product_id,counted_quantity:Number(i.counted_quantity)}))
    if(payload.some(i=>!i.product_id||!Number.isFinite(i.counted_quantity)||i.counted_quantity<0)){show('error','الكمية غير صحيحة','اختر منتجًا وأدخل كمية جرد صفرًا أو أكبر.');return}
    setSaving(true)
    const {data,error}=await supabase.rpc('create_stock_count',{p_organization_id:organization.id,p_warehouse_id:warehouseId,p_items:payload,p_notes:notes.trim()||null})
    setSaving(false)
    if(error){show('error','تعذر إنشاء الجرد',error.message);return}
    show('success','تم إنشاء مسودة الجرد',`مرجع الجرد: ${String(data)}`)
    setItems([{product_id:'',counted_quantity:'0'}]);setNotes('');await load()
  }
  const post=async(row:StockCountRow)=>{
    if(!organization?.id)return
    setBusyId(row.id)
    const {data,error}=await supabase.rpc('post_stock_count',{p_organization_id:organization.id,p_stock_count_id:row.id})
    setBusyId('')
    if(error){show('error','تعذر ترحيل الجرد',error.message);return}
    show('success','تم ترحيل الجرد',String((data as Record<string,unknown>)?.status||'posted'));await load()
  }
  const refresh=()=>{void reloadOptions();void load()}
  return <PageFrame title="الجرد المخزني" description="تسجيل الكميات المعدودة ثم ترحيل الفروقات فقط، مع رفض الترحيل إذا تغيّر الرصيد منذ أخذ اللقطة." icon={ClipboardCheck} refresh={refresh}>
    <Notice error={optionError||error} onRetry={refresh}/>
    {loading?<Empty>جارٍ تحميل المنتجات والمستودعات…</Empty>:<FormShell title="مسودة جرد جديدة" description="تُحفظ لقطة الرصيد النظامي مع الكمية المعدودة. لا تتغير الأرصدة إلا عند الترحيل." icon={Plus} onSubmit={submit} busy={saving} submitLabel="إنشاء مسودة الجرد">
      <Field label="المستودع"><SelectInput value={warehouseId} onChange={setWarehouseId}><option value="">اختر المستودع</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectInput></Field>
      <Field label="ملاحظات"><input className="input" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000}/></Field>
      <div className="sm:col-span-2 space-y-3 rounded-xl border border-neutral-200 p-3"><div className="flex items-center justify-between"><h3 className="font-bold">الأصناف المعدودة</h3><button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={()=>setItems(x=>[...x,{product_id:'',counted_quantity:'0'}])}><Plus className="h-4 w-4"/>إضافة صنف</button></div>{items.map((item,index)=><div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]"><Field label="المنتج"><SelectInput value={item.product_id} onChange={v=>setItems(cur=>cur.map((x,i)=>i===index?{...x,product_id:v}:x))}><option value="">اختر منتجًا</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||p.item_code||p.id.slice(0,8)}</option>)}</SelectInput></Field><Field label="الكمية المعدودة"><input className="input" type="number" min="0" step="0.001" required value={item.counted_quantity} onChange={e=>setItems(cur=>cur.map((x,i)=>i===index?{...x,counted_quantity:e.target.value}:x))}/></Field><div className="flex items-end"><button type="button" className="btn-secondary" disabled={items.length===1} onClick={()=>setItems(cur=>cur.filter((_,i)=>i!==index))}>حذف</button></div></div>)}</div>
    </FormShell>}
    <section className="space-y-3"><h2 className="font-bold">سجل الجرد</h2>{rows.length===0?<Empty>لا توجد عمليات جرد.</Empty>:<div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['المرجع','المستودع','الحالة','تاريخ الإنشاء','الإجراء'].map(x=><th key={x} className="whitespace-nowrap px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono">{r.count_number}</td><td className="px-4 py-3">{warehouses.find(w=>w.id===r.warehouse_id)?.name||r.warehouse_id.slice(0,8)}</td><td className="px-4 py-3">{labelStatus(r.status)}</td><td className="px-4 py-3">{formatDate(r.created_at)}</td><td className="px-4 py-3">{r.status==='draft'?<button type="button" onClick={()=>void post(r)} disabled={Boolean(busyId)} className="btn-primary">{busyId===r.id?'جارٍ الترحيل…':'ترحيل الجرد'}</button>:'—'}</td></tr>)}</tbody></table></div>}</section>
  </PageFrame>
}

export function Expenses() {
  const { organization } = useAuth()
  const { show } = useToast()
  const [rows,setRows]=useState<ExpenseRow[]>([])
  const [category,setCategory]=useState('')
  const [description,setDescription]=useState('')
  const [amount,setAmount]=useState('')
  const [currency,setCurrency]=useState('USD')
  const [date,setDate]=useState(new Date().toISOString().slice(0,10))
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    if(!organization?.id){setRows([]);return}
    const {data,error}=await supabase.from('expenses').select('id,expense_number,category,description,amount,currency,expense_date,status').eq('organization_id',organization.id).order('expense_date',{ascending:false}).limit(500)
    if(error){setError(error.message);setRows([])}else{setError('');setRows((data||[]) as ExpenseRow[])}
  },[organization?.id])
  useEffect(()=>{void load()},[load])
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    const numericAmount=Number(amount)
    if(!organization?.id||!category.trim()||!description.trim()||!Number.isFinite(numericAmount)||numericAmount<=0){show('error','بيانات المصروف غير مكتملة','أدخل تصنيفًا ووصفًا ومبلغًا موجبًا.');return}
    setSaving(true)
    const {data,error}=await supabase.rpc('record_expense',{p_organization_id:organization.id,p_category:category.trim(),p_description:description.trim(),p_amount:numericAmount,p_currency:currency,p_expense_date:date})
    setSaving(false)
    if(error){show('error','تعذر تسجيل المصروف',error.message);return}
    show('success','تم تسجيل المصروف',`مرجع العملية: ${String(data)}`)
    setCategory('');setDescription('');setAmount('');await load()
  }
  return <PageFrame title="المصروفات" description="تسجيل المصروفات داخل المؤسسة مع صلاحيات الخادم وسجل تدقيق." icon={ReceiptText} refresh={()=>void load()}>
    <Notice error={error} onRetry={()=>void load()}/>
    <FormShell title="تسجيل مصروف" description="ينفّذ التسجيل عبر RPC بعد التحقق من عضوية المؤسسة ودور المستخدم." icon={Plus} onSubmit={submit} busy={saving} submitLabel="تسجيل المصروف">
      <Field label="التصنيف"><input className="input" value={category} onChange={e=>setCategory(e.target.value)} required maxLength={80} placeholder="نقل، تشغيل، خدمات…"/></Field>
      <Field label="التاريخ"><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} required/></Field>
      <Field label="وصف المصروف" className="sm:col-span-2"><input className="input" value={description} onChange={e=>setDescription(e.target.value)} required maxLength={500}/></Field>
      <Field label="المبلغ"><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
      <Field label="العملة"><SelectInput value={currency} onChange={setCurrency}><option value="USD">USD</option><option value="SAR">SAR</option><option value="YER">YER</option><option value="AED">AED</option></SelectInput></Field>
    </FormShell>
    <section className="space-y-3"><h2 className="font-bold">سجل المصروفات</h2>{rows.length===0?<Empty>لا توجد مصروفات مسجلة.</Empty>:<div className="card overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-neutral-50"><tr>{['المرجع','التاريخ','التصنيف','الوصف','المبلغ','الحالة'].map(x=><th key={x} className="whitespace-nowrap px-4 py-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-neutral-100"><td className="px-4 py-3 font-mono">{r.expense_number}</td><td className="px-4 py-3">{r.expense_date}</td><td className="px-4 py-3">{r.category}</td><td className="px-4 py-3">{r.description}</td><td className="px-4 py-3">{formatCurrency(Number(r.amount)||0)} {r.currency}</td><td className="px-4 py-3">{labelStatus(r.status)}</td></tr>)}</tbody></table></div>}</section>
  </PageFrame>
}
