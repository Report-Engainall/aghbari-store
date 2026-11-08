import {buildEvidencePassport} from "./evidence-passport";
import type {DecisionCandidate,DecisionImpact,DecisionImpactStatus,DecisionPriority,EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
export type DecisionOperator="GTE"|"GT"|"LTE"|"LT"|"EQ";
export type ImpactOperation="IDENTITY"|"SUM"|"PRODUCT";
export interface ImpactFormula {id:string;version:string;operation:ImpactOperation;metricKeys:string[];resultUnit:string}
export interface DecisionRule {
 id:string;version:string;metricKey:string;operator:DecisionOperator;threshold:number;priority:DecisionPriority;
 what:string;why:string;soWhat:string;whatNext:string;owner:string;expectedOutcome:string;expiresInDays?:number;impactFormula?:ImpactFormula;
}
export type WithheldDecisionReason="NO_SOURCE"|"CONFLICTING_SIGNALS"|"DUPLICATE_METRIC"|"UNAVAILABLE"|"UNVERIFIED"|"NEEDS_REVIEW"|"INCOMPLETE_DATA"|"UNKNOWN_VALUE"|"INVALID_RULE"|"IMPACT_SOURCE_MISSING"|"IMPACT_NOT_VERIFIED"|"CURRENCY_MISMATCH"|"UNIT_MISMATCH"|"INVALID_IMPACT_FORMULA";
export interface WithheldDecision {ruleId:string;metricKey:string;reason:WithheldDecisionReason;evidenceStatus:EvidenceStatus|null;explanation:string}
export interface BuildDailyDecisionsInput {generatedAt:string;asOf:string;evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[];rules:DecisionRule[]}
export interface DailyDecisionResult {generatedAt:string;asOf:string;modelMode:"RULE_BASED";candidates:DecisionCandidate[];withheld:WithheldDecision[]}
const scores:Record<DecisionPriority,number>={P0:400,P1:300,P2:200,P3:100};
function numeric(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
function meets(value:number,op:DecisionOperator,threshold:number):boolean {
 switch(op){case "GTE":return value>=threshold;case "GT":return value>threshold;case "LTE":return value<=threshold;case "LT":return value<threshold;case "EQ":return value===threshold}
}
const withheld=(rule:DecisionRule,reason:WithheldDecisionReason,status:EvidenceStatus|null,explanation:string):WithheldDecision=>({ruleId:rule.id,metricKey:rule.metricKey,reason,evidenceStatus:status,explanation});
function isImpactFormulaValid(formula: ImpactFormula): boolean {
 if (!formula.id.trim() || !formula.version.trim() || !formula.resultUnit.trim() || formula.metricKeys.length === 0) return false;
 if (formula.operation === "IDENTITY" && formula.metricKeys.length !== 1) return false;
 if (formula.operation === "PRODUCT" && formula.metricKeys.length !== 2) return false;
 if (formula.operation === "SUM" && formula.metricKeys.length < 2) return false;
 return true;
}

function impactFor(formula:ImpactFormula|undefined,index:Map<string,MetricSnapshot[]>,anchor:MetricSnapshot):{impact:DecisionImpact|null;status:DecisionImpactStatus;reason:string|null} {
 if(!formula)return {impact:null,status:"NOT_CONFIGURED",reason:"NO_APPROVED_IMPACT_FORMULA"};
 if (!isImpactFormulaValid(formula)) return {impact:null,status:"WITHHELD",reason:"INVALID_IMPACT_FORMULA"};
 const sources:MetricSnapshot[]=[];
 for(const key of formula.metricKeys){const rows=index.get(key)??[];if(rows.length!==1)return {impact:null,status:"WITHHELD",reason:"IMPACT_SOURCE_MISSING"};
  const m=rows[0];if(m.status!=="VERIFIED"||m.completeness!=="COMPLETE"||m.quality!=="ACCEPTABLE"||m.value===null||!m.lineage.evidenceIds.length)
   return {impact:null,status:"WITHHELD",reason:"IMPACT_NOT_VERIFIED"};sources.push(m)}
 const samePeriod=(a:EvidencePeriod|null,b:EvidencePeriod|null)=>a===null||b===null?a===b:a.from===b.from&&a.to===b.to;
 if(sources.some(m=>m.asOf!==anchor.asOf||!samePeriod(m.period,anchor.period)))return {impact:null,status:"WITHHELD",reason:"IMPACT_SCOPE_MISMATCH"};
 const values=sources.map(m=>numeric(m.value));if(values.some(v=>v===null))return {impact:null,status:"WITHHELD",reason:"IMPACT_NOT_VERIFIED"};
 const currencySources=sources.filter(m=>m.unit==="CURRENCY"||m.unit==="CURRENCY_PER_UNIT");
 if(currencySources.some(m=>!m.currency?.trim()))return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 const currencies=[...new Set(currencySources.map(m=>m.currency as string))];
 if(currencies.length>1)return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 if(formula.operation==="SUM"&&(new Set(sources.map(m=>m.unit)).size!==1))return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 if(formula.operation==="IDENTITY"&&formula.resultUnit!==sources[0].unit)return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 if(formula.operation==="SUM"&&formula.resultUnit!==sources[0].unit)return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 if(formula.operation==="PRODUCT"&&currencySources.length===2)return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 if(formula.operation==="PRODUCT"&&currencySources.length===1&&formula.resultUnit!=="CURRENCY")return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 if(formula.operation==="PRODUCT"&&currencySources.length===0&&formula.resultUnit==="CURRENCY")return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 let value=0;const n=values as number[];
 if(formula.operation==="IDENTITY")value=n[0];
 if(formula.operation==="SUM")value=n.reduce((a,b)=>a+b,0);
 if(formula.operation==="PRODUCT")value=n[0]*n[1];
 if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)return {impact:null,status:"WITHHELD",reason:"INVALID_IMPACT_FORMULA"};
 if((formula.resultUnit==="CURRENCY"||formula.resultUnit==="CURRENCY_PER_UNIT")&&currencies.length!==1)return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 return {impact:{value,unit:formula.resultUnit,...(currencies.length===1?{currency:currencies[0]}:{}),formulaId:formula.id,formulaVersion:formula.version,sourceMetricIds:sources.map(m=>m.id)},status:"CALCULATED",reason:null};
}
function expiry(at:string,days:number|undefined):string|null {
 if(days===undefined)return null;if(!Number.isInteger(days)||days<1||days>3650)return null;
 const t=Date.parse(at);return Number.isFinite(t)?new Date(t+days*86400000).toISOString():null;
}
function statusReason(status:EvidenceStatus):{reason:WithheldDecisionReason;message:string} {
 if(status==="UNAVAILABLE")return {reason:"UNAVAILABLE",message:"المصدر غير متاح؛ لم يصدر قرار."};
 if(status==="UNVERIFIED")return {reason:"UNVERIFIED",message:"مصدر المؤشر غير مثبت؛ لم يصدر قرار."};
 if(status==="NEEDS_REVIEW")return {reason:"NEEDS_REVIEW",message:"المؤشر يحتاج مراجعة؛ لم يصدر قرار."};
 return {reason:"INCOMPLETE_DATA",message:"بيانات المؤشر غير مكتملة؛ لم يصدر قرار."};
}
/** Deterministic rule engine. Unknown values stay null; there is no model or write side effect. */
export function buildDailyDecisions(input:BuildDailyDecisionsInput):DailyDecisionResult {
 if(!Number.isFinite(Date.parse(input.generatedAt))||!Number.isFinite(Date.parse(input.asOf)))throw new Error("generatedAt and asOf must be valid timestamps");
 const passport=buildEvidencePassport({id:"daily-decisions:"+input.asOf,generatedAt:input.generatedAt,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics:input.metrics});
 const index=new Map<string,MetricSnapshot[]>();for(const m of passport.metrics){const rows=index.get(m.key)??[];rows.push(m);index.set(m.key,rows)}
 const candidates:DecisionCandidate[]=[],reasons:WithheldDecision[]=[],seen=new Set<string>();
 for(const rule of input.rules){
  if(seen.has(rule.id)){reasons.push(withheld(rule,"INVALID_RULE",null,"Rule ID is duplicated."));continue}seen.add(rule.id);
  if(!rule.id.trim()||!rule.version.trim()||!rule.metricKey.trim()||!Number.isFinite(rule.threshold)||!["P0","P1","P2","P3"].includes(rule.priority)||
   !rule.what.trim()||!rule.why.trim()||!rule.soWhat.trim()||!rule.whatNext.trim()||!rule.owner.trim()||!rule.expectedOutcome.trim()){
   reasons.push(withheld(rule,"INVALID_RULE",null,"Rule metadata is incomplete or invalid."));continue}
  const rows=index.get(rule.metricKey)??[];
  if(!rows.length){reasons.push(withheld(rule,"NO_SOURCE",null,"No sourced metric was provided."));continue}
  if(rows.length>1){const first=rows[0],conflict=rows.some(m=>m.value!==first.value||m.currency!==first.currency||m.status!==first.status);
   reasons.push(withheld(rule,conflict?"CONFLICTING_SIGNALS":"DUPLICATE_METRIC",null,conflict?"Conflicting metric snapshots exist.":"Duplicate metric snapshots exist."));continue}
  const metric=rows[0];
  if(metric.status==="NEEDS_REVIEW"&&metric.value===null){reasons.push(withheld(rule,"UNKNOWN_VALUE",metric.status,"Metric value is null/unknown; no zero was substituted."));continue}
  if(!metric.lineage.evidenceIds.length){reasons.push(withheld(rule,"NO_SOURCE",metric.status,"Metric has no evidence lineage."));continue}
  if(metric.status!=="VERIFIED"){const r=statusReason(metric.status);reasons.push(withheld(rule,r.reason,metric.status,r.message));continue}
  if(metric.completeness!=="COMPLETE"||metric.quality!=="ACCEPTABLE"){reasons.push(withheld(rule,"INCOMPLETE_DATA",metric.status,"Metric quality or completeness gate failed."));continue}
  const value=numeric(metric.value);if(value===null){reasons.push(withheld(rule,"UNKNOWN_VALUE",metric.status,"Metric is unknown or nonnumeric; it was not converted to zero."));continue}
  if(metric.unit==="CURRENCY"&&!metric.currency?.trim()){reasons.push(withheld(rule,"CURRENCY_MISMATCH",metric.status,"Currency is not identified."));continue}
  if(!meets(value,rule.operator,rule.threshold))continue;
  const impact=impactFor(rule.impactFormula,index,metric);
  const related=(rule.impactFormula?.metricKeys??[]).flatMap(key=>index.get(key)??[]);
  const proofMetrics=[metric,...related],evidenceIds=[...new Set(proofMetrics.flatMap(m=>m.lineage.evidenceIds))];
  const formulaVersions=[...new Set(proofMetrics.map(m=>m.lineage.formulaId+"@"+m.lineage.formulaVersion))];
  if(impact.impact)formulaVersions.push(impact.impact.formulaId+"@"+impact.impact.formulaVersion);
  candidates.push({
   id:rule.id+":"+metric.id+":"+metric.asOf,ruleId:rule.id,ruleVersion:rule.version,priority:rule.priority,priorityScore:scores[rule.priority],
   what:rule.what,why:rule.why+" Observed "+value+" "+metric.unit+" against "+rule.operator+" "+rule.threshold+".",
   soWhat:rule.soWhat,impact:impact.impact,impactStatus:impact.status,impactReason:impact.reason,whatNext:rule.whatNext,
   proof:{evidenceIds,metricKeys:[...new Set([metric.key,...(rule.impactFormula?.metricKeys??[])])],asOf:metric.asOf,formulaVersions},
   owner:rule.owner,expectedOutcome:rule.expectedOutcome,createdAt:input.generatedAt,expiresAt:expiry(input.generatedAt,rule.expiresInDays),
  });
 }
 candidates.sort((a,b)=>b.priorityScore-a.priorityScore||a.ruleId.localeCompare(b.ruleId)||a.id.localeCompare(b.id));
 return {generatedAt:input.generatedAt,asOf:input.asOf,modelMode:"RULE_BASED",candidates,withheld:reasons};
}
