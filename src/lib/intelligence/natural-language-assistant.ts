import type { SupplierInvoiceMatchStatus, SupplierInvoiceRecord } from "@/lib/supplier-invoices";
import type { CustomerRetentionReport } from "./customer-retention";
import type { SupplierPerformanceResult } from "./supplier-performance";
import type { DeadStockReport } from "./dead-stock";
import type { ReplenishmentRecommendation } from "./replenishment";
import type { ProcessBottleneckResult } from "./process-bottlenecks";
import type { CashflowScheduleSnapshot } from "./cashflow-schedule-client";
import type { TaskIntelligenceReport, TaskIntelligenceReportKind } from "./task-intelligence-reports";
import type { TaskQualityMetrics } from "./task-quality-reviews";
import type { DecisionOutcomeState, DecisionOutcomeView } from "./decision-outcome-client";
import type { GrowthOpportunityRadarResult } from "./growth-opportunities";
import type { TaskPerformanceScorecard } from "./task-performance-scorecard";
import type { BusinessHealthMapResult } from "./business-health-map";
import type { ShiftOperationsCenterResult } from "./shift-operations";
import type { CustomerQuotePipelineResult } from "./customer-quote-pipeline";
import type { SupplierQuoteComparisonAssistantResult } from "./supplier-quote-comparison-assistant";
import type { SalesOrderStatusIntent, SalesOrderStatusSummary } from "./sales-order-status-summary";
import { buildDecisionPolicyReviewSuggestions, type DecisionMemoryBookResult } from "./decision-memory";
export type SupplierInvoiceIntent="SUPPLIER_INVOICES_UNMATCHED"|"SUPPLIER_INVOICES_PRICE_REVIEW"|"SUPPLIER_INVOICES_MATCHED";
export type PurchaseOrderIntent="PURCHASE_ORDERS_OPEN"|"PURCHASE_ORDERS_AWAITING_RECEIPT"|"PURCHASE_ORDERS_PARTIAL_RECEIPT";
export type CustomerRetentionIntent="CUSTOMER_RETENTION_OVERVIEW"|"CUSTOMER_REPEAT_PURCHASE"|"CUSTOMER_DORMANCY_RISK";
export type SupplierPerformanceIntent="SUPPLIER_PERFORMANCE_OVERVIEW"|"SUPPLIER_DELIVERY_ADHERENCE";
export type InventoryIntent="DEAD_STOCK_OVERVIEW"|"REPLENISHMENT_OVERVIEW";
export type ProcessBottleneckIntent="PROCESS_BOTTLENECK_OVERVIEW";
export type ProcessTaskIntent="OPEN_TASKS_OVERVIEW"|"REOPENED_TASKS_OVERVIEW";
export type TaskIntelligenceReportIntent="DAILY_TASK_REPORT"|"WEEKLY_TASK_REPORT"|"MONTHLY_TASK_REPORT"|"MANAGER_TASK_RISKS";
export type ExpectedCollectionsIntent="EXPECTED_CUSTOMER_COLLECTIONS";
export type TaskQualityIntent="TASK_QUALITY_OVERVIEW";
export type GrowthRadarIntent="GROWTH_RADAR_OVERVIEW";
export type TaskPerformanceIntent="TASK_PERFORMANCE_OVERVIEW";
export type BusinessHealthIntent="BUSINESS_HEALTH_OVERVIEW";
export type CommercePolicyIntent="COMMERCE_POLICY_OVERVIEW"|"COMMERCE_POLICY_SOURCE_CHANGES";
export type DecisionOutcomesIntent="DECISION_OUTCOMES_OVERVIEW"|"DECISIONS_PENDING_REVIEW"|"DECISIONS_AWAITING_EXECUTION"|"DECISIONS_DEFERRED";
export type DecisionMemoryIntent="DECISION_MEMORY_OVERVIEW";
export type ShiftOperationsIntent="SHIFT_OPERATIONS_OVERVIEW";
export type CustomerQuotePipelineIntent="CUSTOMER_QUOTE_PIPELINE_OVERVIEW";
export type SupplierQuoteComparisonIntent="SUPPLIER_QUOTE_COMPARISON_OVERVIEW";
export type SalesOrderIntent=SalesOrderStatusIntent;
export type CustomerServiceIntent=
 |"CUSTOMER_SERVICE_OVERVIEW"
 |"CUSTOMER_SERVICE_RESPONSE_OVERDUE"
 |"CUSTOMER_SERVICE_RESOLUTION_OVERDUE"
 |"CUSTOMER_SERVICE_UNASSIGNED";
export type NaturalLanguageIntent=SupplierInvoiceIntent|PurchaseOrderIntent|CustomerRetentionIntent|SupplierPerformanceIntent|InventoryIntent|ProcessBottleneckIntent|ProcessTaskIntent|TaskIntelligenceReportIntent|ExpectedCollectionsIntent|TaskQualityIntent|CustomerServiceIntent|DecisionOutcomesIntent|DecisionMemoryIntent|GrowthRadarIntent|TaskPerformanceIntent|CommercePolicyIntent|BusinessHealthIntent|ShiftOperationsIntent|SupplierQuoteComparisonIntent|CustomerQuotePipelineIntent|SalesOrderIntent;
export type NaturalLanguageSourceRpc="fetch_purchase_supplier_invoice_workspace"|"fetch_purchase_orders"|"get_customer_retention_aggregate"|"fetch_supplier_performance_snapshot"|"get_inventory_intelligence_aggregate"|"fetch_process_bottleneck_snapshot"|"fetch_task_intelligence_report"|"get_intelligence_aggregate"|"fetch_operational_task_quality_metrics"|"get_customer_service_work_queue_summary"|"fetch_decision_outcomes"|"fetch_task_performance_scorecard"|"fetch_commerce_policy_catalog"|"fetch_operational_shift_workspace"|"fetch_purchase_supplier_quotes"|"fetch_customer_quote_pipeline"|"fetch_intelligence_sales_order_status_summary";
export type NaturalLanguagePlanResult=
 |{status:"READY";intent:NaturalLanguageIntent;normalizedQuestion:string;sourceRpc:NaturalLanguageSourceRpc;filterDescription:string;periodDays?:30|60|90|180|365;horizonDays?:7|30|90;taskReportKind?:TaskIntelligenceReportKind;businessDate?:string}
 |{status:"CLARIFICATION"|"UNSUPPORTED";normalizedQuestion:string;explanation:string;clarification?:string};
function normalizeArabic(value:string):string {
 return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"")
  .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").toLowerCase()
  .replace(/[؟?!.,،؛:()[\]{}]/g," ").replace(/\s+/g," ").trim();
}
export function planNaturalLanguageQuery(question:string):NaturalLanguagePlanResult {
 const normalizedQuestion=normalizeArabic(question);
 if(!normalizedQuestion||normalizedQuestion.length>400)return {
  status:"CLARIFICATION",normalizedQuestion,explanation:"اكتب سؤالاً واضحاً لا يتجاوز 400 حرف.",
  clarification:"ما السجلات التي تريد الاستعلام عنها؟"
 };
 const expectedCollectionsQuestion=/(التحصيلات المستحقه|التحصيلات المتوقعه|مستحقات العملاء|فواتير مستحقه|المبالغ المستحقه للتحصيل|مبالغ التحصيل المجدوله|التحصيل المجدول)/.test(normalizedQuestion);
 if(expectedCollectionsQuestion){
  const dayMatch=normalizedQuestion.match(/(?:خلال\s*)?(7|30|90)\s*(?:يوما?|ايام)/);
  const hasPastWindow=/(اخر|الماضي|الماضيه|السابقة|السابقه|قبل)/.test(normalizedQuestion);
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع|القادمه|المقبله)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  if(hasPastWindow||hasTimeConstraint&&!dayMatch)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر التحصيلات يعرض الاستحقاقات المستقبلية فقط ضمن 7 أو 30 أو 90 يوماً؛ لا يطبق نطاقاً ماضياً أو تاريخاً حراً."
  };
  const horizonDays=(dayMatch?Number(dayMatch[1]):30) as 7|30|90;
  return {status:"READY",intent:"EXPECTED_CUSTOMER_COLLECTIONS",normalizedQuestion,sourceRpc:"get_intelligence_aggregate",horizonDays,
   filterDescription:"فواتير العملاء الصادرة وغير المسددة بالكامل حسب تاريخ الاستحقاق المستقبلي؛ مجموع مستقل لكل عملة، مع دليل الفاتورة والمدفوعات المسجلة."};
 }
 const employeeComparisonQuestion=/(مقارنه الموظفين|قارن الموظفين|اداء كل موظف|ترتيب الموظفين|اسرع الموظفين|ابطا الموظفين)/.test(normalizedQuestion);
 if(employeeComparisonQuestion)return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"مرجع تقارير المهام يمنع ترتيب الموظفين أو إصدار مقارنة فردية دون ضبط الدور والحمل والتعقيد والغياب والعوامل الخارجية؛ مصدر المهام الحالي لا يوفر تلك العوامل."
 };
 const taskPerformanceQuestion=/(بطاقه اداء المهام|اداء المهام حسب الدور|زمن اكمال المهام حسب الدور|مؤشرات تغطيه المهام|بطاقه الاداء التشغيلي للمهام|ملخص اداء المهام حسب الدور)/.test(normalizedQuestion);
 if(taskPerformanceQuestion){
  if(/(امس|البارحه|الماضي|السابق|اخر|خلال|منذ|من تاريخ|بين تاريخ|هذا الشهر|الشهر الحالي|الاسبوع الحالي|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"بطاقة أداء المهام لقطة حالية للأدوار التي تسمح بها صلاحية المستخدم؛ لا تدعم نطاقاً تاريخياً أو ترتيباً فردياً للموظفين."
  };
  return {
   status:"READY",intent:"TASK_PERFORMANCE_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_task_performance_scorecard",
   filterDescription:"ملخص تجميعي حالي للمهام المرئية ضمن أدوار المستخدم فقط، مجمع حسب نوع المهمة والدور؛ لا يحتوي أسماء الموظفين أو ترتيباً فردياً. المقاييس التي لا يثبتها مصدر التدقيق تبقى غير متاحة."
  };
 }
 const policySourceChangeQuestion=/(السياسات التي تغير مصدرها|سياسات تغير مصدرها|السياسات ذات المصدر المتغير|تغير بصمه مصدر السياسه|مصادر السياسات المتغيره)/.test(normalizedQuestion);
 const policyOverviewQuestion=/(حوكمه السياسات|السياسات التجاريه|سجل السياسات|حاله السياسات|ملخص السياسات|السياسات المجدوله|السياسات الساريه)/.test(normalizedQuestion);
 if(policySourceChangeQuestion||policyOverviewQuestion){
  if(/(امس|الماضي|السابق|من تاريخ|بين تاريخ|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"سجل حوكمة السياسات يعرض لقطة حالية مع تاريخ asOf وتغطية الصفحة؛ لا يقدم تاريخاً حراً أو مقارنة زمنية."
  };
  const intent:CommercePolicyIntent=policySourceChangeQuestion?"COMMERCE_POLICY_SOURCE_CHANGES":"COMMERCE_POLICY_OVERVIEW";
  return {
   status:"READY",intent,normalizedQuestion,sourceRpc:"fetch_commerce_policy_catalog",
   filterDescription:"ملخص تجميعي للسياسات التجارية وفق سجل الحوكمة الحالي: حالات دورة الحياة وعدد السجلات التي تغيرت بصمة مصادرها؛ لا يعرض معرفات أو بيانات المالك."
  };
 }
 const managerTaskReport=/(تقرير.*(المدير|الاداره).*المهام|مخاطر المهام (المفتوحه|للاداره)|المهام عاليه الاثر للاداره|تقرير مخاطر المهام|اهم خطوات الاداره|اهم المهام للاداره|اولويات الاداره اليوم|ما الذي يجب على الاداره متابعته)/.test(normalizedQuestion);
 const dailyTaskReport=/(التقرير اليومي للمهام|تقرير يومي للمهام|تقرير المهام اليومي|تقرير.*المهام.*(اليوم|يومي)|ملخص يومي للمهام|مهام اليوم حسب الدور)/.test(normalizedQuestion);
 const weeklyTaskReport=/(التقرير الاسبوعي للمهام|تقرير اسبوعي للمهام|تقرير المهام الاسبوعي|تقرير.*المهام.*(الاسبوع|اسبوعي)|ملخص اسبوعي للمهام|مهام هذا الاسبوع)/.test(normalizedQuestion);
 const monthlyTaskReport=/(التقرير الشهري للمهام|تقرير شهري للمهام|تقرير المهام الشهري|تقرير.*المهام.*(الشهر|شهري)|ملخص شهري للمهام|اتجاه عبء المهام|عبء المهام الشهري|مهام هذا الشهر)/.test(normalizedQuestion);
 if(managerTaskReport||dailyTaskReport||weeklyTaskReport||monthlyTaskReport){
  if(/(امس|البارحه|الاسبوع الماضي|الشهر الماضي|من تاريخ|بين تاريخ|20\d{2}-\d{2}-\d{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"تقارير المهام محددة بالفترة اليومية الحالية أو آخر 7 أيام UTC أو الشهر الحالي حتى اليوم؛ لا أستبدلها بتاريخ ماضٍ أو نطاق حر."
  };
  const taskReportKind:TaskIntelligenceReportKind=managerTaskReport?"MANAGER":
   dailyTaskReport?"DAILY":weeklyTaskReport?"WEEKLY":"MONTHLY";
  const intent:TaskIntelligenceReportIntent=taskReportKind==="MANAGER"?"MANAGER_TASK_RISKS":
   taskReportKind==="DAILY"?"DAILY_TASK_REPORT":
   taskReportKind==="WEEKLY"?"WEEKLY_TASK_REPORT":"MONTHLY_TASK_REPORT";
  const filterDescription=taskReportKind==="DAILY"
   ?"مهام اليوم حسب الدور؛ الجديد حسب created_at، والمتأخر حسب due_at والسجل النشط وقت التقرير."
   :taskReportKind==="WEEKLY"
    ?"آخر سبعة أيام UTC؛ توزيع الإنشاء والإكمال وإعادة الفتح حسب مصدر المهمة والدور والأولوية."
    :taskReportKind==="MONTHLY"
     ?"من أول الشهر UTC حتى اليوم؛ اتجاه أسبوعي للإنشاء والإكمال وإعادة الفتح، دون مقارنة موظفين."
     :"لقطة المهام المفتوحة عالية/حرجة الأولوية؛ للمسؤول الإداري فقط، مع عمر المهمة ومرجع المكلف عند وجوده.";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"fetch_task_intelligence_report",
   taskReportKind,filterDescription};
 }
 if(/تقرير.*المهام|تقارير المهام/.test(normalizedQuestion))return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"نوع تقرير المهام غير واضح؛ اختر الفترة أو غرض الإدارة.",
  clarification:"هل تريد التقرير اليومي، أم الأسبوعي، أم الشهري، أم تقرير مخاطر الإدارة؟"
 };
 const openTasksQuestion=/(المهام المفتوحه|المهام الجاريه|الاعمال المفتوحه|قائمه المهام المفتوحه|المهام المتراكمه|التكليفات المفتوحه)/.test(normalizedQuestion);
 const reopenedTasksQuestion=/(المهام المعاد فتحها|المهام التي اعيد فتحها|مهام اعيد فتحها|اعيد فتح المهام|اعاده فتح المهام|اعاده فتح المهمه)/.test(normalizedQuestion);
 if(openTasksQuestion||reopenedTasksQuestion){
  if(/متاخر|متاخره/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر قائمة المهام لا يقدم تاريخ استحقاق موحداً؛ أستطيع عرض المفتوح حالياً أو ما أعيد فتحه، ولا أصف مهمة بأنها متأخرة."
  };
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90)\s*(?:يوما?|ايام)/);
  if(openTasksQuestion){
   if(dayMatch||/(اليوم|امس|غدا|خلال|اخر|هذا الشهر|الشهر الماضي|من تاريخ|بين تاريخ)/.test(normalizedQuestion))return {
    status:"UNSUPPORTED",normalizedQuestion,
    explanation:"قائمة المهام المفتوحة لقطة حالية وليست سجلاً تاريخياً لفترة ماضية؛ احذف مرشح الفترة أو اسأل عن المهام المعاد فتحها."
   };
   return {status:"READY",intent:"OPEN_TASKS_OVERVIEW",normalizedQuestion,sourceRpc:"fetch_process_bottleneck_snapshot",
    periodDays:30,filterDescription:"قائمة حالية للمهام pending/in_progress المسموح للمستخدم برؤيتها حسب دور المهمة؛ عدد وأقدم عمر فقط دون أسماء أو منفذين."};
  }
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  if(hasTimeConstraint&&!dayMatch)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"إعادة فتح المهام تدعم نافذة 30 أو 60 أو 90 يوماً فقط؛ لا أطبق تواريخ حرة أو فترات تقويمية."
  };
  return {status:"READY",intent:"REOPENED_TASKS_OVERVIEW",normalizedQuestion,sourceRpc:"fetch_process_bottleneck_snapshot",
   periodDays:(dayMatch?Number(dayMatch[1]):30) as 30|60|90,
   filterDescription:"عدد انتقالات المهمة من completed إلى pending/in_progress خلال نافذة UTC محددة، مع تقييد المؤسسة ودور المهمة من الخادم."};
 }
 const processBottleneckQuestion=/(اختناق|اختناقات|زمن العمليات|زمن دوره العمليه|دوره العمليات|عنق الزجاجه|بطء العمليات|بطء الاجراءات)/.test(normalizedQuestion);
 if(processBottleneckQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90)\s*(?:يوما?|ايام)/);
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  if(hasTimeConstraint&&!dayMatch)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"تحليل الاختناقات يقبل نافذة محددة من 30 أو 60 أو 90 يوماً فقط؛ لا أطبق تاريخاً حراً أو فترة تقويمية تقريبية."
  };
  const periodDays=(dayMatch?Number(dayMatch[1]):30) as 30|60|90;
  return {status:"READY",intent:"PROCESS_BOTTLENECK_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_process_bottleneck_snapshot",periodDays,
   filterDescription:"مراحل عمليات موثقة بعينات مكتملة في نافذتين UTC متساويتين وغير متداخلتين، مع حجب المراحل ذات العينات الأقل من 3."};
 }
 const replenishmentQuestion=/(اعاده التوريد|اعاده الطلب|نقطه اعاده الطلب|احتياج التوريد|اصناف تحتاج توريد|منتجات تحتاج توريد|توصيات التوريد|احتياج الشراء)/.test(normalizedQuestion);
 const deadStockQuestion=/(المخزون الراكد|مخزون راكد|الاصناف الراكده|اصناف راكده|الركود|بطيء الحركه|بطيئه الحركه|بدون حركه|بلا حركه)/.test(normalizedQuestion);
 if(replenishmentQuestion||deadStockQuestion){
  const explicitWindow=/(92\s*(?:يوما?|يوم|ايام))/.test(normalizedQuestion);
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  if(hasTimeConstraint&&!explicitWindow)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"محرك المخزون الحالي يعتمد نافذة تشغيل ثابتة مقدارها 92 يوماً؛ لا أطبق فترة أخرى أو تواريخ حرة على بيانات هذه اللقطة."
  };
  const intent:InventoryIntent=replenishmentQuestion?"REPLENISHMENT_OVERVIEW":"DEAD_STOCK_OVERVIEW";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"get_inventory_intelligence_aggregate",
   filterDescription:"مجتمع المنتجات الكامل للمؤسسة ونافذة حركة 92 يوماً؛ توصيات الكميات تبقى حسب وحدة كل منتج دون جمع وحدات مختلفة."};
 }
 const supplierPerformanceQuestion=/(اداء المورد|مؤشرات المورد|زمن التوريد|مهله التوريد|التزام المورد|الالتزام بمواعيد التوريد)/.test(normalizedQuestion);
 if(supplierPerformanceQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90|180|365)\s*(?:يوما?|ايام)/);
  const monthPeriod=/اخر شهر/.test(normalizedQuestion)?30:
   /اخر 3 اشهر/.test(normalizedQuestion)?90:/اخر 6 اشهر/.test(normalizedQuestion)?180:
   /اخر سنه/.test(normalizedQuestion)?365:null;
  const periodDays=(dayMatch?Number(dayMatch[1]):monthPeriod??90) as 30|60|90|180|365;
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  const hasSupportedPeriod=Boolean(dayMatch||monthPeriod!==null);
  if(hasTimeConstraint&&!hasSupportedPeriod)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"تحليل الموردين يدعم نوافذ محددة فقط حتى 365 يوماً في هذا المساعد؛ لا يطبق نطاقات تقويمية أو تواريخ حرة."
  };
  const intent:SupplierPerformanceIntent=/(التزام|الالتزام بمواعيد التوريد|موعد)/.test(normalizedQuestion)
   ?"SUPPLIER_DELIVERY_ADHERENCE":"SUPPLIER_PERFORMANCE_OVERVIEW";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"fetch_supplier_performance_snapshot",periodDays,
   filterDescription:"مؤشرات المشتريات الفعلية للموردين في نافذة UTC بطول "+periodDays+" يوماً؛ لا تشمل أسعاراً أو أرصدة أو درجات جودة غير مثبتة."};
 }
 const growthRadarQuestion=/(رادار النمو|فرص النمو|فرص تجاريه|فرص متابعه العملاء|فرص اعاده الشراء|فرص تكرار الشراء|عملاء يحتاجون متابعه|فرص النمو للعملاء)/.test(normalizedQuestion);
 if(growthRadarQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\\s*)?(30|60|90|180|365)\\s*(?:يوما?|ايام)/);
  const monthPeriod=/اخر شهر/.test(normalizedQuestion)?30:
   /اخر 3 اشهر/.test(normalizedQuestion)?90:/اخر 6 اشهر/.test(normalizedQuestion)?180:
   /اخر سنه/.test(normalizedQuestion)?365:null;
  const hasDateConstraint=/(من تاريخ|بين تاريخ|20[0-9]{2}-[0-9]{2}-[0-9]{2}|الربع|هذا الشهر|الشهر الحالي|الاسبوع الحالي)/.test(normalizedQuestion);
  const hasSupportedPeriod=Boolean(dayMatch||monthPeriod!==null);
  if(hasDateConstraint||/(اخر|خلال|منذ|الفتره)/.test(normalizedQuestion)&&!hasSupportedPeriod)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"رادار النمو الحالي يقارن نوافذ UTC متساوية من 30 أو 60 أو 90 أو 180 أو 365 يوماً؛ لا يدعم تاريخاً حراً أو فترة تقويمية."
  };
  const periodDays=(dayMatch?Number(dayMatch[1]):monthPeriod??90) as 30|60|90|180|365;
  return {status:"READY",intent:"GROWTH_RADAR_OVERVIEW",normalizedQuestion,
   sourceRpc:"get_customer_retention_aggregate",periodDays,
   filterDescription:"إشارات تكرار الشراء وتراجع نشاط العميل فقط من مجتمع الطلبات الحالي، عبر فترتين متساويتين وأدلة مصدر موثقة؛ لا تشمل تحويل عروض الأسعار أو البحث عن منتجات غير متاحة ما لم يوردهما مصدر مستقل."};
 }
 const retentionQuestion=/(احتفاظ|استبقاء|تكرار الشراء|شراء متكرر|متكرر|نشاط العملاء|نشطون|الخمول|خاملون|معرضون للخمول|معرضين للخمول|معرض للخمول|فتور)/.test(normalizedQuestion);
 if(retentionQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90|180|365)\s*(?:يوما?|ايام)/);
  const monthPeriod=/اخر شهر/.test(normalizedQuestion)?30:
   /اخر 3 اشهر/.test(normalizedQuestion)?90:/اخر 6 اشهر/.test(normalizedQuestion)?180:
   /اخر سنه/.test(normalizedQuestion)?365:null;
  const periodDays=(dayMatch?Number(dayMatch[1]):monthPeriod??90) as 30|60|90|180|365;
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  const hasSupportedPeriod=Boolean(dayMatch||monthPeriod!==null);
  if(hasTimeConstraint&&!hasSupportedPeriod)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر الاحتفاظ يدعم نوافذ محددة فقط (30 أو 60 أو 90 أو 180 أو 365 يوماً)، ولا يطبق تواريخ حرة أو فترات تقويمية غير مطابقة."
  };
  const intent:CustomerRetentionIntent=/(الخمول|خاملون|معرضون للخمول|معرضين للخمول|معرض للخمول|فتور)/.test(normalizedQuestion)
   ?"CUSTOMER_DORMANCY_RISK":/(تكرار الشراء|شراء متكرر|متكرر)/.test(normalizedQuestion)
   ?"CUSTOMER_REPEAT_PURCHASE":"CUSTOMER_RETENTION_OVERVIEW";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"get_customer_retention_aggregate",periodDays,
   filterDescription:"مجتمع العملاء الكامل من أوامر المؤسسة النشطة غير الملغاة؛ مقارنة نافذتين متتاليتين متساويتين بطول "+periodDays+" يوماً؛ قراءة مجمعة فقط."};
 }
 const explicitSalesOrderQuestion=/(طلبات العملاء|طلبات البيع|اوامر البيع|اوامر بيع|الطلبات البيعيه|طلبات المبيعات|حاله الطلبات البيعيه|ملخص طلبات العملاء|ملخص الطلبات البيعيه)/.test(normalizedQuestion);
 const genericOrderQuestion=/(الطلبات المفتوحه|الطلبات الجاريه|الطلبات المشحونه|الطلبات الملغاه|ملخص الطلبات|حاله الطلبات)/.test(normalizedQuestion);
 if(explicitSalesOrderQuestion||genericOrderQuestion){
  if(!explicitSalesOrderQuestion)return {
   status:"CLARIFICATION",normalizedQuestion,
   explanation:"كلمة الطلبات قد تعني طلبات العملاء أو أوامر الشراء؛ يلزم تحديد المجتمع قبل القراءة.",
   clarification:"هل تقصد طلبات العملاء/البيع أم أوامر الشراء والتوريد؟"
  };
  if(/(امس|البارحه|الماضي|السابق|اخر|خلال|منذ|من تاريخ|بين تاريخ|هذا الشهر|الشهر الحالي|الاسبوع الحالي|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر طلبات البيع يعرض لقطة حالية مجمعة حسب الحالة؛ لا يوفر سجلاً تاريخياً للأحداث أو مرشحاً زمنياً حراً."
  };
  const intent:SalesOrderIntent=/(الملغاه|ملغيه|ملغاه)/.test(normalizedQuestion)?"SALES_ORDERS_CANCELLED":
   /(المشحونه|تم شحنها|شحن الطلبات)/.test(normalizedQuestion)?"SALES_ORDERS_SHIPPED":
   /(قيد المعالجه|تحت المعالجه|جاريه|قيد التنفيذ)/.test(normalizedQuestion)?"SALES_ORDERS_PROCESSING":
   /(المفتوحه|مفتوحه|غير المكتمله)/.test(normalizedQuestion)?"SALES_ORDERS_OPEN":
   "SALES_ORDERS_OVERVIEW";
  return {
   status:"READY",intent,normalizedQuestion,
   sourceRpc:"fetch_intelligence_sales_order_status_summary",
   filterDescription:"ملخص مجمع حالي لطلبات البيع داخل المؤسسة التي يسمح دور الموظف برؤيتها، مصنف حسب حالات الطلب المعتمدة؛ لا يعيد أسماء العملاء أو معرفات الطلبات أو المبالغ أو تفاصيل السطور."
  };
 }
 const purchaseQuestion=/(امر|اوامر|شراء|مشتريات|توريد)/.test(normalizedQuestion);
 const invoiceQuestion=normalizedQuestion.includes("فاتور");
 const supplierQuestion=normalizedQuestion.includes("مورد");
 if(purchaseQuestion&&/(متاخر|تاخر|متاخره)/.test(normalizedQuestion))return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"مصدر أوامر الشراء الحالي لا يقدم تاريخ استحقاق موحداً معتمداً. لا أستنتج التأخير من عمر الأمر أو تاريخ إنشائه."
 };
 if(/اليوم|امس|غدا|هذا الشهر|الشهر الحالي|خلال/.test(normalizedQuestion))return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"هذا المسار لا يطبق مرشحاً زمنياً حراً بعد. لا أستطيع إرجاع أحدث السجلات ثم وصفها بأنها نتائج الفترة المطلوبة."
 };
 if(invoiceQuestion&&!supplierQuestion)return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"مصدر الفواتير المعتمد في هذا المسار خاص بفواتير الموردين، ولا يجوز خلطها بفواتير العملاء.",
  clarification:"هل تقصد فواتير الموردين المرتبطة بأوامر الشراء والاستلام؟"
 };
 if(invoiceQuestion&&supplierQuestion){
  const mismatch=/(غير مطابق|غير مطابقه|لم تطابق|لم يطابق|لا تطابق|لا يطابق|عدم المطابق|فرق سعر|فروق السعر|اختلاف السعر|غير متطابق)/.test(normalizedQuestion);
  const review=/(بانتظار|تنتظر|قيد المراجعه|بحاجه الي مراجعه|تحتاج مراجعه)/.test(normalizedQuestion);
  const matched=/(الفواتير المطابقه|فاتوره مطابقه|مطابقه مع الاستلام|مطابقه ثلاثيه)/.test(normalizedQuestion);
  if(review&&mismatch)return {status:"READY",intent:"SUPPLIER_INVOICES_PRICE_REVIEW",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status = variance_pending؛ فروق سعر الوحدة بانتظار مراجعة مستقلة."};
  if(mismatch)return {status:"READY",intent:"SUPPLIER_INVOICES_UNMATCHED",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status != matched؛ فروق سعر الوحدة بين الفاتورة وأمر الشراء والاستلام، بما فيها الفروق المعلقة والمعتمدة والمرفوضة."};
  if(matched&&!/(غير|لم|لا|عدم)/.test(normalizedQuestion))return {status:"READY",intent:"SUPPLIER_INVOICES_MATCHED",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status = matched؛ المطابقة السعرية الثلاثية المسجلة."};
  return {status:"CLARIFICATION",normalizedQuestion,explanation:"حددت فواتير الموردين، لكن شرط المطابقة غير واضح.",
   clarification:"هل تريد الفواتير ذات فروق السعر، أم التي تنتظر مراجعة فرق السعر، أم المطابقة؟"};
 }
 if(purchaseQuestion){
  const partial=/(جزئي|جزئيا|جزئيه|مستلمه جزئ)/.test(normalizedQuestion);
  const awaiting=/(بانتظار الاستلام|تنتظر الاستلام|لم تستلم|غير مستلمه|قيد الاستلام)/.test(normalizedQuestion);
  const open=/(مفتوح|مفتوحه|معلقه|قائمه|غير مكتمله)/.test(normalizedQuestion);
  if(partial)return {status:"READY",intent:"PURCHASE_ORDERS_PARTIAL_RECEIPT",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status = partially_received؛ أوامر استلمت بعض سطورها وما زال بعضها معلقاً."};
  if(awaiting)return {status:"READY",intent:"PURCHASE_ORDERS_AWAITING_RECEIPT",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status = submitted؛ أوامر مرسلة تنتظر الاستلام."};
  if(open)return {status:"READY",intent:"PURCHASE_ORDERS_OPEN",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status IN (submitted, partially_received)؛ الأوامر غير المكتملة فقط."};
  return {status:"CLARIFICATION",normalizedQuestion,explanation:"حددت أوامر الشراء، لكن حالة الأمر المطلوبة غير واضحة.",
   clarification:"هل تريد الأوامر المفتوحة، أم بانتظار الاستلام، أم المستلمة جزئياً؟"};
 }
 const customerServiceQuestion=/(خدمات العملاء|خدمه العملاء|حالات خدمه العملاء|حالات العملاء|حاله عميل|شكاوي العملاء|شكاوي|بلاغات العملاء|طلبات الخدمه|مركز الخدمه|دعم العملاء|حالات الدعم)/.test(normalizedQuestion);
 const customerServiceSlaQuestion=/(sla|موعد الاستجابه|تجاوز.*الاستجابه|تاخر.*الاستجابه|تاخر الرد|لم يتم الرد|موعد الحل|تجاوز.*الحل|تاخر.*حل الحالات)/.test(normalizedQuestion);
 const customerServiceUnassignedQuestion=/(غير المسنده|بلا مسؤول|بدون مسؤول|لم تسند|غير موزعه)/.test(normalizedQuestion);
 if(customerServiceQuestion||customerServiceSlaQuestion||customerServiceUnassignedQuestion){
  if(/(اخر|الماضي|الماضيه|السابقة|السابقه|من تاريخ|بين تاريخ|خلال|منذ|هذا الشهر|هذا الاسبوع|الشهر الحالي|الاسبوع الحالي|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"ملخص خدمة العملاء لقطة حالية عند وقت الاستعلام؛ لا يدعم تاريخاً ماضياً أو مقارنة زمنية. لا أستبدل ذلك بآخر سجلات الحالات."
  };
  const intent:CustomerServiceIntent=customerServiceUnassignedQuestion?"CUSTOMER_SERVICE_UNASSIGNED":
   /موعد الاستجابه|تجاوز.*الاستجابه|تاخر.*الاستجابه|تاخر الرد|لم يتم الرد/.test(normalizedQuestion)?"CUSTOMER_SERVICE_RESPONSE_OVERDUE":
   /موعد الحل|تجاوز.*الحل|تاخر.*حل الحالات/.test(normalizedQuestion)?"CUSTOMER_SERVICE_RESOLUTION_OVERDUE":
   customerServiceSlaQuestion?"CUSTOMER_SERVICE_RESPONSE_OVERDUE":"CUSTOMER_SERVICE_OVERVIEW";
  return {
   status:"READY",intent,normalizedQuestion,
   sourceRpc:"get_customer_service_work_queue_summary",
   filterDescription:"ملخص كامل للحالات النشطة داخل المؤسسة الحالية، محسوب على توقيت خادمي واحد؛ يعرض عدد المفتوح والمتأخر عن أول استجابة والمتجاوز لموعد الحل وغير المسند والعاجل والعالي. لا يعيد أسماء العملاء أو تفاصيل الحالات."
  };
 }
 const decisionMemoryQuestion=/(ذاكره القرارات|ذاكرة القرارات|ذاكره القرار|دفتر ذاكره القرارات|دفتر ذاكرة القرارات|التعلم من نتائج القرارات|دروس.*القرارات|الدروس المستفاده.*القرارات|مقترحات مراجعه القواعد من نتائج القرارات)/.test(normalizedQuestion);
 if(decisionMemoryQuestion){
  if(/(اخر|الماضي|الماضيه|السابق|من تاريخ|بين تاريخ|خلال|منذ|هذا الشهر|هذا الاسبوع|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"دفتر الذاكرة يقرأ الصفحات الحالية بحد أقصى 5,100 قرار مع التحقق من ثبات إجمالي المصدر وحجم كل صفحة وعدم تكرار السجلات وثبات الصفحة الأولى؛ لا يقدم تاريخ أحداث أو مقارنة زمنية شاملة."
  };
  return {
   status:"READY",intent:"DECISION_MEMORY_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_decision_outcomes",
   filterDescription:"دفتر ذاكرة للقرارات المعادة من مصدر القرار المصرح به، مع التحقق من لقطة الذاكرة والأدلة والمعادلات؛ يقرأ حتى 5,100 قرار عبر صفحات متتابعة، ويعلن النطاق الجزئي عند تجاوز الحد أو تغير إجمالي المصدر أو عدم ثبات الصفحة الأولى."
  };
 }
 const decisionPendingQuestion=/(القرارات قيد المراجعه|قرارات قيد المراجعه|قرارات بانتظار المراجعه|قرارات تنتظر المراجعه|القرارات بانتظار الاعتماد|قرارات تنتظر الاعتماد)/.test(normalizedQuestion);
 const decisionExecutionQuestion=/(القرارات بانتظار التنفيذ|قرارات بانتظار التنفيذ|القرارات المعتمده للتنفيذ|قرارات تنتظر الاسناد|قرارات بانتظار الاسناد)/.test(normalizedQuestion);
 const decisionDeferredQuestion=/(القرارات المؤجله|قرارات مؤجله|القرارات التي تم تاجيلها|قرارات التي تم تاجيلها|قرارات تم تاجيلها|القرارات التي تاجلت|قرارات تاجلت|سجل القرارات المؤجله)/.test(normalizedQuestion);
 const decisionOverviewQuestion=/(ملخص القرارات|حاله القرارات|وضع القرارات|دوره القرارات|قرارات النظام|سجل القرارات)/.test(normalizedQuestion);
 if(decisionPendingQuestion||decisionExecutionQuestion||decisionDeferredQuestion||decisionOverviewQuestion){
  if(/(اخر|الماضي|الماضيه|السابق|من تاريخ|بين تاريخ|خلال|منذ|هذا الشهر|هذا الاسبوع|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر دورة القرارات يعرض لقطة حالية بصفحات محدودة؛ لا يقدم سجل أحداث تاريخياً أو مقارنة زمنية لهذا السؤال."
  };
  const intent:DecisionOutcomesIntent=decisionDeferredQuestion?"DECISIONS_DEFERRED":
   decisionPendingQuestion?"DECISIONS_PENDING_REVIEW":
   decisionExecutionQuestion?"DECISIONS_AWAITING_EXECUTION":"DECISION_OUTCOMES_OVERVIEW";
  return {
   status:"READY",intent,normalizedQuestion,sourceRpc:"fetch_decision_outcomes",
   filterDescription:intent==="DECISIONS_DEFERRED"?"قرارات حالتها الحالية DEFERRED ضمن صفحة السجلات المصرح بها؛ لا يشمل هذا الاستعلام سجلاً تاريخياً.":
    intent==="DECISIONS_PENDING_REVIEW"?"قرارات حالتها الحالية IN_REVIEW ضمن صفحة السجلات المصرح بها.":
    intent==="DECISIONS_AWAITING_EXECUTION"?"قرارات معتمدة أو مسندة ولم يبدأ تنفيذها بعد ضمن صفحة السجلات المصرح بها.":
    "توزيع الحالات الحالية لدورة القرارات ضمن صفحة السجلات المصرح بها؛ لا يتضمن أسماء المسؤولين أو تفاصيل القرار."
  };
 }
 const taskQualityQuestion=/(جوده المهام|جوده التوصيات|دقه التوصيات|قابليه تنفيذ المهام|الانذارات الكاذبه|التنبيهات الصحيحه|التنبيهات الخاطئه|مراجعات جوده المهام|جوده التنبيهات|جوده قرارات التوصيه|اسباب رفض التوصيات|اسباب تاجيل التوصيات|الاسباب المتكرره|اسباب التكرار|سبب تكرار المهام|اسباب عدم قابليه التنفيذ)/.test(normalizedQuestion);
 if(taskQualityQuestion){
  const historicalQualityWindow=/(اليوم|امس|البارحه|الاسبوع الماضي|الاسبوع السابق|هذا الاسبوع|الاسبوع الحالي|الشهر الماضي|الشهر السابق|هذا الشهر|الشهر الحالي|اخر\\s*(?:[0-9]+\\s*)?(?:يوم|ايام|اسبوع|اسابيع|شهر|اشهر)|خلال|منذ|بين تاريخ|من تاريخ|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion);
  if(historicalQualityWindow)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مؤشرات جودة المهام تقرأ أحدث مراجعة محفوظة لكل كيان ونوع ولا توفر ترشيحاً تاريخياً؛ لا يمكن نسب الإنذارات الكاذبة أو أسباب الرفض إلى أسبوع أو شهر محدد من هذا المصدر."
  };
  const roleScopedQuality=/(حسب الدور|حسب القسم|المبيعات|المحاسبه|المخزن|المخازن|المشتريات|الاداره|العمليات|فريق المبيعات|فريق المخزن)/.test(normalizedQuestion);
  if(roleScopedQuality)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر مراجعات الجودة يعيد مؤشرات المدير ضمن نطاقه المصرح به دون تقسيم حسب الدور أو القسم؛ لم تُستنتج أرقام فرعية."
  };
  return {
   status:"READY",intent:"TASK_QUALITY_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_operational_task_quality_metrics",
   filterDescription:"لقطة حالية لمراجعات المدير المحفوظة عبر نطاق المهام المصرح به؛ أحدث مراجعة لكل كيان ونوع. تعرض أسباب رفض/تأجيل التوصيات والإنذارات الكاذبة والأسباب المتكررة بعد المراجعة، ولا تدعم فترة تاريخية أو توزيعاً حسب الدور."
  };
 }
 const customerQuotePipelineQuestion=/(مسار عروض العملاء|مسار عروض الاسعار للعملاء|ملخص عروض العملاء|ملخص طلبات التسعير|حاله عروض العملاء|حاله عروض الاسعار للعملاء|معدل قبول عروض العملاء|نسبه قبول عروض العملاء|قبول عروض الاسعار)/.test(normalizedQuestion);
 if(customerQuotePipelineQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر|خلال|لفتره|فتره)[^0-9]{0,8}(30|60|90|180|365)[^0-9]*(?:يوما?|ايام)/);
  const unsupportedTime=/(اليوم|امس|غدا|الشهر الحالي|الشهر الماضي|الاسبوع الماضي|السنه الماضيه|من تاريخ|بين تاريخ|[0-9]{4}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion);
  if(unsupportedTime)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر مسار العروض يدعم نوافذ متحركة محددة بالأيام UTC فقط؛ لا يحوّل اليوم أو الشهر التقويمي أو التاريخ الحر إلى فترة مختلفة."
  };
  const periodDays=(dayMatch?Number(dayMatch[1]):90) as 30|60|90|180|365;
  return {
   status:"READY",intent:"CUSTOMER_QUOTE_PIPELINE_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_customer_quote_pipeline",periodDays,
   filterDescription:"مجتمع عروض العملاء المنشأة خلال آخر "+periodDays+" يوماً UTC حسب created_at، مع الحالات الحالية كما في لقطة الخادم. قبول العرض لا يعني إنشاء طلب بيع."
  };
 }
 const supplierQuoteComparisonQuestion=/(مقارنه عروض الموردين|قارن عروض الموردين|مقارنه اسعار الموردين|قارن اسعار الموردين|مقارنه عروض التوريد|اقل سعر.*(الموردين|مورد)|اقل تكلفه.*(الموردين|مورد)|العروض الوارده من الموردين|سجل اسعار عروض الموردين|تاريخ اسعار الموردين|تغير اسعار عروض الموردين|التغير التاريخي لاسعار الموردين|كيف تغير سعر المورد|مقارنه عروض الموردين.*(اداء|التزام|توريد)|اداء التوريد للموردين مع العروض|مقارنه السعر باداء التوريد)/.test(normalizedQuestion);
 if(supplierQuoteComparisonQuestion){
  if(/(الاسبوع الماضي|الشهر الماضي|السنه الماضيه|اخر (7|30|90) يوم|خلال (7|30|90) يوم|من تاريخ|بين تاريخ|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر عروض الموردين يعيد أحدث 200 عرض محفوظ فقط، ولا يقدم استعلاماً تاريخياً أو فترة مقارنة حرة."
  };
  return {
   status:"READY",intent:"SUPPLIER_QUOTE_COMPARISON_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_quotes",
   filterDescription:"عروض الموردين المستلمة والسارية من المصدر المصرح به. لا تقارن إلا الصنف نفسه والكمية ووحدة القياس والعملة نفسها؛ يحتفظ بآخر عرض لكل مورد على أساس المقارنة. المصدر محدود بأحدث 200 عرض."
  };
 }
 const shiftOperationsQuestion=/(مركز الورديه|مركز اقفال اليوم|مركز اقفال الورديه|حاله الورديه|حاله التسليم|محضر التسليم|جاهزيه الافتتاح|جاهزيه الاغلاق|جاهزيه اقفال الورديه|الاقفال التشغيلي|تقرير الورديه)/.test(normalizedQuestion);
 if(shiftOperationsQuestion){
  const dates=[...normalizedQuestion.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(match=>match[0]);
  const uniqueDates=[...new Set(dates)];
  if(uniqueDates.length!==1)return {
   status:"CLARIFICATION",normalizedQuestion,
   explanation:"مركز الوردية يرتبط بتاريخ العمل المحلي للمؤسسة؛ لن أفترض تاريخ جهاز المستخدم أو أحوّل «اليوم» تلقائياً إلى تاريخ UTC.",
   clarification:"أرسل تاريخ العمل المطلوب بصيغة YYYY-MM-DD."
  };
  const businessDate=uniqueDates[0];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)||
     !Number.isFinite(Date.parse(businessDate+"T00:00:00.000Z"))||
     new Date(businessDate+"T00:00:00.000Z").toISOString().slice(0,10)!==businessDate)return {
   status:"CLARIFICATION",normalizedQuestion,
   explanation:"تاريخ العمل المرسل ليس تاريخاً تقويمياً صالحاً.",
   clarification:"أرسل تاريخاً صحيحاً بصيغة YYYY-MM-DD."
  };
  return {
   status:"READY",intent:"SHIFT_OPERATIONS_OVERVIEW",normalizedQuestion,
   sourceRpc:"fetch_operational_shift_workspace",businessDate,
   filterDescription:"لقطة الوردية لمؤسسة المستخدم بتاريخ العمل المحدد. تاريخ العمل صريح، والمنطقة الزمنية وتغطية المصادر وتوقيت asOf تأتي من الخادم؛ قراءة فقط لا تفتح وردية ولا تسجل عدّاً أو تسليماً أو إقفالاً."
  };
 }
 const businessHealthQuestion=/(خريطه صحه الاعمال|صحه الاعمال|ملخص صحه الاعمال|راس المال المحجوز|الصحه الماليه والتشغيليه|الخريطه الماليه والتشغيليه)/.test(normalizedQuestion);
 if(businessHealthQuestion){
  if(/(الاسبوع الماضي|الشهر الماضي|السنه الماضيه|من تاريخ|بين تاريخ|20[0-9]{2}-[0-9]{2}-[0-9]{2})/.test(normalizedQuestion))return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"خريطة صحة الأعمال لقطة موحدة للبيانات المتاحة حالياً؛ لا تدعم استعادة لقطة تاريخية أو مقارنة بتاريخ حر."
  };
  return {
   status:"READY",intent:"BUSINESS_HEALTH_OVERVIEW",normalizedQuestion,
   sourceRpc:"get_inventory_intelligence_aggregate",
   filterDescription:"خريطة مركبة من لقطة مخزون 92 يوماً، وجدول تدفق نقدي 90 يوماً، واحتفاظ العملاء 90 يوماً، بوقت احتساب موحد. تبقى العملات منفصلة، ولا تجمع مكونات رأس المال المتداخلة؛ ما لا يثبته المصدر يظهر غير متاح."
  };
 }
 return {status:"UNSUPPORTED",normalizedQuestion,
  explanation:"لم يتعرف المساعد على نية قراءة معتمدة. لا ينشئ SQL ولا ينفذ أوامر أو تغييرات من اللغة الطبيعية."};
}
export interface NaturalLanguageInvoiceMatch {
 invoiceId:string;invoiceNumber:string;supplierName:string;purchaseOrderNumber:string;
 invoiceDate:string;createdAt:string;currency:string;matchStatus:SupplierInvoiceMatchStatus;
 reviewReason:string|null;lineCount:number;mismatchedLineCount:number;
}
export interface NaturalLanguageInvoiceResult {
 kind:"SUPPLIER_INVOICE";state:"READY"|"PARTIAL"|"EMPTY";intent:SupplierInvoiceIntent;
 answer:string;sourceRpc:"fetch_purchase_supplier_invoice_workspace";asOfDate:string;
 totalInvoiceCount:number;inspectedInvoiceCount:number;matchedQueryCount:number;completePopulation:boolean;
 countsByStatus:Record<SupplierInvoiceMatchStatus,number>;invoices:NaturalLanguageInvoiceMatch[];notice:string|null;
}
export interface NaturalLanguagePurchaseOrder {
 id:string;number:string;supplierName:string;warehouseName:string;status:"submitted"|"partially_received";
 submittedAt:string|null;updatedAt:string;itemCount:number;pendingLineCount:number;
}
export interface NaturalLanguagePurchaseOrderResult {
 kind:"PURCHASE_ORDER";state:"READY"|"PARTIAL"|"EMPTY";intent:PurchaseOrderIntent;
 answer:string;sourceRpc:"fetch_purchase_orders";inspectedOrderCount:number;matchedQueryCount:number;
 completePopulation:boolean;countsByStatus:{submitted:number;partially_received:number};
 orders:NaturalLanguagePurchaseOrder[];notice:string|null;
}
export interface NaturalLanguageCustomerRetentionResult {
 kind:"CUSTOMER_RETENTION";state:"READY"|"PARTIAL";intent:CustomerRetentionIntent;
 answer:string;sourceRpc:"get_customer_retention_aggregate";asOf:string;
 period:{from:string;to:string};previousPeriod:{from:string;to:string};completePopulation:boolean;
 population:{total:number|null;activeCurrentPeriod:number|null;retainedCustomers:number|null;repeatPurchaseCustomers:number|null};
 rates:{retentionRate:number|null;repeatPurchaseRate:number|null;averageOrdersPerActiveCustomer:number|null};
 activity:{active30Days:number|null;cooling31To60Days:number|null;atRisk61To90Days:number|null;inactiveOver90Days:number|null;noOrderDate:number|null};
 warnings:string[];
}
export interface NaturalLanguageGrowthRadarResult {
 kind:"GROWTH_RADAR";state:"READY"|"PARTIAL";intent:GrowthRadarIntent;
 answer:string;sourceRpc:"get_customer_retention_aggregate+fetch_product_performance_growth_aggregate+fetch_unavailable_product_search_demand";
 asOf:string;periodDays:30|60|90|180|365;
 completePopulation:boolean;radar:GrowthOpportunityRadarResult;
 productSourceStatus:"READY"|"PARTIAL"|"UNAVAILABLE";
 productCoverage:{totalCount:number;returnedCount:number;uncomparableUnitCount:number}|null;
 unavailableDemandSourceStatus:"READY"|"PARTIAL"|"UNAVAILABLE";
 unavailableDemandCoverage:{totalCount:number;returnedCount:number;coverageStartedOn:string|null}|null;
}
export interface NaturalLanguageTaskPerformanceResult {
 kind:"TASK_PERFORMANCE";state:TaskPerformanceScorecard["status"];
 intent:TaskPerformanceIntent;answer:string;
 sourceRpc:"fetch_task_performance_scorecard";queriedAt:string;
 scorecard:TaskPerformanceScorecard;
}
export interface NaturalLanguageCommercePolicyResult {
 kind:"COMMERCE_POLICY";state:"READY"|"EMPTY"|"PARTIAL";intent:CommercePolicyIntent;
 answer:string;sourceRpc:"fetch_commerce_policy_catalog";asOf:string;
 totalCount:number;returnedCount:number;completePopulation:boolean;
 lifecycleCounts:Record<"SCHEDULED"|"EFFECTIVE"|"EXPIRED"|"SUPERSEDED",number>;
 sourceChangedCount:number;
}



export interface NaturalLanguageSupplierPerformanceResult {
 kind:"SUPPLIER_PERFORMANCE";state:"READY"|"PARTIAL"|"EMPTY";intent:SupplierPerformanceIntent;
 answer:string;sourceRpc:"fetch_supplier_performance_snapshot";asOf:string;period:{from:string;to:string};
 totalSupplierCount:number;returnedSupplierCount:number;completePopulation:boolean;
 aggregate:{purchaseOrderCount:number|null;completedOrderCount:number|null;openOrderCount:number|null;
  inconsistentReceivedCount:number|null;backlogLineCount:number|null;leadTimeSampleCount:number|null;
  suppliersWithReliableLeadTime:number|null;promisedDeliverySampleCount:number|null;onTimeCount:number|null;onTimePercent:number|null};
 withheldReasons:string[];
}
export interface NaturalLanguageInventoryResult {
 kind:"INVENTORY";state:"READY"|"PARTIAL"|"EMPTY";intent:InventoryIntent;
 answer:string;sourceRpc:"get_inventory_intelligence_aggregate";asOf:string;period:{from:string;to:string};
 totalProducts:number;completePopulation:boolean;
 deadStock:{active:number|null;slowMoving:number|null;stagnant:number|null;zeroMovement:number|null;unknown:number|null};
 replenishment:{recommendedProducts:number|null;noActionProducts:number|null;withheldProducts:number|null};
 warnings:string[];
}
export interface NaturalLanguageProcessBottleneckResult {
 kind:"PROCESS_BOTTLENECK";state:"READY"|"PARTIAL"|"UNAVAILABLE";intent:ProcessBottleneckIntent;
 answer:string;sourceRpc:"fetch_process_bottleneck_snapshot";asOf:string;
 period:{from:string;to:string};baselinePeriod:{from:string;to:string}|null;
 findings:Array<{processKey:"ORDERS"|"QUOTES"|"PURCHASE"|"INVOICES"|"TASKS";stageKey:string;
  waitClass:string;sampleCount:number;medianMinutes:number;p90Minutes:number;recommendation:string}>;
 comparisons:Array<{processKey:"ORDERS"|"QUOTES"|"PURCHASE"|"INVOICES"|"TASKS";stageKey:string;
  currentMedianMinutes:number;baselineMedianMinutes:number;changeMinutes:number;changePercent:number|null;note:string}>;
 sourceCoverage:Array<{key:"ORDERS"|"QUOTES"|"PURCHASE"|"INVOICES"|"TASKS";status:"VERIFIED"|"UNAVAILABLE";sampleCount:number|null;message:string}>;
 reopenedTasks:number|null;withheldReasons:string[];
}
export interface NaturalLanguageProcessTasksResult {
 kind:"PROCESS_TASKS";state:"READY"|"UNAVAILABLE";intent:ProcessTaskIntent;
 answer:string;sourceRpc:"fetch_process_bottleneck_snapshot";asOf:string;period:{from:string;to:string};
 taskCount:number|null;oldestAgeMinutes:number|null;oldestOpenedAt:string|null;
 completeSource:boolean;sourceMessage:string;
}
export interface NaturalLanguageTaskReportResult {
 kind:"TASK_REPORT";state:"READY"|"EMPTY";intent:TaskIntelligenceReportIntent;
 answer:string;sourceRpc:"fetch_task_intelligence_report";report:TaskIntelligenceReport;
}
export interface NaturalLanguageExpectedCollectionsResult {
 kind:"EXPECTED_COLLECTIONS";state:"READY"|"PARTIAL"|"EMPTY";intent:ExpectedCollectionsIntent;
 answer:string;sourceRpc:"get_intelligence_aggregate";asOf:string;period:{from:string;to:string};
 invoiceCount:number|null;completeSchedule:boolean;
 currencies:Array<{currency:string;amount:number;invoiceCount:number}>;
 warnings:string[];
}
export interface NaturalLanguageTaskQualityResult {
 kind:"TASK_QUALITY";state:TaskQualityMetrics["status"];intent:TaskQualityIntent;
 answer:string;sourceRpc:"fetch_operational_task_quality_metrics";queriedAt:string;quality:TaskQualityMetrics;
}
export interface NaturalLanguageCustomerServiceResult {
 kind:"CUSTOMER_SERVICE";state:"READY"|"EMPTY";intent:CustomerServiceIntent;
 answer:string;sourceRpc:"get_customer_service_work_queue_summary";queriedAt:string;asOf:string;
 scope:"ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION";completePopulation:true;
 primaryCount:number;summary:{
  openCount:number;responseOverdueCount:number;resolutionOverdueCount:number;
  unassignedCount:number;urgentCount:number;highCount:number;
 };
}
export interface NaturalLanguageDecisionMemoryResult {
 kind:"DECISION_MEMORY";state:DecisionMemoryBookResult["status"];intent:DecisionMemoryIntent;
 answer:string;sourceRpc:"fetch_decision_outcomes";queriedAt:string;memory:DecisionMemoryBookResult;
}
export interface NaturalLanguageCustomerQuotePipelineResult extends CustomerQuotePipelineResult {
 intent:"CUSTOMER_QUOTE_PIPELINE_OVERVIEW";
}
export interface NaturalLanguageShiftOperationsResult {
 kind:"SHIFT_OPERATIONS";state:ShiftOperationsCenterResult["status"];intent:ShiftOperationsIntent;
 answer:string;sourceRpc:"fetch_operational_shift_workspace";businessDate:string;
 asOf:string;result:ShiftOperationsCenterResult;
}
export interface NaturalLanguageDecisionOutcomesResult {
 kind:"DECISION_OUTCOMES";state:"READY"|"EMPTY"|"PARTIAL";intent:DecisionOutcomesIntent;
 answer:string;sourceRpc:"fetch_decision_outcomes";queriedAt:string;
 totalCount:number;inspectedCount:number;primaryCount:number;completePopulation:boolean;
 countsByState:Record<DecisionOutcomeState,number>;
}

export interface NaturalLanguageBusinessHealthResult {
 kind:"BUSINESS_HEALTH";state:"READY"|"PARTIAL";intent:BusinessHealthIntent;
 answer:string;sourceRpc:"get_inventory_intelligence_aggregate";asOf:string;
 map:BusinessHealthMapResult;
 sources:{
  inventory:{status:"READY";asOf:string;period:{from:string;to:string};totalProducts:number;returnedProducts:number};
  cashflow:{status:"READY";asOf:string;period:{from:string;to:string};scheduleStatus:string;completeness:string;warnings:string[]}
   |{status:"UNAVAILABLE";message:string};
  retention:{status:"READY";asOf:string;period:{from:string;to:string};populationComplete:boolean;customerCount:number|null}
   |{status:"UNAVAILABLE";message:string};
 };
}

export type NaturalLanguageResolvedResult=SupplierQuoteComparisonAssistantResult|NaturalLanguageInvoiceResult|NaturalLanguagePurchaseOrderResult|NaturalLanguageCustomerRetentionResult|NaturalLanguageSupplierPerformanceResult|NaturalLanguageInventoryResult|NaturalLanguageProcessBottleneckResult|NaturalLanguageProcessTasksResult|NaturalLanguageTaskReportResult|NaturalLanguageExpectedCollectionsResult|NaturalLanguageTaskQualityResult|NaturalLanguageCustomerServiceResult|NaturalLanguageDecisionOutcomesResult|NaturalLanguageDecisionMemoryResult|NaturalLanguageShiftOperationsResult|NaturalLanguageCustomerQuotePipelineResult|NaturalLanguageGrowthRadarResult|NaturalLanguageTaskPerformanceResult|NaturalLanguageCommercePolicyResult|NaturalLanguageBusinessHealthResult|SalesOrderStatusSummary;
export function resolveSupplierInvoiceIntent(
 intent:SupplierInvoiceIntent,records:SupplierInvoiceRecord[],metadata:{invoiceCount:number;hasMore:boolean;asOfDate:string},
):NaturalLanguageInvoiceResult {
 const counts:Record<SupplierInvoiceMatchStatus,number>={matched:0,variance_pending:0,variance_approved:0,variance_rejected:0};
 for(const invoice of records)counts[invoice.matchStatus]+=1;
 const invoices=records.filter(invoice=>{
  if(intent==="SUPPLIER_INVOICES_UNMATCHED")return invoice.matchStatus!=="matched";
  if(intent==="SUPPLIER_INVOICES_PRICE_REVIEW")return invoice.matchStatus==="variance_pending";
  return invoice.matchStatus==="matched";
 }).map(invoice=>({invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,supplierName:invoice.supplierName,
  purchaseOrderNumber:invoice.purchaseOrderNumber,invoiceDate:invoice.invoiceDate,createdAt:invoice.createdAt,
  currency:invoice.currency,matchStatus:invoice.matchStatus,reviewReason:invoice.reviewReason,
  lineCount:invoice.lines.length,mismatchedLineCount:invoice.lines.filter(line=>!line.priceMatch).length}));
 const completePopulation=!metadata.hasMore&&records.length===metadata.invoiceCount;
 const state=invoices.length===0?(completePopulation?"EMPTY":"PARTIAL"):(completePopulation?"READY":"PARTIAL");
 const labels:Record<SupplierInvoiceIntent,string>={SUPPLIER_INVOICES_UNMATCHED:"ذات فروق سعر",
  SUPPLIER_INVOICES_PRICE_REVIEW:"التي تنتظر مراجعة فرق السعر",SUPPLIER_INVOICES_MATCHED:"المطابقة"};
 const answer=state==="EMPTY"?"لم توجد فواتير موردين بهذه الحالة ضمن كامل السجلات التي أعادها المصدر. المقصود هنا حالة فرق سعر الوحدة في المطابقة الثلاثية."
  :state==="PARTIAL"?"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" ضمن أحدث "+records.length+
   " فاتورة مفحوصة؛ إجمالي السجلات "+metadata.invoiceCount+". النتيجة جزئية ولا تثبت عدم وجود نتائج أقدم."
  :"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" من أصل "+metadata.invoiceCount+
   " فاتورة في المصدر. المقصود فروق سعر الوحدة بين الفاتورة وتكلفة أمر الشراء والاستلام.";
 return {kind:"SUPPLIER_INVOICE",state,intent,answer,sourceRpc:"fetch_purchase_supplier_invoice_workspace",
  asOfDate:metadata.asOfDate,totalInvoiceCount:metadata.invoiceCount,inspectedInvoiceCount:records.length,
  matchedQueryCount:invoices.length,completePopulation,countsByStatus:counts,invoices,
  notice:completePopulation?null:"المصدر يعيد أحدث 100 فاتورة فقط في هذا المسار؛ لم تُقرأ الصفحات التالية، لذلك بقيت النتيجة جزئية."};
}
type Raw=Record<string,unknown>;
function asObject(value:unknown):Raw|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Raw:null;}
function nonEmpty(value:unknown):value is string{return typeof value==="string"&&value.trim().length>0;}
function validDateOrNull(value:unknown):value is string|null{return value===null||(typeof value==="string"&&Number.isFinite(Date.parse(value)));}
type PurchaseOrderSourceStatus="draft"|"submitted"|"partially_received"|"received"|"cancelled";
interface ParsedPurchaseOrderSource {
 id:string;number:string;supplierName:string;warehouseName:string;status:PurchaseOrderSourceStatus;
 submittedAt:string|null;updatedAt:string;itemCount:number;pendingLineCount:number;
}
function parsePurchaseOrderSource(value:unknown):ParsedPurchaseOrderSource|null {
 const row=asObject(value);if(!row)return null;
 if(!nonEmpty(row.id)||!nonEmpty(row.purchase_order_number)||!nonEmpty(row.supplier_name)||
  !nonEmpty(row.warehouse_name)||!["draft","submitted","partially_received","received","cancelled"].includes(String(row.status))||
  !validDateOrNull(row.submitted_at)||!nonEmpty(row.updated_at)||!Number.isFinite(Date.parse(row.updated_at))||
  !Array.isArray(row.items))return null;
 let pendingLineCount=0;
 for(const rawItem of row.items){
  const item=asObject(rawItem);if(!item)return null;
  const ordered=typeof item.quantity_ordered==="number"?item.quantity_ordered:Number(item.quantity_ordered);
  const received=typeof item.quantity_received==="number"?item.quantity_received:Number(item.quantity_received);
  const remaining=typeof item.remaining_quantity==="number"?item.remaining_quantity:Number(item.remaining_quantity);
  if(!Number.isFinite(ordered)||!Number.isFinite(received)||!Number.isFinite(remaining)||ordered<0||received<0||
   remaining<0||received>ordered||Math.abs(ordered-received-remaining)>0.0005)return null;
  if(remaining>0)pendingLineCount+=1;
 }
 return {id:row.id,number:row.purchase_order_number,supplierName:row.supplier_name,warehouseName:row.warehouse_name,
  status:row.status as PurchaseOrderSourceStatus,submittedAt:row.submitted_at as string|null,
  updatedAt:row.updated_at,itemCount:row.items.length,pendingLineCount};
}
export function resolvePurchaseOrderIntent(intent:PurchaseOrderIntent,rawOrders:unknown):NaturalLanguagePurchaseOrderResult|null {
 if(!Array.isArray(rawOrders)||rawOrders.length>500)return null;
 const parsed=rawOrders.map(parsePurchaseOrderSource);if(parsed.some(x=>x===null))return null;
 const all=parsed as ParsedPurchaseOrderSource[];
 const orders=all.filter(order=>order.status==="submitted"||order.status==="partially_received")
  .map(order=>({...order,status:order.status as "submitted"|"partially_received"}));
 const counts={submitted:orders.filter(x=>x.status==="submitted").length,
  partially_received:orders.filter(x=>x.status==="partially_received").length};
 const matching=orders.filter(order=>{
  if(intent==="PURCHASE_ORDERS_AWAITING_RECEIPT")return order.status==="submitted";
  if(intent==="PURCHASE_ORDERS_PARTIAL_RECEIPT")return order.status==="partially_received";
  return order.status==="submitted"||order.status==="partially_received";
 });
 const completePopulation=rawOrders.length<500;
 const state=matching.length===0?(completePopulation?"EMPTY":"PARTIAL"):(completePopulation?"READY":"PARTIAL");
 const labels:Record<PurchaseOrderIntent,string>={PURCHASE_ORDERS_OPEN:"المفتوحة",
  PURCHASE_ORDERS_AWAITING_RECEIPT:"التي تنتظر الاستلام",PURCHASE_ORDERS_PARTIAL_RECEIPT:"المستلمة جزئياً"};
 const answer=state==="EMPTY"?"لا توجد أوامر شراء بهذه الحالة ضمن السجلات التي أعادها المصدر."
  :state==="PARTIAL"?"عُثر على "+matching.length+" من أوامر الشراء "+labels[intent]+
   " ضمن أحدث "+orders.length+" أمراً. المصدر محدود بـ500 أمر؛ النتيجة جزئية."
  :"عُثر على "+matching.length+" من أوامر الشراء "+labels[intent]+" ضمن كامل السجلات المتاحة.";
 return {kind:"PURCHASE_ORDER",state,intent,answer,sourceRpc:"fetch_purchase_orders",
  inspectedOrderCount:orders.length,matchedQueryCount:matching.length,completePopulation,
  countsByStatus:counts,orders:matching,notice:completePopulation?null:
  "أعاد المصدر سقفه الأقصى (500 أمر)؛ لا يمكن إثبات اكتمال المجموعة أو استبعاد أوامر أقدم."};
}


/** Projects only aggregate customer-retention metrics; customer refs and activity rows never reach the assistant UI. */
export function resolveCustomerRetentionIntent(
 intent:CustomerRetentionIntent,report:CustomerRetentionReport,
):NaturalLanguageCustomerRetentionResult {
 const completePopulation=report.status==="VERIFIED";
 const state=completePopulation?"READY":"PARTIAL";
 const numberLabel=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0}).format(value);
 const rateLabel=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:1}).format(value)+"%";
 const periodLabel=report.period.from+" إلى "+report.period.to;
 const previousLabel=report.previousPeriod.from+" إلى "+report.previousPeriod.to;
 let answer:string;
 if(!completePopulation){
  answer="تعذر اعتماد مجتمع العملاء كاملاً لهذه اللقطة؛ لم تُعرض أعداد أو نسب تقديرية. راجع حالة التغطية والتحذيرات قبل اتخاذ قرار.";
 }else if(intent==="CUSTOMER_DORMANCY_RISK"){
  answer="حالة نشاط العملاء في الفترة "+periodLabel+": فتور 31–60 يوماً "+numberLabel(report.activity.cooling31To60Days)+"، معرضون للخمول 61–90 يوماً "+numberLabel(report.activity.atRisk61To90Days)+"، وخاملون لأكثر من 90 يوماً "+numberLabel(report.activity.inactiveOver90Days)+".";
 }else if(intent==="CUSTOMER_REPEAT_PURCHASE"){
  answer="في الفترة "+periodLabel+" بلغ عدد العملاء المتكررين "+numberLabel(report.population.repeatPurchaseCustomers)+"، ومعدل تكرار الشراء "+rateLabel(report.repeatPurchaseRate)+"، ومتوسط الطلبات لكل عميل نشط "+(report.averageOrdersPerActiveCustomer===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(report.averageOrdersPerActiveCustomer))+".";
 }else{
  answer="في الفترة "+periodLabel+" بلغ مجتمع العملاء "+numberLabel(report.population.total)+"، والنشطون "+numberLabel(report.population.activeCurrentPeriod)+"، والمستمرون "+numberLabel(report.population.retainedCustomers)+"، والمتكررون "+numberLabel(report.population.repeatPurchaseCustomers)+". معدل الاحتفاظ "+rateLabel(report.retentionRate)+". تمت المقارنة مع الفترة السابقة "+previousLabel+".";
 }
 return {
  kind:"CUSTOMER_RETENTION",state,intent,answer,sourceRpc:"get_customer_retention_aggregate",asOf:report.asOf,
  period:report.period,previousPeriod:report.previousPeriod,completePopulation,
  population:{total:report.population.total,activeCurrentPeriod:report.population.activeCurrentPeriod,
   retainedCustomers:report.population.retainedCustomers,repeatPurchaseCustomers:report.population.repeatPurchaseCustomers},
  rates:{retentionRate:report.retentionRate,repeatPurchaseRate:report.repeatPurchaseRate,
   averageOrdersPerActiveCustomer:report.averageOrdersPerActiveCustomer},
  activity:{active30Days:report.activity.active30Days,cooling31To60Days:report.activity.cooling31To60Days,
   atRisk61To90Days:report.activity.atRisk61To90Days,inactiveOver90Days:report.activity.inactiveOver90Days,
   noOrderDate:report.activity.noOrderDate},
  warnings:[...report.warnings],
 };
}


/** Projects only full-population supplier aggregates; supplier and order identities are not returned. */
export function resolveSupplierPerformanceIntent(
 intent:SupplierPerformanceIntent,result:SupplierPerformanceResult,
):NaturalLanguageSupplierPerformanceResult {
 const complete=result.completePopulation&&result.state!=="PARTIAL";
 const suppliers=result.suppliers;
 const sum=(key:"purchaseOrderCount"|"completedOrderCount"|"openOrderCount"|"inconsistentReceivedCount"|"backlogLineCount"|"leadTimeSampleCount"|"promisedDeliverySampleCount"|"onTimeCount")=>
  suppliers.reduce((total,supplier)=>total+supplier[key],0);
 const promisedSamples=sum("promisedDeliverySampleCount"),onTimeCount=sum("onTimeCount");
 const aggregate=complete?{
  purchaseOrderCount:sum("purchaseOrderCount"),completedOrderCount:sum("completedOrderCount"),
  openOrderCount:sum("openOrderCount"),inconsistentReceivedCount:sum("inconsistentReceivedCount"),
  backlogLineCount:sum("backlogLineCount"),leadTimeSampleCount:sum("leadTimeSampleCount"),
  suppliersWithReliableLeadTime:suppliers.filter(supplier=>supplier.leadTimeSampleCount>=3).length,
  promisedDeliverySampleCount:promisedSamples,onTimeCount,
  onTimePercent:promisedSamples>=3?Math.round(onTimeCount/promisedSamples*1000)/10:null,
 }:{
  purchaseOrderCount:null,completedOrderCount:null,openOrderCount:null,inconsistentReceivedCount:null,
  backlogLineCount:null,leadTimeSampleCount:null,suppliersWithReliableLeadTime:null,
  promisedDeliverySampleCount:null,onTimeCount:null,onTimePercent:null,
 };
 let answer:string;
 if(!complete){
  answer="مجموعة الموردين في هذه النافذة جزئية: أُعيد "+result.returnedSupplierCount+" من أصل "+result.totalSupplierCount+" مورداً. حُجبت المجاميع والنسب حتى لا تُعرض عينة الموردين كأنها كامل مجتمع المشتريات.";
 }else if(result.state==="EMPTY"){
  answer="لا توجد أوامر شراء مؤهلة ضمن نافذة "+result.period.from+" إلى "+result.period.to+".";
 }else if(intent==="SUPPLIER_DELIVERY_ADHERENCE"){
  answer="في نافذة "+result.period.from+" إلى "+result.period.to+" توجد "+promisedSamples+" مشاهدة مكتملة مرتبطة بمدة توريد موعودة؛ معدل الالتزام الكلي "+(aggregate.onTimePercent===null?"غير متاح لعدم بلوغ 3 مشاهدات":aggregate.onTimePercent.toFixed(1)+"%")+".";
 }else{
  answer="في نافذة "+result.period.from+" إلى "+result.period.to+" شمل التحليل "+aggregate.purchaseOrderCount+" أمر شراء عبر "+result.totalSupplierCount+" مورداً؛ المكتمل "+aggregate.completedOrderCount+"، والمفتوح "+aggregate.openOrderCount+"، وسطـور الاستلام المتبقية "+aggregate.backlogLineCount+". الموردون ذوو 3 عينات زمن توريد على الأقل: "+aggregate.suppliersWithReliableLeadTime+".";
 }
 return {
  kind:"SUPPLIER_PERFORMANCE",state:complete?result.state:"PARTIAL",intent,answer,
  sourceRpc:"fetch_supplier_performance_snapshot",asOf:result.asOf,period:{from:result.period.from,to:result.period.to},
  totalSupplierCount:result.totalSupplierCount,returnedSupplierCount:result.returnedSupplierCount,completePopulation:complete,
  aggregate,withheldReasons:[...result.withheldReasons],
 };
}


/** Aggregate-only inventory projections; per-SKU values, UOM quantities and financial exposure stay out of the assistant. */
export function resolveInventoryIntent(
 intent:InventoryIntent,input:{
  asOf:string;period:{from:string;to:string};totalProducts:number;completePopulation:boolean;
  deadStock:DeadStockReport;replenishment:ReplenishmentRecommendation[];
 },
):NaturalLanguageInventoryResult {
 const complete=input.completePopulation;
 const movementVerified=complete&&input.deadStock.status==="VERIFIED"&&input.deadStock.items.length===input.totalProducts;
 const stockCounts=movementVerified?{
  active:input.deadStock.items.filter(item=>item.classification==="ACTIVE").length,
  slowMoving:input.deadStock.items.filter(item=>item.classification==="SLOW_MOVING").length,
  stagnant:input.deadStock.items.filter(item=>item.classification==="STAGNANT").length,
  zeroMovement:input.deadStock.items.filter(item=>item.classification==="ZERO_MOVEMENT").length,
  unknown:input.deadStock.items.filter(item=>item.classification==="UNKNOWN").length,
 }:{active:null,slowMoving:null,stagnant:null,zeroMovement:null,unknown:null};
 const recommendationCoverage=complete&&input.replenishment.length===input.totalProducts;
 const replenishmentCounts=recommendationCoverage?{
  recommendedProducts:input.replenishment.filter(item=>item.status==="VERIFIED"&&item.action==="RECOMMEND").length,
  noActionProducts:input.replenishment.filter(item=>item.status==="VERIFIED"&&item.action==="NO_ACTION").length,
  withheldProducts:input.replenishment.filter(item=>item.status!=="VERIFIED"||item.action==="WITHHELD").length,
 }:{recommendedProducts:null,noActionProducts:null,withheldProducts:null};
 const warnings=[...new Set([
  ...input.deadStock.warnings,
  ...input.replenishment.flatMap(item=>item.warnings),
 ])].slice(0,20);
 const state=!complete||intent==="DEAD_STOCK_OVERVIEW"&&!movementVerified||intent==="REPLENISHMENT_OVERVIEW"&&!recommendationCoverage
  ?"PARTIAL":input.totalProducts===0?"EMPTY":"READY";
 let answer:string;
 if(!complete){
  answer="تغطية مجموعة المنتجات غير مكتملة؛ حُجبت المجاميع حتى لا تتحول العينة إلى نتيجة كاملة.";
 }else if(input.totalProducts===0){
  answer="لا توجد منتجات نشطة موثقة ضمن مجتمع المنتجات الذي أعاده مصدر المؤسسة.";
 }else if(intent==="DEAD_STOCK_OVERVIEW"){
  answer=movementVerified
   ?"من أصل "+input.totalProducts+" منتجاً: النشط "+stockCounts.active+"، بطيء الحركة "+stockCounts.slowMoving+"، الراكد "+stockCounts.stagnant+"، بلا حركة في السجل "+stockCounts.zeroMovement+"."
   :"لم تُعتمد تصنيفات الحركة لهذه اللقطة؛ لم تُعرض أعداد الراكد أو النشط كتغطية مكتملة.";
 }else{
  answer=recommendationCoverage
   ?"من أصل "+input.totalProducts+" منتجاً: توجد توصية إعادة توريد موثقة لـ"+replenishmentCounts.recommendedProducts+" منتجاً، ولا حاجة مثبتة لـ"+replenishmentCounts.noActionProducts+"، وتوصية محجوبة لـ"+replenishmentCounts.withheldProducts+" بسبب نقص أو عدم اتساق أحد المدخلات."
   :"تغطية توصيات إعادة التوريد لا تطابق مجتمع المنتجات؛ حُجبت المجاميع.";
 }
 return {
  kind:"INVENTORY",state,intent,answer,sourceRpc:"get_inventory_intelligence_aggregate",
  asOf:input.asOf,period:input.period,totalProducts:input.totalProducts,completePopulation:complete,
  deadStock:stockCounts,replenishment:replenishmentCounts,warnings,
 };
}


/** Projects only aggregate stage timings from complete, authorized source populations. */
export function resolveProcessBottlenecksIntent(
 intent:ProcessBottleneckIntent,result:ProcessBottleneckResult,
):NaturalLanguageProcessBottleneckResult {
 const findings=result.findings.map(item=>({
  processKey:item.processKey,stageKey:item.stageKey,waitClass:item.waitClass,sampleCount:item.sampleCount,
  medianMinutes:item.medianMinutes,p90Minutes:item.p90Minutes,recommendation:item.recommendation,
 }));
 const comparisons=result.comparisons.map(item=>({
  processKey:item.processKey,stageKey:item.stageKey,currentMedianMinutes:item.currentMedianMinutes,
  baselineMedianMinutes:item.baselineMedianMinutes,changeMinutes:item.changeMinutes,
  changePercent:item.changePercent,note:item.note,
 }));
 const sourceCoverage=result.sourceCoverage.map(item=>({
  key:item.key,status:item.status,sampleCount:item.sampleCount,message:item.message,
 }));
 const processCount=sourceCoverage.filter(item=>item.status==="VERIFIED"&&item.sampleCount!==null).length;
 const answer=result.state==="UNAVAILABLE"
  ?"لا تتوفر مصادر عمليات مكتملة ومصرح بها تكفي لإصدار نتيجة موثوقة؛ لم تُعامل المصادر غير المتاحة كأنها لا تحتوي عملاً."
  :findings.length===0
   ?"لم تظهر مراحل تستوفي شرط العينة (3 فترات مكتملة على الأقل) في المصادر الموثقة ضمن النافذة المحددة. هذا لا يعني عدم وجود انتظار في المصادر غير المتاحة."
   :"تم رصد "+findings.length+" مرحلة ذات زمن دورة قابل للقياس عبر "+processCount+" مصادر مكتملة. الترتيب حسب وسيط زمن الانتظار؛ لا يثبت سبباً أو مسؤولية فردية.";
 return {
  kind:"PROCESS_BOTTLENECK",state:result.state,intent,answer,
  sourceRpc:"fetch_process_bottleneck_snapshot",asOf:result.asOf,
  period:{from:result.period.from,to:result.period.to},
  baselinePeriod:result.baselinePeriod?{from:result.baselinePeriod.from,to:result.baselinePeriod.to}:null,
  findings,comparisons,sourceCoverage,reopenedTasks:result.reopenedTasks,
  withheldReasons:[...result.withheldReasons],
 };
}


/** Builds a human-readable Section 58 summary from canonical task counts only. */
export function resolveTaskIntelligenceReport(
 intent:TaskIntelligenceReportIntent,report:TaskIntelligenceReport,
):NaturalLanguageTaskReportResult {
 const totals=report.roleSummaries.reduce((acc,row)=>({
  created:acc.created+row.newCount,open:acc.open+row.openCount,
  overdue:acc.overdue+row.overdueOpenCount,completed:acc.completed+row.completedCount,
  reopened:acc.reopened+row.reopenedEventCount,high:acc.high+row.highImpactOpenCount,
 }),{created:0,open:0,overdue:0,completed:0,reopened:0,high:0});
 const answer=report.state==="EMPTY"
  ?"لا توجد سجلات مهام في مجتمع البيانات الذي تسمح صلاحيتك برؤيته."
  :report.reportKind==="MANAGER"
   ?"توجد "+report.scope.managerRiskTotalCount+" مهمة مفتوحة عالية أو حرجة الأولوية؛ عُرضت "+report.scope.managerRiskReturnedCount+" منها مرتبة حسب الأولوية والاستحقاق والعمر."
   :"الفترة "+report.period.from+" إلى "+report.period.to+" UTC: "+totals.created+" مهمة جديدة، "+totals.overdue+" متأخرة، "+totals.completed+" أُكملت لأول مرة، و"+totals.reopened+" حدث إعادة فتح. المفتوح حالياً "+totals.open+"، وعالي/حرج الأولوية "+totals.high+".";
 return {kind:"TASK_REPORT",state:report.state,intent,answer,
  sourceRpc:"fetch_task_intelligence_report",report};
}

/** Sums only fully verified scheduled customer receivables and keeps each currency independent. */
export function resolveExpectedCollectionsIntent(
 data:CashflowScheduleSnapshot,
):NaturalLanguageExpectedCollectionsResult {
 const grouped=new Map<string,{amount:number;invoiceCount:number}>();
 let valid=data.status==="OK"&&data.completeness==="COMPLETE"&&data.quality==="ACCEPTABLE"&&
  data.schedule.status==="VERIFIED"&&data.schedule.completeness==="COMPLETE"&&data.schedule.quality==="ACCEPTABLE"&&
  !data.warnings.includes("MEASUREMENT_METRIC_WITHHELD");
 for(const entry of data.schedule.entries){
  if(entry.direction!=="INFLOW"||entry.amount.status!=="VERIFIED"||entry.amount.completeness!=="COMPLETE"||
   entry.amount.quality!=="ACCEPTABLE"||!Number.isFinite(entry.amount.value)||entry.amount.value<0||
   entry.dueDate<data.period.from||entry.dueDate>data.period.to){valid=false;continue;}
  const group=grouped.get(entry.amount.currency)??{amount:0,invoiceCount:0};
  group.amount+=entry.amount.value;group.invoiceCount+=1;
  if(!Number.isFinite(group.amount)||Math.abs(group.amount)>Number.MAX_SAFE_INTEGER)valid=false;
  grouped.set(entry.amount.currency,group);
 }
 const proofByCurrency=new Map(data.measurementMetrics.map(metric=>[metric.currency,metric]));
 if(grouped.size!==data.measurementMetrics.length)valid=false;
 for(const [currency,group] of grouped){
  const proof=proofByCurrency.get(currency);
  if(!proof||proof.status!=="VERIFIED"||proof.completeness!=="COMPLETE"||proof.quality!=="ACCEPTABLE"||
   proof.asOf!==data.asOf||proof.period.from!==data.period.from||proof.period.to!==data.period.to||
   proof.formulaId!=="nasr1.receivables-outstanding"||proof.formulaVersion!=="1"||
   Math.abs(group.amount-proof.value)>0.01)valid=false;
 }
 const warnings=[...new Set(data.warnings)];
 const completeSchedule=valid;
 const currencies=valid?[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,group])=>({
  currency,amount:Number(group.amount.toFixed(2)),invoiceCount:group.invoiceCount,
 })):[]; 
 const state=!valid?"PARTIAL":data.schedule.entries.length===0?"EMPTY":"READY";
 const invoiceCount=valid?data.schedule.entries.length:null;
 const totalCurrencies=currencies.length;
 const answer=!valid
  ?"مصدر الاستحقاقات أو أدلة المبالغ غير مكتملة؛ حُجبت جميع الإجماليات ولم تُعرض أرقام جزئية على أنها نهائية."
  :data.schedule.entries.length===0
   ?"لا توجد فواتير عملاء مستحقة ضمن نافذة "+data.period.from+" إلى "+data.period.to+"."
   :"توجد "+invoiceCount+" فاتورة مستحقة للتحصيل ضمن "+totalCurrencies+" عملة في الفترة "+data.period.from+" إلى "+data.period.to+". المبالغ هي أرصدة فواتير بعد طرح الدفعات المسجلة، وليست توقعاً لاحتمال التحصيل.";
 return {
  kind:"EXPECTED_COLLECTIONS",state,intent:"EXPECTED_CUSTOMER_COLLECTIONS",answer,
  sourceRpc:"get_intelligence_aggregate",asOf:data.asOf,period:data.period,invoiceCount,
  completeSchedule,currencies,warnings,
 };
}


/** Projects only aggregate counts from the authorized, current decision page; no owner or business payload is exposed. */
export function resolveDecisionOutcomesIntent(
 intent:DecisionOutcomesIntent,items:DecisionOutcomeView[],totalCount:number,queriedAt:string,
):NaturalLanguageDecisionOutcomesResult {
 const countsByState:Record<DecisionOutcomeState,number>={
  PROPOSED:0,IN_REVIEW:0,APPROVED:0,REJECTED:0,DEFERRED:0,ASSIGNED:0,EXECUTING:0,EXECUTED:0,MEASURED:0,
 };
 for(const item of items)countsByState[item.state]+=1;
 const selected=items.filter(item=>{
  if(intent==="DECISIONS_DEFERRED")return item.state==="DEFERRED";
  if(intent==="DECISIONS_PENDING_REVIEW")return item.state==="IN_REVIEW";
  if(intent==="DECISIONS_AWAITING_EXECUTION")return item.state==="APPROVED"||item.state==="ASSIGNED";
  return true;
 });
 const completePopulation=items.length===totalCount;
 const state:NaturalLanguageDecisionOutcomesResult["state"]=!completePopulation?"PARTIAL":selected.length===0?"EMPTY":"READY";
 const labels:Record<DecisionOutcomesIntent,string>={
  DECISION_OUTCOMES_OVERVIEW:"القرارات",
  DECISIONS_PENDING_REVIEW:"القرارات قيد المراجعة",
  DECISIONS_AWAITING_EXECUTION:"القرارات المعتمدة بانتظار بدء التنفيذ",
  DECISIONS_DEFERRED:"القرارات المؤجلة",
 };
 const answer=state==="PARTIAL"
  ?"أعاد المصدر "+selected.length+" نتيجة مطابقة ضمن "+items.length+" قراراً مفحوصاً من أصل "+totalCount+"؛ هذه الصفحة جزئية ولا تمثل كامل التوزيع أو جميع القرارات المطابقة."
  :state==="EMPTY"
   ?"لا توجد "+labels[intent]+" في كامل نطاق السجلات الذي أعاده المصدر."
   :intent==="DECISION_OUTCOMES_OVERVIEW"
    ?"يعرض سجل المصدر "+totalCount+" قراراً. قُرئت جميع السجلات وأُحصيت الحالات الحالية لكل قرار."
    :"يوجد "+selected.length+" من "+totalCount+" ضمن فئة "+labels[intent]+".";
 return {
  kind:"DECISION_OUTCOMES",state,intent,answer,sourceRpc:"fetch_decision_outcomes",queriedAt,
  totalCount,inspectedCount:items.length,primaryCount:selected.length,completePopulation,countsByState,
 };
}

/** Projects the existing server-authorized shift decision packet without creating or changing a shift. */
export function resolveShiftOperationsIntent(
 result:ShiftOperationsCenterResult,
):NaturalLanguageShiftOperationsResult {
 const requiredOpening=result.openingChecks.filter(item=>item.state==="ACTION_REQUIRED").length;
 const requiredClosing=result.closingChecks.filter(item=>item.state==="ACTION_REQUIRED").length;
 const unknownChecks=[...result.openingChecks,...result.closingChecks].filter(item=>item.state==="UNKNOWN").length;
 const incompleteSources=result.sourceCoverage.filter(source=>!source.notApplicable&&(
  source.status!=="VERIFIED"||source.completeness!=="COMPLETE"||!source.completePopulation
 )).length;
 const financial=result.financialClose.state==="ELIGIBLE"?"مؤهل للمراجعة":
  result.financialClose.state==="BLOCKED"?"محجوب بوجود موانع":
  result.financialClose.state==="NOT_RECORDED"?"لم يسجل":"غير متحقق";
 const answer="وردية "+result.shiftLabel+" بتاريخ "+result.businessDate+
  ": جاهزية الافتتاح "+(result.openingReadiness==="READY"?"جاهز":result.openingReadiness==="ATTENTION"?"تحتاج معالجة":"غير متحقق")+
  "، والإقفال التشغيلي "+(result.operationalClose==="COMPLETE"?"مكتمل":result.operationalClose==="PARTIAL"?"جزئي":"غير متحقق")+
  "، والإقفال المالي "+financial+". عناصر افتتاح تتطلب إجراء: "+requiredOpening+
  "، عناصر إقفال تتطلب إجراء: "+requiredClosing+
  "، فحوص غير متحققة: "+unknownChecks+
  "، ومصادر غير مكتملة أو غير مثبتة: "+incompleteSources+".";
 return {
  kind:"SHIFT_OPERATIONS",state:result.status,intent:"SHIFT_OPERATIONS_OVERVIEW",
  answer,sourceRpc:"fetch_operational_shift_workspace",businessDate:result.businessDate,
  asOf:result.asOf,result,
 };
}

/** Exposes only validated decision-memory records and evidence-backed review drafts. */
export function resolveDecisionMemoryIntent(
 memory:DecisionMemoryBookResult,queriedAt:string,
):NaturalLanguageDecisionMemoryResult {
 if(!Number.isFinite(Date.parse(queriedAt)))throw new Error("decision_memory_query_time_invalid");
 const suggestions=buildDecisionPolicyReviewSuggestions(memory.records);
 const answer=memory.totalCount===0
  ?"لا توجد قرارات محفوظة في المصدر الحالي؛ لم تُنشأ سجلات افتراضية."
  :memory.status==="VERIFIED"
   ?"اكتمل تحميل "+memory.loadedCount+" قراراً. الذاكرة المكتملة "+memory.completeCount+"، والقرارات المقاسة "+memory.measuredCount+"، والقياسات المثبتة القابلة للمقارنة "+memory.verifiedMeasurementCount+"، ومسودات مراجعة القواعد "+suggestions.length+"."
   :"حُمّل "+memory.loadedCount+" قراراً من أصل "+memory.totalCount+"؛ الذاكرة المكتملة "+memory.completeCount+"، والجزئية أو غير الموثقة "+memory.partialCount+"، والقياسات المثبتة القابلة للمقارنة "+memory.verifiedMeasurementCount+"، ومسودات المراجعة "+suggestions.length+". هذه نتيجة جزئية وليست مراجعة شاملة للتاريخ.";
 return {
  kind:"DECISION_MEMORY",state:memory.status,intent:"DECISION_MEMORY_OVERVIEW",
  answer,sourceRpc:"fetch_decision_outcomes",queriedAt,memory,
 };
}

/** Projects the aggregate-only, complete tenant service snapshot without exposing case/customer details. */
export function resolveCustomerServiceIntent(
 intent:CustomerServiceIntent,
 snapshot:import("./customer-service-intelligence-client").CustomerServiceIntelligenceSnapshot,
 queriedAt:string,
):NaturalLanguageCustomerServiceResult {
 const summary=snapshot.summary;
 const primaryCount=intent==="CUSTOMER_SERVICE_OVERVIEW"?summary.openCount:
  intent==="CUSTOMER_SERVICE_RESPONSE_OVERDUE"?summary.responseOverdueCount:
  intent==="CUSTOMER_SERVICE_RESOLUTION_OVERDUE"?summary.resolutionOverdueCount:
  summary.unassignedCount;
 const state=primaryCount===0?"EMPTY":"READY";
 const answer=intent==="CUSTOMER_SERVICE_OVERVIEW"
  ?state==="EMPTY"?"لا توجد حالات خدمة عملاء نشطة حالياً في المؤسسة.":"توجد "+summary.openCount+" حالة نشطة. منها "+summary.responseOverdueCount+" تجاوزت موعد أول استجابة، و"+summary.resolutionOverdueCount+" تجاوزت موعد الحل، و"+summary.unassignedCount+" غير مسندة. الحالات العاجلة: "+summary.urgentCount+"، والعالية: "+summary.highCount+"."
  :intent==="CUSTOMER_SERVICE_RESPONSE_OVERDUE"
   ?state==="EMPTY"?"لا توجد حالات نشطة تجاوزت موعد أول استجابة حتى "+snapshot.asOf+".":"توجد "+primaryCount+" حالة نشطة تجاوزت موعد أول استجابة حتى "+snapshot.asOf+"."
   :intent==="CUSTOMER_SERVICE_RESOLUTION_OVERDUE"
    ?state==="EMPTY"?"لا توجد حالات نشطة تجاوزت موعد الحل حتى "+snapshot.asOf+".":"توجد "+primaryCount+" حالة نشطة تجاوزت موعد الحل حتى "+snapshot.asOf+"."
    :state==="EMPTY"?"كل الحالات النشطة مسندة حالياً؛ لا توجد حالات بلا مسؤول.":"توجد "+primaryCount+" حالة نشطة بلا مسؤول مسند.";
 return {
  kind:"CUSTOMER_SERVICE",state,intent,answer,
  sourceRpc:"get_customer_service_work_queue_summary",queriedAt,asOf:snapshot.asOf,
  scope:snapshot.scope,completePopulation:true,primaryCount,
  summary:{
   openCount:summary.openCount,responseOverdueCount:summary.responseOverdueCount,
   resolutionOverdueCount:summary.resolutionOverdueCount,unassignedCount:summary.unassignedCount,
   urgentCount:summary.urgentCount,highCount:summary.highCount,
  },
 };
}

/** Projects authorized task queue/reopen counts only after the task-role coverage gate succeeds. */
export function resolveProcessTasksIntent(
 intent:ProcessTaskIntent,result:ProcessBottleneckResult,
):NaturalLanguageProcessTasksResult {
 const coverage=result.sourceCoverage.find(item=>item.key==="TASKS");
 const completeSource=Boolean(coverage&&coverage.status==="VERIFIED"&&coverage.completePopulation);
 const queue=result.queues.find(item=>item.processKey==="TASKS");
 const taskCount=intent==="OPEN_TASKS_OVERVIEW"
  ?(completeSource&&queue?queue.openCount:null)
  :(completeSource&&result.reopenedTasks!==null?result.reopenedTasks:null);
 const state=taskCount===null?"UNAVAILABLE":"READY";
 const answer=taskCount===null
  ?"مصدر المهام غير متاح لهذا الدور أو لم يكتمل إثبات تغطيته؛ لم يُفسر غياب المصدر على أنه صفر مهام."
  :intent==="OPEN_TASKS_OVERVIEW"
   ?taskCount===0?"لا توجد مهام مفتوحة حالياً ضمن الأدوار التي تسمح صلاحيتك برؤيتها."
    :"توجد "+taskCount+" مهمة مفتوحة حالياً ضمن الأدوار التي تسمح صلاحيتك برؤيتها."
   :taskCount===0?"لم تسجل إعادة فتح للمهام خلال الفترة المحددة."
    :"سُجلت "+taskCount+" عملية إعادة فتح لمهمة خلال الفترة المحددة.";
 return {
  kind:"PROCESS_TASKS",state,intent,answer,sourceRpc:"fetch_process_bottleneck_snapshot",
  asOf:result.asOf,period:{from:result.period.from,to:result.period.to},
  taskCount,oldestAgeMinutes:intent==="OPEN_TASKS_OVERVIEW"&&queue?queue.oldestAgeMinutes:null,
  oldestOpenedAt:intent==="OPEN_TASKS_OVERVIEW"&&queue?queue.oldestOpenedAt:null,
  completeSource,sourceMessage:coverage?.message??"مصدر المهام لا يقدم تغطية لهذا الدور.",
 };
}
