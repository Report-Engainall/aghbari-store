import { supabase } from "@/lib/supabase";
import { fetchSupplierInvoiceWorkspace } from "@/lib/supplier-invoices";
import { fetchCustomerRetentionAggregate } from "./customer-retention-client";
import { fetchSupplierPerformance } from "./supplier-performance-client";
import { fetchCustomerQuotePipeline } from "./customer-quote-pipeline-client";
import { createInventoryIntelligencePeriod,fetchInventoryIntelligence } from "./inventory-intelligence-client";
import { fetchProcessBottlenecks } from "./process-bottlenecks-client";
import { fetchTaskIntelligenceReport } from "./task-intelligence-reports-client";
import { createCashflowScheduleRequest,fetchCashflowSchedule } from "./cashflow-schedule-client";
import { fetchOperationalTaskQualityMetrics } from "./task-quality-reviews-client";
import { fetchCustomerServiceIntelligenceSummary } from "./customer-service-intelligence-client";
import { fetchDecisionOutcomes, fetchDecisionOutcomeCollection } from "./decision-outcome-client";
import { buildDecisionMemoryBook } from "./decision-memory";
import { fetchOperationalShiftWorkspace } from "./shift-operations-client";
import { fetchSupplierQuotes } from "@/lib/supplier-quotes";
import { buildSupplierQuoteComparisonAssistant } from "./supplier-quote-comparison-assistant";
import { fetchTaskPerformanceScorecard } from "./task-performance-scorecard-client";
import { fetchCommercePolicyCatalog } from "./commerce-policy-governance-client";
import { buildDeadStockReport } from "./dead-stock";
import { buildReplenishmentRecommendations } from "./replenishment";
import { fetchBusinessHealthAssistantSummary } from "./business-health-assistant-client";
import { fetchSalesOrderStatusSnapshot } from "./sales-order-status-summary-client";
import { fetchProductPerformanceGrowthContext } from "./product-performance-growth-client";
import { fetchUnavailableProductSearchDemand } from "./unavailable-product-search-demand-client";
import { buildGrowthOpportunityRadar } from "./growth-opportunities";
import { resolveSalesOrderStatusIntent, type SalesOrderStatusIntent } from "./sales-order-status-summary";
import { planNaturalLanguageQuery,resolvePurchaseOrderIntent,resolveSupplierInvoiceIntent,
 type NaturalLanguagePlanResult,type NaturalLanguageResolvedResult,type ShiftOperationsIntent,resolveShiftOperationsIntent,type SupplierInvoiceIntent,type PurchaseOrderIntent,type CustomerRetentionIntent,resolveCustomerRetentionIntent,type SupplierPerformanceIntent,resolveSupplierPerformanceIntent,type InventoryIntent,resolveInventoryIntent,type ProcessBottleneckIntent,resolveProcessBottlenecksIntent,type ProcessTaskIntent,resolveProcessTasksIntent,type TaskIntelligenceReportIntent,resolveTaskIntelligenceReport,type ExpectedCollectionsIntent,resolveExpectedCollectionsIntent,type TaskQualityIntent,type CustomerServiceIntent,resolveCustomerServiceIntent,type DecisionOutcomesIntent,resolveDecisionOutcomesIntent,type GrowthRadarIntent,type TaskPerformanceIntent,type CommercePolicyIntent,resolveDecisionMemoryIntent } from "./natural-language-assistant";
export type NaturalLanguageAssistantResponse=
 |{status:"RESULT";plan:Extract<NaturalLanguagePlanResult,{status:"READY"}>;result:NaturalLanguageResolvedResult}
 |{status:"CLARIFICATION"|"UNSUPPORTED";plan:Exclude<NaturalLanguagePlanResult,{status:"READY"}>}
 |{status:"NOT_FOUND";message:string;plan:Extract<NaturalLanguagePlanResult,{status:"READY"}>}
 |{status:"DENIED"|"UNAVAILABLE"|"ERROR";message:string};
function mapFailure(error:unknown):NaturalLanguageAssistantResponse {
 const failure=error as {code?:string;message?:string};
 if(failure?.code==="42501"||failure?.code==="28000"||failure?.code==="PGRST301")
  return {status:"DENIED",message:"لا تملك الصلاحية المطلوبة لقراءة مصدر البيانات المعتمد لهذا السؤال."};
 if(failure?.code==="PGRST202"||failure?.code==="42883"||/function .* does not exist|could not find the function/i.test(failure?.message??""))
  return {status:"UNAVAILABLE",message:"خدمة القراءة المعتمدة لهذا السؤال غير متاحة في قاعدة البيانات المتصلة؛ لم تُستخدم بيانات بديلة."};
 return {status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر التطبيق المصرح به."};
}
export async function runNaturalLanguageAssistantQuery(question:string):Promise<NaturalLanguageAssistantResponse> {
 const plan=planNaturalLanguageQuery(question);
 if(plan.status!=="READY")return {status:plan.status,plan};
 try {
  if(plan.intent==="BUSINESS_HEALTH_OVERVIEW"){
   const health=await fetchBusinessHealthAssistantSummary();
   if(!health.ok)return {status:health.status,message:health.message};
   return {status:"RESULT",plan,result:{
    kind:"BUSINESS_HEALTH",state:health.data.state,intent:"BUSINESS_HEALTH_OVERVIEW",
    answer:health.data.answer,sourceRpc:"get_inventory_intelligence_aggregate",
    asOf:health.data.map.asOf,map:health.data.map,sources:health.data.sources,
   }};
  }
  if(plan.sourceRpc==="fetch_commerce_policy_catalog"){
   const result=await fetchCommercePolicyCatalog();
   if(!result.ok)return {status:result.status==="NOT_FOUND"?"ERROR":result.status,message:result.message};
   const catalog=result.data;
   if(!Number.isSafeInteger(catalog.totalCount)||catalog.totalCount<0||
      !Number.isSafeInteger(catalog.returnedCount)||catalog.returnedCount<0||
      catalog.returnedCount!==catalog.items.length||catalog.totalCount<catalog.returnedCount||
      typeof catalog.completePopulation!=="boolean"||
      (catalog.completePopulation&&catalog.totalCount!==catalog.returnedCount)||
      !Number.isFinite(Date.parse(catalog.asOf))){
    return {status:"ERROR",message:"استجابة سجل السياسات لا تتوازن مع تغطية المصدر؛ حُجبت المؤشرات."};
   }
   const lifecycleCounts:Record<"SCHEDULED"|"EFFECTIVE"|"EXPIRED"|"SUPERSEDED",number> = {
    SCHEDULED:0,EFFECTIVE:0,EXPIRED:0,SUPERSEDED:0,
   };
   for(const item of catalog.items)lifecycleCounts[item.lifecycle]+=1;
   const sourceChangedCount=catalog.items.filter(item=>item.sourceChanged).length;
   const state=!catalog.completePopulation?"PARTIAL":catalog.totalCount===0?"EMPTY":"READY";
   const answer=state==="PARTIAL"
    ?"أعاد سجل الحوكمة "+catalog.returnedCount+" سياسة من أصل "+catalog.totalCount+"؛ الملخص جزئي، وفي الصفحة الحالية "+sourceChangedCount+" سياسة تغيرت بصمة مصدرها."
    :state==="EMPTY"?"لا توجد سياسات في سجل الحوكمة الحالي."
    :plan.intent==="COMMERCE_POLICY_SOURCE_CHANGES"
     ?"توجد "+sourceChangedCount+" سياسة من أصل "+catalog.totalCount+" تغيرت بصمة مصادرها وتحتاج مراجعة توافق المصدر."
     :"يعرض سجل الحوكمة "+catalog.totalCount+" سياسة: "+lifecycleCounts.EFFECTIVE+" سارية، "+lifecycleCounts.SCHEDULED+" مجدولة، "+lifecycleCounts.EXPIRED+" منتهية، و"+lifecycleCounts.SUPERSEDED+" مستبدلة.";
   return {status:"RESULT",plan,result:{
    kind:"COMMERCE_POLICY",state,intent:plan.intent as CommercePolicyIntent,
    answer,sourceRpc:"fetch_commerce_policy_catalog",asOf:catalog.asOf,
    totalCount:catalog.totalCount,returnedCount:catalog.returnedCount,
    completePopulation:catalog.completePopulation,lifecycleCounts,sourceChangedCount,
   }};
  }
  if(plan.sourceRpc==="fetch_task_performance_scorecard"){
   const result=await fetchTaskPerformanceScorecard();
   if(!result.ok)return {status:result.status,message:result.message};
   const scorecard=result.scorecard;
   const answer=scorecard.status==="EMPTY"
    ?"لا توجد مهام ضمن الأدوار التي تسمح صلاحيتك برؤيتها في لقطة المصدر الحالية."
    :"بطاقة الأداء تعرض "+scorecard.scope.visibleTaskCount+" مهمة مرئية، موزعة على "+scorecard.scope.visibleRoles.length+" أدوار مصرح بها و"+scorecard.groups.length+" مجموعة نوع/دور. تعرض مؤشرات التغطية وزمن الإكمال وجودة المراجعات المتاحة فقط.";
   return {status:"RESULT",plan,result:{
    kind:"TASK_PERFORMANCE",state:scorecard.status,
    intent:plan.intent as TaskPerformanceIntent,answer,
    sourceRpc:"fetch_task_performance_scorecard",
    queriedAt:new Date().toISOString(),scorecard,
   }};
  }
  if(plan.sourceRpc==="fetch_customer_quote_pipeline"){
   const periodDays=plan.periodDays??90;
   const to=new Date().toISOString().slice(0,10);
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-(periodDays-1));
   const pipeline=await fetchCustomerQuotePipeline({from:fromDate.toISOString().slice(0,10),to});
   if(!pipeline.ok)return {status:pipeline.status,message:pipeline.message};
   return {status:"RESULT",plan,result:{...pipeline.result,intent:"CUSTOMER_QUOTE_PIPELINE_OVERVIEW"}};
  }
  if(plan.sourceRpc==="fetch_purchase_supplier_quotes"){
   const queriedAt=new Date().toISOString();
   const to=queriedAt.slice(0,10);
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-89);
   const [quotes,performance]=await Promise.all([
    fetchSupplierQuotes(),
    fetchSupplierPerformance({from:fromDate.toISOString().slice(0,10),to,limit:200}),
   ]);
   const result=buildSupplierQuoteComparisonAssistant(quotes,queriedAt,performance);
   return {status:"RESULT",plan,result};
  }
  if(plan.sourceRpc==="fetch_operational_shift_workspace"){
   if(!plan.businessDate)return {status:"ERROR",message:"تاريخ العمل مطلوب قبل قراءة مركز الوردية."};
   const workspace=await fetchOperationalShiftWorkspace({businessDate:plan.businessDate});
   if(!workspace.ok){
    if(workspace.status==="NOT_FOUND")return {status:"NOT_FOUND",message:workspace.message,plan};
    return {status:workspace.status,message:workspace.message};
   }
   return {status:"RESULT",plan,result:resolveShiftOperationsIntent(workspace.data.result)};
  }
  if(plan.sourceRpc==="fetch_intelligence_sales_order_status_summary"){
   const source=await fetchSalesOrderStatusSnapshot();
   if(!source.ok)return {status:source.status,message:source.message};
   return {status:"RESULT",plan,result:resolveSalesOrderStatusIntent(
    plan.intent as SalesOrderStatusIntent,source.snapshot,
   )};
  }
  if(plan.sourceRpc==="fetch_decision_outcomes"){
   const queriedAt=new Date().toISOString();
   if(plan.intent==="DECISION_MEMORY_OVERVIEW"){
    const collection=await fetchDecisionOutcomeCollection();
    if(!collection.ok)return {status:collection.status==="DENIED"?"DENIED":collection.status==="UNAVAILABLE"?"UNAVAILABLE":"ERROR",message:collection.message};
    const memory=buildDecisionMemoryBook({
     generatedAt:queriedAt,
     outcomes:collection.collection.items,
     snapshots:[],
     totalOutcomes:collection.collection.total,
     sourceCoverageComplete:collection.collection.complete,
     sourceCoverageWarning:collection.collection.complete
      ?undefined:"DECISION_HISTORY_PAGE_COVERAGE_"+collection.collection.reason,
    });
    return {status:"RESULT",plan,result:resolveDecisionMemoryIntent(memory,queriedAt)};
   }
   const outcomes=await fetchDecisionOutcomes(100,0);
   if(!outcomes.ok)return {status:outcomes.status==="DENIED"?"DENIED":outcomes.status==="UNAVAILABLE"?"UNAVAILABLE":"ERROR",message:outcomes.message};
   return {status:"RESULT",plan,result:resolveDecisionOutcomesIntent(
    plan.intent as DecisionOutcomesIntent,outcomes.items,outcomes.total,queriedAt)};
  }
  if(plan.sourceRpc==="get_customer_service_work_queue_summary"){
   const snapshot=await fetchCustomerServiceIntelligenceSummary();
   if(!snapshot.ok)return {status:snapshot.status,message:snapshot.message};
   return {status:"RESULT",plan,result:resolveCustomerServiceIntent(
    plan.intent as CustomerServiceIntent,snapshot.data,new Date().toISOString())};
  }
  if(plan.sourceRpc==="fetch_operational_task_quality_metrics"){
   const quality=await fetchOperationalTaskQualityMetrics();
   const answer=quality.status==="READY"
    ?"هذه مؤشرات مراجعات الجودة المحفوظة. تقيس أحكام المراجعين ولا تثبت وحدها نجاح الإجراء أو أثره."
    :quality.status==="EMPTY"
     ?"لا توجد مراجعات جودة محفوظة في نطاق الصلاحية الحالي؛ لا يعني ذلك أن المهام أو التنبيهات صحيحة تلقائياً."
     :quality.status==="RESTRICTED"
      ?"تفاصيل جودة المهام والتوصيات محجوبة لهذا الحساب؛ يلزم دور مدير أو مسؤول."
      :"مؤشرات الجودة غير متاحة من المصدر المعتمد حالياً؛ لم تُستبدل بأرقام صفرية.";
   return {status:"RESULT",plan,result:{
    kind:"TASK_QUALITY",state:quality.status,intent:plan.intent as TaskQualityIntent,
    answer,sourceRpc:"fetch_operational_task_quality_metrics",
    queriedAt:new Date().toISOString(),quality,
   }};
  }
  if(plan.sourceRpc==="fetch_task_intelligence_report"){
   if(!plan.taskReportKind)return {status:"ERROR",message:"نوع تقرير المهام غير محدد؛ لم يُنفذ طلب غير مكتمل."};
   const report=await fetchTaskIntelligenceReport(plan.taskReportKind);
   if(!report.ok)return {status:report.status,message:report.message};
   return {status:"RESULT",plan,result:resolveTaskIntelligenceReport(
    plan.intent as TaskIntelligenceReportIntent,report.report)};
  }
  if(plan.sourceRpc==="get_intelligence_aggregate"){
   const request=createCashflowScheduleRequest({horizonDays:plan.horizonDays??30});
   const schedule=await fetchCashflowSchedule(request);
   if(!schedule.ok)return {status:schedule.status,message:schedule.message};
   return {status:"RESULT",plan,result:resolveExpectedCollectionsIntent(schedule.data)};
  }
  if(plan.sourceRpc==="fetch_process_bottleneck_snapshot"){
   const to=new Date().toISOString().slice(0,10);
   const days=plan.periodDays??30;
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-(days-1));
   const from=fromDate.toISOString().slice(0,10);
   const baselineToDate=new Date(from+"T00:00:00.000Z");
   baselineToDate.setUTCDate(baselineToDate.getUTCDate()-1);
   const baselineTo=baselineToDate.toISOString().slice(0,10);
   const baselineFromDate=new Date(baselineTo+"T00:00:00.000Z");
   baselineFromDate.setUTCDate(baselineFromDate.getUTCDate()-(days-1));
   const process=await fetchProcessBottlenecks({
    from,to,baselineFrom:baselineFromDate.toISOString().slice(0,10),baselineTo,
   });
   if(!process.ok)return {status:process.status,message:process.message};
   if(plan.intent==="OPEN_TASKS_OVERVIEW"||plan.intent==="REOPENED_TASKS_OVERVIEW"){
    return {status:"RESULT",plan,result:resolveProcessTasksIntent(
     plan.intent as ProcessTaskIntent,process.result)};
   }
   return {status:"RESULT",plan,result:resolveProcessBottlenecksIntent(
    plan.intent as ProcessBottleneckIntent,process.result)};
  }
  if(plan.sourceRpc==="get_inventory_intelligence_aggregate"){
   const request=createInventoryIntelligencePeriod(new Date(),92);
   const inventory=await fetchInventoryIntelligence(request.period,request.asOf);
   if(!inventory.ok){
    return {status:inventory.status==="DENIED"?"DENIED":inventory.status==="ERROR"?"ERROR":"UNAVAILABLE",
     message:inventory.message};
   }
   const deadStock=buildDeadStockReport({
    id:"natural-language-dead-stock:"+inventory.data.asOf,
    asOf:inventory.data.asOf,period:inventory.data.period,
    evidenceRecords:inventory.data.evidenceRecords,products:inventory.data.deadStockProducts,
    rule:{id:"dead-stock-days",version:"1.0.0",activeWithinDays:30,stagnantAfterDays:90,
     lowTurnoverRatio:0.1,turnoverWindowDays:92},
   });
   const replenishment=buildReplenishmentRecommendations({
    id:"natural-language-replenishment:"+inventory.data.asOf,
    asOf:inventory.data.asOf,period:inventory.data.period,
    evidenceRecords:inventory.data.evidenceRecords,products:inventory.data.replenishmentProducts,
   });
   return {status:"RESULT",plan,result:resolveInventoryIntent(
    plan.intent as InventoryIntent,{
     asOf:inventory.data.asOf,period:inventory.data.period,totalProducts:inventory.data.totalProducts,
     completePopulation:inventory.data.totalProducts===inventory.data.returnedProducts,
     deadStock,replenishment:replenishment.recommendations,
    })};
  }
  if(plan.sourceRpc==="fetch_supplier_performance_snapshot"){
   const to=new Date().toISOString().slice(0,10);
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-((plan.periodDays??90)-1));
   const supplier=await fetchSupplierPerformance({from:fromDate.toISOString().slice(0,10),to,limit:200});
   if(!supplier.ok)return {status:supplier.status,message:supplier.message};
   return {status:"RESULT",plan,result:resolveSupplierPerformanceIntent(
    plan.intent as SupplierPerformanceIntent,supplier.result)};
  }
  if(plan.sourceRpc==="get_customer_retention_aggregate"){
   const periodDays=plan.periodDays??90;
   const retention=await fetchCustomerRetentionAggregate(periodDays,new Date().toISOString());
   if(!retention.ok)return {status:retention.status,message:retention.message};
   if(plan.intent==="GROWTH_RADAR_OVERVIEW"){
    const customerPopulationComplete=retention.growthInputs.sourceSnapshotVerified&&
      retention.data.population.total!==null;
    const [product,unavailableDemand]=await Promise.all([
      fetchProductPerformanceGrowthContext(periodDays,retention.data.asOf),
      fetchUnavailableProductSearchDemand(periodDays,retention.data.asOf),
    ]);
    const productPopulationComplete=product.ok&&product.context.completePopulation;
    const unavailableDemandPopulationComplete=unavailableDemand.ok&&unavailableDemand.context.completePopulation;
    const completePopulation=customerPopulationComplete&&productPopulationComplete&&unavailableDemandPopulationComplete;
    const evidenceRecords=[
      ...retention.growthInputs.evidenceRecords,
      ...(product.ok?product.context.evidenceRecords:[]),
      ...(unavailableDemand.ok?unavailableDemand.context.evidenceRecords:[]),
    ];
    const metrics=[
      ...retention.growthInputs.metrics,
      ...(product.ok?product.context.metrics:[]),
      ...(unavailableDemand.ok?unavailableDemand.context.metrics:[]),
    ];
    const signals=[
      ...retention.growthInputs.signals,
      ...(product.ok?product.context.signals:[]),
      ...(unavailableDemand.ok?unavailableDemand.context.signals:[]),
    ];
    let radar=buildGrowthOpportunityRadar({
      id:retention.data.id,
      generatedAt:retention.data.asOf,
      asOf:retention.data.asOf,
      evidenceRecords,
      metrics,
      signals,
      sourceSnapshotVerified:completePopulation,
    });
    const combinedWarnings=[
      ...radar.warnings,
      ...retention.growthRadar.warnings,
      ...(product.ok?product.context.warnings:["PRODUCT_PERFORMANCE_SOURCE_"+product.status]),
      ...(unavailableDemand.ok
        ? unavailableDemand.context.warnings
        : ["UNAVAILABLE_PRODUCT_SEARCH_SOURCE_"+unavailableDemand.status]),
    ];
    if(!completePopulation&&radar.status!=="UNVERIFIED"){
      radar={...radar,status:"NEEDS_REVIEW"};
    }
    radar={...radar,warnings:[...new Set(combinedWarnings)]};
    const productSourceStatus: "READY"|"PARTIAL"|"UNAVAILABLE" =
      !product.ok?"UNAVAILABLE":product.context.completePopulation?"READY":"PARTIAL";
    const unavailableDemandSourceStatus: "READY"|"PARTIAL"|"UNAVAILABLE" =
      !unavailableDemand.ok?"UNAVAILABLE":
      unavailableDemand.context.completePopulation?"READY":"PARTIAL";
    const answer=completePopulation
     ?"رادار النمو قيّم "+radar.evaluatedSignals+" إشارة من أدلة العملاء والمنتجات والبحث المكتمل، وأظهر "+radar.opportunities.length+" فرصة تجاوزت العتبات و"+radar.withheld.length+" إشارة محجوبة. يتضمن البحث منتجات ظهرت في نتائج العملاء وكان رصيدها المتاح صفراً وقت التسجيل، دون حفظ نص البحث أو هوية العميل."
     :"تغطية رادار النمو جزئية: مجتمع العملاء "+(customerPopulationComplete?"مكتمل":"غير مكتمل")+"، وأداء المنتجات "+(productSourceStatus==="READY"?"مكتمل":productSourceStatus==="PARTIAL"?"جزئي":"غير متاح")+"، وطلب الأصناف غير المتاحة "+(unavailableDemandSourceStatus==="READY"?"مكتمل":unavailableDemandSourceStatus==="PARTIAL"?"جزئي":"غير متاح")+". لا تعني الفترة السابقة لبداية التتبع غياب الطلب، ولا يُفسر نقص المصدر على أنه عدم وجود فرصة.";
    return {status:"RESULT",plan,result:{
     kind:"GROWTH_RADAR",state:completePopulation&&radar.status==="VERIFIED"?"READY":"PARTIAL",
     intent:plan.intent as GrowthRadarIntent,answer,
     sourceRpc:"get_customer_retention_aggregate+fetch_product_performance_growth_aggregate+fetch_unavailable_product_search_demand",
     asOf:radar.asOf,periodDays,completePopulation,radar,
     productSourceStatus,
     productCoverage:product.ok?{
      totalCount:product.context.totalProductUnitCount,
      returnedCount:product.context.returnedProductUnitCount,
      uncomparableUnitCount:product.context.uncomparableUnitCount,
     }:null,
     unavailableDemandSourceStatus,
     unavailableDemandCoverage:unavailableDemand.ok?{
      totalCount:unavailableDemand.context.totalProductCount,
      returnedCount:unavailableDemand.context.returnedProductCount,
      coverageStartedOn:unavailableDemand.context.coverageStartedOn,
     }:null,
    }};
   }
   return {status:"RESULT",plan,result:resolveCustomerRetentionIntent(
    plan.intent as CustomerRetentionIntent,retention.data)};
  }
  if(plan.sourceRpc==="fetch_purchase_supplier_invoice_workspace"){
   const workspace=await fetchSupplierInvoiceWorkspace({limit:100,offset:0});
   return {status:"RESULT",plan,result:resolveSupplierInvoiceIntent(
    plan.intent as SupplierInvoiceIntent,workspace.invoices,
    {invoiceCount:workspace.invoiceCount,hasMore:workspace.hasMore,asOfDate:workspace.asOfDate})};
  }
  const {data,error}=await supabase.rpc("fetch_purchase_orders");
  if(error)throw error;
  const result=resolvePurchaseOrderIntent(plan.intent as PurchaseOrderIntent,data);
  if(!result)return {status:"ERROR",message:"استجابة أوامر الشراء لا تطابق عقد المصدر؛ لم تُستخدم بيانات بديلة."};
  return {status:"RESULT",plan,result};
 }catch(error){return mapFailure(error);}
}
