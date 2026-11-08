import { supabase } from "@/lib/supabase";

export type OnyxReconciliationWarehouse = {
  id: string;
  name: string;
  code: string | null;
};

export type OnyxReconciliationCommand = {
  command_id: string;
  snapshot_id: string;
  warehouse_id: string;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  status: "previewed" | "applied" | "rolled_back" | "cancelled";
  reason?: string;
  source_row_count: number;
  adjusted_lines: number;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
  idempotent_replay?: boolean;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("أعاد الخادم " + label + " غير صالح.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("الحقل " + label + " مفقود من استجابة الخادم.");
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("الحقل " + label + " غير صالح.");
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("العدد " + label + " غير صالح في استجابة الخادم.");
  }
  return value;
}

function command(value: unknown): OnyxReconciliationCommand {
  const row = record(value, "أمر مصالحة Onyx");
  const status = text(row.status, "status");
  if (!["previewed", "applied", "rolled_back", "cancelled"].includes(status)) {
    throw new Error("حالة أمر المصالحة غير معروفة.");
  }
  return {
    command_id: text(row.command_id, "command_id"),
    snapshot_id: text(row.snapshot_id, "snapshot_id"),
    warehouse_id: text(row.warehouse_id, "warehouse_id"),
    warehouse_name: nullableText(row.warehouse_name, "warehouse_name"),
    warehouse_code: nullableText(row.warehouse_code, "warehouse_code"),
    status: status as OnyxReconciliationCommand["status"],
    reason: typeof row.reason === "string" ? row.reason : undefined,
    source_row_count: count(row.source_row_count, "source_row_count"),
    adjusted_lines: count(row.adjusted_lines, "adjusted_lines"),
    created_at: text(row.created_at, "created_at"),
    applied_at: nullableText(row.applied_at, "applied_at"),
    rolled_back_at: nullableText(row.rolled_back_at, "rolled_back_at"),
    idempotent_replay: row.idempotent_replay === true,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function getOnyxReconciliationWarehouses(): Promise<OnyxReconciliationWarehouse[]> {
  const data = await rpc("get_onyx_reconciliation_warehouses", {});
  if (!Array.isArray(data)) throw new Error("قائمة مخازن المصالحة غير صالحة.");
  return data.map((value) => {
    const row = record(value, "مخزن المصالحة");
    const id = text(row.id, "warehouse.id");
    const name = text(row.name, "warehouse.name");
    const code = nullableText(row.code, "warehouse.code");
    return { id, name, code };
  });
}

export async function listOnyxReconciliationCommands(snapshotId: string): Promise<OnyxReconciliationCommand[]> {
  const data = await rpc("list_onyx_inventory_reconciliation_commands", { p_snapshot_id: snapshotId });
  if (!Array.isArray(data)) throw new Error("سجل أوامر مصالحة Onyx غير صالح.");
  return data.map(command);
}

export async function previewOnyxInventoryReconciliation(input: {
  snapshotId: string;
  warehouseId: string;
  idempotencyKey: string;
  reason: string;
}): Promise<OnyxReconciliationCommand> {
  return command(await rpc("preview_onyx_inventory_reconciliation", {
    p_snapshot_id: input.snapshotId,
    p_warehouse_id: input.warehouseId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
  }));
}

export async function applyOnyxInventoryReconciliation(commandId: string, idempotencyKey: string): Promise<OnyxReconciliationCommand> {
  return command(await rpc("apply_onyx_inventory_reconciliation", {
    p_command_id: commandId,
    p_idempotency_key: idempotencyKey,
  }));
}

export async function rollbackOnyxInventoryReconciliation(input: {
  commandId: string;
  idempotencyKey: string;
  reason: string;
}): Promise<OnyxReconciliationCommand> {
  return command(await rpc("rollback_onyx_inventory_reconciliation", {
    p_command_id: input.commandId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
  }));
}
