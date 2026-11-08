import {buildTaskQualityInsights} from "@/lib/intelligence/task-quality-insights";
import type {TaskQualityInsight,TaskQualityInsightState} from "@/lib/intelligence/task-quality-insights";
import type {TaskQualityMetrics} from "@/lib/intelligence/task-quality-reviews";
function stateLabel(s:TaskQualityInsightState):string{
 switch(s){case"READY":return"من المصدر";case"LOW_SAMPLE":return"عينة محدودة";case"EMPTY":return"لا توجد حالة";case"WITHHELD":return"محجوب";case"RESTRICTED":return"صلاحية مطلوبة";case"UNAVAILABLE":return"غير متاح";}
}
function InsightCard({item}:{item:TaskQualityInsight}){
 return <article className="min-w-0 rounded-lg border p-3" aria-label={item.title}>
  <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="text-sm font-semibold">{item.title}</h5><span className="rounded border px-2 py-0.5 text-[10px] text-muted-foreground">{stateLabel(item.state)}</span></div>
  <p className="mt-2 break-words text-lg font-semibold tabular-nums" dir="auto">{item.value}</p>
  <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
  <p className="mt-2 text-xs">{item.interpretation}</p>
  <p className="mt-2 text-xs"><strong>مراجعة موصى بها:</strong> {item.nextStep}</p>
 </article>;
}
export function TaskQualityInsightsPanel({quality}:{quality:TaskQualityMetrics}){
 const insights=buildTaskQualityInsights(quality);
 return <section dir="rtl" className="space-y-3 rounded-lg border p-3" aria-label="استنتاجات جودة المهام والتوصيات">
  <header><h4 className="font-semibold">استنتاجات جودة المهام</h4><p className="mt-1 text-xs text-muted-foreground">ست قراءات وصفية من نفس المصدر المصرح به. لا توجد درجة كلية مصطنعة، ولا استنتاج سببي أو تغيير تلقائي للمهمة أو التوصية.</p></header>
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{insights.map(item=><InsightCard key={item.key} item={item}/>)}</div>
 </section>;
}
