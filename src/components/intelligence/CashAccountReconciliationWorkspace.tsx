import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createBankStatement,
  fetchBankMatchCandidates,
  fetchCashReconciliationWorkspace,
  finalizeBankStatementReconciliation,
  matchBankStatementLine,
  recordBankStatementLine,
  reviewCashOpeningBalance,
  submitCashOpeningBalance,
  uploadCashAccountEvidence,
  voidBankStatement,
  type BankMatchCandidate,
  type CashAccountEvidence,
  type CashEvidenceKind,
  type CashReconciliationWorkspace,
} from "@/lib/finance-cash-account-reconciliation";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value: string, currency: string) => value + " " + currency;
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "تعذر تنفيذ العملية المالية.";

export function CashAccountReconciliationWorkspace() {
  const [workspace, setWorkspace] = useState<CashReconciliationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mappingId, setMappingId] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<CashEvidenceKind>("opening_balance");
  const [file, setFile] = useState<File | null>(null);
  const [openingEvidenceId, setOpeningEvidenceId] = useState("");
  const [openingDate, setOpeningDate] = useState(today());
  const [openingAmount, setOpeningAmount] = useState("");
  const [bankEvidenceId, setBankEvidenceId] = useState("");
  const [statementReference, setStatementReference] = useState("");
  const [statementFrom, setStatementFrom] = useState(today());
  const [statementTo, setStatementTo] = useState(today());
  const [statementOpening, setStatementOpening] = useState("");
  const [statementClosing, setStatementClosing] = useState("");
  const [selectedStatementId, setSelectedStatementId] = useState("");
  const [lineDate, setLineDate] = useState(today());
  const [lineReference, setLineReference] = useState("");
  const [lineDescription, setLineDescription] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [candidates, setCandidates] = useState<Record<string, BankMatchCandidate[]>>({});
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchCashReconciliationWorkspace();
      setWorkspace(next);
      setMappingId((current) => current && next.accounts.some((item) => item.id === current)
        ? current : next.accounts[0]?.id ?? "");
      setSelectedStatementId((current) => current && next.statements.some((item) =>
        item.id === current && !item.isVoided && item.latestRun?.outcome !== "VERIFIED")
        ? current : next.statements.find((item) => !item.isVoided && item.latestRun?.outcome !== "VERIFIED")?.id ?? "");
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedAccount = workspace?.accounts.find((item) => item.id === mappingId) ?? null;
  const openingEvidence = useMemo(
    () => workspace?.evidence.filter((item) => item.mappingId === mappingId &&
      (item.evidenceKind === "opening_balance" || item.evidenceKind === "cash_count")) ?? [],
    [workspace?.evidence, mappingId],
  );
  const bankEvidence = useMemo(
    () => workspace?.evidence.filter((item) => item.mappingId === mappingId && item.evidenceKind === "bank_statement") ?? [],
    [workspace?.evidence, mappingId],
  );
  const selectedStatement = workspace?.statements.find((item) => item.id === selectedStatementId) ?? null;

  async function perform<T>(action: () => Promise<T>, success: string | ((result: T) => string)): Promise<T | undefined> {
    if (busy) return undefined;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      await refresh();
      setNotice(typeof success === "function" ? success(result) : success);
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mappingId || !file) return;
    await perform(async () => {
      const saved = await uploadCashAccountEvidence({ mappingId, evidenceKind, file });
      if (evidenceKind === "bank_statement") setBankEvidenceId(saved.id);
      else setOpeningEvidenceId(saved.id);
      setFile(null);
    }, "تم حفظ المستند الخاص وربطه بحساب المؤسسة.");
  }

  async function submitOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mappingId || !openingEvidenceId || !openingDate || !openingAmount.trim()) return;
    await perform(async () => {
      await submitCashOpeningBalance({
        mappingId,
        evidenceId: openingEvidenceId,
        asOfDate: openingDate,
        openingBalance: openingAmount.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setOpeningAmount("");
      setOpeningEvidenceId("");
    }, "تم تسجيل مقترح الرصيد الافتتاحي؛ ينتظر مراجعة شخص آخر ومطابقة دفتر الأستاذ.");
  }

  async function reviewOpening(proposalId: string, decision: "approved" | "rejected") {
    const reason = window.prompt(decision === "approved" ? "سبب اعتماد الرصيد ومراجعة المستند" : "سبب رفض الرصيد");
    if (!reason || reason.trim().length < 3) return;
    await perform(async () => {
      await reviewCashOpeningBalance({ proposalId, decision, reason: reason.trim() });
    }, decision === "approved" ? "تم اعتماد الرصيد بعد تحقق الخادم من دفتر الأستاذ." : "تم تسجيل رفض الرصيد مع السبب.");
  }

  async function submitStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mappingId || !bankEvidenceId || !statementReference.trim()) return;
    await perform(async () => {
      const id = await createBankStatement({
        mappingId, evidenceId: bankEvidenceId, reference: statementReference.trim(),
        periodFrom: statementFrom, periodTo: statementTo,
        openingBalance: statementOpening.trim(), closingBalance: statementClosing.trim(),
      });
      setSelectedStatementId(id);
      setStatementReference("");
      setBankEvidenceId("");
      setStatementOpening("");
      setStatementClosing("");
    }, "تم تسجيل كشف البنك؛ أضف سطوره ثم طابق كل حركة مع قيد مرحّل.");
  }

  async function addStatementLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStatement || selectedStatement.isVoided || selectedStatement.latestRun?.outcome === "VERIFIED") return;
    await perform(async () => {
      await recordBankStatementLine({
        statementId: selectedStatement.id,
        lineNumber: selectedStatement.lineCount + 1,
        transactionDate: lineDate,
        externalReference: lineReference.trim(),
        description: lineDescription.trim(),
        signedAmount: lineAmount.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setLineReference("");
      setLineDescription("");
      setLineAmount("");
    }, "تم حفظ حركة كشف البنك دون إنشاء قيد محاسبي.");
  }

  async function loadCandidates(statementId: string, lineId: string) {
    const statement = workspace?.statements.find((item) => item.id === statementId);
    if (!statement || statement.isVoided || statement.latestRun?.outcome === "VERIFIED" || busy) return;
    setError("");
    try {
      const found = await fetchBankMatchCandidates(statementId, lineId);
      setCandidates((current) => ({ ...current, [lineId]: found }));
      if (found.length === 1) setSelectedCandidates((current) => ({
        ...current, [lineId]: found[0].journalEntryId + ":" + found[0].journalLineNumber,
      }));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function matchLine(statementId: string, lineId: string) {
    const statement = workspace?.statements.find((item) => item.id === statementId);
    if (!statement || statement.isVoided || statement.latestRun?.outcome === "VERIFIED" || busy) return;
    const selected = selectedCandidates[lineId];
    if (!selected) return;
    const [journalEntryId, lineNumber] = selected.split(":");
    await perform(async () => {
      await matchBankStatementLine({
        statementId, lineId, journalEntryId, journalLineNumber: Number(lineNumber),
      });
      setCandidates((current) => ({ ...current, [lineId]: [] }));
    }, "تم ربط حركة الكشف بقيد الأستاذ المرحّل المطابق.");
  }

  async function finalizeStatement(statementId: string) {
    const statement = workspace?.statements.find((item) => item.id === statementId);
    if (!statement || statement.isVoided || statement.latestRun?.outcome === "VERIFIED" || busy) return;
    const reason = window.prompt("ملاحظة المراجعة وسبب إقفال محاولة المطابقة");
    if (!reason || reason.trim().length < 3) return;
    await perform(async () => await finalizeBankStatementReconciliation({ statementId, reason: reason.trim() }),
      (result) => result && typeof result === "object" && "outcome" in result && result.outcome === "VERIFIED"
        ? "اكتملت المطابقة: رصيد الإقفال يساوي رصيد الافتتاح والحركات، وكل حركات الكشف ودفتر الأستاذ متطابقة."
        : "سُجلت نتيجة NEEDS_REVIEW مع فروق الكشف والأستاذ والسطور غير المطابقة؛ لم يُعتمد الرصيد.");
  }


  async function voidStatement(statementId: string) {
    const statement = workspace?.statements.find((item) => item.id === statementId);
    if (!statement || statement.isVoided || statement.latestRun?.outcome === "VERIFIED" || busy) return;
    const reason = window.prompt("سبب إلغاء كشف البنك (3 أحرف على الأقل)");
    if (!reason || reason.trim().length < 3) return;
    const result = await perform(
      () => voidBankStatement({ statementId, reason: reason.trim() }),
      (value) => value.replayed
        ? "كشف البنك ملغى مسبقاً بالسبب نفسه؛ لم تُكرر عملية الإلغاء."
        : "تم إلغاء كشف البنك مع حفظ السبب والمنفذ والتوقيت. لا يمكن إضافة حركات أو مطابقة هذا الكشف.",
    );
    if (result) {
      setCandidates({});
      setSelectedCandidates({});
    }
  }

  const evidenceLabel = (item: CashAccountEvidence) => item.fileName + " · " + item.evidenceKind + " · " + item.createdAt.slice(0, 10);

  return (
    <section dir="rtl" className="rounded-xl border p-4 space-y-4" aria-label="توثيق الأرصدة ومطابقة كشوف البنوك">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">الأرصدة الافتتاحية ومطابقة كشوف البنوك</h3>
          <p className="text-xs text-muted-foreground">
            الرصيد الافتتاحي لا يعتمد إلا بمراجع مستقل ومساواة دفتر الأستاذ؛ المطابقة لا تنشئ قيوداً أو تعديلات تلقائية.
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={() => void refresh()} disabled={loading || busy}>تحديث</button>
      </header>

      {loading ? <p role="status" className="text-sm">جارٍ تحميل حسابات الصندوق والبنوك...</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p> : null}

      {!loading && workspace && workspace.accounts.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm">لا توجد حسابات صندوق أو بنك مربوطة بدليل الحسابات. أنشئ الربط من إعدادات تسوية الموردين أولاً.</p>
      ) : null}

      {workspace && workspace.accounts.length > 0 ? (
        <>
          <label className="block text-sm">
            الحساب النقدي أو المصرفي
            <select className="mt-1 w-full rounded-md border bg-background p-2" value={mappingId} onChange={(event) => {
              setMappingId(event.target.value);
              setOpeningEvidenceId("");
              setBankEvidenceId("");
            }}>
              {workspace.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName} · {item.accountCode} · {item.settlementKind === "cash" ? "صندوق" : "بنك"} · {item.currency}
                </option>
              ))}
            </select>
          </label>

          {selectedAccount ? (
            <div className="rounded-lg border p-3 text-xs text-muted-foreground">
              الحساب {selectedAccount.accountName} · العملة {selectedAccount.currency}. لا تُحوّل أو تجمع العملات.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <form onSubmit={(event) => void uploadEvidence(event)} className="rounded-lg border p-3 space-y-2">
              <h4 className="font-semibold">1. إرفاق أصل المستند</h4>
              <label className="block text-sm">نوع الإثبات
                <select className="mt-1 w-full rounded-md border bg-background p-2" value={evidenceKind}
                  onChange={(event) => setEvidenceKind(event.target.value as CashEvidenceKind)}>
                  <option value="opening_balance">مستند الرصيد الافتتاحي</option>
                  {selectedAccount?.settlementKind === "cash" ? <option value="cash_count">محضر جرد الصندوق</option> : null}
                  {selectedAccount?.settlementKind === "bank" ? <option value="bank_statement">كشف بنكي</option> : null}
                </select>
              </label>
              <input aria-label="ملف إثبات الرصيد أو كشف البنك" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm" />
              <button className="btn primary" type="submit" disabled={busy || !file || !mappingId}>
                {busy ? "جارٍ الحفظ..." : "رفع المستند وتسجيل بصمته"}
              </button>
              <p className="text-xs text-muted-foreground">PDF أو JPG أو PNG أو WEBP، حتى 10 ميغابايت. الملفات خاصة وغير قابلة للتعديل بعد التسجيل.</p>
            </form>

            <form onSubmit={(event) => void submitOpening(event)} className="rounded-lg border p-3 space-y-2">
              <h4 className="font-semibold">2. تسجيل رصيد افتتاحي موثق</h4>
              <label className="block text-sm">مستند الإثبات
                <select className="mt-1 w-full rounded-md border bg-background p-2" value={openingEvidenceId}
                  onChange={(event) => setOpeningEvidenceId(event.target.value)} required>
                  <option value="">اختر مستند رصيد أو محضر جرد</option>
                  {openingEvidence.map((item) => <option key={item.id} value={item.id}>{evidenceLabel(item)}</option>)}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">تاريخ الرصيد
                  <input type="date" max={today()} className="mt-1 w-full rounded-md border bg-background p-2"
                    value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} required />
                </label>
                <label className="block text-sm">الرصيد ({selectedAccount?.currency ?? ""})
                  <input inputMode="decimal" className="mt-1 w-full rounded-md border bg-background p-2"
                    value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder="مثال: 125000.00" required />
                </label>
              </div>
              <button className="btn primary" type="submit" disabled={busy || !openingEvidenceId || !openingAmount.trim()}>
                تسجيل الرصيد للمراجعة
              </button>
              <p className="text-xs text-muted-foreground">يلزم اعتماد مستخدم آخر. لن يقبل الخادم الاعتماد ما لم يساوِ الرصيد سجل الحساب في دفتر الأستاذ حتى التاريخ المحدد.</p>
            </form>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">طلبات الأرصدة الافتتاحية ومراجعتها</h4>
            {workspace.openingBalances.filter((item) => item.mappingId === mappingId).length === 0
              ? <p className="text-sm text-muted-foreground">لا توجد طلبات أرصدة لهذا الحساب.</p>
              : workspace.openingBalances.filter((item) => item.mappingId === mappingId).map((item) => (
                <article key={item.id} className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{fmt(item.openingBalance, item.currency)} · {item.asOfDate}</strong>
                    <span>{item.reviewDecision === "approved" ? "معتمد" : item.reviewDecision === "rejected" ? "مرفوض" : "بانتظار مراجعة مستقلة"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">المقدم: {item.submittedBy} · المستند: {item.evidenceId} · رصيد الأستاذ عند المراجعة: {item.postedGlBalance ?? "لم تتم المراجعة"} · عدد السطور: {item.postedGlLineCount ?? "—"}</p>
                  {item.reviewReason ? <p className="text-xs">سبب المراجعة: {item.reviewReason}</p> : null}
                  {!item.reviewDecision ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn primary" disabled={busy}
                        onClick={() => void reviewOpening(item.id, "approved")}>اعتماد بعد المراجعة</button>
                      <button type="button" className="btn secondary" disabled={busy}
                        onClick={() => void reviewOpening(item.id, "rejected")}>رفض مع السبب</button>
                    </div>
                  ) : null}
                </article>
              ))}
          </div>

          {selectedAccount?.settlementKind === "bank" ? (
            <>
              <form onSubmit={(event) => void submitStatement(event)} className="rounded-lg border p-3 space-y-3">
                <h4 className="font-semibold">3. تسجيل كشف بنكي</h4>
                <label className="block text-sm">ملف الكشف البنكي
                  <select className="mt-1 w-full rounded-md border bg-background p-2" value={bankEvidenceId}
                    onChange={(event) => setBankEvidenceId(event.target.value)} required>
                    <option value="">اختر كشفاً مرفقاً لهذا الحساب</option>
                    {bankEvidence.map((item) => <option key={item.id} value={item.id}>{evidenceLabel(item)}</option>)}
                  </select>
                </label>
                <label className="block text-sm">مرجع الكشف
                  <input className="mt-1 w-full rounded-md border bg-background p-2" value={statementReference}
                    onChange={(event) => setStatementReference(event.target.value)} minLength={2} maxLength={120} required />
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-sm">من تاريخ
                    <input type="date" className="mt-1 w-full rounded-md border bg-background p-2" value={statementFrom}
                      onChange={(event) => setStatementFrom(event.target.value)} required />
                  </label>
                  <label className="block text-sm">إلى تاريخ
                    <input type="date" className="mt-1 w-full rounded-md border bg-background p-2" value={statementTo}
                      onChange={(event) => setStatementTo(event.target.value)} required />
                  </label>
                  <label className="block text-sm">رصيد بداية الفترة
                    <input inputMode="decimal" className="mt-1 w-full rounded-md border bg-background p-2" value={statementOpening}
                      onChange={(event) => setStatementOpening(event.target.value)} required />
                  </label>
                  <label className="block text-sm">رصيد نهاية الفترة
                    <input inputMode="decimal" className="mt-1 w-full rounded-md border bg-background p-2" value={statementClosing}
                      onChange={(event) => setStatementClosing(event.target.value)} required />
                  </label>
                </div>
                <button className="btn primary" type="submit" disabled={busy || !bankEvidenceId || !statementReference.trim()}>
                  تسجيل الكشف
                </button>
                <p className="text-xs text-muted-foreground">تاريخ بداية الكشف يجب أن يأتي بعد رصيد افتتاحي معتمد بيوم أو بعد كشف سابق تمت مطابقته بالكامل؛ الفترات المتداخلة مرفوضة.</p>
              </form>

              <div className="space-y-3">
                <h4 className="font-semibold">4. سطور الكشف والمطابقة مع دفتر الأستاذ</h4>
                {workspace.statements.filter((item) => item.mappingId === mappingId).length === 0
                  ? <p className="text-sm text-muted-foreground">لا توجد كشوف بنكية مسجلة لهذا الحساب.</p>
                  : workspace.statements.filter((item) => item.mappingId === mappingId).map((statement) => (
                    <article key={statement.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>{statement.statementReference} · {statement.periodFrom} — {statement.periodTo}</strong>
                          <p className="text-xs text-muted-foreground">{statement.lineCount} حركة · {statement.matchedCount} مطابقة · {statement.currency}</p>
                        </div>
                        <span className="text-xs">{statement.isVoided ? "ملغى" : statement.latestRun?.outcome ?? "لم تجر المطابقة"}</span>
                      </div>
                      <p className="text-xs">بداية الكشف: {fmt(statement.openingBalance, statement.currency)} · نهاية الكشف: {fmt(statement.closingBalance, statement.currency)}</p>
                      {statement.isVoided ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs" role="status">
                          <p>أُلغي هذا الكشف. سبب الإلغاء: {statement.voidReason}</p>
                          <p>المنفذ: {statement.voidedBy} · الوقت: {statement.voidedAt}</p>
                          <p>الإلغاء لا يحذف الكشف أو حركاته ولا ينشئ أي قيد محاسبي.</p>
                        </div>
                      ) : null}
                      {statement.latestRun ? (
                        <div className="rounded-md border p-2 text-xs">
                          <p>فرق الكشف: {fmt(statement.latestRun.statementDifference, statement.currency)} · فرق الأستاذ: {fmt(statement.latestRun.ledgerDifference, statement.currency)}</p>
                          <p>حركات كشف غير مطابقة: {statement.latestRun.unmatchedStatementLines} · قيود أستاذ غير مطابقة: {statement.latestRun.unmatchedLedgerLines}</p>
                        </div>
                      ) : null}
                      {!statement.isVoided && statement.latestRun?.outcome !== "VERIFIED" ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="btn secondary" disabled={busy}
                            onClick={() => setSelectedStatementId(statement.id)}>
                            {selectedStatementId === statement.id ? "الكشف المحدد" : "اختيار هذا الكشف لإضافة الحركات"}
                          </button>
                          <button type="button" className="btn secondary" disabled={busy}
                            onClick={() => void voidStatement(statement.id)}>إلغاء الكشف مع السبب</button>
                        </div>
                      ) : null}
                      {statement.lines.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[720px] text-sm">
                            <thead><tr className="border-b text-right text-xs text-muted-foreground">
                              <th className="p-2">#</th><th className="p-2">التاريخ</th><th className="p-2">الوصف/المرجع</th><th className="p-2">المبلغ الموقّع</th><th className="p-2">المطابقة</th><th className="p-2">الإجراء</th>
                            </tr></thead>
                            <tbody>{statement.lines.map((line) => (
                              <tr key={line.id} className="border-b last:border-0">
                                <td className="p-2">{line.lineNumber}</td>
                                <td className="p-2">{line.transactionDate}</td>
                                <td className="p-2">{line.description} {line.externalReference ? "· " + line.externalReference : ""}</td>
                                <td className="p-2">{fmt(line.signedAmount, statement.currency)}</td>
                                <td className="p-2">{line.matchId ? "مطابق مع قيد " + line.journalEntryId : "غير مطابق"}</td>
                                <td className="p-2">
                                  {!line.matchId && !statement.isVoided && statement.latestRun?.outcome !== "VERIFIED" ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      <button type="button" className="btn secondary" onClick={() => void loadCandidates(statement.id, line.id)}>
                                        جلب قيود مطابقة
                                      </button>
                                      {candidates[line.id]?.length ? (
                                        <>
                                          <select aria-label={"قيد دفتر الأستاذ لسطر " + line.lineNumber}
                                            className="max-w-64 rounded-md border bg-background p-1"
                                            value={selectedCandidates[line.id] ?? ""}
                                            onChange={(event) => setSelectedCandidates((current) => ({ ...current, [line.id]: event.target.value }))}>
                                            <option value="">اختر القيد المطابق</option>
                                            {candidates[line.id].map((candidate) => (
                                              <option key={candidate.journalEntryId + ":" + candidate.journalLineNumber}
                                                value={candidate.journalEntryId + ":" + candidate.journalLineNumber}>
                                                #{candidate.entryNumber} · {candidate.entryDate} · {candidate.accountCode} · {candidate.signedAmount}
                                              </option>
                                            ))}
                                          </select>
                                          <button type="button" className="btn primary" disabled={busy || !selectedCandidates[line.id]}
                                            onClick={() => void matchLine(statement.id, line.id)}>مطابقة</button>
                                        </>
                                      ) : candidates[line.id] ? <span className="text-xs text-muted-foreground">لا يوجد قيد مرشح مطابق بالمبلغ والحساب والفترة.</span> : null}
                                    </div>
                                  ) : <span className="text-xs text-muted-foreground">{line.matchId ? "تم الربط" : statement.isVoided ? "موقوف بسبب إلغاء الكشف" : "موقوف بعد اعتماد المطابقة"}</span>}
                                </td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ) : <p className="text-sm text-muted-foreground">أضف حركات الكشف يدوياً وفق المستند الأصلي.</p>}
                      {!statement.isVoided && statement.latestRun?.outcome !== "VERIFIED" ? (
                        <button type="button" className="btn primary" disabled={busy}
                          onClick={() => void finalizeStatement(statement.id)}>احتساب الفروق وإقفال محاولة المطابقة</button>
                      ) : statement.isVoided ? (
                        <p className="text-sm" role="status">الكشف ملغى ومغلق؛ جميع إجراءات الإضافة والمطابقة والإقفال معطلة.</p>
                      ) : <p className="text-sm">تم إقفال هذا الكشف بمطابقة موثقة. لا يقبل تعديلاً لاحقاً.</p>}
                    </article>
                  ))}
              </div>

              {selectedStatement && selectedStatement.mappingId === mappingId &&
               !selectedStatement.isVoided && selectedStatement.latestRun?.outcome !== "VERIFIED" ? (
                <form onSubmit={(event) => void addStatementLine(event)} className="rounded-lg border p-3 space-y-2">
                  <h5 className="font-semibold">إضافة حركة إلى: {selectedStatement.statementReference}</h5>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block text-sm">تاريخ الحركة
                      <input type="date" min={selectedStatement.periodFrom} max={selectedStatement.periodTo}
                        className="mt-1 w-full rounded-md border bg-background p-2" value={lineDate}
                        onChange={(event) => setLineDate(event.target.value)} required />
                    </label>
                    <label className="block text-sm">المرجع البنكي
                      <input className="mt-1 w-full rounded-md border bg-background p-2" value={lineReference}
                        onChange={(event) => setLineReference(event.target.value)} maxLength={160} />
                    </label>
                    <label className="block text-sm">الوصف
                      <input className="mt-1 w-full rounded-md border bg-background p-2" value={lineDescription}
                        onChange={(event) => setLineDescription(event.target.value)} minLength={2} maxLength={500} required />
                    </label>
                    <label className="block text-sm">المبلغ الموقّع ({selectedStatement.currency})
                      <input inputMode="decimal" className="mt-1 w-full rounded-md border bg-background p-2" value={lineAmount}
                        onChange={(event) => setLineAmount(event.target.value)} placeholder="الإيداع + والسحب -" required />
                    </label>
                  </div>
                  <button type="submit" className="btn secondary" disabled={busy}>حفظ حركة الكشف فقط</button>
                  <p className="text-xs text-muted-foreground">الإيداع الموجب = مدين الحساب؛ السحب السالب = دائن الحساب. لا ينشأ قيد GL من سطر الكشف.</p>
                </form>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border p-3 text-sm">مطابقة الكشوف متاحة لحسابات البنك فقط. للصندوق يُسجل محضر جرد ورصيد افتتاحي مستقل، ولا تُعامل عدود الورديات كرصيد خزينة مركزي.</p>
          )}
        </>
      ) : null}

      <footer className="text-xs text-muted-foreground">
        جميع المستندات خاصة ومربوطة بالمؤسسة والحساب. القيود المرشحة يجب أن تكون مرحلة ومتوازنة؛ الفروق لا تُسوّى آلياً. الرصيد المعتمد هو رصيد افتتاحي مؤرخ أو إقفال كشف مطابق، وليس توقعاً للنقد الحالي.
      </footer>
    </section>
  );
}
