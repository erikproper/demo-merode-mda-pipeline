// TypeScript interfaces matching demo-schema.json and pimuml-schema.json.

export interface AttributeType {
  name: string;
  valueType?: string;
}

export interface EntityType {
  name: string;
  attributes?: AttributeType[];
}

export interface DemoModel {
  name: string;
  entityTypes: EntityType[];
}

export interface Property {
  name: string;
  type?: string;
}

export interface PimClass {
  name: string;
  ownedAttributes?: Property[];
}

export interface PimModel {
  name: string;
  classes?: PimClass[];
}
