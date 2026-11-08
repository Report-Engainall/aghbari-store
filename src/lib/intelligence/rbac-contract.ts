import type {EvidenceRecord,EvidenceStatus} from "./types";
export interface CanonicalRoleDefinition {roleId:string;label:string;capabilityIds:string[];sourceVersion:string}
export type CanonicalCapabilityTenantScope="NONE"|"SELF"|"ASSIGNED"|"TENANT"|"GLOBAL";
export type CanonicalCapabilitySensitivity="PUBLIC"|"TENANT_DATA"|"PERSONAL_DATA"|"FINANCIAL"|"SECRET";
export interface CanonicalCapabilityDefinition {
 capabilityId:string;resource:string;operation:string;tenantScope:CanonicalCapabilityTenantScope;
 sensitivity:CanonicalCapabilitySensitivity;policyRef:string;policyVersion:string;
}
export interface CanonicalCapabilityMatrixRow {
 roleId:string;roleLabel:string;roleVersion:string;capabilityId:string;resource:string;operation:string;
 tenantScope:CanonicalCapabilityTenantScope;sensitivity:CanonicalCapabilitySensitivity;
 roleMappingDecision:"ALLOW"|"DENY";actorEffectiveDecision:"ALLOW"|"DENY"|null;
 reasonCode:"CANONICAL_ROLE_MAPPING_PRESENT"|"CANONICAL_ROLE_MAPPING_ABSENT";
 policyRef:string;policyVersion:string;evaluatedAt:string;
}
export interface CanonicalCapabilityMatrix {
 status:EvidenceStatus;source:"SERVER_CANONICAL_PERMISSION_CATALOG";asOf:string;
 rows:CanonicalCapabilityMatrixRow[];warnings:string[];
}
export interface CanonicalRbacSnapshot {
 asOf:string;status:EvidenceStatus;source:"SERVER_CANONICAL_PERMISSION_CATALOG";actorRole:string;
 actorCapabilities:string[];roles:CanonicalRoleDefinition[];capabilities:CanonicalCapabilityDefinition[];evidenceIds:string[];
}
export interface RbacCapabilityDecision {
 allowed:boolean;status:EvidenceStatus;capabilityId:string;actorRole:string;
 reason:"CANONICAL_CAPABILITY_PRESENT"|"CAPABILITY_NOT_GRANTED"|"CATALOG_NOT_VERIFIED"|"CAPABILITY_UNKNOWN";sourceVersion:string|null;
}
/**
 * Creates an explanatory role × resource × operation matrix from the server's
 * canonical role/capability catalog. It does not grant, deny or enforce access.
 */
export function buildCanonicalCapabilityMatrix(input:{
 snapshot:CanonicalRbacSnapshot|null;evidenceRecords:EvidenceRecord[];
}):CanonicalCapabilityMatrix {
 const snapshot=input.snapshot;
 if(!snapshot)return {status:"UNAVAILABLE",source:"SERVER_CANONICAL_PERMISSION_CATALOG",asOf:"",rows:[],warnings:["SERVER_PERMISSION_CATALOG_UNAVAILABLE"]};
 const empty=(status:EvidenceStatus,warning:string):CanonicalCapabilityMatrix=>({
  status,source:"SERVER_CANONICAL_PERMISSION_CATALOG",asOf:snapshot.asOf,rows:[],warnings:[warning],
 });
 if(snapshot.status!=="VERIFIED")return empty(snapshot.status,"SERVER_PERMISSION_CATALOG_NOT_VERIFIED");
 if(!Number.isFinite(Date.parse(snapshot.asOf))||!snapshot.actorRole.trim()||snapshot.roles.length===0||snapshot.capabilities.length===0)
  return empty("NEEDS_REVIEW","SERVER_PERMISSION_CATALOG_ENVELOPE_INCOMPLETE");
 const records=new Map<string,EvidenceRecord>(),duplicateEvidence=new Set<string>();
 for(const record of input.evidenceRecords){if(records.has(record.id))duplicateEvidence.add(record.id);else records.set(record.id,record)}
 const evidenceValid=snapshot.evidenceIds.length>0&&new Set(snapshot.evidenceIds).size===snapshot.evidenceIds.length&&
  snapshot.evidenceIds.every(id=>{const e=records.get(id);return Boolean(e&&!duplicateEvidence.has(id)&&e.status==="VERIFIED"&&
   e.completeness==="COMPLETE"&&e.quality==="ACCEPTABLE"&&e.asOf===snapshot.asOf)});
 if(!evidenceValid)return empty("UNVERIFIED","SERVER_PERMISSION_CATALOG_EVIDENCE_INVALID");
 const roleIds=snapshot.roles.map(role=>role.roleId);
 const capabilityIds=snapshot.capabilities.map(capability=>capability.capabilityId);
 if(new Set(roleIds).size!==roleIds.length||new Set(capabilityIds).size!==capabilityIds.length)
  return empty("NEEDS_REVIEW","DUPLICATE_ROLE_OR_CAPABILITY_DEFINITION");
 const capabilitySet=new Set(capabilityIds);
 const actorRole=snapshot.roles.find(role=>role.roleId===snapshot.actorRole);
 const actorCapabilities=new Set(snapshot.actorCapabilities);
 const invalidRole=snapshot.roles.some(role=>!role.roleId.trim()||!role.label.trim()||!role.sourceVersion.trim()||
  new Set(role.capabilityIds).size!==role.capabilityIds.length||role.capabilityIds.some(id=>!capabilitySet.has(id)));
 const invalidCapability=snapshot.capabilities.some(capability=>!capability.capabilityId.trim()||!capability.resource.trim()||
  !capability.operation.trim()||!capability.policyRef.trim()||!capability.policyVersion.trim());
 if(invalidRole||invalidCapability||!actorRole||snapshot.actorCapabilities.some(id=>!capabilitySet.has(id)))
  return empty("NEEDS_REVIEW","SERVER_PERMISSION_CATALOG_MAPPING_INVALID");
 const rows=snapshot.roles.flatMap(role=>snapshot.capabilities.map(capability=>{
  const allowed=role.capabilityIds.includes(capability.capabilityId);
  return {
   roleId:role.roleId,roleLabel:role.label,roleVersion:role.sourceVersion,capabilityId:capability.capabilityId,
   resource:capability.resource,operation:capability.operation,tenantScope:capability.tenantScope,
   sensitivity:capability.sensitivity,roleMappingDecision:allowed?"ALLOW" as const:"DENY" as const,
   actorEffectiveDecision:role.roleId===snapshot.actorRole?(allowed&&actorCapabilities.has(capability.capabilityId)?"ALLOW" as const:"DENY" as const):null,
   reasonCode:allowed?"CANONICAL_ROLE_MAPPING_PRESENT" as const:"CANONICAL_ROLE_MAPPING_ABSENT" as const,
   policyRef:capability.policyRef,policyVersion:capability.policyVersion,evaluatedAt:snapshot.asOf,
  };
 }));
 return {status:"VERIFIED",source:"SERVER_CANONICAL_PERMISSION_CATALOG",asOf:snapshot.asOf,rows,warnings:[]};
}

/** Read-only consumer of the server's canonical permissions; this module defines no local roles or enforcement. */
export function evaluateCanonicalCapability(input:{snapshot:CanonicalRbacSnapshot;evidenceRecords:EvidenceRecord[];capabilityId:string}):RbacCapabilityDecision {
 const evidence=new Map(input.evidenceRecords.map(e=>[e.id,e])),role=input.snapshot.roles.find(r=>r.roleId===input.snapshot.actorRole);
 const validEvidence=input.snapshot.evidenceIds.length>0&&input.snapshot.evidenceIds.every(id=>{
  const e=evidence.get(id);return Boolean(e&&e.status==="VERIFIED"&&e.completeness==="COMPLETE"&&e.quality==="ACCEPTABLE"&&e.asOf===input.snapshot.asOf);
 });
 const status:EvidenceStatus=input.snapshot.status==="UNVERIFIED"?"UNVERIFIED":input.snapshot.status==="VERIFIED"&&validEvidence&&role?"VERIFIED":"NEEDS_REVIEW";
 if(status!=="VERIFIED" || !role)return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CATALOG_NOT_VERIFIED",sourceVersion:role?.sourceVersion??null};
 if(!input.capabilityId.trim())return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CAPABILITY_UNKNOWN",sourceVersion:role.sourceVersion};
 if(!role.capabilityIds.includes(input.capabilityId))return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CAPABILITY_NOT_GRANTED",sourceVersion:role.sourceVersion};
 const allowed=input.snapshot.actorCapabilities.includes(input.capabilityId);
 return {allowed,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,
  reason:allowed?"CANONICAL_CAPABILITY_PRESENT":"CAPABILITY_NOT_GRANTED",sourceVersion:role.sourceVersion};
}
