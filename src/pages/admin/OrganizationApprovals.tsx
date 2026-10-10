import { useCallback, useEffect, useState } from 'react'
import { Building2, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { ErrorState, LoadingOverlay } from '@/components/ui/Loader'

type PendingOrganization = {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

export default function OrganizationApprovals() {
  const { show } = useToast()
  const [rows, setRows] = useState<PendingOrganization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('list_pending_organizations')
    if (rpcError) {
      setError(rpcError.message.includes('platform_admin_required')
        ? 'ليس لديك صلاحية اعتماد الشركات. يجب منح دور مسؤول المنصة عبر إجراء إداري موثوق.'
        : rpcError.message)
      setRows([])
    } else {
      setRows((data || []) as PendingOrganization[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const review = async (row: PendingOrganization, decision: 'approve' | 'reject') => {
    const action = decision === 'approve' ? 'اعتماد' : 'رفض'
    if (!window.confirm(`هل تريد ${action} طلب شركة «${row.name}»؟`)) return

    setWorkingId(row.id)
    const { error: reviewError } = await supabase.rpc('review_organization', {
      p_organization_id: row.id,
      p_decision: decision,
      p_reason: reasons[row.id]?.trim() || null,
    })
    setWorkingId(null)

    if (reviewError) {
      show('error', `تعذّر ${action} الشركة`, reviewError.message)
      return
    }

    show('success', decision === 'approve' ? 'تم اعتماد الشركة' : 'تم رفض طلب الشركة',
      decision === 'approve' ? 'أصبح بإمكان أعضاء الشركة الدخول بعد تحديث جلستهم.' : 'تم حفظ القرار في سجل التدقيق.')
    await load()
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Building2 className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">اعتماد الشركات</h1>
              <p className="mt-1 text-sm text-neutral-600">مراجعة الطلبات الجديدة قبل تفعيل الوصول إلى المتجر والبيانات التشغيلية.</p>
            </div>
          </div>
          <button onClick={() => void load()} disabled={loading || Boolean(workingId)} className="btn-secondary inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث القائمة
          </button>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <Clock3 className="h-5 w-5 text-warning-600" />
            <div><p className="text-sm text-neutral-500">طلبات قيد المراجعة</p><p className="text-2xl font-bold">{rows.length}</p></div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <ShieldCheck className="h-5 w-5 text-success-600" />
            <div><p className="text-sm text-neutral-500">القرار</p><p className="font-semibold">اعتماد موثق</p></div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-neutral-500" />
            <div><p className="text-sm text-neutral-500">الحماية</p><p className="font-semibold">مغلقة حتى الاعتماد</p></div>
          </div>
        </section>

        {loading ? <LoadingOverlay /> : error ? <ErrorState description={error} onRetry={() => void load()} /> : rows.length === 0 ? (
          <div className="card p-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success-600" />
            <h2 className="text-lg font-bold text-neutral-900">لا توجد طلبات معلّقة</h2>
            <p className="mt-2 text-sm text-neutral-500">ستظهر هنا طلبات الشركات التي تحتاج مراجعة واعتماداً.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-neutral-100 text-neutral-600">
                  <tr>
                    <th className="p-4 font-semibold">الشركة</th>
                    <th className="p-4 font-semibold">البريد</th>
                    <th className="p-4 font-semibold">الهاتف</th>
                    <th className="p-4 font-semibold">تاريخ الطلب</th>
                    <th className="p-4 font-semibold">قرار المراجعة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className="border-t border-neutral-100 align-top">
                      <td className="p-4"><p className="font-semibold text-neutral-900">{row.name}</p><p className="mt-1 font-mono text-xs text-neutral-400">{row.id.slice(0, 8)}</p></td>
                      <td className="p-4 text-neutral-600">{row.email || '—'}</td>
                      <td className="p-4 text-neutral-600">{row.phone || '—'}</td>
                      <td className="p-4 whitespace-nowrap text-neutral-600">{formatDate(row.created_at)}</td>
                      <td className="p-4">
                        <label className="mb-2 block text-xs text-neutral-500">سبب الرفض (اختياري)</label>
                        <input className="input mb-3 min-w-48" maxLength={1000} value={reasons[row.id] || ''} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} placeholder="سبب القرار" />
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => void review(row, 'approve')} disabled={Boolean(workingId)} className="btn-primary btn-sm">
                            {workingId === row.id ? 'جارٍ التنفيذ...' : 'اعتماد الشركة'}
                          </button>
                          <button onClick={() => void review(row, 'reject')} disabled={Boolean(workingId)} className="btn-danger btn-sm">رفض الطلب</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
