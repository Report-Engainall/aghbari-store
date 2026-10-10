import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Brain, CheckCircle2, FileText, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

type AiRecord = {
  id: string
  title?: string | null
  name?: string | null
  description?: string | null
  body?: string | null
  result?: string | null
  status?: string | null
  severity?: string | null
  created_at?: string | null
}

type Snapshot = {
  reports: AiRecord[]
  alerts: AiRecord[]
  tasks: AiRecord[]
}

type ChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

const emptySnapshot: Snapshot = { reports: [], alerts: [], tasks: [] }
const suggestions = ['لخص أحدث التنبيهات', 'ما المهام المفتوحة؟', 'ما أحدث التقارير؟', 'أعطني ملخص حالة مركز الذكاء الاصطناعي']

function normalized(value: string) {
  return value.toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .trim()
}

function recordTitle(row: AiRecord) {
  return String(row.title || row.name || 'سجل بلا عنوان')
}

function recordDetail(row: AiRecord) {
  return String(row.description || row.body || row.result || 'لا توجد تفاصيل إضافية محفوظة.')
}

function recordStatus(row: AiRecord) {
  return String(row.status || row.severity || 'غير محدد')
}

function timeLabel(value?: string | null) {
  if (!value) return 'وقت غير متوفر'
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? 'وقت غير صالح' : timestamp.toLocaleString('ar-YE')
}

function answerFromSnapshot(question: string, snapshot: Snapshot) {
  const q = normalized(question)
  const completed = (row: AiRecord) => ['completed', 'complete', 'done', 'closed', 'cancelled', 'canceled', 'مكتمل', 'مكتملة', 'منجز', 'منجزة', 'ملغي', 'ملغاة'].includes(normalized(String(row.status || '')))
  const openTasks = snapshot.tasks.filter(row => !completed(row))

  if (q.includes('تنبيه') || q.includes('تحذير') || q.includes('alert') || q.includes('خطر')) {
    if (!snapshot.alerts.length) return 'لا توجد سجلات تنبيه ضمن أحدث السجلات المحمّلة لهذا الحساب. هذا لا يثبت عدم وجود أحداث خارج الجدول أو الفترة التي تم تحميلها.'
    return `تم تحميل ${snapshot.alerts.length} سجل تنبيه حديث. أحدثها:\n\n${snapshot.alerts.slice(0, 5).map((row, index) => `${index + 1}. ${recordTitle(row)} — الحالة: ${recordStatus(row)}\n${recordDetail(row)}`).join('\n\n')}\n\nهذه خلاصة للسجلات المحفوظة؛ لم أضف استنتاجات غير موجودة في المصدر.`
  }

  if (q.includes('مهم') || q.includes('task') || q.includes('مهام') || q.includes('مفتوح') || q.includes('متبقي')) {
    if (!snapshot.tasks.length) return 'لا توجد سجلات مهام ضمن أحدث السجلات المحمّلة لهذا الحساب.'
    return `في أحدث ${snapshot.tasks.length} سجل مهمة محمّل، توجد ${openTasks.length} مهام غير مصنفة كمكتملة أو ملغاة، و${snapshot.tasks.length - openTasks.length} مهام مكتملة/مغلقة.\n\n${openTasks.slice(0, 5).map((row, index) => `${index + 1}. ${recordTitle(row)} — الحالة: ${recordStatus(row)}\n${recordDetail(row)}`).join('\n\n') || 'لا تظهر مهام مفتوحة ضمن هذه السجلات.'}\n\nالتصنيف يعتمد على قيمة الحالة المحفوظة فقط.`
  }

  if (q.includes('تقرير') || q.includes('تقارير') || q.includes('report')) {
    if (!snapshot.reports.length) return 'لا توجد سجلات تقارير حديثة في جدول ai_reports لهذا الحساب. استورد أو أنشئ تقريرًا من المسار المعتمد ثم أعد التحديث.'
    return `تم تحميل ${snapshot.reports.length} سجل تقرير حديث. أحدثها:\n\n${snapshot.reports.slice(0, 5).map((row, index) => `${index + 1}. ${recordTitle(row)} — ${timeLabel(row.created_at)}\n${recordDetail(row)}`).join('\n\n')}`
  }

  if (q.includes('ملخص') || q.includes('حالة') || q.includes('الوضع') || q.includes('summary') || q.includes('status')) {
    return `ملخص مركز الذكاء الاصطناعي لهذا الحساب:\n• التقارير المحمّلة: ${snapshot.reports.length}\n• التنبيهات المحمّلة: ${snapshot.alerts.length}\n• المهام المحمّلة: ${snapshot.tasks.length}\n• المهام غير المكتملة حسب الحالة المحفوظة: ${openTasks.length}\n\nهذه أعداد أحدث السجلات المحمّلة (بحد أقصى 50 سجلًا لكل قسم)، وليست إحصاءً تاريخيًا شاملًا.`
  }

  return 'أستطيع حاليًا تلخيص سجلات التقارير والتنبيهات والمهام المحفوظة داخل حساب المؤسسة. لم يتم إعداد نموذج توليدي مفعّل لهذا المساعد، لذلك لن أدّعي فهمًا عامًا أو أختلق تحليلًا للمبيعات أو السيولة أو المخزون. استخدم أحد الاقتراحات أعلاه، أو أعد صياغة سؤالك حول التقارير أو التنبيهات أو المهام.'
}

export default function AIAssistant() {
  const { organization } = useAuth()
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'مرحبًا. أنا المساعد التشغيلي المدمج في بوابة الأغبري. أستند إلى سجلات المؤسسة المحفوظة في التقارير والتنبيهات والمهام؛ لا أرسل بياناتك إلى نموذج خارجي.',
  }])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  const loadSnapshot = useCallback(async (isRefresh = false) => {
    const organizationId = organization?.id
    if (!organizationId) {
      setSnapshot(emptySnapshot)
      setWarnings(['لا توجد مؤسسة نشطة ضمن الجلسة الحالية.'])
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setWarnings([])

    try {
      const [reportsResult, alertsResult, tasksResult] = await Promise.all([
        supabase.from('ai_reports').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
        supabase.from('ai_alerts').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
        supabase.from('ai_tasks').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
      ])

      const nextWarnings: string[] = []
      if (reportsResult.error) nextWarnings.push(`تعذر تحميل التقارير: ${reportsResult.error.message}`)
      if (alertsResult.error) nextWarnings.push(`تعذر تحميل التنبيهات: ${alertsResult.error.message}`)
      if (tasksResult.error) nextWarnings.push(`تعذر تحميل المهام: ${tasksResult.error.message}`)

      setSnapshot({
        reports: reportsResult.error ? [] : (reportsResult.data || []) as AiRecord[],
        alerts: alertsResult.error ? [] : (alertsResult.data || []) as AiRecord[],
        tasks: tasksResult.error ? [] : (tasksResult.data || []) as AiRecord[],
      })
      setWarnings(nextWarnings)
    } catch (cause) {
      setWarnings([cause instanceof Error ? cause.message : 'حدث خطأ غير متوقع أثناء تحميل سجلات المساعد.'])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [organization?.id])

  useEffect(() => {
    setSnapshot(emptySnapshot)
    void loadSnapshot()
  }, [loadSnapshot])

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = question.trim()
    if (!value || loading) return
    const response = answerFromSnapshot(value, snapshot)
    setMessages(current => [...current, { role: 'user', content: value }, { role: 'assistant', content: response }])
    setQuestion('')
  }

  const askSuggestion = (value: string) => {
    const response = answerFromSnapshot(value, snapshot)
    setMessages(current => [...current, { role: 'user', content: value }, { role: 'assistant', content: response }])
  }

  const metrics = [
    { label: 'التقارير الحديثة', value: snapshot.reports.length, icon: FileText },
    { label: 'التنبيهات الحديثة', value: snapshot.alerts.length, icon: AlertTriangle },
    { label: 'المهام الحديثة', value: snapshot.tasks.length, icon: CheckCircle2 },
  ]

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"><Brain className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">المساعد الذكي</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">مساعد مدمج داخل لوحة الأغبري، يستخدم جلسة المؤسسة نفسها ويعرض ملخصات مبنية على السجلات المحفوظة.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-3 py-1 font-semibold text-success-700"><ShieldCheck className="h-3.5 w-3.5" /> نطاق المؤسسة الحالية</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-neutral-600"><Sparkles className="h-3.5 w-3.5" /> ملخصات من البيانات المحفوظة</span>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => void loadSnapshot(true)} disabled={refreshing || loading} className="btn-secondary btn-sm shrink-0"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> تحديث السجلات</button>
      </div>

      {warnings.length > 0 && <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>بعض المصادر لم تُحمّل بالكامل.</strong><ul className="mt-2 list-inside list-disc space-y-1">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {metrics.map(metric => <div key={metric.label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm text-neutral-500"><metric.icon className="h-4 w-4 text-primary-600" />{metric.label}</div><p className="mt-2 text-2xl font-bold text-neutral-900">{loading ? '…' : metric.value}</p><p className="mt-1 text-xs text-neutral-400">حد أقصى 50 سجلًا لكل قسم</p></div>)}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <div><h2 className="font-bold text-neutral-900">مساحة المحادثة</h2><p className="mt-1 text-xs text-neutral-500">الردود محسوبة من أحدث السجلات المتاحة؛ لا يوجد نموذج توليدي مفعّل لهذا المساعد.</p></div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Brain className="h-5 w-5" /></div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
            {loading && <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">جارٍ تحميل سجلات المؤسسة…</div>}
            {!loading && snapshot.reports.length === 0 && snapshot.alerts.length === 0 && snapshot.tasks.length === 0 && warnings.length === 0 && <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm leading-6 text-neutral-600">لا توجد سجلات حديثة متاحة بعد. لن أعرض أرقامًا تجريبية؛ أضف بيانات فعلية عبر مسارات التطبيق المعتمدة ثم حدّث هذه الصفحة.</div>}
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[95%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[88%] ${message.role === 'user' ? 'bg-primary-600 text-white' : 'border border-neutral-200 bg-neutral-50 text-neutral-800'}`}><p className="mb-1 text-[11px] font-bold opacity-70">{message.role === 'user' ? 'أنت' : 'مساعد الأغبري'}</p>{message.content}</div></div>)}
          </div>
          <form onSubmit={submitQuestion} className="border-t border-neutral-100 p-4">
            <label htmlFor="ai-assistant-question" className="mb-2 block text-xs font-semibold text-neutral-600">اسأل عن سجلات التقارير أو التنبيهات أو المهام</label>
            <div className="flex min-w-0 gap-2"><input id="ai-assistant-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="مثال: لخص أحدث التنبيهات" className="input min-w-0 flex-1" disabled={loading} /><button type="submit" disabled={loading || !question.trim()} className="btn-primary shrink-0" aria-label="إرسال السؤال"><Send className="h-4 w-4" /> إرسال</button></div>
          </form>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold text-neutral-900">أسئلة سريعة</h2>
            <div className="mt-3 flex flex-col gap-2">{suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => askSuggestion(suggestion)} disabled={loading} className="rounded-xl border border-neutral-200 px-3 py-3 text-right text-sm text-neutral-700 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">{suggestion}</button>)}</div>
          </section>
          <section className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-primary-950">
            <h2 className="font-bold">حدود المساعد الحالية</h2>
            <p className="mt-2">المساعد جزء من تطبيق الأغبري ويستخدم المؤسسة النشطة. الردود الحالية تلخص السجلات المعروضة فقط؛ لم يتم ربط نموذج خارجي أو تحليل شامل للمبيعات والسيولة والمخزون.</p>
            <p className="mt-2">إذا كان أحد المصادر غير متاح، فستظهر رسالة خطأ بدل إخفاء المشكلة أو عرض نتائج افتراضية.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
