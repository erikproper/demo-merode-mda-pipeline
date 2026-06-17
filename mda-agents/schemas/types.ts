// TypeScript interfaces matching demo-schema.json and pimuml-schema.json.

export interface DemoValueType {
  name: string;
  kind: "categorical";
  literals: string[];
}

export interface DemoEventType {
  name: string;
  entityType: string;
}

export interface AttributeType {
  name: string;
  valueType?: string;
}

export interface Role {
  name: string;
  entityType: string;
  lower?: number;
  upper?: number | "*";
}

export interface FactType {
  name: string;
  roles: [Role, Role];
}

export interface EntityType {
  name: string;
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

export interface Property {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface AssociationEnd {
  name: string;
  type: string;
  lower?: number;
  upper?: number | "*";
}

export interface PimAssociation {
  name: string;
  memberEnds: [AssociationEnd, AssociationEnd];
}

export interface PimClass {
  name: string;
  ownedAttributes?: Property[];
}

export interface PimModel {
  name: string;
  enumerations?: PimEnumeration[];
  classes?: PimClass[];
  associations?: PimAssociation[];
}
