export const EVIDENCE_STATUSES = ["VERIFIED","NEEDS_REVIEW","UNVERIFIED","UNAVAILABLE"] as const;
export type EvidenceStatus=(typeof EVIDENCE_STATUSES)[number];
export type DataCompleteness="COMPLETE"|"PARTIAL"|"UNKNOWN";
export type DataQuality="ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN";
export type EvidenceSourceKind="TABLE"|"RPC"|"IMPORT_SNAPSHOT"|"LEDGER"|"MOVEMENT"|"SYSTEM_PROBE"|"MANUAL";
export type MetricUnit="COUNT"|"RATIO"|"CURRENCY"|"CURRENCY_PER_UNIT"|"QUANTITY"|"DAYS"|"TEXT";
export interface EvidencePeriod {from:string;to:string}
export interface EvidenceSource {kind:EvidenceSourceKind;name:string;recordId?:string;version?:string}
export interface EvidenceRecord {
 id:string;source:EvidenceSource;sourceTimestamp:string;asOf:string;period:EvidencePeriod|null;
 currency?:string;status:EvidenceStatus;completeness:DataCompleteness;quality:DataQuality;warnings:string[];
}
export interface MetricLineage {evidenceIds:string[];calculatedAt:string;formulaId:string;formulaVersion:string;transformations:string[]}
export interface MetricSnapshot {
 id:string;key:string;value:number|string|null;unit:MetricUnit;currency?:string;unitOfMeasure?:string;status:EvidenceStatus;
 completeness:DataCompleteness;quality:DataQuality;period:EvidencePeriod|null;asOf:string;lineage:MetricLineage;warnings:string[];
}
export interface EvidencePassport {
 id:string;generatedAt:string;asOf:string;status:EvidenceStatus;completeness:DataCompleteness;
 evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[];warnings:string[];
}
export type DecisionPriority="P0"|"P1"|"P2"|"P3";
export type DecisionImpactStatus="CALCULATED"|"NOT_CONFIGURED"|"WITHHELD";
export interface DecisionImpact {value:number;unit:string;currency?:string;formulaId:string;formulaVersion:string;sourceMetricIds:string[]}
export interface DecisionCandidate {
 id:string;ruleId:string;ruleVersion:string;priority:DecisionPriority;priorityScore:number;
 what:string;why:string;soWhat:string;impact:DecisionImpact|null;impactStatus:DecisionImpactStatus;impactReason:string|null;
 whatNext:string;proof:{evidenceIds:string[];metricKeys:string[];asOf:string;formulaVersions:string[]};
 owner:string;expectedOutcome:string;createdAt:string;expiresAt:string|null;
}
export type DecisionOutcomeState="PROPOSED"|"IN_REVIEW"|"APPROVED"|"REJECTED"|"DEFERRED"|"ASSIGNED"|"EXECUTING"|"EXECUTED"|"MEASURED";
export interface DecisionActor {id:string;role:string}
export interface DecisionMeasuredOutcome {
 metricKey:string;value:number;unit:MetricUnit;currency?:string;
 status:EvidenceStatus;completeness:DataCompleteness;quality:DataQuality;
 period:EvidencePeriod|null;asOf:string;formulaId:string;formulaVersion:string;
 measuredAt:string;evidenceIds:string[];
}
export interface DecisionOutcomeEventRecord {id:string;idempotencyKey:string;type:string;actor:DecisionActor;at:string;reason?:string;owner?:string;measuredOutcome?:DecisionMeasuredOutcome}
export interface DecisionOutcome {
 id:string;candidateId:string;version:number;state:DecisionOutcomeState;proposedBy:DecisionActor;owner:string;
 expectedOutcome:string;reason:string|null;createdAt:string;approvedAt:string|null;approvedBy:DecisionActor|null;
 assignedAt:string|null;executedAt:string|null;measuredOutcome:DecisionMeasuredOutcome|null;eventKeys:string[];history:DecisionOutcomeEventRecord[];
}
