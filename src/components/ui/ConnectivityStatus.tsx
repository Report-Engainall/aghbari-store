import { useEffect, useState } from 'react'

/**
 * Reports browser connectivity only. It does not claim the API or Supabase is healthy.
 * Online-only mutations are intentionally not queued or reported as saved while offline.
 */
export function ConnectivityStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  if (online) return null

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg"
    >
      <strong className="block font-bold">المتصفح يبلّغ عن عدم الاتصال بالإنترنت</strong>
      <p className="mt-1 leading-6">
        قد يفتح هيكل التطبيق المخزن سابقاً، لكن البيانات الحية غير مضمونة.
        لن تُحفظ الطلبات أو المدفوعات أو تغييرات المخزون دون اتصال بالخادم.
      </p>
    </div>
  )
}
