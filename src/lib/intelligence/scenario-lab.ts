import {calculateWhatIfSales,type SalesForecastResult} from "../sales-forecast";
import {buildEvidencePassport} from "./evidence-passport";
import type {EvidenceRecord,MetricSnapshot} from "./types";
export interface SalesScenarioAssumption {id:string;label:string;changePercent:number;owner:string}
export interface ScenarioConstraint {minimumChangePercent:number;maximumChangePercent:number}
export interface ScenarioResult {
 id:string;baselineId:string;createdAt:string;asOf:string;currency:string;baseline:number|null;
 assumptions:SalesScenarioAssumption[];result:number|null;changeAmount:number|null;status:"SIMULATED"|"WITHHELD";
 formulaId:string;formulaVersion:string;sourceEvidenceIds:string[];assumptionBoundary:"USER_SUPPLIED";accountingFact:false;limitations:string[];
}
function numericBaseline(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string")return null;
 const normalized=value.trim();
 if(!/^\d+(?:\.\d+)?$/.test(normalized))return null;
 const parsed=Number(normalized);
 return Number.isFinite(parsed)&&parsed>=0&&parsed<=Number.MAX_SAFE_INTEGER?parsed:null;
}
/** Reuses the existing forecast and bounded what-if calculator. No ledger or persistence side effects. */
export function buildSalesScenario(input:{id:string;createdAt:string;asOf:string;currency:string;forecast:SalesForecastResult;
 baselineMetric:MetricSnapshot;evidenceRecords:EvidenceRecord[];assumptions:SalesScenarioAssumption[];constraints:ScenarioConstraint}):ScenarioResult {
 const passport=buildEvidencePassport({id:"scenario:"+input.id,generatedAt:input.createdAt,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics:[input.baselineMetric]});
 const metric=passport.metrics[0],base=numericBaseline(metric.value);
 const limits=input.constraints,limitsValid=Number.isFinite(limits.minimumChangePercent)&&Number.isFinite(limits.maximumChangePercent)&&
  limits.minimumChangePercent>=-100&&limits.maximumChangePercent<=500&&limits.minimumChangePercent<=limits.maximumChangePercent;
 const baselineValid=metric.status==="VERIFIED"&&metric.completeness==="COMPLETE"&&metric.quality==="ACCEPTABLE"&&metric.unit==="CURRENCY"&&
  metric.currency===input.currency&&metric.asOf===input.asOf&&metric.lineage.evidenceIds.length>0&&Boolean(metric.lineage.formulaId.trim())&&
  Boolean(metric.lineage.formulaVersion.trim())&&base!==null&&Number.isFinite(base)&&input.forecast.ready&&Math.abs(base-input.forecast.expectedTotal)<0.005;
 const assumptionsValid=input.assumptions.length>0&&input.assumptions.every(a=>a.id.trim()&&a.label.trim()&&a.owner.trim()&&
  Number.isFinite(a.changePercent)&&limitsValid&&a.changePercent>=limits.minimumChangePercent&&a.changePercent<=limits.maximumChangePercent&&
  a.changePercent>=-100&&a.changePercent<=500);
 const limitations:string[]=[];
 if(!input.forecast.ready)limitations.push("BASELINE_FORECAST_NOT_READY");
 if(!baselineValid)limitations.push("BASELINE_EVIDENCE_NOT_VERIFIED");
 if(!limitsValid)limitations.push("INVALID_SCENARIO_CONSTRAINTS");
 if(!assumptionsValid)limitations.push("SCENARIO_ASSUMPTION_OUT_OF_BOUNDS_OR_INCOMPLETE");
 const factor=assumptionsValid?input.assumptions.reduce((value,a)=>value*(1+a.changePercent/100),1):NaN;
 const change=(factor-1)*100;
 const combinedWithinBounds=Number.isFinite(change)&&limitsValid&&change>=limits.minimumChangePercent&&change<=limits.maximumChangePercent&&change>=-100&&change<=500;
 if(assumptionsValid&&!combinedWithinBounds)limitations.push("COMPOUNDED_SCENARIO_OUT_OF_BOUNDS");
 const result=baselineValid&&base!==null&&assumptionsValid&&combinedWithinBounds?calculateWhatIfSales(base,change):null;
 if(baselineValid&&assumptionsValid&&result===null)limitations.push("SCENARIO_RESULT_UNSAFE");
 const valid=result!==null&&limitations.length===0;
 return {id:input.id,baselineId:metric.id,createdAt:input.createdAt,asOf:input.asOf,currency:input.currency,
  baseline:baselineValid&&base!==null?base:null,assumptions:input.assumptions,result:valid?result:null,
  changeAmount:valid&&base!==null?Number(((result as number)-base).toFixed(2)):null,status:valid?"SIMULATED":"WITHHELD",
  formulaId:"sales.what-if.compound",formulaVersion:"1.0.0",sourceEvidenceIds:baselineValid?metric.lineage.evidenceIds:[],
  assumptionBoundary:"USER_SUPPLIED",accountingFact:false,limitations};
}
