export type ProcessBottleneckKey = "ORDERS" | "QUOTES" | "PURCHASE" | "INVOICES" | "TASKS";
export type ProcessWaitClass =
  | "MIXED_OR_UNATTRIBUTED" | "INTERNAL_RESPONSE" | "INTERNAL_DRAFT_REVIEW"
  | "MIXED_SUPPLIER_RECEIVING" | "EXTERNAL_CUSTOMER_SETTLEMENT" | "INTERNAL_QUEUE_AND_WORK";
export type ProcessWindow = "CURRENT" | "BASELINE";

export interface ProcessBottleneckPeriod { from: string; to: string; timeZone: "UTC"; }
export interface ProcessBottleneckMetric {
  window: ProcessWindow; processKey: ProcessBottleneckKey; stageKey: string;
  waitClass: ProcessWaitClass; sampleCount: number;
  averageMinutes: number; medianMinutes: number; p90Minutes: number;
  firstCompletedAt: string; lastCompletedAt: string;
}
export interface ProcessBottleneckQueue {
  processKey: ProcessBottleneckKey; openCount: number;
  oldestOpenedAt: string | null; oldestAgeMinutes: number | null; asOf: string;
}
export interface ProcessBottleneckCoverage {
  key: ProcessBottleneckKey; status: "VERIFIED" | "UNAVAILABLE";
  source: string; asOf: string | null; period: ProcessBottleneckPeriod | null;
  sampleCount: number | null; completePopulation: boolean; message: string;
}
export interface ProcessBottleneckSnapshot {
  asOf: string; period: ProcessBottleneckPeriod; baselinePeriod: ProcessBottleneckPeriod | null;
  metrics: ProcessBottleneckMetric[]; queues: ProcessBottleneckQueue[];
  sourceCoverage: ProcessBottleneckCoverage[]; reopenedTasks: number | null;
}
export interface ProcessBottleneckComparison {
  processKey: ProcessBottleneckKey; stageKey: string;
  currentMedianMinutes: number; baselineMedianMinutes: number;
  changeMinutes: number; changePercent: number | null; note: string;
}
export interface ProcessBottleneckFinding {
  processKey: ProcessBottleneckKey; stageKey: string; waitClass: ProcessWaitClass;
  sampleCount: number; averageMinutes: number; medianMinutes: number; p90Minutes: number;
  recommendation: string;
}
export interface ProcessBottleneckResult {
  state: "READY" | "PARTIAL" | "UNAVAILABLE"; asOf: string;
  period: ProcessBottleneckPeriod; baselinePeriod: ProcessBottleneckPeriod | null;
  findings: ProcessBottleneckFinding[]; comparisons: ProcessBottleneckComparison[];
  queues: ProcessBottleneckQueue[]; sourceCoverage: ProcessBottleneckCoverage[];
  reopenedTasks: number | null; withheldReasons: string[];
}
const PROCESS_KEYS = new Set<ProcessBottleneckKey>(["ORDERS","QUOTES","PURCHASE","INVOICES","TASKS"]);
const WAIT_CLASSES = new Set<ProcessWaitClass>([
  "MIXED_OR_UNATTRIBUTED","INTERNAL_RESPONSE","INTERNAL_DRAFT_REVIEW",
  "MIXED_SUPPLIER_RECEIVING","EXTERNAL_CUSTOMER_SETTLEMENT","INTERNAL_QUEUE_AND_WORK",
]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type R = Record<string, unknown>;
function rec(v: unknown): R | null { return v !== null && typeof v === "object" && !Array.isArray(v) ? v as R : null; }
function day(v: unknown): v is string {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v;
}
function ts(v: unknown): v is string { return typeof v === "string" && v.includes("T") && Number.isFinite(Date.parse(v)); }
function text(v: unknown, max=180): v is string { return typeof v === "string" && v.length > 0 && v.length <= max; }
function int(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function num(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v) && v >= 0; }
function parsePeriod(v: unknown): ProcessBottleneckPeriod | null {
  const r=rec(v);
  return r && day(r.from) && day(r.to) && r.from <= r.to && r.timeZone === "UTC"
    ? {from:r.from,to:r.to,timeZone:"UTC"} : null;
}
function parseMetric(v: unknown): ProcessBottleneckMetric | null {
  const r=rec(v);
  if (!r || (r.window!=="CURRENT" && r.window!=="BASELINE") ||
      typeof r.processKey!=="string" || !PROCESS_KEYS.has(r.processKey as ProcessBottleneckKey) ||
      typeof r.waitClass!=="string" || !WAIT_CLASSES.has(r.waitClass as ProcessWaitClass) ||
      !text(r.stageKey) || !int(r.sampleCount) || r.sampleCount<1 ||
      !num(r.averageMinutes) || !num(r.medianMinutes) || !num(r.p90Minutes) ||
      r.p90Minutes<r.medianMinutes ||
      !ts(r.firstCompletedAt) || !ts(r.lastCompletedAt) ||
      Date.parse(r.firstCompletedAt)>Date.parse(r.lastCompletedAt)) return null;
  return {
    window:r.window, processKey:r.processKey as ProcessBottleneckKey, stageKey:r.stageKey,
    waitClass:r.waitClass as ProcessWaitClass, sampleCount:r.sampleCount,
    averageMinutes:r.averageMinutes, medianMinutes:r.medianMinutes, p90Minutes:r.p90Minutes,
    firstCompletedAt:r.firstCompletedAt, lastCompletedAt:r.lastCompletedAt,
  };
}
function parseQueue(v: unknown, asOf: string): ProcessBottleneckQueue | null {
  const r=rec(v);
  if (!r || typeof r.processKey!=="string" || !PROCESS_KEYS.has(r.processKey as ProcessBottleneckKey) ||
      !int(r.openCount) || (r.oldestOpenedAt!==null && !ts(r.oldestOpenedAt)) ||
      (r.oldestAgeMinutes!==null && !num(r.oldestAgeMinutes)) || r.asOf!==asOf ||
      (r.openCount===0 && (r.oldestOpenedAt!==null || r.oldestAgeMinutes!==null)) ||
      (r.openCount>0 && (r.oldestOpenedAt===null || r.oldestAgeMinutes===null))) return null;
  if (r.openCount>0) {
    const openedAt=Date.parse(r.oldestOpenedAt as string);
    const measuredAt=Date.parse(asOf);
    const suppliedAge=r.oldestAgeMinutes as number;
    if (!Number.isFinite(openedAt) || openedAt>measuredAt) return null;
    const expectedAge=Math.round(((measuredAt-openedAt)/60000)*100)/100;
    if (!Number.isFinite(expectedAge) || Math.abs(expectedAge-suppliedAge)>0.01) return null;
  }
  return {
    processKey:r.processKey as ProcessBottleneckKey, openCount:r.openCount,
    oldestOpenedAt:r.oldestOpenedAt as string|null, oldestAgeMinutes:r.oldestAgeMinutes as number|null, asOf,
  };
}
function parseCoverage(v: unknown, asOf: string, period: ProcessBottleneckPeriod): ProcessBottleneckCoverage | null {
  const r=rec(v);
  if (!r || typeof r.key!=="string" || !PROCESS_KEYS.has(r.key as ProcessBottleneckKey) ||
      (r.status!=="VERIFIED" && r.status!=="UNAVAILABLE") || !text(r.source) ||
      !text(r.message,500) || typeof r.completePopulation!=="boolean" ||
      (r.sampleCount!==null && !int(r.sampleCount))) return null;
  const coveragePeriod=r.status==="VERIFIED" ? parsePeriod(r.period) : null;
  if (r.status==="VERIFIED" &&
      (r.asOf!==asOf || !coveragePeriod || coveragePeriod.from!==period.from ||
       coveragePeriod.to!==period.to || coveragePeriod.timeZone!==period.timeZone ||
       r.sampleCount===null || !r.completePopulation)) return null;
  if (r.status==="UNAVAILABLE" &&
      (r.asOf!==null || r.period!==null || r.sampleCount!==null || r.completePopulation)) return null;
  return {
    key:r.key as ProcessBottleneckKey, status:r.status, source:r.source,
    asOf:r.asOf as string|null, period:r.period as ProcessBottleneckPeriod|null,
    sampleCount:r.sampleCount as number|null, completePopulation:r.completePopulation, message:r.message,
  };
}
export function parseProcessBottleneckSnapshot(v: unknown): ProcessBottleneckSnapshot | null {
  const r=rec(v);
  if (!r || !ts(r.asOf) || !Array.isArray(r.metrics) || !Array.isArray(r.queues) ||
      !Array.isArray(r.sourceCoverage) || (r.reopenedTasks!==null && !int(r.reopenedTasks))) return null;
  const period=parsePeriod(r.period);
  const baselinePeriod=r.baselinePeriod===null ? null : parsePeriod(r.baselinePeriod);
  if (!period || (r.baselinePeriod!==null && !baselinePeriod)) return null;
  const metrics=r.metrics.map(parseMetric);
  const queues=r.queues.map(x=>parseQueue(x,r.asOf as string));
  const coverage=r.sourceCoverage.map(x=>parseCoverage(x,r.asOf as string,period));
  if (metrics.some(x=>x===null) || queues.some(x=>x===null) || coverage.some(x=>x===null)) return null;
  const q=queues as ProcessBottleneckQueue[], c=coverage as ProcessBottleneckCoverage[], m=metrics as ProcessBottleneckMetric[];
  const metricIdentity=(x:ProcessBottleneckMetric)=>x.window+":"+x.processKey+":"+x.stageKey+":"+x.waitClass;
  if (new Set(m.map(metricIdentity)).size!==m.length) return null;
  const withinPeriod=(x:ProcessBottleneckMetric):boolean=>{
    const target=x.window==="CURRENT"?period:baselinePeriod;
    if(!target) return false;
    const start=Date.parse(target.from+"T00:00:00.000Z");
    const end=Date.parse(target.to+"T00:00:00.000Z")+24*60*60*1000;
    const first=Date.parse(x.firstCompletedAt),last=Date.parse(x.lastCompletedAt);
    return Number.isFinite(start)&&Number.isFinite(end)&&first>=start&&last<end;
  };
  if(m.some(x=>!withinPeriod(x))) return null;
  if (new Set(q.map(x=>x.processKey)).size!==q.length ||
      new Set(c.map(x=>x.key)).size!==c.length || c.length!==PROCESS_KEYS.size ||
      m.some(x=>x.window==="BASELINE" && !baselinePeriod)) return null;
  return {asOf:r.asOf,period,baselinePeriod,metrics:m,queues:q,sourceCoverage:c,reopenedTasks:r.reopenedTasks as number|null};
}
function recommend(m: ProcessBottleneckMetric): string {
  switch(m.processKey) {
    case "ORDERS": return "راجع انتقالات هذه المرحلة وحقول التحقق المبكر وتوزيع قائمة الانتظار؛ الزمن المرصود لا يثبت سبباً منفرداً.";
    case "QUOTES": return "راجع اكتمال طلب التسعير والقوالب والحقول التي تعيد الطلب للمراجعة قبل إصدار العرض.";
    case "PURCHASE": return m.waitClass==="INTERNAL_DRAFT_REVIEW"
      ? "راجع زمن مراجعة واعتماد مسودة الشراء وقائمة الموافقات."
      : "راجع موعد التوريد ونافذة الاستلام وتنسيق المورد والمستودع؛ الفترة مختلطة ولا تنسب التأخير لطرف واحد.";
    case "INVOICES": return "راجع الفواتير المستحقة وشروط السداد وطريقة التحصيل مع إبقاء أي إجراء مالي ضمن مسار الاعتماد.";
    case "TASKS": return "راجع حجم التكليف وتوزيع الأدوار وأسباب إعادة الفتح؛ الزمن يشمل الانتظار والتنفيذ ولا يقيس سرعة الموظف منفرداً.";
  }
}
function periodLengthDays(period: ProcessBottleneckPeriod): number {
  const from = Date.parse(period.from + "T00:00:00.000Z");
  const to = Date.parse(period.to + "T00:00:00.000Z");
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

function comparableBeforeAfterPeriods(
  current: ProcessBottleneckPeriod,
  baseline: ProcessBottleneckPeriod | null,
): baseline is ProcessBottleneckPeriod {
  return Boolean(
    baseline &&
    baseline.timeZone === current.timeZone &&
    baseline.to < current.from &&
    periodLengthDays(baseline) === periodLengthDays(current)
  );
}

export function buildProcessBottlenecks(s: ProcessBottleneckSnapshot): ProcessBottleneckResult {
  const verified=new Set(s.sourceCoverage.filter(x=>x.status==="VERIFIED" && x.completePopulation).map(x=>x.key));
  const comparablePeriods = comparableBeforeAfterPeriods(s.period, s.baselinePeriod);
  const withheld = s.sourceCoverage.filter(x=>x.status==="UNAVAILABLE").map(x=>x.message);
  const findings=s.metrics.filter(m=>m.window==="CURRENT" && verified.has(m.processKey) && m.sampleCount>=3)
    .map(m=>({
      processKey:m.processKey,stageKey:m.stageKey,waitClass:m.waitClass,sampleCount:m.sampleCount,
      averageMinutes:m.averageMinutes,medianMinutes:m.medianMinutes,p90Minutes:m.p90Minutes,recommendation:recommend(m),
    }))
    .sort((a,b)=>b.medianMinutes-a.medianMinutes || b.p90Minutes-a.p90Minutes || a.processKey.localeCompare(b.processKey))
    .slice(0,8);
  const stageIdentity=(m:ProcessBottleneckMetric)=>m.processKey+":"+m.stageKey+":"+m.waitClass;
  const prior=new Map(s.metrics.filter(m=>m.window==="BASELINE" && verified.has(m.processKey))
    .map(m=>[stageIdentity(m),m]));
  const currentStages=new Map(s.metrics.filter(m=>m.window==="CURRENT" && verified.has(m.processKey))
    .map(m=>[stageIdentity(m),m]));
  const comparisons: ProcessBottleneckComparison[]=[];
  if(comparablePeriods) {
    for(const m of currentStages.values()) {
      const identity=stageIdentity(m);
      if(m.sampleCount<3) {
        withheld.push("مقارنة المرحلة "+m.processKey+"/"+m.stageKey+" محجوبة: عينة الفترة الحالية أقل من 3 (n="+m.sampleCount+").");
        continue;
      }
      const old=prior.get(identity);
      if(!old) {
        withheld.push("لم تُرصد المرحلة "+m.processKey+"/"+m.stageKey+" في فترة الأساس؛ لم تُعامل كقيمة صفرية.");
        continue;
      }
      if(old.sampleCount<3) {
        withheld.push("مقارنة المرحلة "+m.processKey+"/"+m.stageKey+" محجوبة: عينة فترة الأساس أقل من 3 (n="+old.sampleCount+").");
        continue;
      }
      const diff=m.medianMinutes-old.medianMinutes;
      comparisons.push({
        processKey:m.processKey,stageKey:m.stageKey,currentMedianMinutes:m.medianMinutes,
        baselineMedianMinutes:old.medianMinutes,changeMinutes:diff,
        changePercent:old.medianMinutes>0 ? Math.round(diff/old.medianMinutes*10000)/100 : null,
        note:"مقارنة وصفية لفترتين متساويتين؛ لا تثبت أن تغييراً واحداً سبب الفرق.",
      });
    }
    for(const old of prior.values()) if(!currentStages.has(stageIdentity(old))) {
      withheld.push("لم تُرصد المرحلة "+old.processKey+"/"+old.stageKey+" في الفترة الحالية؛ لم تُعامل كقيمة صفرية.");
    }
  }
  const available=s.sourceCoverage.filter(x=>x.status==="VERIFIED").length;
  const state=available===0 ? "UNAVAILABLE" : available===PROCESS_KEYS.size ? "READY" : "PARTIAL";
  for(const m of s.metrics.filter(x=>x.window==="CURRENT" && verified.has(x.processKey) && x.sampleCount<3))
    withheld.push("عينة "+m.processKey+"/"+m.stageKey+" لا تكفي لاعتبار المرحلة اختناقاً (n="+m.sampleCount+").");
  if(s.baselinePeriod && !comparablePeriods)
    withheld.push("فترة الأساس يجب أن تسبق الفترة الحالية وأن تطابقها في عدد الأيام؛ حُجبت المقارنة.");
  else if(s.baselinePeriod && comparisons.length===0)
    withheld.push("لا توجد مراحل مشتركة بعينة كافية في الفترتين للمقارنة.");
  return {
    state,asOf:s.asOf,period:s.period,baselinePeriod:s.baselinePeriod,findings,
    comparisons:comparisons.sort((a,b)=>Math.abs(b.changeMinutes)-Math.abs(a.changeMinutes)),
    queues:s.queues,sourceCoverage:s.sourceCoverage,reopenedTasks:s.reopenedTasks,
    withheldReasons:[...new Set(withheld)],
  };
}
