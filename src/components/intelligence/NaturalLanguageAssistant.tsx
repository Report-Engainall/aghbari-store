import { useState } from "react";
import { runNaturalLanguageAssistantQuery,type NaturalLanguageAssistantResponse } from "@/lib/intelligence/natural-language-assistant-client";
import type { NaturalLanguageInvoiceMatch,NaturalLanguagePurchaseOrder } from "@/lib/intelligence/natural-language-assistant";

type AssistantResultPayload = Extract<NaturalLanguageAssistantResponse, { status: "RESULT" }>["result"];
function isAssistantResultKind<K extends string>(
  response: NaturalLanguageAssistantResponse | null,
  kind: K,
): response is Extract<NaturalLanguageAssistantResponse, { status: "RESULT" }> & {
  result: Extract<AssistantResultPayload, { kind: K }>;
} {
  return response !== null && response.status === "RESULT" && response.result.kind === kind;
}
import { TaskQualityReviewMetrics } from "./TaskQualityReviewMetrics";
import { TaskIntelligenceInsights } from "./TaskIntelligenceInsights";
import { GrowthOpportunityRadar } from "./GrowthOpportunityRadar";
import { TaskPerformanceScorecard } from "./TaskPerformanceScorecard";
import { BusinessHealthMap } from "./BusinessHealthMap";
import { DecisionMemoryBook } from "./DecisionMemoryBook";
import { DailyDecisionBoard } from "./DailyDecisionBoard";
import { ShiftOperationsCenter } from "./ShiftOperationsCenter";
import { SupplierQuoteComparisonAssistant } from "./SupplierQuoteComparisonAssistant";
import { CustomerQuotePipelineSummary } from "./CustomerQuotePipelineSummary";
import { StartFirstOperationalShiftForm } from "./StartFirstOperationalShiftForm";
import type { TaskIntelligenceManagerRisk, TaskIntelligenceRole } from "@/lib/intelligence/task-intelligence-reports";
export interface NaturalLanguageAssistantProps {onOpenSupplierInvoice?:(invoiceId:string)=>void;onOpenPurchaseOrder?:(purchaseOrderId:string)=>void;}
const qty=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0});
const rate=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:1});
function count(value:number|null):string{return value===null?"غير متاح":qty.format(value);}
function percent(value:number|null):string{return value===null?"غير متاح":rate.format(value)+"%";}
const money=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2});
function collectionsCurrency(amount:number,currency:string):string{return money.format(amount)+" "+currency;}
function taskTitle(intent:"OPEN_TASKS_OVERVIEW"|"REOPENED_TASKS_OVERVIEW"):string {
 return intent==="OPEN_TASKS_OVERVIEW"?"قائمة المهام المفتوحة":"إعادة فتح المهام";
}
function processLabel(key:"ORDERS"|"QUOTES"|"PURCHASE"|"INVOICES"|"TASKS"):string {
 return ({ORDERS:"الطلبات",QUOTES:"عروض الأسعار",PURCHASE:"المشتريات",INVOICES:"الفواتير",TASKS:"المهام"} as const)[key];
}
function waitClassLabel(value:string):string {
 const labels:Record<string,string>={MIXED_OR_UNATTRIBUTED:"انتظار مختلط أو غير منسوب",INTERNAL_RESPONSE:"استجابة داخلية",
  INTERNAL_DRAFT_REVIEW:"مراجعة واعتماد داخلي",MIXED_SUPPLIER_RECEIVING:"استلام مختلط المورد والمستودع",
  EXTERNAL_CUSTOMER_SETTLEMENT:"تسوية من العميل",INTERNAL_QUEUE_AND_WORK:"انتظار وتنفيذ داخلي"};
 return labels[value]??"تصنيف انتظار غير معروف";
}
function duration(value:number):string {
 return value<60?rate.format(value)+" دقيقة":rate.format(value/60)+" ساعة";
}
function inventoryTitle(intent:"DEAD_STOCK_OVERVIEW"|"REPLENISHMENT_OVERVIEW"):string {
 return intent==="REPLENISHMENT_OVERVIEW"?"احتياج إعادة التوريد":"حركة المخزون والركود";
}
function supplierTitle(intent:"SUPPLIER_PERFORMANCE_OVERVIEW"|"SUPPLIER_DELIVERY_ADHERENCE"):string {
 return intent==="SUPPLIER_DELIVERY_ADHERENCE"?"الالتزام بمواعيد التوريد":"ملخص أداء الموردين";
}
function retentionTitle(intent:"CUSTOMER_RETENTION_OVERVIEW"|"CUSTOMER_REPEAT_PURCHASE"|"CUSTOMER_DORMANCY_RISK"):string {
 if(intent==="CUSTOMER_DORMANCY_RISK")return "مخاطر فتور وخمول العملاء";
 if(intent==="CUSTOMER_REPEAT_PURCHASE")return "تكرار الشراء";
 return "ملخص الاحتفاظ بالعملاء";
}
function invoiceStatus(status:NaturalLanguageInvoiceMatch["matchStatus"]):string {
 if(status==="matched")return "مطابقة سعرية ثلاثية";
 if(status==="variance_pending")return "فرق سعر بانتظار المراجعة";
 if(status==="variance_approved")return "فرق سعر معتمد";
 return "فرق سعر مرفوض";
}
function orderStatus(status:NaturalLanguagePurchaseOrder["status"]):string {
 return status==="submitted"?"مرسل بانتظار الاستلام":"مستلم جزئياً";
}
function taskRiskRoleLabel(role:TaskIntelligenceRole):string {
 return ({sales:"المبيعات",accountant:"المحاسبة والتحصيل",warehouse:"المخازن",purchasing:"المشتريات",management:"الإدارة",operations:"العمليات"} as const)[role];
}
function taskRiskWhyNow(risk:TaskIntelligenceManagerRisk,asOf:string):string {
 if(risk.isOverdue)return risk.overdueMinutes===null
  ?"تجاوز موعد الاستحقاق المسجل في المصدر."
  :"تجاوز موعد الاستحقاق المسجل بنحو "+count(Math.round(risk.overdueMinutes))+" دقيقة.";
 const due=risk.dueAt?Date.parse(risk.dueAt):Number.NaN;
 const snapshot=Date.parse(asOf);
 if(Number.isFinite(due)&&Number.isFinite(snapshot)&&due>=snapshot&&due-snapshot<=24*60*60*1000)
  return "موعد الاستحقاق خلال 24 ساعة.";
 return risk.priority==="critical"?"أولوية حرجة ضمن المهام المفتوحة.":"أولوية مرتفعة ضمن المهام المفتوحة.";
}
function taskRiskNextStep(risk:TaskIntelligenceManagerRisk):string {
 if(risk.status==="in_progress")return "راجع آخر تقدم مسجل، وتأكد من توثيق نتيجة التنفيذ في مركز المهام.";
 return risk.assignedProfileId===null
  ?"راجع مرجع المصدر، ثم عيّن مسؤولاً مخولاً أو أبقها في قائمة الدور حتى يستلمها شخص مؤهل."
  :"تحقق من استلام المسؤول للمهمة وتابع موعدها عبر مركز المهام.";
}

export function NaturalLanguageAssistant({onOpenSupplierInvoice,onOpenPurchaseOrder}:NaturalLanguageAssistantProps) {
 const [question,setQuestion]=useState("");const [response,setResponse]=useState<NaturalLanguageAssistantResponse|null>(null);
 const [loading,setLoading]=useState(false);
 async function submit(){
  if(loading||!question.trim())return;setLoading(true);setResponse(null);
  try{setResponse(await runNaturalLanguageAssistantQuery(question));}
  catch{setResponse({status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر التطبيق المصرح به."});}
  finally{setLoading(false);}
 }
 return <section dir="rtl" className="min-w-0 rounded-xl border p-4 space-y-3" aria-labelledby="natural-language-assistant-title">
  <header><h2 id="natural-language-assistant-title" className="text-lg font-semibold">المساعد الإداري</h2>
   <p className="text-xs text-muted-foreground">يستخدم نوايا ومصادر مصرحاً بها. السؤال نفسه لا ينفذ تغييرات؛ أدوات ذاكرة القرار وسير الاعتماد لا تظهر إلا هنا كإجراءات منفصلة، صريحة وخاضعة لصلاحية الخادم.</p></header>
  <form onSubmit={event=>{event.preventDefault();void submit();}} aria-busy={loading} className="flex min-w-0 flex-col gap-2 sm:flex-row">
   <input value={question} onChange={event=>setQuestion(event.target.value)} maxLength={400} aria-label="سؤال إداري"
    placeholder="مثال: ما أوامر الشراء المفتوحة؟" className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"/>
   <button type="submit" disabled={loading||!question.trim()} className="min-h-11 shrink-0 rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">{loading?"جارٍ الاستعلام…":"اسأل"}</button>
  </form>
  <p className="text-xs text-muted-foreground">أمثلة: طلبات العملاء المفتوحة وحالات طلبات البيع، أوامر الشراء المفتوحة، الأوامر بانتظار الاستلام، المستلمة جزئياً، فواتير المورد ذات فروق السعر، ومعدل الاحتفاظ وتكرار الشراء ومخاطر الخمول ورادار فرص النمو المبنية على طلبات العملاء المثبتة، وبطاقة أداء المهام حسب الدور، وملخص حوكمة السياسات التجارية والسياسات التي تغيرت بصمة مصادرها، وأداء الموردين والركود واحتياج إعادة التوريد واختناقات العمليات والتحصيلات المستحقة من فواتير العملاء خلال 7 أو 30 أو 90 يوماً، والمهام المفتوحة وإعادة فتح المهام، والتقرير اليومي أو الأسبوعي أو الشهري للمهام، ومخاطر المهام للإدارة، وملخص القرارات والقرارات قيد المراجعة والقرارات بانتظار التنفيذ والقرارات المؤجلة ودفتر ذاكرة القرارات والتعلم من نتائجها، ومركز الوردية بتاريخ عمل محدد، ومسار عروض أسعار العملاء ومعدل القبول الصريح، ومقارنة عروض الموردين حسب الصنف والكمية والوحدة والعملة مع مؤشرات الأداء الفعلي للتوريد، وجودة المهام والتوصيات والإنذارات بعد المراجعة، وحالات خدمة العملاء المفتوحة، وتأخر أول استجابة، وتجاوز موعد الحل، والحالات غير المسندة. لا يُستنتج التأخير من عمر الأمر أو من تاريخ إنشائه.</p>
  {response?.status==="CLARIFICATION"||response?.status==="UNSUPPORTED"?<div role="status" className="rounded-lg border p-3 text-sm">
   <p>{response.plan.explanation}</p>{response.plan.clarification?<p className="mt-2 font-medium">{response.plan.clarification}</p>:null}</div>:null}
  {response&&(response.status==="DENIED"||response.status==="UNAVAILABLE"||response.status==="NOT_FOUND"||response.status==="ERROR")?<div role="alert" className="rounded-lg border p-3 text-sm">
   {response.status==="DENIED"?"غير مصرح":response.status==="UNAVAILABLE"?"المصدر غير متاح":response.status==="NOT_FOUND"?"لا توجد وردية مطابقة":"تعذر الاستعلام"}: {response.message}</div>:null}
  {response?.status==="NOT_FOUND"&&response.plan.sourceRpc==="fetch_operational_shift_workspace"?
    <StartFirstOperationalShiftForm businessDate={response.plan.businessDate??""} onStarted={()=>void submit()}/>:null}
  {isAssistantResultKind(response,"SALES_ORDER_STATUS")?<section dir="rtl" className="space-y-3 rounded-lg border p-3" aria-label="ملخص طلبات البيع">
   <header className="flex flex-wrap items-center justify-between gap-2">
    <strong>{response.result.intent==="SALES_ORDERS_OPEN"?"الطلبات البيعية المفتوحة":response.result.intent==="SALES_ORDERS_PROCESSING"?"الطلبات قيد المعالجة":response.result.intent==="SALES_ORDERS_SHIPPED"?"الطلبات المشحونة":response.result.intent==="SALES_ORDERS_CANCELLED"?"الطلبات الملغاة":"ملخص حالات طلبات البيع"}</strong>
    <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="EMPTY"?"لا توجد طلبات":response.result.state==="PARTIAL"?"تغطية جزئية":"لقطة كاملة"}</span>
   </header>
   <p className="font-medium">{response.result.answer}</p>
   <p className="text-xs text-muted-foreground">المصدر: fetch_intelligence_sales_order_status_summary · عدد الطلبات: {count(response.result.totalCount)} · كما في {new Date(response.result.asOf).toLocaleString("ar-YE")}</p>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {([
      ["مسودات","draft"],["بانتظار المعالجة","pending"],["مؤكدة","confirmed"],["قيد المعالجة","processing"],
      ["مشحونة","shipped"],["مسلّمة","delivered"],["ملغاة","cancelled"],
    ] as const).map(([label,key])=><article key={key} className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="text-xl tabular-nums">{count(response.result.countsByStatus[key])}</strong>
    </article>)}
    <article className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">إجمالي الحالات غير المعروفة</p>
      <strong className="text-xl tabular-nums">{count(response.result.unknownStatusCount)}</strong>
    </article>
   </div>
   {response.result.intent!=="SALES_ORDERS_OVERVIEW"?<p className="text-xs text-muted-foreground">العدد المطابق للمرشح: {count(response.result.matchingCount)}.</p>:null}
   {!response.result.completePopulation?<p role="status" className="text-xs text-muted-foreground">توجد حالات طلب مخزنة خارج قاموس الحالات المعروف؛ لذلك بقيت النتيجة جزئية ولم تُصنّف تلك الطلبات تخميناً.</p>:null}
   <p className="text-xs text-muted-foreground">هذه قراءة تجميعية للموظف المخول داخل المؤسسة الحالية. لا تعرض أسماء العملاء أو معرفات الطلبات أو المبالغ أو السطور، ولا تنفذ أي تغيير على الطلبات.</p>
  </section>:null}
  {isAssistantResultKind(response,"DECISION_OUTCOMES")?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>{response.result.answer}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="PARTIAL"?"نتيجة جزئية":response.result.state==="EMPTY"?"لا توجد نتائج":"اكتمل نطاق المصدر"}</span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")} · السجلات المفحوصة: {qty.format(response.result.inspectedCount)} من {qty.format(response.result.totalCount)}</p>
   </div>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {([
     ["مقترح","PROPOSED"],["قيد المراجعة","IN_REVIEW"],["معتمد","APPROVED"],["مرفوض","REJECTED"],["مؤجل","DEFERRED"],
     ["مسند","ASSIGNED"],["قيد التنفيذ","EXECUTING"],["بانتظار القياس","EXECUTED"],["تم قياسه","MEASURED"],
    ] as const).map(([label,key])=><article key={key} className="rounded-lg border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="text-xl tabular-nums">{qty.format(response.result.countsByState[key])}</strong>
    </article>)}
   </div>
   <p className="text-xs text-muted-foreground">النتيجة قراءة تجميعية لحالة القرار الحالية وليست سجلاً تاريخياً للأحداث. عند ظهور «نتيجة جزئية» لا تُفسر أعداد الحالات أو عدم العثور على قرارات مطابقة على أنها تغطي كامل السجل. لا يعرض هذا المسار أسماء المسؤولين أو بيانات مالية أو تفاصيل حساسة.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="SUPPLIER_QUOTE_COMPARISON"?<SupplierQuoteComparisonAssistant result={response.result}/>:null}
  {response?.status==="RESULT"&&response.result.kind==="CUSTOMER_QUOTE_PIPELINE"?<CustomerQuotePipelineSummary result={response.result}/>:null}
  {response?.status==="RESULT"&&response.result.kind==="SHIFT_OPERATIONS"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>مركز بدء الوردية والإقفال</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="VERIFIED"?"الأدلة مثبتة":response.result.state==="NEEDS_REVIEW"?"تحتاج مراجعة":response.result.state==="UNVERIFIED"?"غير متحقق":"المصادر غير متاحة"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">تاريخ العمل: {response.result.businessDate} · المنطقة الزمنية: {response.result.result.organizationTimeZone} · آخر قراءة للمصادر: {response.result.asOf} · وردية: {response.result.result.shiftId}</p>
   </div>
   <ShiftOperationsCenter result={response.result.result} state="ready" onRetry={()=>void submit()}/>
   <p className="text-xs text-muted-foreground">هذه قراءة لقرار الافتتاح والإقفال فقط. لا تفتح الوردية ولا تسجل عدّ الصندوق أو التسليم أو إقفالاً مالياً، ولا تنفذ حركة مخزون أو ترحيلاً محاسبياً. المصدر المفقود أو غير المكتمل يبقى ظاهراً كغير متحقق.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="DECISION_MEMORY"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>دفتر ذاكرة القرارات والتعلّم من النتائج</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.memory.totalCount===0?"لا توجد قرارات محفوظة":response.result.state==="VERIFIED"?"نطاق القرارات مكتمل":response.result.state==="PARTIAL"?"نطاق جزئي — راجع التغطية":"الذاكرة غير متاحة"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")} · القرارات المحملة: {qty.format(response.result.memory.loadedCount)} من {qty.format(response.result.memory.totalCount)}</p>
   </div>
   <DailyDecisionBoard result={response.result.memory} onRetry={()=>void submit()}/>
   <DecisionMemoryBook result={response.result.memory} state="ready" onRetry={()=>void submit()}/>
   <p className="text-xs text-muted-foreground">تُستبعد الذاكرة الناقصة والوقائع بلا إثبات والقياسات غير المتوافقة من مسودات مراجعة القواعد. المسودات لا تغيّر قاعدة أو سعرًا أو حد ائتمان أو مخزون؛ أي تعديل لاحق يظل في مسار اعتماد منفصل. يشمل البحث جميع الصفحات التي جرى تحميلها والتحقق منها، بحد أقصى 5,100 قرار. يظل النطاق جزئياً عند تجاوز الحد أو تغير إجمالي المصدر أو عدم ثبات الصفحة الأولى؛ ولا يُعامل غياب السابقة من نطاق غير مكتمل كدليل على عدم وجودها.</p>
  </div>:null}
  {isAssistantResultKind(response,"COMMERCE_POLICY")?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>حوكمة السياسات التجارية</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="PARTIAL"?"سجل جزئي":response.result.state==="EMPTY"?"لا توجد سياسات":"سجل كامل حسب المصدر"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {new Date(response.result.asOf).toLocaleString("ar-YE")} · المعاد للقراءة: {qty.format(response.result.returnedCount)} من {qty.format(response.result.totalCount)}</p>
   </div>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {([
     ["سارية","EFFECTIVE"],["مجدولة","SCHEDULED"],["منتهية","EXPIRED"],["مستبدلة","SUPERSEDED"],
    ] as const).map(([label,key])=><article key={key} className="rounded-lg border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="text-xl tabular-nums">{qty.format(response.result.lifecycleCounts[key])}</strong>
    </article>)}
    <article className="rounded-lg border p-3 text-sm">
     <p className="text-xs text-muted-foreground">بصمة المصدر تغيرت</p>
     <strong className="text-xl tabular-nums">{qty.format(response.result.sourceChangedCount)}</strong>
     <p className="text-xs text-muted-foreground">ضمن السياسات المعادة فقط</p>
    </article>
   </div>
   <p className="text-xs text-muted-foreground">هذا ملخص تجميعي فقط؛ لا يعرض سجلات المصدر أو المالك أو القواعد أو المعرّفات. عند كون السجل جزئياً فالأعداد تخص الصفحة المعادة ولا تمثل إجمالي المؤسسة. تغيير بصمة المصدر إشارة للمراجعة وليس دليلاً منفرداً على مخالفة السياسة.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="TASK_PERFORMANCE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>بطاقة أداء المهام</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="EMPTY"?"لا توجد مهام ضمن النطاق":"لقطة الأدوار المصرّح بها"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {new Date(response.result.scorecard.asOf).toLocaleString("ar-YE")} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")}</p>
   </div>
   <TaskPerformanceScorecard scorecard={response.result.scorecard} state="ready"/>
   <p className="text-xs text-muted-foreground">هذه بطاقة تجميع حسب نوع المهمة والدور المرئي فقط، وليست تقييماً فردياً للموظفين. لا يُستنتج معدل إعادة فتح كامل من سجل جزئي، ولا تُحسب مقارنة موظفين أو نتائج تحسين غير موثقة؛ تبقى المؤشرات المحددة في «غير متاح» محجوبة.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="TASK_QUALITY"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")}</p>
    <p className="mt-1 text-xs text-muted-foreground">تاريخ الاستعلام لا يمثل تاريخ آخر مراجعة؛ المؤشرات محسوبة من أحدث مراجعة محفوظة لكل نوع.</p>
   </div>
   <TaskQualityReviewMetrics quality={response.result.quality}/>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="CUSTOMER_SERVICE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>{response.result.answer}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="EMPTY"?"لا توجد حالات ضمن هذا المؤشر":"ملخص كامل للحالات النشطة"}</span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · وقت القياس الخادمي: {new Date(response.result.asOf).toLocaleString("ar-YE")} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")}</p>
   </div>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">الحالات النشطة</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.openCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">تجاوز موعد أول استجابة</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.responseOverdueCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">تجاوز موعد الحل</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.resolutionOverdueCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">غير مسندة</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.unassignedCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أولوية عاجلة</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.urgentCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أولوية عالية</p><strong className="text-xl tabular-nums">{qty.format(response.result.summary.highCount)}</strong></article>
   </div>
   <p className="text-xs text-muted-foreground">النطاق: جميع الحالات النشطة في المؤسسة الحالية، محسوبة عند وقت خادمي واحد. هذه أعداد مجمعة؛ لا يعيد هذا المسار أسماء العملاء أو أرقام الحالات أو أوصافها أو أسماء الموظفين. قد تتداخل حالات تأخر الاستجابة وتأخر الحل، لذلك لا تُجمع في رقم إجمالي واحد.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="BUSINESS_HEALTH"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>خريطة صحة الأعمال ورأس المال</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مصادر مكتملة":"عرض جزئي — راجع المصادر المحجوبة"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
     <article className="rounded-md border p-2"><strong>المخزون</strong><p>{count(response.result.sources.inventory.returnedProducts)} من {count(response.result.sources.inventory.totalProducts)} منتج</p><p>{response.result.sources.inventory.period.from} — {response.result.sources.inventory.period.to}</p></article>
     <article className="rounded-md border p-2"><strong>التدفق النقدي</strong><p>{response.result.sources.cashflow.status==="READY"?"تم تحميل المصدر":"غير متاح"}</p><p>{response.result.sources.cashflow.status==="READY"?response.result.sources.cashflow.period.from+" — "+response.result.sources.cashflow.period.to:response.result.sources.cashflow.message}</p></article>
     <article className="rounded-md border p-2"><strong>الاحتفاظ بالعملاء</strong><p>{response.result.sources.retention.status==="READY"?(response.result.sources.retention.populationComplete?"مجتمع كامل":"تغطية غير مكتملة"):"غير متاح"}</p><p>{response.result.sources.retention.status==="READY"?response.result.sources.retention.period.from+" — "+response.result.sources.retention.period.to:response.result.sources.retention.message}</p></article>
    </div>
   </div>
   <BusinessHealthMap result={response.result.map} state="ready"/>
   <p className="text-xs text-muted-foreground">هذه قراءة فقط ولا تنفذ ترحيلاً أو تحصيلاً أو شراءً. الأرصدة البنكية والالتزامات لا تُفترض عند غياب المصدر؛ DSO وDPO وCCC وإجمالي رأس المال المعرض تبقى غير محسوبة ما لم تكتمل مدخلاتها وتثبت عدم تداخل مجموعاتها.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PURCHASE_ORDER"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · أوامر مفحوصة: {qty.format(response.result.inspectedOrderCount)}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs"><span>مرسلة: {qty.format(response.result.countsByStatus.submitted)}</span><span>مستلمة جزئياً: {qty.format(response.result.countsByStatus.partially_received)}</span></div></div>
   {response.result.notice?<p className="rounded-lg border p-3 text-xs">{response.result.notice}</p>:null}
   {response.result.orders.map(order=><article key={order.id} className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><strong>أمر {order.number} · {order.supplierName}</strong><span className="text-xs">{orderStatus(order.status)}</span></div>
    <p className="text-xs text-muted-foreground">المخزن: {order.warehouseName} · الإرسال: {order.submittedAt??"لم يسجل"}</p>
    <p className="mt-1 text-xs">سطور الأصناف: {qty.format(order.itemCount)} · سطور الاستلام المتبقية: {qty.format(order.pendingLineCount)}</p>
    {onOpenPurchaseOrder?<button type="button" onClick={()=>onOpenPurchaseOrder(order.id)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs">فتح أمر الشراء</button>:null}
   </article>)}
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="SUPPLIER_INVOICE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOfDate} · مفحوص {qty.format(response.result.inspectedInvoiceCount)} من {qty.format(response.result.totalInvoiceCount)}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs"><span>مطابقة: {qty.format(response.result.countsByStatus.matched)}</span>
     <span>معلّقة: {qty.format(response.result.countsByStatus.variance_pending)}</span>
     <span>معتمدة بفرق: {qty.format(response.result.countsByStatus.variance_approved)}</span>
     <span>مرفوضة: {qty.format(response.result.countsByStatus.variance_rejected)}</span></div></div>
   {response.result.notice?<p className="rounded-lg border p-3 text-xs">{response.result.notice}</p>:null}
   {response.result.invoices.map(invoice=><article key={invoice.invoiceId} className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{invoice.supplierName} · فاتورة {invoice.invoiceNumber}</p>
     <p className="text-xs text-muted-foreground">أمر الشراء {invoice.purchaseOrderNumber} · {invoice.invoiceDate} · {invoice.currency}</p></div><span className="rounded-full border px-2 py-1 text-xs">{invoiceStatus(invoice.matchStatus)}</span></div>
    <p className="mt-2 text-xs">سطور الفاتورة: {qty.format(invoice.lineCount)} · سطور ذات فرق سعر: {qty.format(invoice.mismatchedLineCount)}</p>
    {invoice.reviewReason?<p className="mt-1 text-xs">سبب المراجعة: {invoice.reviewReason}</p>:null}
    {onOpenSupplierInvoice?<button type="button" onClick={()=>onOpenSupplierInvoice(invoice.invoiceId)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs">فتح الفاتورة</button>:null}
   </article>)}
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PROCESS_TASKS"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{taskTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مصدر مصرح ومكتمل":"مصدر غير متاح"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة المرجعية: {response.result.period.from} — {response.result.period.to}</p>
    {response.result.state==="READY"&&response.result.intent==="OPEN_TASKS_OVERVIEW"&&response.result.oldestAgeMinutes!==null?<p className="mt-2 text-xs">عمر أقدم مهمة مفتوحة: {duration(response.result.oldestAgeMinutes)}</p>:null}
    {response.result.state==="UNAVAILABLE"?<p role="status" className="mt-2 text-xs text-muted-foreground">{response.result.sourceMessage}</p>:null}
   </div>
   <p className="text-xs text-muted-foreground">الأعداد مقيدة بمهام المؤسسة والأدوار التي يسمح بها الخادم. لا يعرض هذا الاستعلام أسماء الموظفين أو تفاصيل المهام، ولا يحكم على التأخير لغياب تاريخ استحقاق موحد.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="EXPECTED_COLLECTIONS"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>التحصيلات المستحقة المجدولة</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية موثقة":response.result.state==="PARTIAL"?"الإجماليات محجوبة":"لا توجد استحقاقات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة: {response.result.period.from} — {response.result.period.to} · فواتير: {count(response.result.invoiceCount)}</p>
   </div>
   {response.result.completeSchedule&&response.result.currencies.length?<div className="grid gap-2 sm:grid-cols-2">
    {response.result.currencies.map(item=><article key={item.currency} className="rounded-lg border p-3 text-sm">
     <p className="text-xs text-muted-foreground">العملة {item.currency}</p>
     <strong className="text-lg">{collectionsCurrency(item.amount,item.currency)}</strong>
     <p className="text-xs text-muted-foreground">{count(item.invoiceCount)} فاتورة مستحقة</p>
    </article>)}
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>تنبيهات المصدر</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.slice(0,10).map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">الأرقام أرصدة فواتير عملاء مستحقة بعد خصم الدفعات المسجلة، مع إبقاء العملات منفصلة. ليست توقعاً لاحتمال التحصيل أو صافي السيولة، ولا تشمل التزامات الموردين.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PROCESS_BOTTLENECK"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>اختناقات العمليات وزمن الدورة</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مصادر مكتملة":response.result.state==="PARTIAL"?"مصادر جزئية":"غير متاح"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">كما في {response.result.asOf} · الحالية: {response.result.period.from} — {response.result.period.to} · المقارنة: {response.result.baselinePeriod?response.result.baselinePeriod.from+" — "+response.result.baselinePeriod.to:"غير متاحة"}</p>
   </div>
   {response.result.findings.length?<div className="space-y-2">
    {response.result.findings.slice(0,5).map((finding,index)=><article key={finding.processKey+":"+finding.stageKey+":"+index} className="rounded-lg border p-3 text-sm">
     <div className="flex flex-wrap items-center justify-between gap-2"><strong>{processLabel(finding.processKey)} · {finding.stageKey}</strong><span className="text-xs">عينة مكتملة: {count(finding.sampleCount)}</span></div>
     <p className="mt-1 text-xs text-muted-foreground">{waitClassLabel(finding.waitClass)}</p>
     <div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-xs text-muted-foreground">وسيط الانتظار</p><strong>{duration(finding.medianMinutes)}</strong></div><div><p className="text-xs text-muted-foreground">المئين 90</p><strong>{duration(finding.p90Minutes)}</strong></div></div>
     <p className="mt-2 text-xs">{finding.recommendation}</p>
    </article>)}
   </div>:null}
   {response.result.comparisons.length?<section className="rounded-lg border p-3 text-sm">
    <strong>التغير بين الفترتين (وصفي)</strong>
    <div className="mt-2 space-y-2">{response.result.comparisons.slice(0,5).map((item,index)=><p key={item.processKey+":"+item.stageKey+":"+index} className="text-xs">
     {processLabel(item.processKey)} · {item.stageKey}: {duration(item.baselineMedianMinutes)} ← {duration(item.currentMedianMinutes)}
     {item.changePercent===null?"":" · "+rate.format(item.changePercent)+"%"} · لا يثبت السببية
    </p>)}</div>
   </section>:null}
   {response.result.withheldReasons.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>مصادر ومراحل غير مكتملة أو بعينة صغيرة</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.withheldReasons.slice(0,12).map(reason=><li key={reason}>{reason}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">لا تُنسب فترات الانتظار إلى موظف، ولا تُعتبر المقارنة سبباً للتغير أو حكماً على الإنتاجية الفردية.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="INVENTORY"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{inventoryTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مؤشرات مكتملة حسب المصدر":response.result.state==="PARTIAL"?"بعض المؤشرات محجوبة":"لا توجد منتجات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · نافذة الحركة: {response.result.period.from} — {response.result.period.to} · المنتجات: {count(response.result.totalProducts)}</p>
   </div>
   {response.result.intent==="DEAD_STOCK_OVERVIEW"&&response.result.deadStock.stagnant!==null?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">منتجات نشطة</p><strong className="text-lg">{count(response.result.deadStock.active)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">بطيئة الحركة</p><strong className="text-lg">{count(response.result.deadStock.slowMoving)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">راكدة (90 يوماً فأكثر)</p><strong className="text-lg">{count(response.result.deadStock.stagnant)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">بلا حركة مسجلة</p><strong className="text-lg">{count(response.result.deadStock.zeroMovement)}</strong></article>
   </div>:null}
   {response.result.intent==="REPLENISHMENT_OVERVIEW"&&response.result.replenishment.recommendedProducts!==null?<div className="grid gap-2 sm:grid-cols-3">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">منتجات لها توصية توريد</p><strong className="text-lg">{count(response.result.replenishment.recommendedProducts)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">لا تحتاج توريداً مثبتاً</p><strong className="text-lg">{count(response.result.replenishment.noActionProducts)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">توصيات محجوبة</p><strong className="text-lg">{count(response.result.replenishment.withheldProducts)}</strong></article>
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود القياس والإثبات</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.slice(0,12).map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">لا تُجمع كميات منتجات مختلفة الوحدات، ولا تُعرض قيمة مالية للمخزون لغياب تكلفة وحدة وعملة مثبتتين. النتيجة لا تنشئ أمراً أو حركة مخزون.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="SUPPLIER_PERFORMANCE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{supplierTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية كاملة":response.result.state==="PARTIAL"?"تغطية جزئية":"لا توجد سجلات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · نافذة UTC: {response.result.period.from} — {response.result.period.to} · الموردون: {count(response.result.returnedSupplierCount)} من {count(response.result.totalSupplierCount)}</p>
   </div>
   {response.result.completePopulation&&response.result.state!=="EMPTY"?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر الشراء</p><strong className="text-lg">{count(response.result.aggregate.purchaseOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر مكتملة</p><strong className="text-lg">{count(response.result.aggregate.completedOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر مفتوحة</p><strong className="text-lg">{count(response.result.aggregate.openOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">سطور استلام متبقية</p><strong className="text-lg">{count(response.result.aggregate.backlogLineCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">عينات زمن التوريد</p><strong className="text-lg">{count(response.result.aggregate.leadTimeSampleCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل الالتزام بالموعود</p><strong className="text-lg">{percent(response.result.aggregate.onTimePercent)}</strong></article>
   </div>:null}
   {response.result.withheldReasons.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود القياس</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.withheldReasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">المؤشرات تشغيلية فقط؛ لا تعرض أسعار الموردين أو أرصدتهم، ولا تنشئ أوامر شراء. لا يُحسب متوسط زمن التوريد من متوسطات الموردين المنفصلة.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="GROWTH_RADAR"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>رادار فرص النمو</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مجتمع العملاء والمنتجات مكتمل":"تغطية جزئية أو مؤشرات تحتاج مراجعة"}</span>
    </div>
    <p className="mt-2">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · نافذة التحليل: {response.result.periodDays} يوماً، ومقارنتها بفترة سابقة مساوية.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <article className="rounded-lg border p-2 text-xs"><p className="text-muted-foreground">مصدر أداء المنتجات</p><strong>{response.result.productSourceStatus==="READY"?"مكتمل":response.result.productSourceStatus==="PARTIAL"?"جزئي":"غير متاح"}</strong></article>
      <article className="rounded-lg border p-2 text-xs"><p className="text-muted-foreground">مجموعات المنتج/الوحدة</p><strong>{response.result.productCoverage?count(response.result.productCoverage.returnedCount)+" من "+count(response.result.productCoverage.totalCount):"غير متاح"}</strong></article>
      <article className="rounded-lg border p-2 text-xs"><p className="text-muted-foreground">وحدات قياس غير قابلة للمقارنة</p><strong>{response.result.productCoverage?count(response.result.productCoverage.uncomparableUnitCount):"غير متاح"}</strong></article>
      <article className="rounded-lg border p-2 text-xs"><p className="text-muted-foreground">مصدر البحث عن أصناف غير متاحة</p><strong>{response.result.unavailableDemandSourceStatus==="READY"?"تغطية مكتملة":response.result.unavailableDemandSourceStatus==="PARTIAL"?"تغطية جزئية": "غير متاح"}</strong><p className="mt-1 text-muted-foreground">المجموعات {response.result.unavailableDemandCoverage?count(response.result.unavailableDemandCoverage.returnedCount)+" من "+count(response.result.unavailableDemandCoverage.totalCount):"غير متاحة"} · بداية التتبع {response.result.unavailableDemandCoverage?.coverageStartedOn??"غير معروفة"}</p></article>
    </div>
   </div>
   <GrowthOpportunityRadar result={response.result.radar} state="ready"/>
   <p className="text-xs text-muted-foreground">مؤشر أداء المنتج يقيس كمية سطور الطلبات المؤكدة أو قيد المعالجة أو المشحونة أو المسلّمة، لا الإيراد أو الكمية المستلمة فعلياً ولا الربح المتوقع. مصدر طلب الأصناف غير المتاحة يحتسب فقط نتائج بحث العملاء التي طابقها الخادم مع أصناف نشطة ذات رصيد متاح معروف يساوي صفراً؛ لا يسجل نص البحث أو هوية العميل ولا يخلط الفترات السابقة لبداية التتبع مع غياب الطلب. لا ينفذ الرادار شراءً أو تسعيراً أو متابعة تلقائية.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="CUSTOMER_RETENTION"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{retentionTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية موثقة":"تغطية غير مكتملة"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة الحالية: {response.result.period.from} — {response.result.period.to} · السابقة: {response.result.previousPeriod.from} — {response.result.previousPeriod.to}</p>
   </div>
   {response.result.completePopulation?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">مجتمع العملاء</p><strong className="text-lg">{count(response.result.population.total)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">العملاء النشطون</p><strong className="text-lg">{count(response.result.population.activeCurrentPeriod)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل الاحتفاظ</p><strong className="text-lg">{percent(response.result.rates.retentionRate)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل تكرار الشراء</p><strong className="text-lg">{percent(response.result.rates.repeatPurchaseRate)}</strong></article>
   </div>:null}
   {response.result.completePopulation?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">مستمرون</p><strong>{count(response.result.population.retainedCustomers)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">متكررون</p><strong>{count(response.result.population.repeatPurchaseCustomers)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">نشطون خلال 30 يوماً</p><strong>{count(response.result.activity.active30Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">فتور 31–60 يوماً</p><strong>{count(response.result.activity.cooling31To60Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معرضون للخمول 61–90 يوماً</p><strong>{count(response.result.activity.atRisk61To90Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">خاملون أكثر من 90 يوماً</p><strong>{count(response.result.activity.inactiveOver90Days)}</strong></article>
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود المصدر</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">المساعد يعرض مؤشرات مجمعة فقط؛ لا يكشف أسماء العملاء أو مراجعهم أو أرصدتهم أو أسعارهم، ولا ينشئ رسائل متابعة أو إجراءات تلقائية.</p>
  </div>:null}

  {isAssistantResultKind(response,"TASK_REPORT")?<div className="space-y-3 rounded-lg border p-3 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <strong>{response.result.intent==="MANAGER_TASK_RISKS"?"تقرير مخاطر المهام للإدارة":response.result.intent==="DAILY_TASK_REPORT"?"التقرير اليومي للمهام":response.result.intent==="WEEKLY_TASK_REPORT"?"التقرير الأسبوعي للمهام":"التقرير الشهري للمهام"}</strong>
    <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="EMPTY"?"لا توجد سجلات مهام":"تغطية كاملة ضمن الأدوار المصرح بها"}</span>
   </div>
   <p className="font-medium">{response.result.answer}</p>
   <TaskIntelligenceInsights report={response.result.report}/>
   <p className="text-xs text-muted-foreground">المصدر: ai_tasks + audit_logs · كما في {new Date(response.result.report.asOf).toLocaleString("ar",{timeZone:"UTC"})} UTC · الفترة: {response.result.report.period.from} — {response.result.report.period.to} UTC · الأدوار المصرح بها: {response.result.report.scope.visibleRoles.join("، ")}</p>
   {response.result.report.reportKind!=="MANAGER"?<div className="overflow-x-auto">
    <table className="w-full min-w-[720px] text-start text-xs">
     <thead><tr className="border-b"><th className="p-2">الدور</th><th className="p-2">جديدة</th><th className="p-2">مفتوحة</th><th className="p-2">متأخرة</th><th className="p-2">عالية/حرجة</th><th className="p-2">أُكملت أول مرة</th><th className="p-2">إعادات الفتح</th><th className="p-2">معدل إعادة الفتح</th><th className="p-2">زمن الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.roleSummaries.map(row=><tr key={row.taskRole} className="border-b last:border-0">
      <th className="p-2 font-medium">{row.taskRole==="sales"?"المبيعات":row.taskRole==="accountant"?"المحاسبة":row.taskRole==="warehouse"?"المخزن":row.taskRole==="purchasing"?"المشتريات":row.taskRole==="management"?"الإدارة":"العمليات"}</th>
      <td className="p-2">{count(row.newCount)}</td><td className="p-2">{count(row.openCount)}</td><td className="p-2">{count(row.overdueOpenCount)}</td>
      <td className="p-2">{count(row.highImpactOpenCount)}</td><td className="p-2">{count(row.completedCount)}</td>
      <td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{percent(row.reopenRatePercent)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td>
     </tr>)}</tbody>
    </table>
   </div>:null}
   {response.result.report.reportKind==="WEEKLY"?<div className="space-y-2">
    <strong>التوزيع حسب المصدر والدور والأولوية</strong>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b"><th className="p-2">المصدر</th><th className="p-2">الدور</th><th className="p-2">الأولوية</th><th className="p-2">إنشاء</th><th className="p-2">إكمال</th><th className="p-2">مهام أعيد فتحها</th><th className="p-2">أحداث إعادة الفتح</th><th className="p-2">معدل إعادة الفتح</th><th className="p-2">متوسط الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.sourceBreakdown.map(row=><tr key={row.sourceKey+row.taskRole+row.priority} className="border-b"><td className="p-2" dir="ltr">{row.sourceKey}</td><td className="p-2">{row.taskRole}</td><td className="p-2">{row.priority}</td><td className="p-2">{count(row.createdCount)}</td><td className="p-2">{count(row.completedCount)}</td><td className="p-2">{count(row.reopenedTaskCount)}</td><td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{percent(row.reopenRatePercent)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td></tr>)}</tbody>
    </table></div>
   </div>:null}
   {response.result.report.reportKind==="MONTHLY"?<div className="space-y-2">
    <strong>اتجاه العمل أسبوعياً داخل الشهر</strong>
    <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-xs"><thead><tr className="border-b"><th className="p-2">بداية الأسبوع</th><th className="p-2">جديدة</th><th className="p-2">أُكملت</th><th className="p-2">مهام أعيد فتحها</th><th className="p-2">أحداث إعادة الفتح</th><th className="p-2">متوسط زمن الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.weeklyTrend.map(row=><tr key={row.weekStart} className="border-b"><td className="p-2">{row.weekStart}</td><td className="p-2">{count(row.createdCount)}</td><td className="p-2">{count(row.completedCount)}</td><td className="p-2">{count(row.reopenedTaskCount)}</td><td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td></tr>)}</tbody>
    </table></div>
   </div>:null}
   {response.result.report.reportKind==="MANAGER"&&response.result.report.qualityReviewSnapshot!==null?<section className="space-y-2 rounded-lg border p-3">
    <div>
     <strong>ملخص مستقل لمراجعات جودة المهام</strong>
     <p className="mt-1 text-xs text-muted-foreground">يعرض أحدث مراجعة محفوظة لكل مهمة ونوع مراجعة، ولا يقتصر على الفترة الزمنية للتقرير أعلاه. تبقى هذه الأرقام منفصلة عن المؤشرات اليومية أو الأسبوعية.</p>
    </div>
    <TaskQualityReviewMetrics quality={response.result.report.qualityReviewSnapshot}/>
   </section>:null}
   {response.result.report.reportKind==="MANAGER"?<div className="space-y-2">
    <div className="flex flex-wrap justify-between gap-2">
     <strong>أهم خمس خطوات للمتابعة الإدارية</strong>
     <span className="text-xs text-muted-foreground">
      {response.result.report.scope.managerRiskTotalCount===null?"الإجمالي غير متاح":count(response.result.report.scope.managerRiskTotalCount)+" إجمالي"}
      · {count(response.result.report.managerRisks.length)} أعادها المصدر
     </span>
    </div>
    {response.result.report.managerRisks.length===0?<p className="rounded-md border p-3 text-muted-foreground">لا توجد مهام مفتوحة عالية/حرجة الأولوية في النطاق الإداري الذي أجازه المصدر.</p>:
     <div className="space-y-2">
      {response.result.report.managerRisks.slice(0,5).map((risk,index)=><article key={risk.id} className="rounded-md border p-3">
       <div className="flex flex-wrap justify-between gap-2">
        <strong>{index+1}. {risk.title}</strong>
        <span>{risk.priority==="critical"?"حرجة":"عالية"}</span>
       </div>
       <p className="mt-1 text-xs text-muted-foreground">الدور: {taskRiskRoleLabel(risk.taskRole)} · الحالة: {risk.status==="pending"?"بانتظار التنفيذ":"قيد التنفيذ"} · عمر المهمة: {count(Math.round(risk.ageMinutes))} دقيقة · الاستحقاق: {risk.dueAt??"غير محدد"}</p>
       <p className="mt-2 text-sm"><strong>سبب التقديم:</strong> {taskRiskWhyNow(risk,response.result.report.asOf)}</p>
       <p className="mt-1 text-sm"><strong>الخطوة المقترحة:</strong> {taskRiskNextStep(risk)}</p>
       <p className="mt-1 text-xs text-muted-foreground">حالة الإسناد: {risk.assignedProfileId===null?"غير مسند":"يوجد مسؤول مسجل"}{risk.sourceEntityType?" · نوع المصدر: "+risk.sourceEntityType:""}</p>
      </article>)}
     </div>}
    {!response.result.report.scope.managerRiskCompletePopulation?
     <p className="text-xs text-muted-foreground">هذه أعلى خمس مهام ضمن الصفوف التي أعادها المصدر، وليست كامل قائمة المخاطر. إجمالي السجلات مستقل عن عدد الصفوف المعروضة؛ لا يُفترض أن المهام غير المعروضة أقل أهمية.</p>
     :response.result.report.managerRisks.length>5?
      <p className="text-xs text-muted-foreground">يعرض هذا الملخص أول خمس مهام بحسب ترتيب المصدر المعتمد للأولوية والاستحقاق والعمر؛ بقية السجلات متاحة في تقرير مخاطر المهام.</p>:null}
   </div>:null}
   <div className="rounded-md border p-3 text-xs">
    <strong>تعريفات القياس وحدوده</strong>
    <p className="mt-1">الجديد = سجل أُنشئ في الفترة ولا يُعاد عده عند إعادة الفتح. الإكمال = أول انتقال موثق إلى completed. زمن الحل = من الإنشاء إلى أول إكمال. إعادة الفتح حدث مستقل؛ النسبة تقيس المهام التي اكتملت أول مرة ثم أعيد فتحها داخل الفترة نفسها.</p>
    <p className="mt-1">الانتظار على طرف آخر وأسباب التأخير ونتائج التحسين غير متاحة في عقد التقرير الزمني؛ لا تعرض كأصفار. قد يظهر للمدير ملخص مستقل لمراجعات الجودة من أحدث السجلات، وليس من الفترة أعلاه. الأولوية التشغيلية ليست أثراً مالياً.</p>
    {response.result.report.limitations.length?<ul className="mt-2 list-disc space-y-1 ps-5">{response.result.report.limitations.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}
   </div>
  </div>:null}

 </section>;
}
