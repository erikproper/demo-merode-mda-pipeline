/**
 * TypeScript interfaces generated from demo-schema.json and pimuml-schema.json.
 *
 * Two sections:
 *   1. DEMO Fact Model (CIM)  — root type: DemoModel
 *   2. pimUML Model     (PIM) — root type: PimModel
 */

// =============================================================================
// Section 1 — DEMO Fact Model (CIM)
// Source: demo-schema.json
// =============================================================================

/** Kind of an EntityType: declared (A3) or derived (A4). */
export type EntityTypeKind = "declared" | "derived";

/** Kind of a ValueType: categorical (A1) with literals, or non-categorical (A2). */
export type ValueTypeKind = "categorical" | "non-categorical";

/** Kind of specialization in a Generalization: via event type (A7) or derivation rule (A9). */
export type SpecializationKind = "eventType" | "derivationRule";

// ---- AttributeType ----------------------------------------------------------

/** Attribute of an entity type, references a value type by name (A5). */
export interface AttributeType {
  /** Name of the attribute. */
  name: string;
  /** Name of the referenced ValueType. */
  valueType: string;
}

// ---- EventType --------------------------------------------------------------

/** Event type of an entity type (A6). Maps to a Boolean attribute + state machine states. */
export interface EventType {
  /** Name of the event type. */
  name: string;
}

// ---- EntityType (discriminated union on `kind`) -----------------------------

/** Declared entity type (A3): has no derivation rule. */
export interface DeclaredEntityType {
  name: string;
  kind: "declared";
  attributes?: AttributeType[];
  events?: EventType[];
}

/** Derived entity type (A4): requires a derivation rule (A9). */
export interface DerivedEntityType {
  name: string;
  kind: "derived";
  /** OCL expression or natural-language description of the derivation rule. */
  derivationRule: string;
  attributes?: AttributeType[];
  events?: EventType[];
}

/** Union of declared and derived entity types. */
export type EntityType = DeclaredEntityType | DerivedEntityType;

// ---- ValueType (discriminated union on `kind`) ------------------------------

/** Categorical value type (A1): maps to UML Enumeration; literals are required. */
export interface CategoricalValueType {
  name: string;
  kind: "categorical";
  /** Enumeration values. At least one entry required. */
  literals: [string, ...string[]];
}

/** Non-categorical value type (A2): maps to a user-defined UML DataType. */
export interface NonCategoricalValueType {
  name: string;
  kind: "non-categorical";
}

/** Union of categorical and non-categorical value types. */
export type ValueType = CategoricalValueType | NonCategoricalValueType;

// ---- Generalization ---------------------------------------------------------

/** Generalization between two entity types (A10). The parent becomes abstract. */
export interface DemoGeneralization {
  /** Name of the general (abstract) entity type. */
  parent: string;
  /** Name of the specialized entity type. */
  child: string;
  /** How the specialization is expressed: via event type (A7) or derivation rule (A9). */
  specializationKind?: SpecializationKind;
  /** Name of the associated event type (only when specializationKind = "eventType", A7). */
  eventType?: string;
  /** Name of the property type (only for A8: specialization of value type with event type). */
  propertyType?: string;
}

// ---- Aggregation ------------------------------------------------------------

/** Aggregation relationship between a whole entity type and a part entity type (A11). */
export interface Aggregation {
  /** Name of the whole entity type. */
  whole: string;
  /** Name of the part entity type. */
  part: string;
}

// ---- PropertyType -----------------------------------------------------------

/** Association / property type between entity types with cardinalities (A12). */
export interface PropertyType {
  /** Optional name of the association. */
  name?: string;
  /** Name of the source entity type. */
  source: string;
  /** Name of the target entity type. */
  target: string;
  /** Lower cardinality (0 or a positive integer). */
  lowerCardinality?: number;
  /** Upper cardinality: positive integer or '*' for unlimited. */
  upperCardinality?: number | "*";
}

// ---- DemoModel (root) -------------------------------------------------------

/** Root object of the DEMO Fact Model (CIM). */
export interface DemoModel {
  /** Name of the DEMO model. */
  name: string;
  /** All declared and derived entity types. */
  entityTypes: EntityType[];
  /** All value types (categorical and non-categorical). */
  valueTypes?: ValueType[];
  /** Generalization relationships between entity types (A10). */
  generalizations?: DemoGeneralization[];
  /** Aggregation relationships between entity types (A11). */
  aggregations?: Aggregation[];
  /** Associations / property types with cardinalities (A12). */
  propertyTypes?: PropertyType[];
}

// =============================================================================
// Section 2 — pimUML Model (PIM)
// Source: pimuml-schema.json
// =============================================================================

// ---- Enumerations -----------------------------------------------------------

/** Aggregation kind of a UML Property. */
export type AggregationKind = "none" | "shared" | "composite";

/** Kind of a UML Pseudostate (PseudostateKind enumeration). */
export type PseudostateKind =
  | "initial"
  | "deepHistory"
  | "shallowHistory"
  | "join"
  | "fork"
  | "junction"
  | "choice"
  | "entryPoint"
  | "exitPoint"
  | "terminate";

// ---- ValueSpecification (discriminated union on `_type`) --------------------

/** Boolean literal value (LiteralBoolean). */
export interface LiteralBoolean {
  _type: "LiteralBoolean";
  value: boolean;
}

/** Integer literal value (LiteralInteger). */
export interface LiteralInteger {
  _type: "LiteralInteger";
  value: number;
}

/** Natural number or '*' literal value (LiteralUnlimitedNatural). */
export interface LiteralUnlimitedNatural {
  _type: "LiteralUnlimitedNatural";
  /** Non-negative integer or '*' for unlimited. */
  value: number | "*";
}

/** UML ValueSpecification: discriminated union of concrete literal types. */
export type ValueSpecification =
  | LiteralBoolean
  | LiteralInteger
  | LiteralUnlimitedNatural;

// ---- Behavior & Trigger -----------------------------------------------------

/** Simplified UML Behavior: an Alf expression or activity name. */
export interface Behavior {
  /** Alf expression or activity name, e.g. 'Set<Entity>.<Event>'. */
  expression: string;
}

/** UML Trigger of a transition. */
export interface Trigger {
  /** Name of the trigger (NamedElement.name). */
  name: string;
}

// ---- State Machine ----------------------------------------------------------

/** UML Transition between two vertices. */
export interface Transition {
  /** Name of the source vertex (Transition.source). */
  source: string;
  /** Name of the target vertex (Transition.target). */
  target: string;
  /** Optional trigger (Transition.trigger, 0..1). */
  trigger?: Trigger;
  /** Optional effect behavior, e.g. an Alf expression (Transition.effect). */
  effect?: Behavior;
}

/**
 * UML State (Vertex). Can be simple or composite (with sub-regions).
 * Discriminator: _type = "State".
 */
export interface State {
  _type: "State";
  /** Name of the state (NamedElement.name). */
  name: string;
  /** Sub-regions for composite states (State.region). */
  regions?: Region[];
  /** Entry behavior of the state (State.entry). */
  entry?: Behavior;
}

/**
 * UML Pseudostate (Vertex). Represents control points such as initial, fork, join.
 * Discriminator: _type = "Pseudostate".
 */
export interface Pseudostate {
  _type: "Pseudostate";
  /** Kind of pseudostate (PseudostateKind). */
  kind: PseudostateKind;
  /** Optional name (used for entryPoint / exitPoint). */
  name?: string;
}

/** Union type for UML Vertex: either a State or a Pseudostate. */
export type Vertex = State | Pseudostate;

/** UML Region of a StateMachine or a composite State. */
export interface Region {
  /** Optional name of the region (NamedElement.name). */
  name?: string;
  /** Vertices of the region: States and Pseudostates (Region.subvertex). */
  subvertices?: Vertex[];
  /** Transitions within the region (Region.transition). */
  transitions?: Transition[];
}

/** UML StateMachine (Behavior, inherits from Class). At least 1 region required. */
export interface StateMachine {
  /** Name of the state machine (NamedElement.name). */
  name: string;
  /** Regions of the state machine (min. 1). */
  regions: [Region, ...Region[]];
}

// ---- Class Diagram ----------------------------------------------------------

/** UML Generalization relationship, references the parent class by name. */
export interface PimGeneralization {
  /** Name of the general (parent) class (Generalization.general). */
  general: string;
}

/** UML Property (attribute or association end). */
export interface Property {
  /** Name of the property (NamedElement.name). */
  name: string;
  /** Reference to the type by name: a Class, PrimitiveType, or Enumeration. */
  type?: string;
  /** Whether this property is a logical identifier (A3: logical identifier). */
  isID?: boolean;
  /** Aggregation kind: none | shared (A11) | composite. */
  aggregation?: AggregationKind;
  /** Lower multiplicity (MultiplicityElement.lower). */
  lower?: number;
  /** Upper multiplicity: positive integer or '*' (MultiplicityElement.upper). */
  upper?: number | "*";
  /** Default value as a ValueSpecification. */
  defaultValue?: ValueSpecification;
}

/** UML Class (concrete or abstract). Inherits from EncapsulatedClassifier and BehavioredClassifier. */
export interface PimClass {
  /** Name of the class (NamedElement.name). */
  name: string;
  /** Whether the class is abstract (A10: abstract parent). */
  isAbstract?: boolean;
  /** Attributes directly owned by the class (Class.ownedAttribute). */
  ownedAttributes?: Property[];
  /** Generalization relationships to parent classes. */
  generalizations?: PimGeneralization[];
  /** Owned behaviors, typically StateMachines (BehavioredClassifier.ownedBehavior). */
  ownedBehaviors?: StateMachine[];
  /** Activity Diagrams owned by the class, e.g. Set<entity>.<event> or Create<child> (A6, A7, A9). */
  ownedActivities?: Activity[];
}

/** UML Association between exactly two classes (A12: property type). */
export interface Association {
  /** Optional name of the association (NamedElement.name). */
  name?: string;
  /** Exactly two association ends (Properties) with type and multiplicity. */
  memberEnds: [Property, Property];
}

/** UML AssociationClass: combines Association and Class (A8). */
export interface AssociationClass {
  /** Name of the AssociationClass (NamedElement.name). */
  name: string;
  /** Whether the AssociationClass is abstract. */
  isAbstract?: boolean;
  /** Attributes directly owned by the AssociationClass. */
  ownedAttributes?: Property[];
  /** Generalization relationships. */
  generalizations?: PimGeneralization[];
  /** Exactly two association ends (inherited from Association). */
  memberEnds: [Property, Property];
}

/** UML EnumerationLiteral: a single named value within an Enumeration. */
export interface EnumerationLiteral {
  /** Name of the literal. */
  name: string;
  /** Qualified name, e.g. 'MyEnum::value' (readOnly). */
  qualifiedName?: string;
}

/** UML Enumeration (DataType). Derived from categorical value types (A1). */
export interface Enumeration {
  /** Name of the enumeration (NamedElement.name). */
  name: string;
  /** Enumeration literals. At least one entry required. */
  literals?: [EnumerationLiteral, ...EnumerationLiteral[]];
}

/** UML PrimitiveType (DataType). Derived from non-categorical value types (A2). */
export interface PrimitiveType {
  /** Name of the primitive type (NamedElement.name), e.g. 'String', 'Integer'. */
  name: string;
}

// =============================================================================
// Section 2b — pimUML Activity Diagram
// Source: pimuml-schema.json ($defs: Activity, ActivityNode, ...)
// Covers mapping rules A6, A7, A9 (DEMO→pimUML) and B13–B22 (pimUML→Mendix)
// =============================================================================

// ---- Parameter & ControlFlow ------------------------------------------------

/** Direction of a UML Parameter (ParameterDirectionKind). */
export type ParameterDirection = "in" | "out" | "inout" | "return";

/** UML Parameter of an Activity. Represents typed input or output data. Maps to Mendix microflow Parameter (B16). */
export interface ActivityParameter {
  /** Name of the parameter (NamedElement.name). */
  name: string;
  /** Reference to the type by name (a Class, PrimitiveType, or Enumeration). */
  type?: string;
  /** Parameter direction. */
  direction: ParameterDirection;
}

/** UML ControlFlow edge between two ActivityNodes (referenced by name). Maps to Mendix Sequence flow (B22). */
export interface ControlFlow {
  /** Name of the source ActivityNode. */
  source: string;
  /** Name of the target ActivityNode. */
  target: string;
}

// ---- ActivityNode (discriminated union on `_type`) --------------------------

/** UML InitialNode. Entry point of an Activity. Maps to Mendix StartEvent (B14). */
export interface InitialNode {
  _type: "InitialNode";
  /** Name of the node (NamedElement.name). */
  name: string;
}

/** UML ActivityFinalNode. Terminal node of an Activity. Maps to Mendix EndEvent (B15). */
export interface ActivityFinalNode {
  _type: "ActivityFinalNode";
  /** Name of the node (NamedElement.name). */
  name: string;
}

/** UML ActivityParameterNode. Connects a Parameter to the activity flow. Maps to Mendix Entity reference / Parameter (B16). */
export interface ActivityParameterNode {
  _type: "ActivityParameterNode";
  /** Name of the node (NamedElement.name). */
  name: string;
  /** Reference to the Parameter by name. */
  parameter: string;
}

/** UML CreateObjectAction. Creates a new instance of a classifier. Maps to Mendix CreateObjectAction (B20). */
export interface CreateObjectAction {
  _type: "CreateObjectAction";
  /** Name of the action (NamedElement.name). */
  name: string;
  /** Name of the Class to instantiate. */
  classifier: string;
  /** Name of the output pin carrying the new object (optional). */
  result?: string;
}

/** One end of a UML CreateLinkAction: pairs an input pin with an association end (Property). */
export interface LinkEndData {
  /** Name of the input pin providing the object for this end. */
  value: string;
  /** Name of the Association end (Property). */
  end: string;
}

/** UML CreateLinkAction. Creates a link between two objects. Maps to Mendix ChangeObjectAction (B19). */
export interface CreateLinkAction {
  _type: "CreateLinkAction";
  /** Name of the action (NamedElement.name). */
  name: string;
  /** Exactly two link end data entries (one per association end). */
  endData: [LinkEndData, LinkEndData];
}

/** UML AddStructuralFeatureValueAction. Sets the value of a structural feature. Maps to Mendix ChangeObjectAction (B17, B18). */
export interface AddStructuralFeatureValueAction {
  _type: "AddStructuralFeatureValueAction";
  /** Name of the action (NamedElement.name). */
  name: string;
  /** Name of the input pin providing the target object. */
  object: string;
  /** Name of the Property to set. */
  structuralFeature: string;
  /** Name of the input pin providing the new value. */
  value: string;
}

/** UML ValueSpecificationAction. Evaluates a literal and places it on an output pin. Maps to Mendix Change Object (B17). */
export interface ValueSpecificationAction {
  _type: "ValueSpecificationAction";
  /** Name of the action (NamedElement.name). */
  name: string;
  /** The literal value to evaluate. */
  value: ValueSpecification;
  /** Name of the output pin (optional). */
  result?: string;
}

/** UML ReadStructuralFeatureAction. Reads the value of a structural feature. Maps to Mendix CreateVariableAction (B21). */
export interface ReadStructuralFeatureAction {
  _type: "ReadStructuralFeatureAction";
  /** Name of the action (NamedElement.name). */
  name: string;
  /** Name of the input pin providing the target object. */
  object: string;
  /** Name of the Property to read. */
  structuralFeature: string;
  /** Name of the output pin for the read value (optional). */
  result?: string;
}

/** Union of all UML ActivityNode concrete types. Discriminated via `_type`. */
export type ActivityNode =
  | InitialNode
  | ActivityFinalNode
  | ActivityParameterNode
  | CreateObjectAction
  | CreateLinkAction
  | AddStructuralFeatureValueAction
  | ValueSpecificationAction
  | ReadStructuralFeatureAction;

// ---- Activity (root of activity diagram) ------------------------------------

/**
 * UML Activity (Behavior, inherits from Class).
 * Used for Set<entity>.<event> activities (A6), Create<child> activities (A7, A9).
 * Maps to Mendix Microflow (B13).
 */
export interface Activity {
  /** Name of the activity (NamedElement.name). */
  name: string;
  /** Input/output parameters (Activity.ownedParameter). Maps to Mendix microflow Parameters (B16). */
  parameters?: ActivityParameter[];
  /** All nodes: control nodes, object nodes, actions (Activity.node). */
  nodes?: ActivityNode[];
  /** Control flow edges connecting the nodes (Activity.edge). Maps to Sequence flow (B22). */
  edges?: ControlFlow[];
}

// ---- PimModel (root) --------------------------------------------------------

/** Root object of the pimUML Platform-Independent Model. */
export interface PimModel {
  /** Name of the pimUML model. */
  name: string;
  /** All Class elements of the class diagram. */
  classes?: PimClass[];
  /** All associations between classes. */
  associations?: Association[];
  /** All AssociationClasses (A8). */
  associationClasses?: AssociationClass[];
  /** All Enumerations (from categorical value types, A1). */
  enumerations?: Enumeration[];
  /** All PrimitiveTypes (from non-categorical value types, A2). */
  primitiveTypes?: PrimitiveType[];
}

// =============================================================================
// Type guards
// =============================================================================

/** Narrows an EntityType to DerivedEntityType. */
export function isDerivedEntityType(e: EntityType): e is DerivedEntityType {
  return e.kind === "derived";
}

/** Narrows a ValueType to CategoricalValueType. */
export function isCategoricalValueType(v: ValueType): v is CategoricalValueType {
  return v.kind === "categorical";
}

/** Narrows a Vertex to State. */
export function isState(v: Vertex): v is State {
  return v._type === "State";
}

/** Narrows a Vertex to Pseudostate. */
export function isPseudostate(v: Vertex): v is Pseudostate {
  return v._type === "Pseudostate";
}

/** Narrows a ValueSpecification to LiteralBoolean. */
export function isLiteralBoolean(v: ValueSpecification): v is LiteralBoolean {
  return v._type === "LiteralBoolean";
}

/** Narrows a ValueSpecification to LiteralInteger. */
export function isLiteralInteger(v: ValueSpecification): v is LiteralInteger {
  return v._type === "LiteralInteger";
}

/** Narrows a ValueSpecification to LiteralUnlimitedNatural. */
export function isLiteralUnlimitedNatural(v: ValueSpecification): v is LiteralUnlimitedNatural {
  return v._type === "LiteralUnlimitedNatural";
}

// ---- Activity Diagram type guards -------------------------------------------

/** Narrows an ActivityNode to InitialNode. */
export function isInitialNode(n: ActivityNode): n is InitialNode {
  return n._type === "InitialNode";
}

/** Narrows an ActivityNode to ActivityFinalNode. */
export function isActivityFinalNode(n: ActivityNode): n is ActivityFinalNode {
  return n._type === "ActivityFinalNode";
}

/** Narrows an ActivityNode to ActivityParameterNode. */
export function isActivityParameterNode(n: ActivityNode): n is ActivityParameterNode {
  return n._type === "ActivityParameterNode";
}

/** Narrows an ActivityNode to CreateObjectAction. */
export function isCreateObjectAction(n: ActivityNode): n is CreateObjectAction {
  return n._type === "CreateObjectAction";
}

/** Narrows an ActivityNode to CreateLinkAction. */
export function isCreateLinkAction(n: ActivityNode): n is CreateLinkAction {
  return n._type === "CreateLinkAction";
}

/** Narrows an ActivityNode to AddStructuralFeatureValueAction. */
export function isAddStructuralFeatureValueAction(n: ActivityNode): n is AddStructuralFeatureValueAction {
  return n._type === "AddStructuralFeatureValueAction";
}

/** Narrows an ActivityNode to ValueSpecificationAction. */
export function isValueSpecificationAction(n: ActivityNode): n is ValueSpecificationAction {
  return n._type === "ValueSpecificationAction";
}

/** Narrows an ActivityNode to ReadStructuralFeatureAction. */
export function isReadStructuralFeatureAction(n: ActivityNode): n is ReadStructuralFeatureAction {
  return n._type === "ReadStructuralFeatureAction";
}
