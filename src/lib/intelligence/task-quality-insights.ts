import type { TaskQualityMetrics, TaskQualityReasonCode } from "./task-quality-reviews";
export type TaskQualityInsightState = "READY"|"LOW_SAMPLE"|"EMPTY"|"WITHHELD"|"RESTRICTED"|"UNAVAILABLE";
export interface TaskQualityInsight {key:string;title:string;value:string;state:TaskQualityInsightState;evidence:string;interpretation:string;nextStep:string;}
const REASONS:Record<TaskQualityReasonCode,string>={
 SOURCE_MISSING:"دليل المصدر غير موجود",SOURCE_INCOMPLETE:"بيانات المصدر غير مكتملة",SOURCE_STALE:"بيانات المصدر قديمة",SOURCE_MISMATCH:"عدم تطابق مع المصدر",
 ALREADY_RESOLVED:"المهمة حُلّت بالفعل",DUPLICATE_RECOMMENDATION:"توصية مكررة",OUT_OF_SCOPE:"خارج النطاق التشغيلي",POLICY_CONFLICT:"تعارض مع سياسة معتمدة",
 RESOURCE_UNAVAILABLE:"الموارد غير متاحة",TIMING_NOT_APPROPRIATE:"التوقيت غير مناسب",LOW_EXPECTED_IMPACT:"الأثر المتوقع منخفض",BUDGET_CONSTRAINT:"قيد الميزانية",
 THRESHOLD_NOT_MET:"الحد المعتمد لم يتحقق",OTHER:"سبب آخر موضح"
};
const fmt=(n:number)=>n.toLocaleString("ar-YE");
const pct=(n:number,d:number)=>d>0?(Math.round(n/d*10000)/100).toLocaleString("ar-YE",{maximumFractionDigits:2})+"٪":"غير محسوب";
const sample=(n:number):TaskQualityInsightState=>n<5?"LOW_SAMPLE":"READY";
const note=(s:TaskQualityInsightState)=>s==="LOW_SAMPLE"?"العينة أقل من 5 أحكام حاسمة؛ القراءة وصفية وليست اتجاهاً مستقراً.":s==="WITHHELD"?"حُجب المؤشر لغياب مقام صالح أو دليل كافٍ.":"القيمة مشتقة من عدّ المراجعات المصرح به دون تقدير أو ملء بيانات.";
function card(key:string,title:string,value:string,state:TaskQualityInsightState,evidence:string,interpretation:string,nextStep:string):TaskQualityInsight{
 return{key,title,value,state,evidence,interpretation:interpretation+" "+note(state),nextStep};
}
function sourceState(status:"RESTRICTED"|"UNAVAILABLE"|"EMPTY",evidence:string):TaskQualityInsight[]{
 const value=status==="EMPTY"?"لا توجد مراجعات محفوظة":status==="RESTRICTED"?"يتطلب صلاحية مدير أو مسؤول":"المصدر غير متاح";
 const next=status==="EMPTY"?"ابدأ بتسجيل مراجعات مرتبطة بمهام فعلية؛ لا تستنتج الجودة من غياب المراجعات.":status==="RESTRICTED"?"اعرض المؤشرات داخل جلسة مدير/مسؤول مخولة فقط.":"تحقق من ترحيل خدمة الجودة وتعاقد المصدر؛ لا تستبدل النتيجة بأصفار.";
 return[card("SOURCE_STATE","حالة مصدر جودة المهام",value,status,evidence,"لا تُنتج المنظومة مؤشرات من مصدر محجوب أو غير متاح.",next)];
}
/** Evidence-bounded insight pack: no composite score, causal claim, trend inference or mutation. */
export function buildTaskQualityInsights(m:TaskQualityMetrics):TaskQualityInsight[]{
 if(m.status==="RESTRICTED")return sourceState("RESTRICTED","استجابة صلاحيات المصدر.");
 if(m.status==="UNAVAILABLE")return sourceState("UNAVAILABLE",m.reasonCode);
 if(m.status==="EMPTY")return sourceState("EMPTY",fmt(m.scope.reviewedTaskCount)+" من "+fmt(m.scope.visibleTaskCount)+" مهام مرئية تمت مراجعتها.");
 const out:TaskQualityInsight[]=[];
 const visible=m.scope.visibleTaskCount,reviewed=m.scope.reviewedTaskCount,unreviewed=Math.max(0,visible-reviewed);
 out.push(visible>0
  ?card("REVIEW_COVERAGE","تغطية مراجعة المهام",pct(reviewed,visible),sample(reviewed),fmt(reviewed)+" تمت مراجعتها من "+fmt(visible)+" مهمة مرئية؛ المتبقي "+fmt(unreviewed)+".","نسبة تغطية للمجتمع المرئي، وليست درجة جودة أو حكماً على المهام غير المراجعة.",unreviewed>0?"وجّه المراجعين إلى المهام غير المغطاة وفق صلاحياتهم وأولويتها المعتمدة.":"حافظ على تحديث مجتمع المهام قبل اعتبار التغطية مكتملة.")
  :card("REVIEW_COVERAGE","تغطية مراجعة المهام","غير محسوب","WITHHELD","عدد المهام المرئية يساوي صفراً.","لا يوجد مقام صالح لحساب التغطية.","تحقق من نطاق مجتمع المهام المصرح به."));
 const ad=m.actionability.rateDenominator;
 out.push(card("ACTIONABILITY_RATE","قابلية التنفيذ في الأحكام الحاسمة",m.actionability.actionableRatePercent===null?"غير محسوب":pct(m.actionability.actionableCount,ad),ad===0?"WITHHELD":sample(ad),fmt(m.actionability.actionableCount)+" قابل للتنفيذ من "+fmt(ad)+" حكم حاسم؛ المؤجل "+fmt(m.actionability.deferredCount)+" مستبعد من المقام.","يقيس ACTIONABLE مقابل NOT_ACTIONABLE فقط؛ التأجيل لا يدخل المقام.","راجع أسباب عدم القابلية ومصدر كل توصية قبل تغيير السياسة أو سير العمل."));
 const dd=m.disposition.approvedCount+m.disposition.rejectedCount;
 out.push(card("DISPOSITION_APPROVAL_RATE","قبول التوصيات بين القرارات الحاسمة",dd===0?"غير محسوب":pct(m.disposition.approvedCount,dd),dd===0?"WITHHELD":sample(dd),fmt(m.disposition.approvedCount)+" قبول من "+fmt(dd)+" قرار قبول/رفض؛ المؤجل "+fmt(m.disposition.deferredCount)+" مستبعد.","نسبة القبول تمثل قرار المراجع ولا تثبت نجاح التوصية لاحقاً.","قارن أسباب الرفض بالأدلة والمخاطر قبل إعادة صياغة التوصيات."));
 const fd=m.alerts.falseAlarmDenominator;
 out.push(card("FALSE_ALARM_RATE","نسبة الإنذارات الكاذبة",m.alerts.falseAlarmRatePercent===null?"غير محسوب":pct(m.alerts.falsePositiveCount,fd),fd===0?"WITHHELD":sample(fd),fmt(m.alerts.falsePositiveCount)+" كاذب من "+fmt(fd)+" تنبيه حُسم كصحيح أو كاذب؛ "+fmt(m.alerts.needsReviewCount)+" يحتاج مراجعة ومستبعد من المقام.","تعتمد النسبة على التنبيهات المحسومة فقط؛ NEEDS_REVIEW ليست صحيحة أو كاذبة.","راجع أسباب تقادم المصدر وعدم تطابقه والعتبات دون خفض حساسية الإنذار تلقائياً."));
 const dc=m.disposition.reviewedCount;
 out.push(card("DEFERRED_DISPOSITION_SHARE","حصة قرارات التأجيل",dc===0?"غير محسوب":pct(m.disposition.deferredCount,dc),dc===0?"WITHHELD":sample(dc),fmt(m.disposition.deferredCount)+" تأجيل من "+fmt(dc)+" قرار مراجعة.","التأجيل قرار مستقل وليس رفضاً ولا قبولاً.","راجع أسباب التأجيل والموعد والمالك التالي قبل إعادة إدراج التوصية."));
 const cause=[...m.repeatedCauses].sort((a,b)=>b.affectedTaskCount-a.affectedTaskCount||b.reviewCount-a.reviewCount||a.reasonCode.localeCompare(b.reasonCode))[0];
 out.push(cause
  ?card("REPEATED_CAUSE_LEADER","أكثر سبب متكرر عبر مهام مختلفة",REASONS[cause.reasonCode],"READY",fmt(cause.affectedTaskCount)+" مهام مختلفة · "+fmt(cause.reviewCount)+" مراجعات مرتبطة.","تكرار وصفي في المراجعات؛ لا يثبت سبباً جذرياً أو علاقة سببية.","افحص عينات المهام والمصدر قبل فتح إجراء تحسين أو تغيير سياسة.")
  :card("REPEATED_CAUSE_LEADER","أكثر سبب متكرر عبر مهام مختلفة","لا يوجد سبب متكرر مثبت","EMPTY",fmt(m.causeReviewCount)+" مراجعات سلبية مصنفة؛ لا يوجد سبب يتجاوز مهمة واحدة وفق تعريف المصدر.","لا تُختلق مجموعة متكررة عند غياب دليل على تعدد المهام.","واصل تسجيل الأسباب الموحدة ثم راجع ما يتكرر فعلياً."));
 return out;
}
