import type { OperationalTask, OperationalTaskRole } from '@/lib/types';
import { BUSINESS_BRAND_NAME } from '@/lib/brand';

type HasTaskRole = { id: string; task_role: OperationalTaskRole };
export type TaskPrintScope = OperationalTaskRole | 'all' | 'filtered' | 'selected';

/** Canonical title used by the printable operational task register. */
export function operationalTaskPrintTitle(): string {
  return BUSINESS_BRAND_NAME + ' — كشف المهام التشغيلية';
}

/**
 * Selects tasks from rows already filtered by status, priority, assignee, dates and search.
 * The caller supplies the role-filtered screen rows for "filtered"; the permission check remains
 * an additional UI boundary and PostgreSQL/RLS remains authoritative.
 */
export function filterTasksForPrint<T extends HasTaskRole>(
  tasks: readonly T[],
  scope: TaskPrintScope,
  allowedRoles: readonly OperationalTaskRole[],
  currentlyDisplayedTasks: readonly T[] = tasks,
  selectedTaskIds: ReadonlySet<string> = new Set(),
): T[] {
  if (scope === 'filtered') {
    return currentlyDisplayedTasks.filter((task) => allowedRoles.includes(task.task_role));
  }
  if (scope === 'selected') {
    return tasks.filter((task) => allowedRoles.includes(task.task_role) && selectedTaskIds.has(task.id));
  }
  if (scope !== 'all' && !allowedRoles.includes(scope)) return [];
  return tasks.filter((task) =>
    allowedRoles.includes(task.task_role) && (scope === 'all' || task.task_role === scope),
  );
}


/**
 * Projects an authorized task into the exact data contract permitted in a printable register.
 * Keep tenant, source, assignment and internal workflow identifiers out of rendered documents.
 */
export type OperationalTaskPrintRow = Pick<
  OperationalTask,
  | 'id'
  | 'title'
  | 'description'
  | 'task_role'
  | 'priority'
  | 'status'
  | 'due_at'
  | 'source_entity_type'
  | 'created_at'
  | 'completed_at'
  | 'resolution_note'
> & { assigned_label: string };

export function projectOperationalTaskPrintRow(
  task: OperationalTask,
  assignedLabel: string,
): OperationalTaskPrintRow {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    task_role: task.task_role,
    priority: task.priority,
    status: task.status,
    due_at: task.due_at,
    source_entity_type: task.source_entity_type,
    created_at: task.created_at,
    completed_at: task.completed_at,
    resolution_note: task.resolution_note,
    assigned_label: assignedLabel,
  };
}
