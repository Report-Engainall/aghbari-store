import type { OperationalTask, OperationalTaskAssignee } from "@/lib/types";

export interface OperationalTaskAttentionItem {
  task: OperationalTask;
  whyNow: string;
  nextStep: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function urgencyFor(dueAt: string | null, now: number): { band: number; reason: string; dueTime: number } {
  const dueTime = dueAt ? Date.parse(dueAt) : Number.NaN;
  if (!Number.isFinite(dueTime)) {
    return { band: 0, reason: "لا يوجد موعد استحقاق صالح مثبت في المصدر", dueTime: Number.POSITIVE_INFINITY };
  }
  const remaining = dueTime - now;
  if (remaining < 0) {
    return { band: 5, reason: "متأخرة — تجاوزت موعد الاستحقاق المسجل", dueTime };
  }
  if (remaining <= DAY_MS) {
    return { band: 4, reason: "موعد الاستحقاق خلال 24 ساعة", dueTime };
  }
  if (remaining <= 3 * DAY_MS) {
    return { band: 3, reason: "موعد الاستحقاق خلال ثلاثة أيام", dueTime };
  }
  if (remaining <= 7 * DAY_MS) {
    return { band: 2, reason: "موعد الاستحقاق خلال سبعة أيام", dueTime };
  }
  return { band: 0, reason: "موعد مسجل بعد سبعة أيام", dueTime };
}

/**
 * Deterministic role-scoped triage.
 * It only ranks persisted open-task fields; it never infers business impact
 * or creates/updates a task.
 */
export function prioritizeOperationalTasks(
  tasks: readonly OperationalTask[],
  now = Date.now(),
  limit = 5,
): OperationalTaskAttentionItem[] {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const safeLimit = Number.isInteger(limit) ? Math.min(7, Math.max(3, limit)) : 5;

  return tasks
    .filter((task) => task.status === "pending" || task.status === "in_progress")
    .map((task) => {
      const urgency = urgencyFor(task.due_at, safeNow);
      const priority = PRIORITY_WEIGHT[task.priority] ?? 0;
      const activeWork = task.status === "in_progress" ? 1 : 0;
      const createdAt = Date.parse(task.created_at);
      const order = urgency.band * 100 + priority * 10 + activeWork;
      const priorityReason = task.priority === "critical"
        ? "أولوية حرجة"
        : task.priority === "high"
          ? "أولوية مرتفعة"
          : task.priority === "medium"
            ? "أولوية متوسطة"
            : task.priority === "low"
              ? "أولوية منخفضة"
              : "الأولوية غير مصنفة";
      return {
        task,
        order,
        dueTime: urgency.dueTime,
        createdTime: Number.isFinite(createdAt) ? createdAt : Number.POSITIVE_INFINITY,
        whyNow: urgency.band > 0 ? urgency.reason + " · " + priorityReason : priorityReason + " · " + urgency.reason,
        nextStep: task.status === "in_progress" ? "استكمل العمل وسجّل النتيجة" : "استلم المهمة لبدء التنفيذ",
      };
    })
    .sort((a, b) =>
      b.order - a.order ||
      a.dueTime - b.dueTime ||
      a.createdTime - b.createdTime ||
      a.task.id.localeCompare(b.task.id),
    )
    .slice(0, safeLimit)
    .map(({ task, whyNow, nextStep }) => ({ task, whyNow, nextStep }));
}


export interface OperationalTaskAssigneeSuggestion {
  assignee: OperationalTaskAssignee;
  openTaskCount: number;
  overdueTaskCount: number;
  weightedLoad: number;
}

/**
 * Suggests the eligible staff member with the lightest visible open workload.
 * Weight: one point per open task, +3 critical, +2 high, +1 medium,
 * and +2 when its persisted due date is overdue. A manager must confirm.
 */
export function suggestOperationalTaskAssignee(
  tasks: readonly OperationalTask[],
  eligibleAssignees: readonly OperationalTaskAssignee[],
  now = Date.now(),
): OperationalTaskAssigneeSuggestion | null {
  if (eligibleAssignees.length === 0) return null;
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const priorityExtra: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

  const ranked = eligibleAssignees.map((assignee) => {
    const openTasks = tasks.filter((task) =>
      task.assigned_to === assignee.profile_id &&
      (task.status === "pending" || task.status === "in_progress"),
    );
    const overdueTaskCount = openTasks.filter((task) => {
      const due = task.due_at ? Date.parse(task.due_at) : Number.NaN;
      return Number.isFinite(due) && due < safeNow;
    }).length;
    const weightedLoad = openTasks.reduce((total, task) => {
      const base = 1 + (priorityExtra[task.priority] ?? 0);
      const due = task.due_at ? Date.parse(task.due_at) : Number.NaN;
      return total + base + (Number.isFinite(due) && due < safeNow ? 2 : 0);
    }, 0);
    return { assignee, openTaskCount: openTasks.length, overdueTaskCount, weightedLoad };
  });

  ranked.sort((a, b) =>
    a.weightedLoad - b.weightedLoad ||
    a.openTaskCount - b.openTaskCount ||
    a.overdueTaskCount - b.overdueTaskCount ||
    a.assignee.full_name.localeCompare(b.assignee.full_name, "ar"),
  );
  return ranked[0] ?? null;
}
