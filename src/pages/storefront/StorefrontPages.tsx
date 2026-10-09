import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Bell, Building2, CheckCircle2, ChevronLeft, Copy, FileText, GitCompare, Heart, HelpCircle, Layers, MapPin, Package, Plus, Search, Settings, ShoppingCart, Trash2, User, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { EmptyState, ErrorState, LoadingOverlay } from '@/components/ui/Loader'
import { ProductCard } from '@/components/storefront/ProductCard'
import { StatusBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, formatCustomerAmount } from '@/lib/utils'
import type { Address, CartItem, Invoice, Notification, Order, Product, Statement } from '@/types'
import { createOrderFromCart, generateIdempotencyKey } from '@/lib/orders'
import { useCommercePolicies } from '@/lib/useCommercePolicies'
import { CUSTOMER_PRODUCT_SELECT } from '@/lib/customerProductSelect'

function PageHeader({ title, description, icon: Icon = Package }: { title: string; description?: string; icon?: typeof Package }) {
  return <div className="mb-6 flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon className="h-5 w-5" /></div><div><h1 className="text-2xl font-bold text-neutral-900">{title}</h1>{description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}</div></div>
}

function PageError({ message }: { message: string }) { return <div className="card p-8 text-center text-error-700 bg-error-50 border-error-200"><AlertCircle className="mx-auto mb-2 h-8 w-8" /><p>{message}</p></div> }

export function SearchPage() {
  const { organization } = useAuth()
  const [params] = useSearchParams()
  const query = params.get('q') || ''
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      if (!organization?.id) {
        setProducts([])
        setLoading(false)
        setError('سجّل الدخول بحساب مؤسستك لعرض الكتالوج.')
        return
      }
      let request = supabase.from('products')
        .select(CUSTOMER_PRODUCT_SELECT)
        .eq('organization_id', organization.id)
        .eq('is_active', true)
      if (query) request = request.or(`name.ilike.%${query}%,name_ar.ilike.%${query}%,sku.ilike.%${query}%`)
      const { data, error: queryError } = await request.order('created_at', { ascending: false }).limit(48)
      if (!active) return
      if (queryError) {
        setProducts([])
        setError('تعذر تحميل نتائج البحث. حاول مرة أخرى.')
      } else setProducts((data || []) as unknown as Product[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [query, organization?.id])

  return <div className="max-w-7xl mx-auto px-4 py-6">
    <PageHeader title="نتائج البحث" description={query ? `نتائج البحث عن: ${query}` : 'ابحث عن المنتجات بالاسم أو الرمز'} icon={Search} />
    {loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : products.length
      ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
      : <EmptyState icon={<Search />} title="لا توجد نتائج" description="جرّب كلمة بحث مختلفة أو تصفح الكتالوج." />}
  </div>
}

export function Cart() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate(); const [items, setItems] = useState<CartItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = async () => { if (!user) return; setLoading(true); const { data, error: dbError } = await supabase.from('cart_items').select('id,user_id,product_id,variant_id,quantity,unit_type,created_at,product:products(id,name,name_ar,sku,image_url,unit)').eq('user_id', user.id).order('created_at'); if (dbError) setError(dbError.message); else setItems((data || []) as unknown as CartItem[]); setLoading(false) }
  useEffect(() => { load() }, [user])
  const itemCount = items.length
  const updateQuantity = async (item: CartItem, quantity: number) => { if (quantity <= 0) { await supabase.from('cart_items').delete().eq('id', item.id) } else { await supabase.from('cart_items').update({ quantity }).eq('id', item.id) }; await load() }
  if (loading) return <LoadingOverlay message="جاري تحميل السلة..." />
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="سلة المشتريات" description="راجع المنتجات والكميات قبل إتمام الطلب" icon={ShoppingCart} />{error ? <PageError message={error} /> : !items.length ? <EmptyState icon={<ShoppingCart />} title="السلة فارغة" description="أضف منتجات من المتجر للبدء." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /> : <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-3">{items.map(item => <div key={item.id} className="card p-4 flex items-center gap-4"><div className="h-20 w-20 bg-neutral-100 rounded-lg flex items-center justify-center shrink-0">{item.product?.image_url ? <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="text-neutral-300" />}</div><div className="flex-1 min-w-0"><Link to={`/product/${item.product_id}`} className="font-semibold text-neutral-900 hover:text-primary-600 line-clamp-2">{item.product?.name_ar || item.product?.name || 'منتج'}</Link><p className="text-sm text-neutral-500 mt-1">{item.product?.sku}</p></div><div className="flex items-center gap-2"><button onClick={() => updateQuantity(item, item.quantity - 1)} className="btn-secondary btn-icon">−</button><span className="w-8 text-center font-semibold">{item.quantity}</span><button onClick={() => updateQuantity(item, item.quantity + 1)} className="btn-secondary btn-icon">+</button></div><button onClick={() => updateQuantity(item, 0)} className="text-error-500 hover:text-error-700" aria-label="حذف"><Trash2 className="h-4 w-4" /></button></div>)}</div><aside className="card p-5 h-fit sticky top-20"><h2 className="font-bold text-lg mb-4">ملخص الطلب</h2><div className="flex justify-between text-sm mb-3"><span className="text-neutral-500">عدد الأصناف</span><span>{itemCount}</span></div><p className="text-sm text-neutral-500 mt-3">{formatCustomerAmount()}</p><button onClick={() => { if (!items.length) { show('warning', 'السلة فارغة'); return }; navigate('/checkout') }} className="btn-primary w-full mt-5">إتمام الطلب <ArrowLeft className="h-4 w-4" /></button></aside></div>}</div>
}

export function Checkout() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate(); const [items, setItems] = useState<CartItem[]>([]); const [address, setAddress] = useState(''); const [notes, setNotes] = useState(''); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (user) supabase.from('cart_items').select('id,user_id,product_id,variant_id,quantity,unit_type,created_at,product:products(id,name,name_ar,sku,image_url,unit)').eq('user_id', user.id).then(({ data }) => setItems(data as unknown as CartItem[] || [])) }, [user])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!items.length) { setError('السلة فارغة'); return }; setSubmitting(true); setError(''); const { orderId, error: orderError } = await createOrderFromCart({ shippingAddress: { address }, billingAddress: { address }, notes, idempotencyKey: generateIdempotencyKey() }); if (orderError || !orderId) { setError(orderError || 'تعذر إنشاء الطلب'); setSubmitting(false); return }; setSubmitting(false); show('success', 'تم إرسال الطلب للمراجعة'); navigate(`/order-success/${orderId}`) }
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="إتمام الطلب" description="أدخل معلومات التوصيل وأرسل الطلب للمراجعة" icon={ShoppingCart} />{!items.length ? <EmptyState title="لا توجد منتجات للطلب" action={<Link to="/store" className="btn-primary">العودة للمتجر</Link>} /> : <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 card p-6 space-y-4"><div><label className="label">عنوان التوصيل</label><textarea required value={address} onChange={event => setAddress(event.target.value)} className="input min-h-24" placeholder="المدينة، الحي، الشارع، وأي تفاصيل مساعدة" /></div><div><label className="label">ملاحظات الطلب</label><textarea value={notes} onChange={event => setNotes(event.target.value)} className="input min-h-24" placeholder="ملاحظات اختيارية" /></div>{error && <PageError message={error} />}<button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال الطلب'}</button></div><aside className="card p-5 h-fit"><h2 className="font-bold mb-4">ملخص الطلب</h2>{items.map(item => <div key={item.id} className="flex justify-between gap-3 text-sm py-2 border-b border-neutral-100"><span className="truncate">{item.product?.name_ar || item.product?.name}</span><span>{item.quantity}</span></div>)}<p className="text-sm text-neutral-500 pt-4">{formatCustomerAmount()}</p></aside></form>}</div>
}

export function OrderSuccess() { const { id } = useParams(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-16 w-16 text-success-500 mx-auto mb-4" /><h1 className="text-2xl font-bold text-neutral-900">تم استلام طلبك</h1><p className="text-neutral-500 mt-2">سيتم مراجعة الطلب والتواصل معك عند تحديث حالته.</p><div className="flex gap-3 justify-center mt-8"><Link to={`/orders/${id}`} className="btn-primary">عرض الطلب</Link><Link to="/store" className="btn-secondary">متابعة التسوق</Link></div></div></div> }

export function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!user) { setOrders([]); setLoading(false); return }
    supabase.from('customer_order_summaries')
      .select('id,organization_id,user_id,order_number,status,payment_status,total_items,notes,customer_adjustment_note,created_at,updated_at')
      .eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error: dbError }) => {
        if (!active) return
        if (dbError) setError(dbError.message)
        else setOrders((data || []) as unknown as Order[])
        setLoading(false)
      })
    return () => { active = false }
  }, [user?.id])
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="طلباتي" description="متابعة الطلبات دون كشف الأسعار أو الإجماليات" icon={Package} />{loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : !orders.length ? <EmptyState icon={<Package />} title="لا توجد طلبات بعد" action={<Link to="/store" className="btn-primary">ابدأ التسوق</Link>} /> : <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50 text-neutral-500"><tr><th className="p-4">رقم الطلب</th><th className="p-4">التاريخ</th><th className="p-4">عدد الأصناف</th><th className="p-4">الحالة</th><th className="p-4" /></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t border-neutral-100 hover:bg-neutral-50"><td className="p-4 font-semibold">{order.order_number}</td><td className="p-4 text-neutral-500">{formatDate(order.created_at)}</td><td className="p-4">{order.total_items ?? '—'}</td><td className="p-4"><StatusBadge status={order.status} /></td><td className="p-4"><Link to={`/orders/${order.id}`} className="text-primary-600 hover:underline">التفاصيل</Link></td></tr>)}</tbody></table></div></div>}</div>
}

export function OrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { policies } = useCommercePolicies()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentErrorMessage, setPaymentErrorMessage] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [paymentSubmitted, setPaymentSubmitted] = useState(false)

  useEffect(() => {
    if (!id || !user) { setLoading(false); return }
    let mounted = true
    const load = async () => {
      const { data, error: dbError } = await supabase.from('customer_order_summaries')
        .select('id,organization_id,user_id,order_number,status,payment_status,total_items,notes,customer_adjustment_note,created_at,updated_at')
        .eq('id', id).eq('user_id', user.id).maybeSingle()
      if (!mounted) return
      if (dbError) { setError(dbError.message); setLoading(false); return }
      if (!data) { setOrder(null); setLoading(false); return }
      const { data: itemRows, error: itemsError } = await supabase.from('customer_order_item_summaries')
        .select('id,order_id,organization_id,product_id,product_name,item_code,unit_snapshot,quantity,approved_quantity')
        .eq('order_id', id)
      if (!mounted) return
      if (itemsError) { setError(itemsError.message); setLoading(false); return }
      const safeItems = (itemRows || []).map(item => ({
        id: item.id, order_id: item.order_id, product_id: item.product_id,
        name: item.product_name, product_name_snapshot: item.product_name,
        sku: item.item_code, item_code: item.item_code, unit_snapshot: item.unit_snapshot,
        unit_type: item.unit_snapshot, quantity: item.quantity, approved_quantity: item.approved_quantity,
      }))
      setOrder({ ...data, items: safeItems } as unknown as Order)
      setLoading(false)
    }
    void load()
    // Poll only the customer-safe view; raw realtime order rows include financial columns.
    const pollId = window.setInterval(() => { void load() }, 15000)
    return () => {
      mounted = false
      window.clearInterval(pollId)
    }
  }, [id, user?.id])

  const submitPayment = async () => {
    if (!id || !paymentAmount.trim()) { setPaymentErrorMessage('أدخل المبلغ الذي أرسلته'); return }
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setPaymentErrorMessage('أدخل مبلغاً صحيحاً أكبر من صفر.'); return }
    setSubmittingPayment(true)
    setPaymentErrorMessage('')
    const { data, error: paymentError } = await supabase.rpc('submit_order_payment', {
      p_order_id: id,
      p_amount: amount,
      p_method: paymentMethod,
      p_reference: paymentReference.trim() || null,
      p_notes: paymentNotes.trim() || null,
    })
    setSubmittingPayment(false)
    if (paymentError) {
      const friendly = paymentError.message.includes('order_not_approved_for_payment')
        ? 'لا يمكن تسجيل الدفع قبل اعتماد الطلب من الإدارة.'
        : paymentError.message.includes('order_not_owned') ? 'لا تملك صلاحية تسجيل دفع لهذا الطلب.'
        : paymentError.message.includes('proforma_invoice_not_available') ? 'لا توجد فاتورة أولية متاحة لهذا الطلب.'
        : paymentError.message
      setPaymentErrorMessage(friendly)
      return
    }
    setPaymentSubmitted(true)
    setPaymentAmount('')
    setPaymentReference('')
    setPaymentNotes('')
  }

  if (loading) return <LoadingOverlay />
  if (error) return <ErrorState title="تعذر تحميل الطلب" description={error} onRetry={() => window.location.reload()} />
  if (!order) return <ErrorState title="الطلب غير موجود" />

  const itemCount = order.items?.length || 0
  const showTotal = false
  const STEPS: { key: string; label: string }[] = [
    { key: 'pending', label: 'تم استلام الطلب' },
    { key: 'review', label: 'قيد المراجعة' },
    { key: 'approved', label: 'تم الاعتماد' },
    { key: 'processing', label: 'قيد التجهيز' },
    { key: 'dispatched', label: 'تم الشحن' },
    { key: 'delivered', label: 'تم التوصيل' },
  ]
  const currentIdx = STEPS.findIndex(step => step.key === order.status)
  const isCancelled = order.status === 'cancelled' || order.status === 'rejected'

  return <div className="max-w-4xl mx-auto px-4 py-6">
    <PageHeader title={`الطلب ${order.order_number}`} description={`أُنشئ في ${formatDate(order.created_at)}`} icon={Package} />
    {order.customer_adjustment_note && <div className="card p-4 mb-4 border-warning-200 bg-warning-50"><p className="text-sm font-bold text-warning-800">{order.customer_adjustment_note}</p></div>}
    {order.status === 'review' && <div className="card p-4 mb-4 border-warning-200 bg-warning-50 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-warning-600 shrink-0" /><p className="text-sm font-bold text-warning-800">تم إرجاع الطلب للتعديل. يرجى مراجعة الطلب أو التواصل مع الإدارة.</p></div>}
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        {STEPS.map((step, idx) => <div key={step.key} className="flex-1 flex flex-col items-center"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isCancelled ? 'bg-error-100 text-error-600' : idx <= currentIdx ? 'bg-success-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>{idx <= currentIdx && !isCancelled ? '✓' : idx + 1}</div><p className={`text-xs mt-2 text-center ${idx <= currentIdx && !isCancelled ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{step.label}</p></div>)}
      </div>
      {isCancelled && <p className="text-center text-error-600 font-semibold mt-3">تم إلغاء هذا الطلب</p>}
    </div>
    <div className="card p-6">
      <div className="mb-6 flex flex-wrap justify-between gap-4"><div><p className="text-sm text-neutral-500">الحالة</p><StatusBadge status={order.status} /></div><div><p className="text-sm text-neutral-500">حالة الدفع</p><StatusBadge status={order.payment_status} /></div></div>
      <h3 className="font-bold mb-3">الأصناف ({itemCount})</h3>
      {order.items?.map(item => <div key={item.id} className="flex justify-between gap-3 py-2 border-b border-neutral-100 text-sm"><span className="min-w-0">{item.product_name_snapshot || item.name}</span><span className="shrink-0 text-neutral-600">× {item.approved_quantity ?? item.quantity}</span></div>)}
      {showTotal ? <div className="flex justify-between font-bold pt-4 mt-2"><span>الإجمالي</span><span className="text-primary-700">{formatCurrency(order.total)}</span></div> : <p className="text-sm text-neutral-500 pt-4 mt-2">يُحدد المبلغ بعد مراجعة واعتماد الطلب.</p>}
      <p className="text-sm text-neutral-600 mt-4">{order.notes || 'لا توجد ملاحظات على الطلب.'}</p>
      {policies.payment_request_after_approval && order.status === 'approved' && <div className="mt-5 rounded-xl border border-primary-200 bg-primary-50 p-4">
        <p className="font-bold text-primary-900">تم اعتماد طلبك من الإدارة.</p>
        <p className="mt-1 text-sm leading-6 text-primary-800">يرجى إرسال المبلغ المتفق عليه، ثم تسجيل مرجع التحويل أدناه. لا تُعرض الأسعار أو الإجماليات الرقمية في هذه الشاشة. ستبقى الفاتورة أولية حتى تتحقق الإدارة من الدفعات.</p>
        {paymentSubmitted && <p role="status" className="mt-3 rounded-lg border border-success-200 bg-success-50 p-3 text-sm font-semibold text-success-800">تم تسجيل طلب تأكيد الدفع. حالة الدفعة: قيد المراجعة.</p>}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">المبلغ الذي أرسلته</label><input className="input" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="أدخل المبلغ" /></div>
          <div><label className="label">طريقة الدفع</label><select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="transfer">تحويل بنكي</option><option value="cash">نقداً</option><option value="check">شيك</option><option value="card">بطاقة</option><option value="wallet">محفظة</option></select></div>
          <div className="sm:col-span-2"><label className="label">رقم المرجع / رقم التحويل (اختياري)</label><input className="input" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} maxLength={300} placeholder="رقم العملية أو مرجع الحوالة" /></div>
          <div className="sm:col-span-2"><label className="label">ملاحظة (اختياري)</label><textarea className="input min-h-20" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} maxLength={2000} placeholder="تفاصيل إضافية تساعد الإدارة في التحقق" /></div>
        </div>
        {paymentErrorMessage && <p role="alert" className="mt-3 text-sm font-medium text-error-700">{paymentErrorMessage}</p>}
        <button type="button" disabled={submittingPayment || !paymentAmount.trim()} onClick={() => void submitPayment()} className="btn-primary mt-4">{submittingPayment ? 'جارٍ تسجيل الدفعة…' : 'إرسال بيانات الدفع للمراجعة'}</button>
      </div>}
    </div>
  </div>
}

export function Wishlist() {
  const { user, organization } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!user || !organization?.id) {
        setProducts([])
        setLoading(false)
        return
      }
      setLoading(true)
      const safeProductFields = 'id,organization_id,category_id,brand_id,sku,name,name_ar,slug,description,unit,box_quantity,carton_quantity,min_order_qty,stock_quantity,reserved_stock,weight,barcode,image_url,is_active,is_featured,is_new,tags,created_at,updated_at,category:categories(id,name,slug),brand:brands(id,name,slug,logo_url)'
      const { data, error: queryError } = await supabase.from('wishlist_items')
        .select(`product:products(${safeProductFields})`)
        .eq('user_id', user.id)
        .eq('product.organization_id', organization.id)
      if (!active) return
      if (queryError) { setError(queryError.message); setProducts([]) }
      else setProducts((data || []).map(item => (item as any).product).filter(Boolean) as Product[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [user?.id, organization?.id])

  return <div className="max-w-7xl mx-auto px-4 py-6">
    <PageHeader title="المفضلة" description="المنتجات التي حفظتها للرجوع إليها" icon={Heart} />
    {loading ? <LoadingOverlay /> : error ? <PageError message="تعذر تحميل المفضلة." /> : products.length
      ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
      : <EmptyState icon={<Heart />} title="لا توجد منتجات محفوظة" description="اضغط على القلب في أي منتج لإضافته للمفضلة." />}
  </div>
}
export function Addresses() { const { organization } = useAuth(); const [rows, setRows] = useState<Address[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { if (organization) supabase.from('addresses').select('*').eq('organization_id', organization.id).then(({ data }) => { setRows(data as Address[] || []); setLoading(false) }) }, [organization]); return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="عناوين التوصيل" description="إدارة عناوين شركتك" icon={MapPin} /><Link to="/addresses/new" className="btn-primary mb-5 inline-flex"><Plus className="h-4 w-4" /> إضافة عنوان</Link>{loading ? <LoadingOverlay /> : rows.length ? <div className="grid gap-3">{rows.map(row => <div className="card p-5" key={row.id}><div className="flex justify-between"><h3 className="font-semibold">{row.label}</h3>{row.is_default && <span className="badge-success">افتراضي</span>}</div><p className="text-sm text-neutral-600 mt-2">{row.line1}، {row.city}، {row.country}</p></div>)}</div> : <EmptyState icon={<MapPin />} title="لا توجد عناوين" description="أضف عنواناً لاستخدامه عند إتمام الطلب." />}</div> }
export function AccountSettings() { const { signOut } = useAuth(); const { show } = useToast(); const [saving, setSaving] = useState(false); const [name, setName] = useState(''); const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); const { error } = await supabase.auth.updateUser({ data: { full_name: name } }); setSaving(false); show(error ? 'error' : 'success', error ? 'تعذر الحفظ' : 'تم حفظ الإعدادات', error?.message) }; return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="إعدادات الحساب" description="تحكم في بيانات الحساب وتفضيلاته" icon={Settings} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">الاسم الظاهر</label><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="الاسم الكامل" /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</button></form><button onClick={() => signOut()} className="btn-danger mt-5">تسجيل الخروج</button></div> }
export function Notifications() { const { user } = useAuth(); const [rows, setRows] = useState<Notification[]>([]); useEffect(() => { if (user) supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => setRows(data as Notification[] || [])) }, [user]); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الإشعارات" description="آخر التحديثات المتعلقة بحسابك وطلباتك" icon={Bell} />{rows.length ? <div className="card divide-y divide-neutral-100">{rows.map(row => <div key={row.id} className="p-4"><div className="flex justify-between"><h3 className="font-semibold">{row.title}</h3><span className="text-xs text-neutral-400">{formatDate(row.created_at)}</span></div><p className="text-sm text-neutral-500 mt-1">{row.body}</p></div>)}</div> : <EmptyState icon={<Bell />} title="لا توجد إشعارات" />}</div> }
export function Help() { const faqs = ['كيف أضيف منتجاً للسلة؟', 'كيف أتابع حالة طلبي؟', 'كيف أطلب كشف حساب؟', 'كيف أغير بيانات الشركة؟']; return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مركز المساعدة" description="إجابات سريعة وطرق التواصل مع فريق الأغبري" icon={HelpCircle} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">{faqs.map(question => <div className="card p-5" key={question}><h3 className="font-semibold">{question}</h3><p className="text-sm text-neutral-500 mt-2">يمكنك تنفيذ ذلك من حسابك بعد تسجيل الدخول، وإذا احتجت مساعدة تواصل معنا.</p></div>)}</div><div className="card p-6"><h2 className="font-bold mb-2">تواصل معنا</h2><p className="text-sm text-neutral-500">أرسل استفسارك إلى فريق الدعم وسنعود إليك بأقرب وقت.</p><a href="mailto:support@aghbari.com" className="btn-primary inline-flex mt-4">إرسال بريد للدعم</a></div></div> }
export function OnboardingCompany() { const { organization, refreshOrganization } = useAuth(); const { show } = useToast(); const [name, setName] = useState(organization?.name || ''); const [saving, setSaving] = useState(false); const save = async (event: FormEvent) => { event.preventDefault(); if (!organization) return; setSaving(true); const { error } = await supabase.from('organizations').update({ name }).eq('id', organization.id); setSaving(false); if (error) show('error', 'تعذر الحفظ', error.message); else { await refreshOrganization(); show('success', 'تم تحديث بيانات الشركة') } }; return <div className="max-w-xl mx-auto px-4 py-10"><PageHeader title="استكمال بيانات الشركة" description="أكمل بيانات المؤسسة لمتابعة استخدام المنصة" icon={Building2} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم الشركة</label><input required className="input" value={name} onChange={event => setName(event.target.value)} /></div><button disabled={saving} className="btn-primary w-full">{saving ? 'جاري الحفظ...' : 'حفظ ومتابعة'}</button></form></div> }
export function AccountPending() { const { organization } = useAuth(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold">الحساب قيد المراجعة</h1><p className="text-neutral-500 mt-3">تم استلام طلب {organization?.name || 'شركتك'}، وسيتم إشعارك بعد اعتماد الحساب.</p><Link to="/" className="btn-secondary mt-6 inline-flex">العودة للرئيسية</Link></div></div> }

export function VerifyAccount() { const { user } = useAuth(); const { show } = useToast(); const [sending, setSending] = useState(false); const resend = async () => { if (!user?.email) return; setSending(true); const { error } = await supabase.auth.resend({ type: 'signup', email: user.email }); setSending(false); show(error ? 'error' : 'success', error ? 'تعذر إرسال الرسالة' : 'تم إرسال رسالة التفعيل', error?.message) }; return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><CheckCircle2 className="h-14 w-14 text-primary-600 mx-auto mb-4" /><h1 className="text-2xl font-bold">تفعيل الحساب</h1><p className="text-neutral-500 mt-3">تحقق من بريدك الإلكتروني لتفعيل الحساب. لا نعتبر الحساب مفعلاً قبل تأكيد البريد من الخدمة.</p><button className="btn-primary mt-6" disabled={sending || !user?.email} onClick={resend}>{sending ? 'جاري الإرسال...' : 'إعادة إرسال رسالة التفعيل'}</button></div></div> }

export function ProfileOnboarding() { const { user } = useAuth(); const { show } = useToast(); const [name, setName] = useState(String(user?.user_metadata?.full_name || '')); const [saving, setSaving] = useState(false); const save = async (event: FormEvent) => { event.preventDefault(); setSaving(true); const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } }); setSaving(false); show(error ? 'error' : 'success', error ? 'تعذر حفظ الملف' : 'تم حفظ الملف الشخصي', error?.message) }; return <div className="max-w-xl mx-auto px-4 py-10"><PageHeader title="استكمال بيانات العميل" description="أكمل اسمك ليظهر بشكل صحيح في الطلبات والمراسلات" icon={User} /><form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">الاسم الكامل</label><input required className="input" value={name} onChange={event => setName(event.target.value)} /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ الملف'}</button></form></div> }

export function InvitePage() { const { token } = useParams(); return <div className="max-w-xl mx-auto px-4 py-16 text-center"><div className="card p-10"><AlertCircle className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold">دعوة العميل</h1><p className="text-neutral-500 mt-3">لا يمكن قبول الدعوة {token ? `(${token.slice(0, 8)}...)` : ''} قبل توفير خدمة الدعوات على الخادم. لم يتم تسجيل أي قبول وهمي.</p><Link to="/register" className="btn-secondary mt-6 inline-flex">إنشاء حساب جديد</Link></div></div> }

export function FeatureStatus({ title, description }: { title: string; description: string }) { return <div className="max-w-2xl mx-auto px-4 py-16 text-center"><div className="card p-10"><AlertCircle className="h-14 w-14 text-warning-500 mx-auto mb-4" /><h1 className="text-2xl font-bold text-neutral-900">{title}</h1><p className="text-neutral-500 mt-3">{description}</p><Link to="/help" className="btn-secondary mt-6 inline-flex">الانتقال إلى المساعدة</Link></div></div> }

export function ProductsPage() { return <FeatureStatus title="كل المنتجات" description="هذه الصفحة تعرض نفس محتوى المتجر. استخدم صفحة المتجر للتصفح والتصفية الكاملة." /> }

export function CategoriesPage() {
  const [categories, setCategories] = useState<import('@/types').Category[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => { setCategories(data as any || []); setLoading(false) }) }, [])
  return <div className="max-w-7xl mx-auto px-4 py-6"><PageHeader title="التصنيفات" description="تصفح المنتجات حسب التخصص" icon={Layers} />{loading ? <LoadingOverlay /> : categories.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{categories.map(cat => <Link key={cat.id} to={`/category/${cat.slug}`} className="card p-6 text-center hover:shadow-card-hover transition-all hover:-translate-y-1"><Layers className="h-8 w-8 text-primary-500 mx-auto mb-3" /><h3 className="font-semibold text-neutral-900">{cat.name}</h3></Link>)}</div> : <EmptyState icon={<Layers />} title="لا توجد تصنيفات" description="لم يتم إضافة تصنيفات بعد." />}</div>
}

export function AdvancedSearch() {
  const { organization } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ q: '', categoryId: '', brandId: '', inStock: false })
  const [categories, setCategories] = useState<import('@/types').Category[]>([])
  const [brands, setBrands] = useState<import('@/types').Brand[]>([])

  useEffect(() => {
    if (!organization?.id) { setCategories([]); setBrands([]); return }
    supabase.from('categories').select('id,name,slug,parent_id,icon,sort_order,is_active,created_at')
      .eq('organization_id', organization.id).eq('is_active', true).order('sort_order')
      .then(({ data }) => setCategories(data as import('@/types').Category[] || []))
    supabase.from('brands').select('id,name,slug,logo_url,description,is_active,created_at')
      .eq('is_active', true)
      .then(({ data }) => setBrands(data as import('@/types').Brand[] || []))
  }, [organization?.id])

  const search = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setSearched(true)
    setError('')
    if (!organization?.id) {
      setProducts([])
      setError('سجّل الدخول بحساب مؤسستك للبحث في الكتالوج.')
      setLoading(false)
      return
    }
    let request = supabase.from('products')
      .select(CUSTOMER_PRODUCT_SELECT)
      .eq('organization_id', organization.id)
      .eq('is_active', true)
    if (form.q) request = request.or(`name.ilike.%${form.q}%,name_ar.ilike.%${form.q}%,sku.ilike.%${form.q}%`)
    if (form.categoryId) request = request.eq('category_id', form.categoryId)
    if (form.brandId) request = request.eq('brand_id', form.brandId)
    if (form.inStock) request = request.gt('stock_quantity', 0)
    const { data, error: queryError } = await request.order('created_at', { ascending: false }).limit(48)
    if (queryError) { setProducts([]); setError('تعذر تنفيذ البحث. حاول مرة أخرى.') }
    else setProducts((data || []) as unknown as Product[])
    setLoading(false)
  }

  return <div className="max-w-7xl mx-auto px-4 py-6">
    <PageHeader title="البحث المتقدم" description="ابحث بالاسم والتصنيف والعلامة التجارية والتوفر" icon={Search} />
    <form onSubmit={search} className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <div className="lg:col-span-3"><label className="label">كلمة البحث</label><input className="input" value={form.q} onChange={event => setForm(current => ({ ...current, q: event.target.value }))} placeholder="اسم المنتج أو SKU" /></div>
      <div><label className="label">التصنيف</label><select className="input" value={form.categoryId} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))}><option value="">الكل</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div><label className="label">العلامة التجارية</label><select className="input" value={form.brandId} onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))}><option value="">الكل</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>
      <div><label className="label">التوفر</label><label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={form.inStock} onChange={event => setForm(current => ({ ...current, inStock: event.target.checked }))} className="rounded border-neutral-300" /> متوفر فقط</label></div>
      <div className="lg:col-span-3"><p className="mb-3 text-xs leading-5 text-neutral-500">لا تتضمن نتائج البحث أسعاراً أو نطاق سعر. تظهر الأسعار فقط في المسارات الإدارية المصرح بها.</p><button type="submit" className="btn-primary" disabled={loading}>{loading ? 'جاري البحث...' : 'بحث'}</button></div>
    </form>
    {searched && (loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : products.length
      ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
      : <EmptyState icon={<Search />} title="لا توجد نتائج" description="جرّب معايير بحث مختلفة." />)}
  </div>
}

export function ComparePage() {
  const { organization } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]') as string[]
    if (!ids.length || !organization?.id) { setLoading(false); setProducts([]); return }
    supabase.from('products').select(CUSTOMER_PRODUCT_SELECT)
      .eq('organization_id', organization.id).in('id', ids)
      .then(({ data, error }) => { setProducts(error ? [] : (data || []) as unknown as Product[]); setLoading(false) })
  }, [organization?.id])
  const removeItem = (id: string) => {
    const ids = JSON.parse(localStorage.getItem('compare_ids') || '[]') as string[]
    localStorage.setItem('compare_ids', JSON.stringify(ids.filter(x => x !== id)))
    setProducts(prev => prev.filter(p => p.id !== id))
  }
  const clearAll = () => { localStorage.removeItem('compare_ids'); setProducts([]) }
  if (loading) return <LoadingOverlay />
  if (!products.length) return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المقارنة" description="قارن بين المنتجات جنباً إلى جنب" icon={GitCompare} /><EmptyState icon={<GitCompare />} title="لا توجد منتجات للمقارنة" description="أضف منتجات للمقارنة من صفحة المنتج." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /></div>
  return <div className="max-w-7xl mx-auto px-4 py-6"><div className="flex items-center justify-between mb-4"><PageHeader title="المقارنة" description="قارن بين المنتجات" icon={GitCompare} /><button onClick={clearAll} className="btn-secondary btn-sm">مسح الكل</button></div>
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4 text-neutral-500">الخاصية</th>{products.map(p => <th key={p.id} className="p-4">{p.name_ar || p.name}</th>)}</tr></thead>
      <tbody>
        {['sku', 'stock_quantity', 'unit', 'box_quantity', 'carton_quantity', 'min_order_qty', 'weight'].map(field => (
          <tr key={field} className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">{field === 'sku' ? 'SKU' : field === 'stock_quantity' ? 'المخزون' : field === 'unit' ? 'الوحدة' : field === 'box_quantity' ? 'كمية الصندوق' : field === 'carton_quantity' ? 'كمية الكرتون' : field === 'min_order_qty' ? 'الحد الأدنى' : field === 'weight' ? 'الوزن' : field}</td>
            {products.map(p => <td key={p.id} className="p-4">{String((p as any)[field] ?? '—')}</td>)}
          </tr>
        ))}
        <tr className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">التصنيف</td>{products.map(p => <td key={p.id} className="p-4">{p.category?.name || '—'}</td>)}</tr>
        <tr className="border-t border-neutral-100"><td className="p-4 font-semibold text-neutral-500">العلامة</td>{products.map(p => <td key={p.id} className="p-4">{p.brand?.name || '—'}</td>)}</tr>
        <tr className="border-t border-neutral-100"><td className="p-4" /><td className="p-4">{products.map(p => <button key={p.id} onClick={() => removeItem(p.id)} className="text-error-500 hover:text-error-700 text-sm">إزالة</button>)}</td></tr>
      </tbody>
    </table></div>
  </div>
}

export function CheckoutReview() {
  const { user, organization } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (user) supabase.from('cart_items').select('id,user_id,product_id,variant_id,quantity,unit_type,created_at,product:products(id,name,name_ar,sku,image_url,unit)').eq('user_id', user.id).then(({ data }) => { setItems(data as unknown as CartItem[] || []); setLoading(false) }) }, [user])
  if (loading) return <LoadingOverlay />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مراجعة الطلب" description="راجع الطلب قبل التأكيد النهائي" icon={ShoppingCart} />
    <div className="card p-6 mb-4"><h2 className="font-bold mb-4">المنتجات</h2>{items.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span className="truncate">{item.product?.name_ar || item.product?.name} × {item.quantity}</span></div>)}
      <p className="text-sm text-neutral-500 pt-4 mt-2">{formatCustomerAmount()}</p></div>
    {organization && <div className="card p-6 mb-4"><h2 className="font-bold mb-2">الشركة</h2><p className="text-sm text-neutral-600">{organization.name}</p><p className="text-sm text-neutral-500">شروط الدفع: {organization.payment_terms_days} يوم</p></div>}
    <div className="flex gap-3"><Link to="/checkout" className="btn-secondary">تعديل</Link><Link to="/checkout/confirm" className="btn-primary">تأكيد الطلب</Link></div>
  </div>
}

export function CheckoutConfirm() {
  const { user } = useAuth(); const { show } = useToast(); const navigate = useNavigate()
  const [items, setItems] = useState<CartItem[]>([]); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (user) supabase.from('cart_items').select('id,user_id,product_id,variant_id,quantity,unit_type,created_at,product:products(id,name,name_ar,sku,image_url,unit)').eq('user_id', user.id).then(({ data }) => setItems(data as unknown as CartItem[] || [])) }, [user])
  const confirm = async () => {
    if (!items.length) { setError('السلة فارغة'); return }
    setSubmitting(true); setError('')
    const { orderId, error: orderError } = await createOrderFromCart({ shippingAddress: {}, billingAddress: {}, notes: '', idempotencyKey: generateIdempotencyKey() })
    if (orderError || !orderId) { setError(orderError || 'تعذر إنشاء الطلب'); setSubmitting(false); return }
    setSubmitting(false); show('success', 'تم تأكيد الطلب'); navigate(`/order-success/${orderId}`)
  }
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="تأكيد الطلب" description="الخطوة الأخيرة قبل إرسال الطلب" icon={CheckCircle2} />
    <div className="card p-6 mb-4"><p className="text-sm text-neutral-600">سيتم إرسال الطلب للمراجعة. {formatCustomerAmount()}</p>{error && <PageError message={error} />}</div>
    <div className="flex gap-3"><Link to="/checkout/review" className="btn-secondary">رجوع</Link><button onClick={confirm} disabled={submitting} className="btn-primary">{submitting ? 'جاري التأكيد...' : 'تأكيد نهائي'}</button></div>
  </div>
}

export function ReorderList() {
  const { user } = useAuth(); const { show } = useToast(); const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!user) { setOrders([]); setLoading(false); return }
    supabase.from('customer_order_summaries')
      .select('id,user_id,order_number,status,total_items,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error) show('error', 'تعذر تحميل الطلبات السابقة', error.message)
        setOrders((data || []) as unknown as Order[])
        setLoading(false)
      })
  }, [user?.id])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="إعادة الطلب" description="أعد طلب منتجات من طلب سابق بضغطة واحدة" icon={Copy} />
    {loading ? <LoadingOverlay /> : !orders.length ? <EmptyState icon={<Copy />} title="لا توجد طلبات سابقة" description="ستظهر طلباتك السابقة هنا لإعادة الطلب." action={<Link to="/store" className="btn-primary">تصفح المتجر</Link>} /> :
    <div className="space-y-3">{orders.map(order => <div key={order.id} className="card p-4 flex items-center justify-between"><div><h3 className="font-semibold">{order.order_number}</h3><p className="text-sm text-neutral-500">{formatDate(order.created_at)}</p></div><Link to={`/reorder/${order.id}`} className="btn-primary btn-sm">إعادة الطلب</Link></div>)}</div>}
  </div>
}

export function ReorderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!id || !user) { setOrder(null); setLoading(false); return }
      setLoading(true)
      const { data, error } = await supabase.from('customer_order_summaries')
        .select('id,user_id,order_number,status,total_items,created_at')
        .eq('id', id).eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (error) { show('error', 'تعذر تحميل الطلب السابق', error.message); setLoading(false); return }
      if (!data) { setOrder(null); setLoading(false); return }
      const { data: itemRows, error: itemError } = await supabase.from('customer_order_item_summaries')
        .select('id,order_id,product_id,product_name,item_code,unit_snapshot,quantity,approved_quantity')
        .eq('order_id', id)
      if (!active) return
      if (itemError) { show('error', 'تعذر تحميل أصناف الطلب السابق', itemError.message); setLoading(false); return }
      const items = (itemRows || []).map(item => ({
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        name: item.product_name,
        product_name_snapshot: item.product_name,
        sku: item.item_code,
        unit_type: item.unit_snapshot,
        unit_snapshot: item.unit_snapshot,
        quantity: item.approved_quantity ?? item.quantity,
      }))
      setOrder({ ...data, items } as unknown as Order)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id, user?.id])

  const reorder = async () => {
    if (!user || !order?.items?.length) return
    setAdding(true)
    const cartRows = order.items.map(item => ({
      user_id: user.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_type: (item.unit_type || 'piece') as 'piece' | 'box' | 'carton',
    }))
    const { error } = await supabase.from('cart_items').insert(cartRows)
    setAdding(false)
    if (error) show('error', 'تعذر الإضافة', error.message)
    else { show('success', 'تمت الإضافة للسلة'); navigate('/cart') }
  }

  if (loading) return <LoadingOverlay />
  if (!order) return <ErrorState title="الطلب غير موجود" />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title={`إعادة طلب ${order.order_number}`} description="راجع المنتجات وأضفها للسلة" icon={Copy} />
    <div className="card p-6 mb-4">{order.items?.map(item => <div key={item.id} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span className="truncate">{item.product_name_snapshot || item.name} × {item.quantity}</span></div>)}</div>
    <button onClick={reorder} disabled={adding || !order.items?.length} className="btn-primary">{adding ? 'جاري الإضافة...' : 'إضافة الكل للسلة'}</button>
  </div>
}

export function Templates() {
  const { user, organization } = useAuth(); const [rows, setRows] = useState<import('@/types').ReorderTemplate[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (user) supabase.from('reorder_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => { setRows(data as any || []); setLoading(false) }) }, [user])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="قوالب الطلب" description="احفظ قوالب طلبات متكررة لإعادة استخدامها" icon={Copy} />
    <Link to="/templates/new" className="btn-primary mb-5 inline-flex"><Plus className="h-4 w-4" /> قالب جديد</Link>
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<Copy />} title="لا توجد قوالب" description="أنشئ قالب طلب لتسريع عمليات الشراء المتكررة." /> :
    <div className="space-y-3">{rows.map(row => <Link key={row.id} to={`/templates/${row.id}`} className="card p-4 flex items-center justify-between hover:shadow-card-hover transition-shadow"><div><h3 className="font-semibold">{row.name}</h3><p className="text-sm text-neutral-500">{formatDate(row.created_at)}</p></div><Copy className="h-5 w-5 text-neutral-400" /></Link>)}</div>}
  </div>
}

export function TemplateDetail() {
  const { id } = useParams(); const [tpl, setTpl] = useState<import('@/types').ReorderTemplate | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id) supabase.from('reorder_templates').select('*').eq('id', id).maybeSingle().then(({ data }) => { setTpl(data as any || null); setLoading(false) }) }, [id])
  if (loading) return <LoadingOverlay />
  if (!tpl) return <ErrorState title="القالب غير موجود" />
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title={tpl.name} description="تفاصيل قالب الطلب" icon={Copy} />
    <div className="card p-6 mb-4">{Array.isArray(tpl.items) && tpl.items.map((item: any, i: number) => <div key={i} className="flex justify-between py-2 border-b border-neutral-100 text-sm"><span>{item.name || item.product_id}</span><span>{item.quantity}</span></div>)}</div>
    <Link to={`/templates/${id}/edit`} className="btn-secondary">تعديل القالب</Link>
  </div>
}

export function TemplateEdit() {
  const { id } = useParams(); const { show } = useToast(); const navigate = useNavigate()
  const [name, setName] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  useEffect(() => { if (id) supabase.from('reorder_templates').select('*').eq('id', id).maybeSingle().then(({ data }) => { setName((data as any)?.name || ''); setLoading(false) }) }, [id])
  const save = async (e: FormEvent) => { e.preventDefault(); if (!id) return; setSaving(true); const { error } = await supabase.from('reorder_templates').update({ name }).eq('id', id); setSaving(false); if (error) show('error', 'تعذر الحفظ', error.message); else { show('success', 'تم الحفظ'); navigate('/templates') } }
  if (loading) return <LoadingOverlay />
  return <div className="max-w-xl mx-auto px-4 py-6"><PageHeader title="تعديل القالب" description="عدّل اسم القالب" icon={Copy} />
    <form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم القالب</label><input required className="input" value={name} onChange={e => setName(e.target.value)} /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></form>
  </div>
}

export function TemplateNew() {
  const { user, organization } = useAuth(); const { show } = useToast(); const navigate = useNavigate()
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false)
  const save = async (e: FormEvent) => { e.preventDefault(); if (!user) return; setSaving(true); const { data, error } = await supabase.from('reorder_templates').insert({ user_id: user.id, organization_id: organization?.id, name, items: [] }).select().single(); setSaving(false); if (error) show('error', 'تعذر الإنشاء', error.message); else { show('success', 'تم إنشاء القالب'); navigate(`/templates/${data.id}/edit`) } }
  return <div className="max-w-xl mx-auto px-4 py-6"><PageHeader title="قالب جديد" description="أنشئ قالب طلب متكرر" icon={Plus} />
    <form onSubmit={save} className="card p-6 space-y-4"><div><label className="label">اسم القالب</label><input required className="input" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: طلب شهري - مواد غذائية" /></div><button className="btn-primary" disabled={saving}>{saving ? 'جاري الإنشاء...' : 'إنشاء'}</button></form>
  </div>
}

export function PricingPage() {
  const { organization } = useAuth()
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="الأسعار والحساب التجاري" description="معلومات التسعير الخاصة بشركتك" icon={Wallet} />
    <div className="card p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><p className="text-xs text-neutral-500 mb-1">الفئة</p><p className="font-medium">{organization?.tier || 'standard'}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">شروط الدفع</p><p className="font-medium">{organization?.payment_terms_days || 0} يوم</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">حد الائتمان</p><p className="font-medium">{formatCustomerAmount()}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">حالة الحساب</p><p className="font-medium">{organization?.status || 'غير محدد'}</p></div>
      </div>
      <p className="text-sm text-neutral-500">الأسعار تحدد بعد اعتماد الطلب من قبل الإدارة.</p>
    </div>
  </div>
}

export function StatementDetail() {
  const { id } = useParams(); const { organization } = useAuth(); const [stmt, setStmt] = useState<Statement | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id && organization) supabase.from('customer_statement_summaries').select('id,organization_id,statement_number,period_start,period_end,status,created_at').eq('id', id).eq('organization_id', organization.id).maybeSingle().then(({ data, error }) => { if (error) setStmt(null); else setStmt(data as Statement || null); setLoading(false) }) }, [id, organization?.id])
  if (loading) return <LoadingOverlay />
  if (!stmt) return <ErrorState title="كشف الحساب غير موجود" />
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title={`كشف حساب ${stmt.statement_number}`} description={`الفترة: ${formatDate(stmt.period_start)} - ${formatDate(stmt.period_end)}`} icon={Wallet} />
    <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><p className="text-xs text-neutral-500 mb-1">رقم الكشف</p><p className="font-medium">{stmt.statement_number}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الحالة</p><StatusBadge status={stmt.status} /></div>
      <div><p className="text-xs text-neutral-500 mb-1">الفترة من</p><p className="font-medium">{formatDate(stmt.period_start)}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الفترة إلى</p><p className="font-medium">{formatDate(stmt.period_end)}</p></div>
    </div>
  </div>
}

export function PaymentDetail() {
  const { id } = useParams(); const { organization } = useAuth(); const [payment, setPayment] = useState<import('@/types').Payment | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (id && organization) supabase.from('customer_payment_summaries').select('id,invoice_id,organization_id,payment_number,method,status,created_at,reference').eq('id', id).eq('organization_id', organization.id).maybeSingle().then(({ data, error }) => { if (error) setPayment(null); else setPayment(data as any || null); setLoading(false) }) }, [id, organization?.id])
  if (loading) return <LoadingOverlay />
  if (!payment) return <ErrorState title="العملية غير موجودة" />
  return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title={`عملية ${payment.payment_number}`} description="تفاصيل الدفع" icon={Wallet} />
    <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><p className="text-xs text-neutral-500 mb-1">رقم العملية</p><p className="font-medium">{payment.payment_number}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الطريقة</p><p className="font-medium">{payment.method}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الحالة</p><StatusBadge status={payment.status} /></div>
      <div><p className="text-xs text-neutral-500 mb-1">المرجع</p><p className="font-medium">{payment.reference || '—'}</p></div>
    </div>
  </div>
}

export function Receivables() {
  const { organization } = useAuth(); const { show } = useToast(); const [rows, setRows] = useState<Invoice[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (organization) supabase.from('customer_sales_invoice_summaries').select('id,order_id,organization_id,invoice_number,status,issue_date,due_date,created_at').eq('organization_id', organization.id).in('status', ['issued', 'partial', 'overdue']).order('created_at', { ascending: false }).then(({ data, error }) => { if (error) show('error', 'تعذر تحميل المستحقات', error.message); setRows((data || []) as unknown as Invoice[]); setLoading(false) }) }, [organization?.id])
  return <div className="max-w-5xl mx-auto px-4 py-6"><PageHeader title="المستحقات" description="الفواتير غير المدفوعة بالكامل" icon={Wallet} />
    <div className="card p-5 mb-4"><p className="text-sm text-neutral-500">عدد الفواتير المستحقة</p><p className="text-3xl font-bold text-error-600">{rows.length}</p></div>
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<Wallet />} title="لا توجد مستحقات" description="جميع الفواتير مدفوعة." /> :
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4">الفاتورة</th><th className="p-4">الحالة</th></tr></thead>
      <tbody>{rows.map(inv => <tr key={inv.id} className="border-t border-neutral-100"><td className="p-4 font-medium">{inv.invoice_number}</td><td className="p-4"><StatusBadge status={inv.status} /></td></tr>)}</tbody></table></div>}
  </div>
}

export function FinancialDocuments() {
  const { organization } = useAuth(); const { show } = useToast(); const [invoices, setInvoices] = useState<Invoice[]>([]); const [statements, setStatements] = useState<Statement[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!organization) { setInvoices([]); setStatements([]); setLoading(false); return }
    Promise.all([
      supabase.from('customer_sales_invoice_summaries').select('id,order_id,organization_id,invoice_number,status,issue_date,due_date,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('customer_statement_summaries').select('id,organization_id,statement_number,period_start,period_end,status,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(20),
    ]).then(([inv, stmt]) => {
      if (inv.error) show('error', 'تعذر تحميل الفواتير', inv.error.message)
      if (stmt.error) show('error', 'تعذر تحميل كشوف الحساب', stmt.error.message)
      setInvoices((inv.data || []) as unknown as Invoice[])
      setStatements((stmt.data || []) as unknown as Statement[])
      setLoading(false)
    })
  }, [organization?.id])
  return <div className="max-w-6xl mx-auto px-4 py-6"><PageHeader title="المستندات المالية" description="كل الفواتير وكشوف الحساب في مكان واحد" icon={FileText} />
    {loading ? <LoadingOverlay /> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div><h2 className="font-bold mb-3">الفواتير</h2>{invoices.length ? <div className="card divide-y divide-neutral-100">{invoices.map(inv => <Link key={inv.id} to={`/invoices/${inv.id}`} className="block p-4 hover:bg-neutral-50"><div className="flex justify-between"><span className="font-medium">{inv.invoice_number}</span><StatusBadge status={inv.status} /></div></Link>)}</div> : <EmptyState icon={<FileText />} title="لا توجد فواتير" />}</div>
      <div><h2 className="font-bold mb-3">كشوف الحساب</h2>{statements.length ? <div className="card divide-y divide-neutral-100">{statements.map(stmt => <Link key={stmt.id} to={`/statements/${stmt.id}`} className="block p-4 hover:bg-neutral-50"><div className="flex justify-between"><span className="font-medium">{stmt.statement_number}</span><StatusBadge status={stmt.status} /></div></Link>)}</div> : <EmptyState icon={<Wallet />} title="لا توجد كشوف" />}</div>
    </div>}
  </div>
}

export function CompanyDetails() { const { organization } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="تفاصيل الشركة" description="البيانات القانونية والتجارية" icon={Building2} /><div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{[['الاسم القانوني', organization?.legal_name], ['الرقم الضريبي', organization?.tax_number], ['رقم السجل التجاري', organization?.cr_number], ['المدينة', organization?.city], ['الدولة', organization?.country], ['العنوان', organization?.address]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-neutral-500 mb-1">{label}</p><p className="font-medium">{value || 'غير متوفر'}</p></div>)}</div></div> }
export function CompanyContacts() { const { organization } = useAuth(); return <div className="max-w-3xl mx-auto px-4 py-6"><PageHeader title="جهات التواصل" description="بيانات الاتصال بالشركة" icon={Building2} /><div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{[['البريد', organization?.email], ['الهاتف', organization?.phone], ['الموقع', organization?.website]].map(([label, value]) => <div key={String(label)}><p className="text-xs text-neutral-500 mb-1">{label}</p><p className="font-medium">{value || 'غير متوفر'}</p></div>)}</div></div> }
export function CompanyUsers() {
  const { organization } = useAuth(); const [rows, setRows] = useState<import('@/types').OrganizationMember[]>([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (organization) supabase.from('organization_members').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).then(({ data }) => { setRows(data as any || []); setLoading(false) }) }, [organization])
  return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="مستخدمو الشركة" description="الأعضاء المرتبطون بحساب المؤسسة" icon={User} />
    {loading ? <LoadingOverlay /> : !rows.length ? <EmptyState icon={<User />} title="لا يوجد مستخدمون" description="لم يتم إضافة أعضاء بعد." /> :
    <div className="card overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-neutral-50"><tr><th className="p-4">المستخدم</th><th className="p-4">الدور</th><th className="p-4">الحالة</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-neutral-100"><td className="p-4 font-mono text-xs">{row.user_id}</td><td className="p-4"><StatusBadge status={row.role} /></td><td className="p-4"><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div>}
  </div>
}

export function HelpOrder() { return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المساعدة - الطلبات" description="دليل إدارة الطلبات وتتبعها" icon={HelpCircle} /><div className="card p-6 space-y-4 text-sm text-neutral-600"><p>يمكنك متابعة حالة طلباتك من صفحة "طلباتي". يتم تحديث الحالة تلقائياً عند كل مرحلة: المراجعة، الاعتماد، التجهيز، الشحن، التوصيل.</p><p>لإعادة طلب سابق، استخدم صفحة "إعادة الطلب" واختر الطلب المناسب.</p></div></div> }
export function HelpAccount() { return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="المساعدة - الحساب" description="دليل إدارة الحساب والإعدادات" icon={HelpCircle} /><div className="card p-6 space-y-4 text-sm text-neutral-600"><p>يمكنك تعديل اسمك من إعدادات الحساب. لتعديل بيانات الشركة، تواصل مع مسؤول المؤسسة.</p><p>تدير الإشعارات من صفحة الإشعارات أو من إعدادات الحساب.</p></div></div> }



/**
 * Customer-facing financial-document pages intentionally use summary views which
 * omit monetary fields. Operational amounts stay in the authorized staff workflow.
 */
export function Invoices() {
  const { organization } = useAuth()
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      if (!organization?.id) {
        setRows([])
        setError('سجّل الدخول بحساب شركتك لعرض الفواتير.')
        setLoading(false)
        return
      }
      const { data, error: queryError } = await supabase.from('customer_sales_invoice_summaries')
        .select('id,order_id,organization_id,invoice_number,status,issue_date,due_date,created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (queryError) {
        setRows([])
        setError('تعذر تحميل الفواتير. حاول مرة أخرى.')
      } else setRows((data || []) as unknown as Invoice[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [organization?.id])

  return <div className="max-w-5xl mx-auto px-4 py-6">
    <PageHeader title="فواتيري" description="عرض حالة المستندات دون إظهار أي مبالغ أو أسعار" icon={FileText} />
    {loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : rows.length === 0
      ? <EmptyState icon={<FileText />} title="لا توجد فواتير بيع" description="تظهر الفاتورة هنا بعد اعتماد الدفع وإصدارها رسمياً." />
      : <div className="card divide-y divide-neutral-100">{rows.map(invoice =>
        <Link key={invoice.id} to={`/invoices/${invoice.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-neutral-50">
          <div><p className="font-semibold text-neutral-900">{invoice.invoice_number}</p><p className="mt-1 text-xs text-neutral-500">{formatDate(invoice.issue_date || invoice.created_at)}</p></div>
          <div className="flex items-center gap-3"><StatusBadge status={invoice.status} /><span className="text-primary-700 text-sm">التفاصيل ←</span></div>
        </Link>)}</div>}
  </div>
}

export function InvoiceDetail() {
  const { id } = useParams()
  const { organization } = useAuth()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (!id || !organization?.id) { setInvoice(null); setLoading(false); return }
      const { data, error } = await supabase.from('customer_sales_invoice_summaries')
        .select('id,order_id,organization_id,invoice_number,status,issue_date,due_date,created_at')
        .eq('id', id).eq('organization_id', organization.id).maybeSingle()
      if (!active) return
      setInvoice(error ? null : data as unknown as Invoice | null)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id, organization?.id])

  if (loading) return <LoadingOverlay />
  if (!invoice) return <ErrorState title="الفاتورة غير موجودة" description="لا توجد فاتورة بيع صادرة لهذا الحساب، أو لا تملك صلاحية عرضها." />

  return <div className="max-w-3xl mx-auto px-4 py-6">
    <PageHeader title={`فاتورة ${invoice.invoice_number}`} description="المستند الرسمي المعتمد" icon={FileText} />
    <div className="card p-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><p className="text-xs text-neutral-500 mb-1">رقم الفاتورة</p><p className="font-semibold">{invoice.invoice_number}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">الحالة</p><StatusBadge status={invoice.status} /></div>
      <div><p className="text-xs text-neutral-500 mb-1">تاريخ الإصدار</p><p className="font-medium">{invoice.issue_date ? formatDate(invoice.issue_date) : '—'}</p></div>
      <div><p className="text-xs text-neutral-500 mb-1">تاريخ الاستحقاق</p><p className="font-medium">{invoice.due_date ? formatDate(invoice.due_date) : '—'}</p></div>
    </div>
    <p className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">تُخفي بوابة العميل الأسعار والمبالغ في جميع مراحل الطلب والفاتورة. لمتابعة حالة السداد، افتح تفاصيل الطلب المرتبط أو صفحة المدفوعات.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Link to={`/orders/${invoice.order_id}`} className="btn-primary">متابعة الطلب</Link><Link to="/payments" className="btn-secondary">المدفوعات</Link></div>
  </div>
}

export function Statements() {
  const { organization } = useAuth()
  const [rows, setRows] = useState<Statement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      if (!organization?.id) { setRows([]); setError('سجّل الدخول بحساب شركتك لعرض كشوف الحساب.'); setLoading(false); return }
      const { data, error: queryError } = await supabase.from('customer_statement_summaries')
        .select('id,organization_id,statement_number,period_start,period_end,status,created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false }).limit(100)
      if (!active) return
      if (queryError) { setRows([]); setError('تعذر تحميل كشوف الحساب. حاول مرة أخرى.') }
      else setRows((data || []) as unknown as Statement[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [organization?.id])

  return <div className="max-w-5xl mx-auto px-4 py-6">
    <PageHeader title="كشوف الحساب" description="استعرض الفترات وحالة المستند من دون أرصدة أو قيم مالية" icon={Wallet} />
    {loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : !rows.length
      ? <EmptyState icon={<Wallet />} title="لا توجد كشوف حساب" description="ستظهر الكشوف بعد إصدارها من الإدارة." />
      : <div className="card divide-y divide-neutral-100">{rows.map(row =>
        <Link key={row.id} to={`/statements/${row.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-neutral-50">
          <div><p className="font-semibold">{row.statement_number}</p><p className="mt-1 text-xs text-neutral-500">{formatDate(row.period_start)} — {formatDate(row.period_end)}</p></div>
          <StatusBadge status={row.status} />
        </Link>)}</div>}
  </div>
}

export function Payments() {
  const { organization } = useAuth()
  const [rows, setRows] = useState<import('@/types').Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      if (!organization?.id) { setRows([]); setError('سجّل الدخول بحساب شركتك لعرض المدفوعات.'); setLoading(false); return }
      const { data, error: queryError } = await supabase.from('customer_payment_summaries')
        .select('id,invoice_id,organization_id,payment_number,method,status,created_at,reference')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false }).limit(100)
      if (!active) return
      if (queryError) { setRows([]); setError('تعذر تحميل المدفوعات. حاول مرة أخرى.') }
      else setRows((data || []) as unknown as import('@/types').Payment[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [organization?.id])

  return <div className="max-w-5xl mx-auto px-4 py-6">
    <PageHeader title="المدفوعات" description="تتبع حالة الدفعات والمراجع دون إظهار مبالغ مالية" icon={Wallet} />
    {loading ? <LoadingOverlay /> : error ? <PageError message={error} /> : !rows.length
      ? <EmptyState icon={<Wallet />} title="لا توجد مدفوعات" description="بعد اعتماد الطلب، أرسل بيانات الدفع من صفحة تفاصيل الطلب." action={<Link to="/orders" className="btn-primary">طلباتي</Link>} />
      : <div className="card divide-y divide-neutral-100">{rows.map(row =>
        <Link key={row.id} to={`/payments/${row.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-neutral-50">
          <div><p className="font-semibold">{row.payment_number}</p><p className="mt-1 text-xs text-neutral-500">{formatDate(row.created_at)} · {row.method || '—'}</p>{row.reference && <p className="mt-1 text-xs text-neutral-500">المرجع: {row.reference}</p>}</div>
          <StatusBadge status={row.status} />
        </Link>)}</div>}
  </div>
}

export function Profile() {
  const { user } = useAuth()
  const { show } = useToast()
  const [fullName, setFullName] = useState(String(user?.user_metadata?.full_name || ''))
  const [phone, setPhone] = useState(String(user?.user_metadata?.phone || ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFullName(String(user?.user_metadata?.full_name || ''))
    setPhone(String(user?.user_metadata?.phone || ''))
  }, [user?.id])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) { show('error', 'يجب تسجيل الدخول أولاً'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ data: {
      ...user.user_metadata,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
    } })
    setSaving(false)
    show(error ? 'error' : 'success', error ? 'تعذر حفظ الملف الشخصي' : 'تم حفظ الملف الشخصي', error?.message)
  }

  return <div className="max-w-xl mx-auto px-4 py-6">
    <PageHeader title="ملفي الشخصي" description="إدارة بيانات التواصل المرتبطة بحساب الدخول" icon={User} />
    <form onSubmit={save} className="card p-6 space-y-4">
      <div><label className="label">البريد الإلكتروني</label><input className="input bg-neutral-50" readOnly value={user?.email || ''} /></div>
      <div><label className="label">الاسم الكامل</label><input required maxLength={160} className="input" value={fullName} onChange={event => setFullName(event.target.value)} /></div>
      <div><label className="label">رقم الهاتف</label><input maxLength={40} className="input" value={phone} onChange={event => setPhone(event.target.value)} /></div>
      <button type="submit" className="btn-primary" disabled={saving || !user}>{saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</button>
    </form>
  </div>
}

export function Company() {
  const { organization, membership } = useAuth()
  if (!organization) return <div className="max-w-4xl mx-auto px-4 py-6"><PageHeader title="الشركة" description="بيانات حساب الشركة" icon={Building2} /><EmptyState icon={<Building2 />} title="لا توجد مؤسسة مرتبطة" description="سجّل الدخول بحساب شركة نشطة أو اطلب من المسؤول ربط حسابك." /></div>
  return <div className="max-w-4xl mx-auto px-4 py-6">
    <PageHeader title={organization.name_ar || organization.name} description="مساحة عمل الشركة والبيانات التجارية" icon={Building2} />
    <div className="card p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><p className="text-xs text-neutral-500 mb-1">الاسم التجاري</p><p className="font-semibold">{organization.name}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">حالة الحساب</p><StatusBadge status={organization.status} /></div>
        <div><p className="text-xs text-neutral-500 mb-1">فئة الحساب</p><p className="font-medium">{organization.tier}</p></div>
        <div><p className="text-xs text-neutral-500 mb-1">صلاحية المستخدم</p><p className="font-medium">{membership?.role || 'عضو'}</p></div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link to="/company/details" className="btn-secondary justify-center">بيانات الشركة</Link>
        <Link to="/company/contacts" className="btn-secondary justify-center">جهات التواصل</Link>
        <Link to="/company/users" className="btn-secondary justify-center">مستخدمو الشركة</Link>
      </div>
    </div>
  </div>
}
