// TypeScript interfaces matching demo-schema.json and pimuml-schema.json.

export interface DemoValueType {
  name: string;
  kind: "categorical" | "nonCategorical";
  literals?: string[];
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

export interface MerodeAttribute {
  name: string;
  type?: string;
}

export interface MerodeObjectType {
  name: string;
  attributes?: MerodeAttribute[];
}

export interface MerodeExistenceDependency {
  name: string;
  dependent: string;
  master: string;
  lower?: number;
  upper?: number | "*";
}

export interface MerodeBusinessEventType {
  name: string;
  objectType: string;
}

export interface MerodeModel {
  name: string;
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

export interface Property {
  name: string;
  type?: string;
  defaultValue?: string;
  isDerived?: boolean;
  derivationRule?: string;
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

export interface PimModel {
  name: string;
  enumerations?: PimEnumeration[];
  dataTypes?: PimDataType[];
  classes?: PimClass[];
  associations?: PimAssociation[];
  generalizations?: PimGeneralization[];
}
