// TypeScript interfaces matching demo-schema.json and pimuml-schema.json.

export interface DemoValueType {
  name: string;
  kind: "categorical" | "nonCategorical";
  literals?: string[];
  triggerEventType?: string;
  relatesEntityTypes?: [string, string];
  attributes?: AttributeType[];
}

export interface DemoEventType {
  name: string;
  entityType: string;
}

export interface AttributeType {
  name: string;
  valueType?: string;
  derivationRule?: string;
}

export interface Role {
  name: string;
  entityType: string;
  lower?: number;
  upper?: number | "*";
}

export interface FactType {
  name: string;
  isAggregation?: boolean;
  roles: [Role, Role];
}

export interface EntityType {
  name: string;
  isAbstract?: boolean;
  isDerived?: boolean;
  derivationExpression?: string;
  parent?: string;
  triggerEventType?: string;
  attributes?: AttributeType[];
}

export interface DemoModel {
  name: string;
  valueTypes?: DemoValueType[];
  entityTypes: EntityType[];
  factTypes?: FactType[];
  eventTypes?: DemoEventType[];
}

// MERODE types

export interface MerodeDomainType {
  name: string;
  kind: "categorical" | "nonCategorical";
  literals?: string[];
}

export interface MerodeAttribute {
  name: string;
  type?: string;
}

export interface MerodeObjectType {
  name: string;
  attributes?: MerodeAttribute[];
  lifecycleStates?: string[];
}

export interface MerodeExistenceDependency {
  name: string;
  dependent: string;
  master: string;
  lower?: number;
  upper?: number | "*";
}

export interface MerodeEventEffect {
  attribute: string;
}

export interface MerodeBusinessEventType {
  name: string;
  objectType: string;
  role?: "C" | "M" | "E";
  fromState?: string;
  toState?: string;
  effects?: MerodeEventEffect[];
}

export interface MerodeModel {
  name: string;
  domainTypes?: MerodeDomainType[];
  objectTypes: MerodeObjectType[];
  existenceDependencies?: MerodeExistenceDependency[];
  businessEventTypes?: MerodeBusinessEventType[];
}

// pimUML types

export interface PimEnumeration {
  name: string;
  literals: string[];
}

export interface PimDataType {
  name: string;
}

export interface PimAssociationClass {
  name: string;
  triggerEvent?: string;
  memberEnds: [AssociationEnd, AssociationEnd];
  ownedAttributes?: Property[];
}

export interface Property {
  name: string;
  type?: string;
  defaultValue?: string;
  isDerived?: boolean;
  derivationRule?: string;
  isID?: boolean;
}

export interface AssociationEnd {
  name: string;
  type: string;
  lower?: number;
  upper?: number | "*";
}

export interface PimAssociation {
  name: string;
  isAggregation?: boolean;
  isDerived?: boolean;
  derivationExpression?: string;
  triggerEvent?: string;
  memberEnds: [AssociationEnd, AssociationEnd];
}

export interface PimGeneralization {
  child: string;
  parent: string;
}

export interface PimClass {
  name: string;
  isAbstract?: boolean;
  isDerived?: boolean;
  derivationExpression?: string;
  ownedAttributes?: Property[];
}

export interface PimState {
  name: string;
  kind: "initial" | "false" | "true" | "simple" | "final";
  entryActivity?: string;
}

export interface PimTransition {
  from: string;
  to: string;
  trigger?: string;
  alfExpression?: string;
}

export interface PimRegion {
  name: string;
  forEvent?: string;
  states: PimState[];
  transitions: PimTransition[];
}

export interface PimActivityEffect {
  attribute: string;
  type: string;
}

export interface PimActivity {
  name: string;
  kind: "set" | "create" | "end";
  targetType?: string;
  effects?: PimActivityEffect[];
}

export interface PimStateMachine {
  name: string;
  entityType: string;
  regions: PimRegion[];
  activities?: PimActivity[];
}

export interface PimModel {
  name: string;
  enumerations?: PimEnumeration[];
  dataTypes?: PimDataType[];
  associationClasses?: PimAssociationClass[];
  classes?: PimClass[];
  associations?: PimAssociation[];
  generalizations?: PimGeneralization[];
  stateMachines?: PimStateMachine[];
}
