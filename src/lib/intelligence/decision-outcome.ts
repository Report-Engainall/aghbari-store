import type {DecisionActor,DecisionMeasuredOutcome,DecisionOutcome,DecisionOutcomeEventRecord,DecisionOutcomeState} from "./types";
export type DecisionOutcomeEventType="SUBMIT_FOR_REVIEW"|"APPROVE"|"REJECT"|"DEFER"|"ASSIGN"|"START_EXECUTION"|"COMPLETE_EXECUTION"|"MEASURE"|"RESUBMIT_FOR_REVIEW";
export interface DecisionOutcomeEvent extends DecisionOutcomeEventRecord {type:DecisionOutcomeEventType}
export type DecisionTransitionResult=
 |{ok:true;outcome:DecisionOutcome;duplicate:boolean}
 |{ok:false;outcome:DecisionOutcome;reason:"INVALID_EVENT"|"IDEMPOTENCY_CONFLICT"|"INVALID_TRANSITION"|"MISSING_REASON"|"MISSING_OWNER"|"INVALID_MEASUREMENT"};
export function createDecisionOutcome(input:{id:string;candidateId:string;proposedBy:DecisionActor;owner:string;expectedOutcome:string;createdAt:string}):DecisionOutcome {
 if(!input.id.trim()||!input.candidateId.trim()||!input.proposedBy.id.trim()||!input.proposedBy.role.trim()||!input.owner.trim()||
  !input.expectedOutcome.trim()||!Number.isFinite(Date.parse(input.createdAt)))throw new Error("invalid_decision_outcome");
 return {id:input.id,candidateId:input.candidateId,version:1,state:"PROPOSED",proposedBy:input.proposedBy,owner:input.owner,
  expectedOutcome:input.expectedOutcome,reason:null,createdAt:input.createdAt,approvedAt:null,approvedBy:null,assignedAt:null,
  executedAt:null,measuredOutcome:null,eventKeys:[],history:[]};
}
const transitions:Record<DecisionOutcomeState,DecisionOutcomeEventType[]>={
 PROPOSED:["SUBMIT_FOR_REVIEW"],IN_REVIEW:["APPROVE","REJECT","DEFER"],APPROVED:["ASSIGN"],REJECTED:[],DEFERRED:["RESUBMIT_FOR_REVIEW"],
 ASSIGNED:["START_EXECUTION"],EXECUTING:["COMPLETE_EXECUTION"],EXECUTED:["MEASURE"],MEASURED:[],
};
function sameEvent(a:DecisionOutcomeEventRecord,b:DecisionOutcomeEvent):boolean {
 return a.id===b.id&&a.type===b.type&&a.actor.id===b.actor.id&&a.at===b.at&&a.reason===b.reason&&a.owner===b.owner&&
  JSON.stringify(a.measuredOutcome??null)===JSON.stringify(b.measuredOutcome??null);
}
function validMeasurement(m:DecisionMeasuredOutcome|undefined):boolean {
 if(!m)return false;
 const monetary=m.unit==="CURRENCY"||m.unit==="CURRENCY_PER_UNIT";
 const asOf=Date.parse(m.asOf),measuredAt=Date.parse(m.measuredAt);
 const periodValid=m.period===null||
  (Number.isFinite(Date.parse(m.period.from))&&Number.isFinite(Date.parse(m.period.to))&&
   Date.parse(m.period.from)<=Date.parse(m.period.to));
 const evidenceIds=Array.isArray(m.evidenceIds)?m.evidenceIds:[];
 return Boolean(
  m.metricKey.trim()&&Number.isFinite(m.value)&&m.unit.trim()&&
  m.status==="VERIFIED"&&m.completeness==="COMPLETE"&&m.quality==="ACCEPTABLE"&&
  Number.isFinite(asOf)&&Number.isFinite(measuredAt)&&asOf<=measuredAt&&periodValid&&
  m.formulaId.trim()&&m.formulaVersion.trim()&&
  evidenceIds.length>0&&new Set(evidenceIds).size===evidenceIds.length&&evidenceIds.every(id=>typeof id==="string"&&id.trim())&&
  (!monetary||Boolean(m.currency?.trim()))
 );
}
/** Pure transition policy only; P2 must persist actor, tenant, idempotency, version and audit atomically. */
export function transitionDecisionOutcome(outcome:DecisionOutcome,event:DecisionOutcomeEvent):DecisionTransitionResult {
 if(!event.id.trim()||!event.idempotencyKey.trim()||!event.actor.id.trim()||!event.actor.role.trim()||!Number.isFinite(Date.parse(event.at)))
  return {ok:false,outcome,reason:"INVALID_EVENT"};
 const prior=outcome.history.find(item=>item.idempotencyKey===event.idempotencyKey);
 if(prior)return sameEvent(prior,event)?{ok:true,outcome,duplicate:true}:{ok:false,outcome,reason:"IDEMPOTENCY_CONFLICT"};
 if(!transitions[outcome.state].includes(event.type))return {ok:false,outcome,reason:"INVALID_TRANSITION"};
 if((event.type==="REJECT"||event.type==="APPROVE"||event.type==="DEFER"||event.type==="RESUBMIT_FOR_REVIEW")&&!event.reason?.trim())return {ok:false,outcome,reason:"MISSING_REASON"};
 if(event.type==="ASSIGN"&&!event.owner?.trim())return {ok:false,outcome,reason:"MISSING_OWNER"};
 if(event.type==="MEASURE"&&!validMeasurement(event.measuredOutcome))return {ok:false,outcome,reason:"INVALID_MEASUREMENT"};
 const next:Record<DecisionOutcomeEventType,DecisionOutcomeState>={SUBMIT_FOR_REVIEW:"IN_REVIEW",APPROVE:"APPROVED",REJECT:"REJECTED",DEFER:"DEFERRED",
  ASSIGN:"ASSIGNED",START_EXECUTION:"EXECUTING",COMPLETE_EXECUTION:"EXECUTED",MEASURE:"MEASURED",RESUBMIT_FOR_REVIEW:"IN_REVIEW"};
 return {ok:true,duplicate:false,outcome:{...outcome,version:outcome.version+1,state:next[event.type],
  history:[...outcome.history,event],eventKeys:[...outcome.eventKeys,event.idempotencyKey],reason:event.reason??outcome.reason,
  ...(event.type==="APPROVE"?{approvedAt:event.at,approvedBy:event.actor}:{}),
  ...(event.type==="ASSIGN"?{owner:event.owner as string,assignedAt:event.at}:{}),
  ...(event.type==="COMPLETE_EXECUTION"?{executedAt:event.at}:{}),
  ...(event.type==="MEASURE"?{measuredOutcome:event.measuredOutcome as DecisionMeasuredOutcome}:{})}};
}
