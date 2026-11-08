import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Preferences = {
  notifications: boolean
  notificationDetail: 'minimal' | 'standard' | 'detailed'
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  timeZone: string
  reduceMotion: boolean
  personalization: boolean
}

const defaults: Preferences = {
  notifications: true,
  notificationDetail: 'standard',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  reduceMotion: false,
  personalization: true,
}

export default function PersonalizationPrivacyPanel() {
  const [value, setValue] = useState<Preferences>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return
      if (authError) setError('تعذر تحميل تفضيلات الحساب.')
      const stored = data.user?.user_metadata?.aghbari_preferences
      if (stored && typeof stored === 'object') {
        setValue({ ...defaults, ...stored })
      }
      setLoading(false)
    }).catch(() => {
      if (active) { setError('تعذر تحميل تفضيلات الحساب.'); setLoading(false) }
    })
    return () => { active = false }
  }, [])

  const change = <K extends keyof Preferences>(key: K, next: Preferences[K]) => {
    setValue(current => ({ ...current, [key]: next }))
    setMessage('')
    setError('')
  }

  const save = async () => {
    if (value.quietHoursEnabled && (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value.quietHoursStart) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value.quietHoursEnd))) {
      setError('أدخل وقتاً صحيحاً لساعات الهدوء.')
      return
    }
    setSaving(true); setError(''); setMessage('')
    try {
      const { error: saveError } = await supabase.auth.updateUser({
        data: { aghbari_preferences: value },
      })
      if (saveError) throw saveError
      setMessage('تم حفظ تفضيلات هذا الحساب.')
    } catch {
      setError('لم يتم الحفظ. تحقق من الجلسة ثم أعد المحاولة.')
    } finally { setSaving(false) }
  }

  if (loading) return <section className="card" aria-busy="true"><p>جارٍ تحميل تفضيلات الخصوصية…</p></section>

  return (
    <section className="card" aria-labelledby="privacy-preferences-title" style={{ padding: 20, marginTop: 20 }}>
      <h2 id="privacy-preferences-title">الخصوصية والتخصيص</h2>
      <p className="text-muted">تفضيلات شخصية مرتبطة بحسابك، وليست إعدادات عامة للمتجر.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
        <label className="label"><input type="checkbox" checked={value.notifications} onChange={e => change('notifications', e.target.checked)} /> تفعيل الإشعارات</label>
        <label className="label">مستوى تفاصيل الإشعار
          <select className="input" value={value.notificationDetail} onChange={e => change('notificationDetail', e.target.value as Preferences['notificationDetail'])}>
            <option value="minimal">مختصر</option><option value="standard">متوازن</option><option value="detailed">مفصل</option>
          </select>
        </label>
        <label className="label"><input type="checkbox" checked={value.quietHoursEnabled} onChange={e => change('quietHoursEnabled', e.target.checked)} /> تفعيل ساعات الهدوء</label>
        <label className="label">بداية الهدوء<input className="input" type="time" value={value.quietHoursStart} onChange={e => change('quietHoursStart', e.target.value)} disabled={!value.quietHoursEnabled} /></label>
        <label className="label">نهاية الهدوء<input className="input" type="time" value={value.quietHoursEnd} onChange={e => change('quietHoursEnd', e.target.value)} disabled={!value.quietHoursEnabled} /></label>
        <label className="label">المنطقة الزمنية
          <input className="input" value={value.timeZone} onChange={e => change('timeZone', e.target.value)} placeholder="Asia/Aden" />
        </label>
        <label className="label"><input type="checkbox" checked={value.reduceMotion} onChange={e => change('reduceMotion', e.target.checked)} /> تقليل الحركة والانتقالات</label>
        <label className="label"><input type="checkbox" checked={value.personalization} onChange={e => change('personalization', e.target.checked)} /> السماح بالتخصيص داخل الحساب</label>
      </div>
      <div style={{ marginTop: 18, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <strong>المعالجة الخارجية وموافقات القنوات</strong>
        <p className="text-muted">حالة الموافقة والتنفيذ غير متاحة من عقد خادم موثّق في هذا المسار؛ لذلك لم يُتح خيار موافقة شكلياً. لا تعتبر تفضيلات هذه الشاشة دليلاً على منع المعالجة الخارجية.</p>
        <p className="text-muted">لا توجد حالياً بيانات سياسة موثوقة تفسر تعطيل قناة بعينها.</p>
      </div>
      {error && <p role="alert" style={{ color: 'var(--color-danger, #b42318)' }}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ تفضيلات الخصوصية'}</button>
    </section>
  )
}
