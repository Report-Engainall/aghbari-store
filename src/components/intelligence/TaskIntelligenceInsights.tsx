import type { TaskIntelligenceReport } from "@/lib/intelligence/task-intelligence-reports";
import { buildTaskIntelligenceInsights, type TaskInsight } from "@/lib/intelligence/task-intelligence-insights";

function number(value:number):string{return value.toLocaleString("ar-YE",{maximumFractionDigits:2});}
function display(insight:TaskInsight):string{
  if(insight.value===null)return "غير متاح";
  if(insight.valueKind==="LABEL")return String(insight.value);
  if(insight.valueKind==="PERCENT")return number(insight.value as number)+"٪";
  if(insight.valueKind==="MINUTES")return number(insight.value as number)+" دقيقة";
  return number(insight.value as number);
}
function stateLabel(state:TaskInsight["state"]):string{
  return state==="EMPTY"?"لا توجد حالات":state==="WITHHELD"?"غير محسوب":state==="PARTIAL"?"جزئي":"من المصدر";
}
function Card({item}:{item:TaskInsight}){
  const border=item.severity==="CRITICAL"?"border-destructive/50":item.severity==="WARNING"?"border-amber-500/40":"";
  return <article className={"min-w-0 rounded-lg border p-3 "+border}>
    <div className="flex items-start justify-between gap-2">
      <h5 className="text-sm font-semibold">{item.title}</h5>
      <span className="shrink-0 rounded border px-2 py-0.5 text-[10px] text-muted-foreground">{stateLabel(item.state)}</span>
    </div>
    <p className="mt-2 break-words text-xl font-semibold tabular-nums" dir="auto">{display(item)}</p>
    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
    <p className="mt-2 text-xs"><strong>الخطوة التالية:</strong> {item.nextStep}</p>
  </article>;
}
export function TaskIntelligenceInsights({report}:{report:TaskIntelligenceReport}){
  const insights=buildTaskIntelligenceInsights(report);
  return <section dir="rtl" aria-label="مؤشرات القرار التشغيلي للمهام" className="space-y-3 rounded-lg border p-3">
    <header>
      <h4 className="font-semibold">مؤشرات القرار التشغيلي</h4>
      <p className="mt-1 text-xs text-muted-foreground">15 مؤشراً مشتقاً من لقطة المهام المصرح بها. الأرقام وصفية ولا تغيّر الإسناد أو الأولوية أو حالة المهمة.</p>
    </header>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {insights.map(item=><Card key={item.key} item={item}/>)}
    </div>
  </section>;
}
