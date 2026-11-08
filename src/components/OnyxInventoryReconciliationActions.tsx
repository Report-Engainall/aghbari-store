import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, LoaderCircle, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import "./OnyxInventoryReconciliationActions.css";
import {
  applyOnyxInventoryReconciliation,
  getOnyxReconciliationWarehouses,
  listOnyxReconciliationCommands,
  previewOnyxInventoryReconciliation,
  rollbackOnyxInventoryReconciliation,
  type OnyxReconciliationCommand,
  type OnyxReconciliationWarehouse,
} from "@/lib/onyx-inventory-reconciliation";

function key(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  throw new Error("تعذر توليد مفتاح idempotency آمن في هذا المتصفح.");
}

const statusLabels: Record<OnyxReconciliationCommand["status"], string> = {
  previewed: "معاينة جاهزة",
  applied: "تم التطبيق",
  rolled_back: "تم التراجع التعويضي",
  cancelled: "ملغاة",
};


function renderOnyxWarehouseOptions(warehouses: OnyxReconciliationWarehouse[]) {
  return warehouses.map((warehouse) => (
    <option key={warehouse.id} value={warehouse.id}>
      {warehouse.name}{warehouse.code ? " — " + warehouse.code : ""}
    </option>
  ));
}

function renderOnyxCommandOptions(commands: OnyxReconciliationCommand[]) {
  return commands.map((item) => (
    <option key={item.command_id} value={item.command_id}>
      {statusLabels[item.status]} — {item.warehouse_name || item.warehouse_code || item.warehouse_id.slice(0, 8)} — {item.source_row_count} صفًا — {new Date(item.created_at).toLocaleString("ar-YE")}
    </option>
  ));
}

function OnyxCommandSummary({ command }: { command: OnyxReconciliationCommand }) {
  return (
    <div className="onyx-command-summary" role="status">
      <div><span>الحالة</span><strong>{statusLabels[command.status]}</strong></div>
      <div><span>الصفوف المثبتة</span><strong>{command.source_row_count}</strong></div>
      <div><span>الحركات التي غيّرت الرصيد</span><strong>{command.adjusted_lines}</strong></div>
      <div><span>معرّف الأمر</span><code>{command.command_id}</code></div>
      {command.reason && <p>السبب: {command.reason}</p>}
    </div>
  );
}

function OnyxApplyPreviewButton({ busy, onApply }: { busy: boolean; onApply: () => void }) {
  return (
    <button type="button" className="btn primary" onClick={onApply} disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
      {busy ? "جارٍ التحقق والقفل والتطبيق الذري…" : "2. اعتماد المعاينة وتطبيق الكميات"}
    </button>
  );
}

function OnyxRollbackControls({ reason, onReasonChange, busy, onRollback }: {
  reason: string; onReasonChange: (value: string) => void; busy: boolean; onRollback: () => void;
}) {
  return (
    <div className="onyx-rollback-controls">
      <label>سبب التراجع التعويضي<input value={reason} onChange={(event) => onReasonChange(event.target.value)} maxLength={1000} disabled={busy} /></label>
      <button type="button" className="btn outline" onClick={onRollback} disabled={busy || !reason.trim()}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
        {busy ? "جارٍ فحص الحركات اللاحقة…" : "3. تنفيذ تراجع تعويضي آمن"}
      </button>
    </div>
  );
}

export function OnyxInventoryReconciliationActions({ snapshotId }: { snapshotId: string }) {
  const [warehouses, setWarehouses] = useState<OnyxReconciliationWarehouse[]>([]);
  const [commands, setCommands] = useState<OnyxReconciliationCommand[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [commandId, setCommandId] = useState("");
  const [reason, setReason] = useState("مطابقة كمية المخزون مع لقطة Onyx المعتمدة");
  const [rollbackReason, setRollbackReason] = useState("تراجع تعويضي عن مصالحة Onyx");
  const [previewKey, setPreviewKey] = useState("");
  const [applyKey, setApplyKey] = useState("");
  const [rollbackKey, setRollbackKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "apply" | "rollback">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const activeCommand = useMemo(
    () => commands.find((item) => item.command_id === commandId) ?? null,
    [commands, commandId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      getOnyxReconciliationWarehouses(),
      listOnyxReconciliationCommands(snapshotId),
    ]).then(([nextWarehouses, nextCommands]) => {
      if (!active) return;
      setWarehouses(nextWarehouses);
      setCommands(nextCommands);
      setWarehouseId((current) => nextWarehouses.some((item) => item.id === current)
        ? current : nextWarehouses[0]?.id ?? "");
      setCommandId((current) => nextCommands.some((item) => item.command_id === current)
        ? current : nextCommands[0]?.command_id ?? "");
    }).catch((cause: unknown) => {
      if (!active) return;
      setWarehouses([]);
      setCommands([]);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل صلاحيات المخازن وسجل المصالحة.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [snapshotId, refreshKey]);

  function selectCommand(nextId: string) {
    setCommandId(nextId);
    const selected = commands.find((item) => item.command_id === nextId);
    if (selected?.warehouse_id) setWarehouseId(selected.warehouse_id);
    setApplyKey("");
    setRollbackKey("");
    setNotice("");
  }

  async function createPreview() {
    if (!warehouseId || !reason.trim()) {
      setError("اختر مخزنًا واكتب سبب المصالحة قبل إنشاء المعاينة.");
      return;
    }
    setBusy("preview");
    setError("");
    setNotice("");
    const requestKey = previewKey || key();
    setPreviewKey(requestKey);
    try {
      const result = await previewOnyxInventoryReconciliation({
        snapshotId,
        warehouseId,
        idempotencyKey: requestKey,
        reason: reason.trim(),
      });
      setCommandId(result.command_id);
      setNotice("حُفظت المعاينة للصفوف المثبتة النطاق فقط. لم يتغير أي رصيد مخزون.");
      setPreviewKey("");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فشل إنشاء معاينة المصالحة.");
    } finally {
      setBusy("");
    }
  }

  async function applyPreview() {
    if (!activeCommand || activeCommand.status !== "previewed") return;
    setBusy("apply");
    setError("");
    setNotice("");
    const requestKey = applyKey || key();
    setApplyKey(requestKey);
    try {
      await applyOnyxInventoryReconciliation(activeCommand.command_id, requestKey);
      setNotice("تم التطبيق ذريًا مع تسجيل حركات المخزون والتدقيق. أعد تحميل السجل للتحقق من الحالة.");
      setApplyKey("");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "رفض الخادم تطبيق المصالحة.");
    } finally {
      setBusy("");
    }
  }

  async function rollbackApplied() {
    if (!activeCommand || activeCommand.status !== "applied" || !rollbackReason.trim()) return;
    setBusy("rollback");
    setError("");
    setNotice("");
    const requestKey = rollbackKey || key();
    setRollbackKey(requestKey);
    try {
      await rollbackOnyxInventoryReconciliation({
        commandId: activeCommand.command_id,
        idempotencyKey: requestKey,
        reason: rollbackReason.trim(),
      });
      setNotice("سُجل التراجع كحركات تعويضية جديدة؛ لم تُعدّل الحركات السابقة.");
      setRollbackKey("");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "رفض الخادم التراجع حفاظًا على سلامة الحركات اللاحقة.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel onyx-apply-panel" aria-label="تطبيق مصالحة مخزون Onyx">
      <div className="onyx-section-heading">
        <div>
          <h2><Scale size={18} /> تطبيق مصالحة المخزون (بمعاينة وموافقة)</h2>
          <p>هذه عملية كتابة محمية للمسؤول/المدير وليست هي التحليل المقارن الموجود أعلاه. تُرفض اللقطة غير المحددة لمخزن واحد.</p>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>

      <div className="onyx-apply-safety">
        <span><Database size={15} /> مصدر Onyx محفوظ</span>
        <span><Clock3 size={15} /> يتحقق الخادم من حداثة الكميات والحجوزات والحركات</span>
        <span><RotateCcw size={15} /> التراجع تعويضي ولا يمحو التاريخ</span>
      </div>

      {error && <div className="onyx-alert" role="alert"><AlertTriangle size={17} /> {error}</div>}
      {notice && <div className="onyx-alert compact" role="status"><CheckCircle2 size={17} /> {notice}</div>}
      {loading ? (
        <p role="status"><LoaderCircle className="spin" size={16} /> جارٍ تحميل المخازن وسجل الأوامر…</p>
      ) : (
        <>
          <div className="onyx-apply-fields">
            <label>
              المخزن المستهدف
              <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={busy !== "" || warehouses.length === 0}>
                {warehouses.length === 0 && <option value="">لا توجد مخازن نشطة متاحة</option>}
                {renderOnyxWarehouseOptions(warehouses)}
              </select>
            </label>
            <label>
              سبب المصالحة
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={busy !== ""} />
            </label>
          </div>
          <button type="button" className="btn primary" onClick={() => void createPreview()} disabled={!warehouseId || !reason.trim() || busy !== ""}>
            {busy === "preview" ? <LoaderCircle className="spin" size={16} /> : <Scale size={16} />}
            {busy === "preview" ? "جارٍ التحقق وإنشاء المعاينة…" : "1. معاينة المخزون دون تعديل"}
          </button>

          {commands.length > 0 && (
            <div className="onyx-apply-history">
              <label>
                أوامر المصالحة المحفوظة لهذه اللقطة
                <select value={activeCommand?.command_id ?? ""} onChange={(event) => selectCommand(event.target.value)} disabled={busy !== ""}>
                  {renderOnyxCommandOptions(commands)}
                </select>
              </label>
              {activeCommand && <OnyxCommandSummary command={activeCommand} />}
            </div>
          )}

          {activeCommand?.status === "previewed" && <OnyxApplyPreviewButton busy={busy !== ""} onApply={() => void applyPreview()} />}

          {activeCommand?.status === "applied" && <OnyxRollbackControls reason={rollbackReason} onReasonChange={setRollbackReason} busy={busy !== ""} onRollback={() => void rollbackApplied()} />}

          <p className="onyx-apply-footnote">شروط التنفيذ: صلاحية مسؤول/مدير من المؤسسة نفسها، لقطة مخزون جاهزة ومقيدة بمخزن واحد، أكواد أصناف غير مكررة، أرصدة وحجوزات لم تتغير منذ المعاينة. أي تعارض يرفض الأمر كله دون تطبيق جزئي.</p>
        </>
      )}
    </section>
  );
}
