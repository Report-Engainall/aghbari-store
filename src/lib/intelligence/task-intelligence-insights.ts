import type { TaskIntelligenceReport, TaskIntelligenceRole, TaskIntelligenceRoleSummary, TaskIntelligenceSourceSummary } from "./task-intelligence-reports";

export type TaskInsightState = "READY" | "EMPTY" | "PARTIAL" | "WITHHELD";
export type TaskInsightValueKind = "COUNT" | "PERCENT" | "MINUTES" | "LABEL";
export interface TaskInsight {
  key: string;
  title: string;
  value: number | string | null;
  valueKind: TaskInsightValueKind;
  state: TaskInsightState;
  severity: "INFO" | "WARNING" | "CRITICAL";
  detail: string;
  nextStep: string;
}
const ROLE: Record<TaskIntelligenceRole,string> = {
  sales:"المبيعات",accountant:"المحاسبة والتحصيل",warehouse:"المخازن",
  purchasing:"المشتريات",management:"الإدارة",operations:"العمليات"
};
const sum=(values:number[]):number|null=>{let total=0;for(const value of values){if(!Number.isSafeInteger(total+value))return null;total+=value;}return total;};
function count(key:string,title:string,value:number|null,detail:string,nextStep:string,warning=false):TaskInsight {
  return {key,title,value,valueKind:"COUNT",state:value===null?"WITHHELD":value===0?"EMPTY":"READY",
    severity:warning&&value!==null&&value>0?"WARNING":"INFO",detail,nextStep};
}
function roleMax(rows:TaskIntelligenceRoleSummary[],field:"openCount"|"overdueOpenCount") {
  return [...rows].filter(r=>r[field]>0).sort((a,b)=>b[field]-a[field]||a.taskRole.localeCompare(b.taskRole))[0]??null;
}
function sourceMax(rows:TaskIntelligenceSourceSummary[]) {
  return [...rows].filter(r=>r.resolvedTaskCount>=3&&r.reopenRatePercent!==null)
    .sort((a,b)=>(b.reopenRatePercent??-1)-(a.reopenRatePercent??-1)||a.sourceKey.localeCompare(b.sourceKey))[0]??null;
}
export function buildTaskIntelligenceInsights(report:TaskIntelligenceReport):TaskInsight[] {
  const roles=report.roleSummaries;
  const created=sum(roles.map(r=>r.newCount));
  const completed=sum(roles.map(r=>r.completedCount));
  const open=sum(roles.map(r=>r.openCount));
  const overdue=sum(roles.map(r=>r.overdueOpenCount));
  const high=sum(roles.map(r=>r.highImpactOpenCount));
  const reopened=sum(roles.map(r=>r.reopenedEventCount));
  const overdueShare=open!==null&&overdue!==null&&open>0&&overdue<=open
    ?Math.round((overdue/open)*10000)/100:null;
  const rows:TaskInsight[]=[
    count("NEW_TASKS","المهام المنشأة خلال الفترة",created,"سجلات أنشئت داخل الفترة؛ لا تُعد إعادة الفتح إنشاءً جديداً.","راجع توزيع مصادر الإنشاء حسب الدور."),
    count("FIRST_COMPLETIONS","المهام المكتملة لأول مرة",completed,"أول انتقال موثق إلى completed لكل مهمة.","اربط العدد بجودة الإكمال وإعادة الفتح، لا بعدد الإغلاقات وحده."),
    count("OPEN_BACKLOG","الرصيد المفتوح حالياً",open,"سجلات pending وin_progress عند وقت لقطة المصدر.","راجع قائمة العمل الحالية وتبعياتها."),
    count("OVERDUE_OPEN","المهام المفتوحة المتأخرة",overdue,"مهمة نشطة لها due_at أسبق من asOf؛ الغياب لا يعني التأخر.","راجع الاستحقاق والسجل المصدر قبل التصعيد.",true),
    {key:"OVERDUE_SHARE",title:"نسبة التأخر من الرصيد المفتوح",
      value:overdueShare,valueKind:"PERCENT",
      state:overdueShare===null?"WITHHELD":"READY",severity:overdue!==null&&overdue>0?"WARNING":"INFO",
      detail:open!==null&&open>0?"المعادلة: المتأخرة ÷ المفتوحة × 100.":"لا يوجد مقام مفتوح صالح لحساب النسبة.",
      nextStep:"اقرأ النسبة مع حجم الرصيد واختلاف نطاق كل دور."},
    count("HIGH_PRIORITY_OPEN","المهام المفتوحة عالية أو حرجة",high,"أولوية high أو critical مسجلة؛ لا تمثل قيمة مالية.","راجع الدليل التشغيلي لكل حالة قبل التدخل.",true),
  ];
  const topOpen=roleMax(roles,"openCount"),topLate=roleMax(roles,"overdueOpenCount");
  rows.push(
    {key:"TOP_OPEN_ROLE",title:"أعلى دور في عدد المهام المفتوحة",value:topOpen?ROLE[topOpen.taskRole]:null,valueKind:"LABEL",
      state:topOpen?"READY":"EMPTY",severity:"INFO",detail:topOpen?topOpen.openCount+" مهمة؛ هذا عدد مطلق لا قياس لحمل الموظفين.":"لا توجد مهام مفتوحة.",
      nextStep:"راجع الأولوية والتبعيات قبل إعادة التوزيع."},
    {key:"TOP_OVERDUE_ROLE",title:"أعلى دور في عدد المهام المتأخرة",value:topLate?ROLE[topLate.taskRole]:null,valueKind:"LABEL",
      state:topLate?"READY":"EMPTY",severity:topLate?"WARNING":"INFO",detail:topLate?topLate.overdueOpenCount+" مهمة متأخرة باستحقاق مثبت.":"لا توجد مهام متأخرة.",
      nextStep:"راجع التواريخ والسجلات؛ لا ينسب العدد سبب التأخر لموظف."}
  );
  const slowest=[...roles].filter(r=>r.resolvedTaskCount>=3&&r.averageResolutionMinutes!==null)
    .sort((a,b)=>(b.averageResolutionMinutes??-1)-(a.averageResolutionMinutes??-1))[0];
  rows.push(slowest?{
    key:"SLOWEST_RESOLUTION_ROLE",title:"أعلى متوسط زمن حل بين الأدوار",value:slowest.averageResolutionMinutes,valueKind:"MINUTES",
    state:"READY",severity:"INFO",detail:ROLE[slowest.taskRole]+"؛ عينة "+slowest.resolvedTaskCount+" إكمالات، بحد أدنى 3.",
    nextStep:"راجع مسار الإجراء والانتظار غير المسجل؛ لا تنسب الزمن إلى موظف."
  }:{
    key:"SLOWEST_RESOLUTION_ROLE",title:"أعلى متوسط زمن حل بين الأدوار",value:null,valueKind:"MINUTES",
    state:"WITHHELD",severity:"INFO",detail:"لا توجد عينة من 3 إكمالات على الأقل بمتوسط صالح.",
    nextStep:"يُحجب الترتيب حتى تتوافر عينة مؤهلة."
  });
  const hotspot=sourceMax(report.sourceBreakdown);
  rows.push(hotspot?{
    key:"SOURCE_REOPEN_HOTSPOT",title:"أعلى معدل إعادة فتح حسب المصدر",value:hotspot.reopenRatePercent,valueKind:"PERCENT",
    state:"READY",severity:"WARNING",detail:hotspot.sourceKey+" · "+ROLE[hotspot.taskRole]+" · "+hotspot.priority+" · عينة "+hotspot.resolvedTaskCount+".",
    nextStep:"راجع تعريف الإنجاز ودليل الإغلاق لهذا المصدر."
  }:{
    key:"SOURCE_REOPEN_HOTSPOT",title:"أعلى معدل إعادة فتح حسب المصدر",value:null,valueKind:"PERCENT",
    state:"WITHHELD",severity:"INFO",detail:"لا توجد مجموعة مصدر بعينة مؤهلة من 3 إكمالات ومعدل صالح.",
    nextStep:"يُحجب الترتيب حتى تتوافر عينة مؤهلة."
  });
  rows.push(count("REOPENED_EVENTS","أحداث إعادة الفتح المرصودة",reopened,"انتقالات موثقة من completed إلى pending أو in_progress.","راجع أسباب إعادة الفتح وجودة توثيق الإكمال.",true));

  const manager=report.reportKind==="MANAGER"&&report.scope.managerViewAvailable;
  const full=manager&&report.scope.managerRiskCompletePopulation&&
    report.scope.managerRiskReturnedCount===report.scope.managerRiskTotalCount&&
    report.managerRisks.length===report.scope.managerRiskReturnedCount;
  const riskRows=report.managerRisks;
  const riskDetail=full?"كامل مجتمع المخاطر العالية والحرجة.":"من أعلى السجلات المعادة فقط؛ قد توجد سجلات أخرى خارج الصفحة.";
  const riskState=(value:number)=>full?(value===0?"EMPTY":"READY"):"PARTIAL";
  const protectedCount=(key:string,title:string,value:number|null,detail:string,nextStep:string):TaskInsight=>({
    key,title,value,valueKind:"COUNT",state:manager?(value===null?"WITHHELD":value===0?"EMPTY":"READY"):"WITHHELD",
    severity:value!==null&&value>0?"WARNING":"INFO",detail,nextStep
  });
  rows.push(
    protectedCount("MANAGER_HIGH_RISK_TOTAL","إجمالي المخاطر الإدارية العالية والحرجة",
      manager?report.scope.managerRiskTotalCount:null,"عدّ إجمالي مستقل من الخادم؛ التفاصيل محدودة بـ25.",
      "راجع المخاطر حسب الأولوية والاستحقاق قبل التدخل."),
    {...protectedCount("MANAGER_OVERDUE_RISKS","المخاطر الإدارية المتأخرة",
      manager?riskRows.filter(r=>r.isOverdue).length:null,riskDetail,
      "راجع الاستحقاق والسجل المصدر قبل التصعيد."),
      state:manager?riskState(riskRows.filter(r=>r.isOverdue).length):"WITHHELD"},
    {...protectedCount("MANAGER_UNASSIGNED_RISKS","مخاطر بلا مسؤول مسجل",
      manager?riskRows.filter(r=>r.assignedProfileId===null).length:null,riskDetail,
      "راجع تعيين مالك مخول؛ لا يتم الإسناد تلقائياً."),
      state:manager?riskState(riskRows.filter(r=>r.assignedProfileId===null).length):"WITHHELD"},
    {...protectedCount("MANAGER_48H_RISKS","مخاطر مفتوحة بعمر 48 ساعة فأكثر",
      manager?riskRows.filter(r=>r.ageMinutes>=2880).length:null,riskDetail,
      "راجع التبعيات؛ العمر لا يثبت سبب التأخير."),
      state:manager?riskState(riskRows.filter(r=>r.ageMinutes>=2880).length):"WITHHELD"}
  );
  if(!manager){
    for(const item of rows.slice(-4)){item.value=null;item.state="WITHHELD";item.detail="هذا المؤشر محجوب خارج تقرير مخاطر الإدارة.";item.nextStep="يتطلب صلاحية تقرير الإدارة.";}
  }else{
    for(const item of rows.slice(-3)){ if(!full)item.state="PARTIAL"; }
  }
  return rows;
}
