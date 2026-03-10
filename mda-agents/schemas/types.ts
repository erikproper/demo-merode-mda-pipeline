// TypeScript interfaces for demo-schema.json (CIM) and pimuml-schema.json (PIM).

// =============================================================================
// Section 1 — DEMO Fact Model (CIM)
// =============================================================================

export interface AttributeType {
  name: string;
  valueType: string;
}

export interface EventType {
  name: string;
}

export interface DeclaredEntityType {
  name: string;
  kind: "declared";
  attributes?: AttributeType[];
  events?: EventType[];
}

export interface DerivedEntityType {
  name: string;
  kind: "derived";
  derivationRule: string;
  attributes?: AttributeType[];
  events?: EventType[];
}

export type EntityType = DeclaredEntityType | DerivedEntityType;

export interface CategoricalValueType {
  name: string;
  kind: "categorical";
  literals: [string, ...string[]];
}

export interface NonCategoricalValueType {
  name: string;
  kind: "non-categorical";
}

export type ValueType = CategoricalValueType | NonCategoricalValueType;

export interface DemoGeneralization {
  parent: string;
  child: string;
  specializationKind?: "eventType" | "derivationRule";
  eventType?: string;
  propertyType?: string;
}

export interface Aggregation {
  whole: string;
  part: string;
}

export interface PropertyType {
  name?: string;
  source: string;
  target: string;
  lowerCardinality?: number;
  upperCardinality?: number | "*";
}

export interface DemoModel {
  name: string;
  entityTypes: EntityType[];
  valueTypes?: ValueType[];
  generalizations?: DemoGeneralization[];
  aggregations?: Aggregation[];
  propertyTypes?: PropertyType[];
}

// =============================================================================
// Section 2 — pimUML Model (PIM)
// =============================================================================

export interface Property {
  name: string;
  type?: string;
  isID?: boolean;
  aggregation?: "none" | "shared" | "composite";
  lower?: number;
  upper?: number | "*";
  defaultValue?: { _type: string; value: unknown };
}

export interface PimGeneralization {
  general: string;
}

export interface PimClass {
  name: string;
  isAbstract?: boolean;
  ownedAttributes?: Property[];
  generalizations?: PimGeneralization[];
}

export interface Association {
  name?: string;
  memberEnds: [Property, Property];
}

export interface AssociationClass {
  name: string;
  isAbstract?: boolean;
  ownedAttributes?: Property[];
  generalizations?: PimGeneralization[];
  memberEnds: [Property, Property];
}

export interface EnumerationLiteral {
  name: string;
  qualifiedName?: string;
}

export interface Enumeration {
  name: string;
  literals?: [EnumerationLiteral, ...EnumerationLiteral[]];
}

export interface PrimitiveType {
  name: string;
}

export interface PimModel {
  name: string;
  classes?: PimClass[];
  associations?: Association[];
  associationClasses?: AssociationClass[];
  enumerations?: Enumeration[];
  primitiveTypes?: PrimitiveType[];
}
