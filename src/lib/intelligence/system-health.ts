import type {EvidenceRecord} from "./types";
export type HealthStatus="HEALTHY"|"DEGRADED"|"UNAVAILABLE"|"UNKNOWN";
export interface SystemHealthProbe {
 component:string;status:HealthStatus;checkedAt:string;latencyMs:number|null;sourceEvidenceId:string|null;
 errorCode:string|null;owner:string|null;freshForSeconds:number;
}
export interface SystemHealthComponent {
 component:string;status:HealthStatus;checkedAt:string|null;latencyMs:number|null;sourceEvidenceId:string|null;
 errorCode:string|null;owner:string|null;warnings:string[];
}
export interface SystemHealthSnapshot {asOf:string;status:HealthStatus;components:SystemHealthComponent[];evidenceRecords:EvidenceRecord[];warnings:string[]}
/** A missing, stale or unverified required probe prevents global HEALTHY. */
export function buildSystemHealthSnapshot(input:{asOf:string;requiredComponents:string[];probes:SystemHealthProbe[];evidenceRecords:EvidenceRecord[]}):SystemHealthSnapshot {
 const now=Date.parse(input.asOf);if(!Number.isFinite(now))throw new Error("asOf must be valid");
 if(input.requiredComponents.length===0)return {asOf:input.asOf,status:"UNKNOWN",components:[],evidenceRecords:input.evidenceRecords,warnings:["NO_REQUIRED_HEALTH_COMPONENTS"]};
 const evidence=new Map<string,EvidenceRecord[]>(),byName=new Map<string,SystemHealthProbe[]>();
 for(const record of input.evidenceRecords){const rows=evidence.get(record.id)??[];rows.push(record);evidence.set(record.id,rows);}
 for(const p of input.probes){const rows=byName.get(p.component)??[];rows.push(p);byName.set(p.component,rows)}
 const components:SystemHealthComponent[]=[];
 for(const name of input.requiredComponents){
  const rows=byName.get(name)??[];
  if(rows.length!==1){components.push({component:name,status:"UNKNOWN",checkedAt:null,latencyMs:null,sourceEvidenceId:null,errorCode:null,owner:null,
   warnings:[rows.length?"DUPLICATE_HEALTH_PROBE":"REQUIRED_PROBE_MISSING"]});continue}
  const p=rows[0],warnings:string[]=[],checked=Date.parse(p.checkedAt),freshMs=p.freshForSeconds*1000;
  const evidenceRows=p.sourceEvidenceId?(evidence.get(p.sourceEvidenceId)??[]):[];
  const record=evidenceRows.length===1?evidenceRows[0]:undefined;
  let status=p.status;
  if(!["HEALTHY","DEGRADED","UNAVAILABLE","UNKNOWN"].includes(status)){status="UNKNOWN";warnings.push("PROBE_STATUS_INVALID")}
  if(!Number.isFinite(checked)||checked>now||!Number.isFinite(freshMs)||freshMs<0||now-checked>freshMs){status="UNKNOWN";warnings.push("PROBE_STALE_OR_INVALID")}
  if(evidenceRows.length>1){status=status==="UNAVAILABLE"?"UNAVAILABLE":"UNKNOWN";warnings.push("HEALTH_EVIDENCE_AMBIGUOUS")}
  else if(!record||record.status!=="VERIFIED"||record.completeness!=="COMPLETE"||record.quality!=="ACCEPTABLE"||record.asOf!==p.checkedAt||
    !Number.isFinite(Date.parse(record.sourceTimestamp))||Date.parse(record.sourceTimestamp)>checked){
   status=status==="UNAVAILABLE"?"UNAVAILABLE":"UNKNOWN";warnings.push("HEALTH_EVIDENCE_MISSING_OR_UNVERIFIED")}
  if(p.latencyMs!==null&&(!Number.isFinite(p.latencyMs)||p.latencyMs<0)){status="UNKNOWN";warnings.push("INVALID_LATENCY")}
  if(p.errorCode&&status==="HEALTHY"){status="DEGRADED";warnings.push("ERROR_CODE_PRESENT")}
  if(!p.owner)warnings.push("OWNER_NOT_ASSIGNED");
  components.push({component:name,status,checkedAt:Number.isFinite(checked)?p.checkedAt:null,latencyMs:p.latencyMs,sourceEvidenceId:p.sourceEvidenceId,errorCode:p.errorCode,owner:p.owner,warnings});
 }
 const status=components.some(c=>c.status==="UNAVAILABLE")?"UNAVAILABLE":components.some(c=>c.status==="UNKNOWN")?"UNKNOWN":
  components.some(c=>c.status==="DEGRADED")?"DEGRADED":"HEALTHY";
 return {asOf:input.asOf,status,components,evidenceRecords:input.evidenceRecords,warnings:[...new Set(components.flatMap(c=>c.warnings))]};
}
