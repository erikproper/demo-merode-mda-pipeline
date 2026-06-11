// TypeScript interfaces matching demo-schema.json and pimuml-schema.json.

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
  entityTypes: EntityType[];
  factTypes?: FactType[];
}

export interface Property {
  name: string;
  type?: string;
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
  classes?: PimClass[];
  associations?: PimAssociation[];
}
