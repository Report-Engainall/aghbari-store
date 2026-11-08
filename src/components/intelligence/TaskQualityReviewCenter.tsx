import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchOperationalTaskQualityMetrics } from "@/lib/intelligence/task-quality-reviews-client";
import type { TaskQualityMetrics } from "@/lib/intelligence/task-quality-reviews";
import { TaskQualityReviewMetrics } from "./TaskQualityReviewMetrics";

export interface TaskQualityReviewCenterProps {
  refreshToken?: number;
}

export function TaskQualityReviewCenter({ refreshToken = 0 }: TaskQualityReviewCenterProps) {
  const [quality, setQuality] = useState<TaskQualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    const result = await fetchOperationalTaskQualityMetrics();
    if (generation !== requestGeneration.current) return;
    setQuality(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load, refreshToken]);

  return (
    <section className="panel space-y-3" dir="rtl" aria-labelledby="task-quality-center-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="task-quality-center-heading" className="text-lg font-semibold">مركز مراجعة جودة المهام</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مؤشرات مبنية على أحدث مراجعة محفوظة لكل مهمة ونوع تقييم. لا تغيّر المراجعات حالة المهمة ولا تنفذ الإجراء نيابة عن المسؤول.
          </p>
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void load()}
          disabled={loading}
          aria-label="تحديث مؤشرات جودة المهام"
        >
          <RefreshCw size={16} aria-hidden="true" />
          تحديث المؤشرات
        </button>
      </header>
      {loading && quality === null ? (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          جارٍ تحميل مؤشرات الجودة من المصدر المعتمد…
        </p>
      ) : null}
      {quality ? <TaskQualityReviewMetrics quality={quality} /> : null}
      {loading && quality !== null ? (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          جارٍ تحديث المؤشرات؛ تبقى آخر نتيجة معروضة حتى وصول استجابة المصدر.
        </p>
      ) : null}
    </section>
  );
}
