import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole, PackageCheck, Palette, ReceiptText, Save, Settings2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useCommercePolicies, type CommercePolicies, type QuantityInputTone } from '@/lib/useCommercePolicies'

function PolicyToggle({ checked, onChange, title, description, disabled = false }: {
  checked: boolean
  onChange: (value: boolean) => void
  title: string
  description: string
  disabled?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-primary-200">
      <span className="min-w-0">
        <span className="block font-semibold text-neutral-900">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-neutral-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-primary-600"
      />
    </label>
  )
}

export default function PolicyCenter() {
  const { organization, isAdmin } = useAuth()
  const { show } = useToast()
  const { policies, loading, saving, error, save, refresh } = useCommercePolicies()
  const [draft, setDraft] = useState<CommercePolicies>(policies)

  useEffect(() => setDraft(policies), [policies])

  const change = <K extends keyof CommercePolicies>(key: K, value: CommercePolicies[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const submit = async () => {
    const saved = await save(draft)
    if (saved) show('success', 'تم حفظ سياسات المؤسسة', 'تُطبق السياسات المحفوظة على مسارات الواجهة والخادم التي تدعمها.')
    else show('error', 'تعذر حفظ السياسات')
  }

  const tones: { value: QuantityInputTone; title: string; hint: string; className: string }[] = [
    { value: 'sky', title: 'أزرق هادئ', hint: 'تمييز لطيف للحقل النشط', className: 'border-sky-200 bg-sky-50 text-sky-800' },
    { value: 'mint', title: 'أخضر نعناعي', hint: 'إشارة هادئة للحالة النشطة', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { value: 'slate', title: 'رمادي متناسق', hint: 'تمييز محايد وقليل التباين', className: 'border-slate-200 bg-slate-50 text-slate-800' },
  ]

  if (!organization) return <div className="p-6"><div className="card p-6">يلزم تحديد المؤسسة قبل إدارة السياسات.</div></div>

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Settings2 className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">مركز السياسات</h1>
            <p className="mt-1 text-sm text-neutral-500">سياسات الطلبات والأسعار وسلوك شاشة العميل الخاصة بـ {organization.name}.</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading || saving} className="btn-secondary btn-sm">تحديث السياسات</button>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        تعذر قراءة أو حفظ الإعدادات الأخيرة. تعمل الواجهة بإعدادات أمان افتراضية: إخفاء الأسعار واشتراط اعتماد الكميات.
        <p className="mt-1 break-words text-xs opacity-80">{error}</p>
      </div>}

      {!isAdmin && <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">يمكنك عرض السياسات؛ التعديل محفوظ لمالك المؤسسة أو مسؤولها فقط.</div>}

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">خصوصية الأسعار والعميل</h2></div>
        <div className="space-y-3">
          <PolicyToggle checked={true} onChange={() => undefined} disabled title="إخفاء الأسعار عن حسابات العملاء (سياسة إلزامية)" description="هذا الشرط لا يمكن تعطيله من الواجهة: لا تعرض واجهة العميل أسعاراً أو إجماليات رقمية في الطلب أو الفاتورة قبل الاعتماد أو بعده." />
          <PolicyToggle checked={draft.payment_request_after_approval} onChange={value => change('payment_request_after_approval', value)} title="طلب إرسال المبلغ بعد اعتماد الإدارة" description="بعد انتقال الطلب إلى حالة الاعتماد، يظهر للعميل تنبيه أسفل تفاصيل الطلب لإرسال المبلغ لإتمام الاعتماد النهائي." />
        </div>
      </section>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">اعتماد الكميات</h2></div>
        <div className="space-y-3">
          <PolicyToggle checked={draft.require_quantity_approval} onChange={value => change('require_quantity_approval', value)} title="منع مغادرة شاشة اعتماد الكميات قبل الحفظ" description="تبقى التعديلات معلقة حتى يضغط المسؤول زر اعتماد الكميات. لا يُعتمد التغيير عند فقدان التركيز أو التنقل بين الحقول." />
        </div>
        <div className="mt-5">
          <p className="mb-3 font-semibold text-neutral-800">لون الحقل النشط للكمية المعتمدة</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tones.map(tone => <button key={tone.value} type="button" onClick={() => change('quantity_input_tone', tone.value)} aria-pressed={draft.quantity_input_tone === tone.value} className={`rounded-xl border p-4 text-right transition ${tone.className} ${draft.quantity_input_tone === tone.value ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}>
              <span className="block font-semibold">{tone.title}</span><span className="mt-1 block text-xs">{tone.hint}</span>
              {draft.quantity_input_tone === tone.value && <span className="mt-2 block text-xs font-bold">✓ محدد</span>}
            </button>)}
          </div>
        </div>
      </section>

      <section className="card mb-6 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary-700" /><h2 className="text-lg font-bold">حدود تطبيق السياسات</h2></div>
        <p className="text-sm leading-7 text-neutral-600">هذه الإعدادات تُحفظ على مستوى المؤسسة وتُقرأ من سجل السياسات الخاص بها. يتم تفعيل أي سياسة فقط بعد ربطها بمسارات التنفيذ والتحقق المناسبة؛ لا يُعتبر وجود مفتاح إعداد وحده دليلاً على اكتمال بقية محركات المذكرة.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm"><ReceiptText className="mb-2 h-4 w-4 text-neutral-500" /><strong>مسارات الطلب والفاتورة</strong><p className="mt-1 text-neutral-500">إخفاء الأرقام المالية من واجهات العميل مع إبقائها في السجلات التشغيلية للإدارة.</p></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-sm"><Palette className="mb-2 h-4 w-4 text-neutral-500" /><strong>هوية الواجهة</strong><p className="mt-1 text-neutral-500">لون الحقل النشط اختيار مرئي؛ ولا يغيّر السعر أو حالة اعتماد الكمية.</p></div>
        </div>
      </section>

      <div className="sticky bottom-3 flex justify-between gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="flex items-center gap-2 text-xs text-neutral-500"><CheckCircle2 className="h-4 w-4" /> التغييرات لا تُحفظ قبل الضغط</span>
        <button type="button" onClick={submit} disabled={loading || saving || !isAdmin} className="btn-primary"><Save className="h-4 w-4" />{saving ? 'جارٍ الحفظ…' : 'حفظ السياسات'}</button>
      </div>
    </div>
  )
}
