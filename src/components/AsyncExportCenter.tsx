import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileSpreadsheet, RefreshCw, XCircle } from "lucide-react";
import {
  cancelMyAsyncExportJob, getMyAsyncExportDownload, listMyAsyncExportJobs,
  requestAsyncOrdersCsvExport, triggerAsyncExportWorker, type AsyncExportJobState,
} from "@/lib/async-export-jobs";
import { exportJobIdempotencyKey } from "@/lib/async-export-csv";

const labels: Record<AsyncExportJobState["status"], string> = {
  queued: "في قائمة الانتظار", processing: "جارٍ التجهيز", retry: "إعادة المحاولة",
  ready: "جاهز للتنزيل", failed: "فشل نهائي", cancelled: "ملغى", expired: "انتهت الصلاحية",
};
const styles: Record<AsyncExportJobState["status"], string> = {
  queued: "bg-sky-50 text-sky-800", processing: "bg-amber-50 text-amber-800",
  retry: "bg-amber-50 text-amber-800", ready: "bg-emerald-50 text-emerald-800",
  failed: "bg-rose-50 text-rose-800", cancelled: "bg-muted text-muted-foreground", expired: "bg-rose-50 text-rose-800",
};
type Notice = { kind: "success" | "error" | "info"; text: string };
const time = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
};
const size = (bytes: number | null) => bytes === null ? "—" : bytes < 1024 ? bytes + " بايت" : bytes < 1048576 ? (bytes / 1024).toFixed(1) + " كيلوبايت" : (bytes / 1048576).toFixed(2) + " ميجابايت";

type AsyncExportJobRowProps = {
  job: AsyncExportJobState;
  busy: string | null;
  onDownload: (job: AsyncExportJobState) => void;
  onRetry: (job: AsyncExportJobState) => void;
  onCancel: (job: AsyncExportJobState) => void;
};

type AsyncExportJobActionProps = {
  job: AsyncExportJobState;
  isBusy: boolean;
  onDownload: (job: AsyncExportJobState) => void;
  onRetry: (job: AsyncExportJobState) => void;
  onCancel: (job: AsyncExportJobState) => void;
};

function AsyncExportDownloadAction({ job, isBusy, onDownload }: AsyncExportJobActionProps) {
  if (job.status !== "ready") return null;
  return (
    <button type="button" onClick={() => onDownload(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
      <Download size={14}/> تنزيل
    </button>
  );
}

function AsyncExportRetryAction({ job, isBusy, onRetry }: AsyncExportJobActionProps) {
  if (job.status !== "queued" && job.status !== "retry") return null;
  return (
    <button type="button" onClick={() => onRetry(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-60">
      <RefreshCw size={14}/> تنبيه العامل
    </button>
  );
}

function AsyncExportCancelAction({ job, isBusy, onCancel }: AsyncExportJobActionProps) {
  if (job.status !== "queued" && job.status !== "retry") return null;
  return (
    <button type="button" onClick={() => onCancel(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-xs text-rose-700 disabled:opacity-60">
      <XCircle size={14}/> إلغاء
    </button>
  );
}

function AsyncExportJobActions({ job, busy, onDownload, onRetry, onCancel }: AsyncExportJobRowProps) {
  const actionProps: AsyncExportJobActionProps = {
    job,
    isBusy: busy === job.job_id,
    onDownload,
    onRetry,
    onCancel,
  };
  return (
    <div className="flex flex-wrap gap-2">
      <AsyncExportDownloadAction {...actionProps} />
      <AsyncExportRetryAction {...actionProps} />
      <AsyncExportCancelAction {...actionProps} />
    </div>
  );
}

function AsyncExportJobActionCell({ job, busy, onDownload, onRetry, onCancel }: AsyncExportJobRowProps) {
  return (
    <td className="px-4 py-3">
      <AsyncExportJobActions job={job} busy={busy} onDownload={onDownload} onRetry={onRetry} onCancel={onCancel} />
    </td>
  );
}

function AsyncExportJobRow({ job, busy, onDownload, onRetry, onCancel }: AsyncExportJobRowProps) {
  return (
    <tr>
      <td className="px-4 py-3">
        <span className={"inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " + styles[job.status]}>{labels[job.status]}</span>
        {job.error_message && <p className="mt-1 max-w-64 text-xs text-rose-700">{job.error_message}</p>}
      </td>
      <td className="px-4 py-3 tabular-nums">{job.row_count ?? "—"}</td>
      <td className="px-4 py-3 tabular-nums">{size(job.byte_size)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{time(job.created_at)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{time(job.expires_at)}</td>
      <AsyncExportJobActionCell job={job} busy={busy} onDownload={onDownload} onRetry={onRetry} onCancel={onCancel} />
    </tr>
  );
}

export function AsyncExportCenter() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobs, setJobs] = useState<AsyncExportJobState[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState('');
  const keyRef = useRef<string | null>(null);
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setLoadError('');
    try {
      const latestJobs = await listMyAsyncExportJobs(30);
      setJobs(latestJobs);
      setLoadError('');
    } catch (e) {
      // Never leave an older job snapshot visible as if it were the current server state.
      setJobs([]);
      const message = e instanceof Error ? e.message : "تعذر تحديث سجل التصدير.";
      setLoadError(message);
      setNotice({ kind: "error", text: message });
    } finally {
      setLoading(false);
      locked.current = false;
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const active = jobs.some((j) => ["queued", "processing", "retry"].includes(j.status));
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || to < from) { setNotice({ kind: "error", text: "حدد تاريخين صالحين بحيث لا يسبق تاريخ النهاية تاريخ البداية." }); return; }
    setSubmitting(true); setNotice(null);
    const key = keyRef.current ?? exportJobIdempotencyKey();
    keyRef.current = key;
    try {
      const result = await requestAsyncOrdersCsvExport({ date_from: from, date_to: to }, key);
      if (result.workerAccepted) keyRef.current = null;
      setNotice({
        kind: result.workerAccepted ? "success" : "info",
        text: result.workerAccepted ? "تم حفظ الطلب وإرساله إلى العامل." : "تم حفظ الطلب، لكن العامل لم يؤكد الاستلام. أعد المحاولة من السجل دون إنشاء طلب جديد.",
      });
      await refresh();
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : "تعذر إنشاء طلب التصدير." }); }
    finally { setSubmitting(false); }
  }
  async function retry(job: AsyncExportJobState) {
    setBusy(job.job_id);
    try {
      const accepted = await triggerAsyncExportWorker(job.job_id);
      setNotice({ kind: accepted ? "success" : "info", text: accepted ? "أُرسل الطلب الحالي إلى العامل." : "لم يطالب العامل بهذا الطلب الآن؛ قد تكون مهلة إعادة المحاولة سارية." });
      await refresh();
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : "تعذرت إعادة تنبيه العامل." }); }
    finally { setBusy(null); }
  }
  async function cancel(job: AsyncExportJobState) {
    setBusy(job.job_id);
    try {
      const result = await cancelMyAsyncExportJob(job.job_id);
      setNotice({ kind: result.cancelled ? "success" : "info", text: result.cancelled ? "تم إلغاء الطلب." : "الحالة الحالية: " + (labels[result.status as AsyncExportJobState["status"]] ?? result.status) });
      await refresh();
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : "تعذر إلغاء الطلب." }); }
    finally { setBusy(null); }
  }
  async function download(job: AsyncExportJobState) {
    setBusy(job.job_id);
    try {
      const link = await getMyAsyncExportDownload(job.job_id);
      window.location.assign(link.url);
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : "تعذر إنشاء رابط التنزيل." }); }
    finally { setBusy(null); }
  }

  return <main dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold tracking-wide text-primary">مركز البيانات والتقارير</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">تصدير الطلبات غير المتزامن</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">إنشاء CSV للطلبات المعتمدة مع عزل المؤسسة والمنفّذ، وإعادة محاولة محدودة، ورابط تنزيل مؤقت.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> تحديث السجل</button>
    </header>
    {notice && <div role="status" aria-live="polite" className={"rounded-xl border p-4 text-sm " + (notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900")}>{notice.text}</div>}
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet size={20}/></span>
        <div><h2 className="font-semibold text-foreground">طلب تصدير جديد</h2><p className="mt-0.5 text-xs text-muted-foreground">الحدود: 1000 طلب، 10000 بند، 25 ميجابايت، واحتفاظ سبعة أيام.</p></div>
      </div>
      <form onSubmit={create} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium">من تاريخ<input type="date" required value={from} onChange={(e) => { setFrom(e.target.value); keyRef.current = null; }} className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5"/></label>
        <label className="block text-sm font-medium">إلى تاريخ<input type="date" required value={to} onChange={(e) => { setTo(e.target.value); keyRef.current = null; }} className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5"/></label>
        <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{submitting ? <RefreshCw size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>} {submitting ? "جارٍ إرسال الطلب…" : "إنشاء ملف CSV"}</button>
      </form>
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">سجل طلباتي</h2><p className="text-xs text-muted-foreground">تحديث تلقائي كل 5 ثوانٍ أثناء المعالجة.</p></div><span className="rounded-full bg-muted px-3 py-1 text-sm tabular-nums">{jobs.length} طلب</span></div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="min-w-[760px] w-full text-right text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-3">الحالة</th><th scope="col" className="px-4 py-3">عدد البنود</th><th scope="col" className="px-4 py-3">الحجم</th><th scope="col" className="px-4 py-3">تاريخ الطلب</th><th scope="col" className="px-4 py-3">الصلاحية</th><th scope="col" className="px-4 py-3">الإجراء</th></tr></thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => (
            <AsyncExportJobRow
              key={job.job_id}
              job={job}
              busy={busy}
              onDownload={download}
              onRetry={retry}
              onCancel={cancel}
            />
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center" role={loadError ? "alert" : "status"}>
                {loading ? "جارٍ تحميل السجل…" : loadError ? "تعذر تأكيد حالة سجل التصدير. اضغط «تحديث السجل» لإعادة المحاولة؛ لم تُعرض بيانات قديمة." : "لا توجد طلبات تصدير حتى الآن"}
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
      <p className="text-xs leading-5 text-muted-foreground">تُنظَّف الملفات بعد انتهاء صلاحيتها. رابط التنزيل موقّع لمدة 60 ثانية فقط ولا يفتح الوصول العام.</p>
    </section>
  </main>;
}
