import type {AiProvider} from "../../../supabase/functions/ai-gateway/logic";
export type FreeQuotaStatus="AVAILABLE"|"EXHAUSTED"|"NOT_CONFIGURED"|"DISABLED"|"UNKNOWN";
export type AiExecutionMode="MODEL"|"RULE_BASED"|"MODEL_UNAVAILABLE";
export interface FreeProviderQuota {
 provider:AiProvider;model:string;quotaStatus:FreeQuotaStatus;quotaRemaining:number|null;freeTierConfirmed:boolean;
 zeroCostConfirmed:boolean;privacyReviewed:boolean;privacyAllowsQuestionOnly:boolean;inputRate:number|null;outputRate:number|null;
 verifiedAt:string;sourceEvidenceId:string;cooldownUntil:string|null;
}
export interface SanitizedQuestion {ok:boolean;question?:string}
export interface FreeQuotaEvidence {id:string;status:"VERIFIED"|"NEEDS_REVIEW"|"UNVERIFIED"|"UNAVAILABLE";asOf:string;completeness:"COMPLETE"|"PARTIAL"|"UNKNOWN";quality:"ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN"}
export interface AiRouteDecision {
 mode:AiExecutionMode;provider:AiProvider|null;model:string|null;reason:"FREE_PROVIDER_AVAILABLE"|"ALL_FREE_QUOTAS_UNAVAILABLE"|"NO_RULE_ENGINE"|"UNSAFE_QUESTION";
 attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>;paidSpendLimit:0;question:string|null;
}
function freeProviderEligibilityReason(
 provider:FreeProviderQuota,
 now:number,
 providerCounts:Map<string,number>,
 evidenceById:Map<string,FreeQuotaEvidence[]>,
):string {
 const key=JSON.stringify([provider.provider,provider.model]);
 if((providerCounts.get(key)??0)!==1)return "DUPLICATE_PROVIDER_QUOTA_RECORD";
 if(provider.quotaStatus!=="AVAILABLE")return "QUOTA_"+provider.quotaStatus;
 if(!provider.freeTierConfirmed)return "FREE_TIER_NOT_CONFIRMED";
 if(!provider.zeroCostConfirmed||provider.inputRate!==0||provider.outputRate!==0)return "COST_NOT_ZERO";
 if(!provider.privacyReviewed||!provider.privacyAllowsQuestionOnly)return "PRIVACY_NOT_APPROVED";
 if(provider.quotaRemaining===null||!Number.isSafeInteger(provider.quotaRemaining)||provider.quotaRemaining<=0)
  return "QUOTA_REMAINING_UNKNOWN_OR_EMPTY";
 if(typeof provider.model!=="string"||!provider.model.trim()||typeof provider.sourceEvidenceId!=="string"||!provider.sourceEvidenceId.trim())
  return "MODEL_OR_EVIDENCE_MISSING";
 const evidenceRows=evidenceById.get(provider.sourceEvidenceId)??[];
 if(evidenceRows.length>1)return "QUOTA_EVIDENCE_AMBIGUOUS";
 const evidence=evidenceRows[0];
 if(!evidence||evidence.status!=="VERIFIED"||evidence.completeness!=="COMPLETE"||evidence.quality!=="ACCEPTABLE"||evidence.asOf!==provider.verifiedAt)
  return "FREE_QUOTA_EVIDENCE_NOT_VERIFIED";
 const verifiedAt=Date.parse(provider.verifiedAt);
 if(!Number.isFinite(verifiedAt)||now-verifiedAt>86400000||verifiedAt>now)return "PROVIDER_VERIFICATION_STALE";
 if(provider.cooldownUntil!==null&&!Number.isFinite(Date.parse(provider.cooldownUntil)))return "PROVIDER_COOLDOWN_INVALID";
 if(provider.cooldownUntil&&Date.parse(provider.cooldownUntil)>now)return "PROVIDER_COOLDOWN";
 return "ELIGIBLE";
}

/** The only provider payload is the sanitized question; no customer, ledger, stock, margin or tenant DTO is accepted here. */
export function chooseFreeAiRoute(input:{
 question:unknown;sanitize:(question:unknown)=>SanitizedQuestion;asOf:string;providers:FreeProviderQuota[];
 quotaEvidence:FreeQuotaEvidence[];ruleEngineAvailable:boolean;
}):AiRouteDecision {
 const fallback=input.ruleEngineAvailable?"RULE_BASED":"MODEL_UNAVAILABLE";
 let sanitized:SanitizedQuestion;
 try {
  sanitized=input.sanitize(input.question);
 } catch {
  sanitized={ok:false};
 }
 const safeQuestion=sanitized?.ok===true&&typeof sanitized.question==="string"&&
  sanitized.question.trim().length>0&&sanitized.question.length<=1200
   ?sanitized.question.trim():null;
 if(!safeQuestion)return {mode:fallback,provider:null,model:null,
  reason:"UNSAFE_QUESTION",attemptedProviders:[],paidSpendLimit:0,question:null};
 const now=Date.parse(input.asOf);if(!Number.isFinite(now))throw new Error("asOf must be valid");
 const attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>=[];
 const providerKey=(provider:FreeProviderQuota)=>JSON.stringify([provider.provider,provider.model]);
 const providerCounts=new Map<string,number>();
 for(const provider of input.providers)providerCounts.set(providerKey(provider),(providerCounts.get(providerKey(provider))??0)+1);
 const evidenceById=new Map<string,FreeQuotaEvidence[]>();
 for(const record of input.quotaEvidence){const rows=evidenceById.get(record.id)??[];rows.push(record);evidenceById.set(record.id,rows);}
 const selected=[...input.providers].sort((a,b)=>a.provider.localeCompare(b.provider)||a.model.localeCompare(b.model)).find(provider=>{
  const reason=freeProviderEligibilityReason(provider,now,providerCounts,evidenceById);
  attemptedProviders.push({provider:provider.provider,model:provider.model,reason});
  return reason==="ELIGIBLE";
 });
 if(!selected)return {mode:fallback,provider:null,model:null,reason:input.ruleEngineAvailable?"ALL_FREE_QUOTAS_UNAVAILABLE":"NO_RULE_ENGINE",
  attemptedProviders,paidSpendLimit:0,question:safeQuestion};
 return {mode:"MODEL",provider:selected.provider,model:selected.model,reason:"FREE_PROVIDER_AVAILABLE",
  attemptedProviders,paidSpendLimit:0,question:safeQuestion};
}
export interface AiOpsEvent {id:string;provider:AiProvider|null;mode:AiExecutionMode;status:"SUCCEEDED"|"FAILED"|"FALLBACK";reasonCode:string;occurredAt:string;elapsedMs:number|null}
export interface AiOpsSummary {
 asOf:string;total:number;successful:number;failed:number;fallbacks:number;byProvider:Array<{provider:AiProvider;count:number}>;
 lastEventAt:string|null;errorCodes:string[];containsPrompts:false;containsSecrets:false;
}
const aiProviderValues = new Set<AiProvider>(["openai_compatible", "gemini"]);
const aiModeValues = new Set<AiExecutionMode>(["MODEL", "RULE_BASED", "MODEL_UNAVAILABLE"]);
const aiStatusValues = new Set<AiOpsEvent["status"]>(["SUCCEEDED", "FAILED", "FALLBACK"]);
const aiReasonCodePattern = /^[a-z0-9_]{1,80}$/;

/**
 * Strictly summarizes only bounded, unique, source-time-valid telemetry.
 * Prompts, provider payloads, credentials and arbitrary event properties are never projected.
 */
export function summarizeAiOperations(asOf:string,events:AiOpsEvent[]):AiOpsSummary {
 const asOfMs=Date.parse(asOf);
 if(!Number.isFinite(asOfMs))throw new Error("asOf must be valid");
 if(!Array.isArray(events)||events.length>5000)throw new Error("ai_ops_event_population_invalid");
 const ids=new Set<string>();
 const counts=new Map<AiProvider,number>();
 const errorCodes=new Set<string>();
 let successful=0,failed=0,fallbacks=0,lastEventAt:string|null=null,lastEventMs=-1;
 for(const value of events as unknown[]){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("ai_ops_event_invalid");
  const event=value as Record<string,unknown>;
  if(typeof event.id!=="string"||!event.id.trim()||event.id.length>120||ids.has(event.id)||
     !(event.provider===null||aiProviderValues.has(event.provider as AiProvider))||
     typeof event.mode!=="string"||!aiModeValues.has(event.mode as AiExecutionMode)||
     typeof event.status!=="string"||!aiStatusValues.has(event.status as AiOpsEvent["status"])||
     typeof event.reasonCode!=="string"||!aiReasonCodePattern.test(event.reasonCode)||
     typeof event.occurredAt!=="string"||!Number.isFinite(Date.parse(event.occurredAt))||
     Date.parse(event.occurredAt)>asOfMs||
     !(event.elapsedMs===null || (typeof event.elapsedMs==="number" &&
       Number.isSafeInteger(event.elapsedMs) && event.elapsedMs>=0 && event.elapsedMs<=600000))) {
   throw new Error("ai_ops_event_invalid");
  }
  ids.add(event.id);
  const occurredMs=Date.parse(event.occurredAt);
  if(occurredMs>lastEventMs){lastEventMs=occurredMs;lastEventAt=event.occurredAt;}
  if(event.provider)counts.set(event.provider as AiProvider,(counts.get(event.provider as AiProvider)??0)+1);
  if(event.status==="SUCCEEDED")successful+=1;
  else if(event.status==="FAILED"){failed+=1;errorCodes.add(event.reasonCode);}
  else fallbacks+=1;
 }
 return {asOf,total:events.length,successful,failed,fallbacks,
  byProvider:[...counts].map(([provider,count])=>({provider,count})).sort((a,b)=>a.provider.localeCompare(b.provider)),
  lastEventAt,errorCodes:[...errorCodes].sort(),
  containsPrompts:false,containsSecrets:false};
}
