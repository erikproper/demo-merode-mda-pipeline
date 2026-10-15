# Metamodel: pimUML

The pimUML metamodel is based on UML version 2.5.1 and is divided into three parts: class diagram, state machine diagram, and activity diagram.

---

## Legend (Figure C.1)

| Representation                         | Meaning                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| **Metaclass** (green background, bold) | Concrete class, contained in at least one matched pattern rule                     |
| **Metaclass** (white, bold)            | Concrete class, contained in no matched pattern rule                               |
| _Metaclass_ (green background, italic) | Abstract, introduces no attributes or references inherited by concrete metaclasses |
| _Metaclass_ (white, italic)            | Abstract, introduces attributes or references inherited by concrete metaclasses    |

---

## Figure C.2 - Metamodel of the pimUML class model

### Inheritance hierarchy

| Class                       | Inherits from                                | Type               | Attributes                                                                                  |
| --------------------------- | -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| _NamedElement_              | -                                            | abstract           | `+ name: String [0..1]`                                                                     |
| _Namespace_                 | NamedElement                                 | abstract           | -                                                                                           |
| _Type_                      | -                                            | abstract           | -                                                                                           |
| _TypedElement_              | -                                            | abstract           | `+ type -> Type`                                                                            |
| _MultiplicityElement_       | -                                            | abstract           | `+ /lower: Integer`, `+ /upper: UnlimitedNatural`                                           |
| _ValueSpecification_        | -                                            | abstract           | -                                                                                           |
| _Classifier_                | Namespace                                    | abstract           | -                                                                                           |
| _StructuredClassifier_      | Classifier                                   | abstract           | -                                                                                           |
| _EncapsulatedClassifier_    | StructuredClassifier                         | abstract           | -                                                                                           |
| _BehavioredClassifier_      | Classifier                                   | abstract           | -                                                                                           |
| _ConnectableElement_        | -                                            | abstract           | -                                                                                           |
| _StructuralFeature_         | MultiplicityElement, TypedElement            | abstract           | -                                                                                           |
| _Behavior_                  | Class                                        | abstract           | -                                                                                           |
| _LiteralSpecification_      | ValueSpecification                           | abstract           | -                                                                                           |
| _DataType_                  | Classifier                                   | abstract           | -                                                                                           |
| **Class**                   | EncapsulatedClassifier, BehavioredClassifier | concrete (pattern) | `+ name: String [0..1]`, `+ isAbstract: Boolean`                                            |
| **Generalization**          | -                                            | concrete (pattern) | -                                                                                           |
| **Property**                | ConnectableElement, StructuralFeature        | concrete (pattern) | `+ name: String [0..1]`, `+ isID: Boolean = false`, `+ aggregation: AggregationKind = none` |
| **Association**             | Classifier                                   | concrete (pattern) | `+ name: String [0..1]`                                                                     |
| **AssociationClass**        | Association, Class                           | concrete (pattern) | `+ name: String [0..1]`                                                                     |
| **PrimitiveType**           | DataType                                     | concrete (pattern) | -                                                                                           |
| **Enumeration**             | DataType                                     | concrete (pattern) | -                                                                                           |
| **EnumerationLiteral**      | -                                            | concrete (pattern) | `+ /qualifiedName: String [0..1] {readOnly}`                                                |
| **InstanceSpecification**   | -                                            | concrete           | -                                                                                           |
| **LiteralUnlimitedNatural** | LiteralSpecification                         | concrete           | -                                                                                           |
| **LiteralBoolean**          | LiteralSpecification                         | concrete           | -                                                                                           |
| **LiteralInteger**          | LiteralSpecification                         | concrete           | -                                                                                           |

### Associations (class model)

| From                 | To                   | Role (from)                                  | Role (to)                               | Multiplicity   |
| -------------------- | -------------------- | -------------------------------------------- | --------------------------------------- | -------------- |
| Classifier           | Generalization       | `+ specific`                                 | `+ generalization`                      | -              |
| Classifier           | Generalization       | `+ general`                                  | `+ generalization`                      | -              |
| MultiplicityElement  | ValueSpecification   | -                                            | `+ lowerValue`                          | -              |
| MultiplicityElement  | ValueSpecification   | -                                            | `+ upperValue`                          | -              |
| BehavioredClassifier | Behavior             | `+ behavioredClassifier` (subsets namespace) | `+ ownedBehavior` (subsets ownedMember) | `0..1` <-> `*` |
| Class                | Property             | `+ class`                                    | `+ ownedAttribute`                      | -              |
| Property             | ValueSpecification   | -                                            | `+ defaultValue`                        | -              |
| Property             | Association          | `+ memberEnd`                                | `+ association`                         | -              |
| Property             | Association          | `+ navigableOwnedEnd` / `+ ownedEnd`         | `+ owningAssociation`                   | -              |
| Property             | LiteralSpecification | `+ owningProperty`                           | -                                       | -              |
| DataType             | Property             | -                                            | `+ ownedAttribute`                      | -              |
| Property             | DataType             | -                                            | `+ datatype`                            | -              |

### Enumeration: AggregationKind

| Value     |
| --------- |
| none      |
| shared    |
| composite |

---

## Figure C.3 - Metamodel of the pimUML state machine model

### Inheritance hierarchy

| Class                    | Inherits from          | Type               | Attributes                          |
| ------------------------ | ---------------------- | ------------------ | ----------------------------------- |
| _NamedElement_           | -                      | abstract           | `+ name: String [0..1]`             |
| _Namespace_              | NamedElement           | abstract           | -                                   |
| _Classifier_             | Namespace              | abstract           | -                                   |
| _StructuredClassifier_   | Classifier             | abstract           | -                                   |
| _EncapsulatedClassifier_ | StructuredClassifier   | abstract           | -                                   |
| **Class**                | EncapsulatedClassifier | concrete           | -                                   |
| _Behavior_               | Class                  | abstract           | -                                   |
| _Vertex_                 | -                      | abstract           | -                                   |
| **StateMachine**         | Behavior               | concrete (pattern) | `+ name: String [0..1]`             |
| **Region**               | -                      | concrete (pattern) | `+ name: String [0..1]`             |
| **Transition**           | -                      | concrete (pattern) | -                                   |
| **Pseudostate**          | Vertex                 | concrete (pattern) | `+ kind: PseudostateKind = initial` |
| **State**                | Vertex                 | concrete (pattern) | `+ name: String [0..1]`             |
| **Trigger**              | -                      | concrete (pattern) | `+ name: String [0..1]`             |

### Associations (state machine)

| From         | To         | Role (from)      | Role (to)      | Multiplicity      |
| ------------ | ---------- | ---------------- | -------------- | ----------------- |
| StateMachine | Region     | `+ stateMachine` | `+ region`     | `0..1` <-> `1..*` |
| Region       | Vertex     | `+ container`    | `+ subvertex`  | `0..1` <-> `*`    |
| Region       | Transition | `+ container`    | `+ transition` | `1` <-> `*`       |
| Transition   | Vertex     | -                | `+ target`     | - <-> `1`         |
| Transition   | Vertex     | -                | `+ source`     | - <-> `1`         |
| Transition   | Trigger    | `+ transition`   | `+ trigger`    | - <-> `0..1`      |
| Transition   | Behavior   | -                | `+ effect`     | - <-> `0..1`      |
| Transition   | Transition | `+ transition`   | `+ transition` | `*` <-> `*`       |
| State        | Behavior   | -                | `+ entry`      | - <-> `0..1`      |
| State        | Region     | `+ container`    | `+ region`     | `0..1` <-> `*`    |

### Enumeration: PseudostateKind

| Value          |
| -------------- |
| initial        |
| deepHistory    |
| shallowHistory |
| join           |
| fork           |
| junction       |
| choice         |
| entryPoint     |
| exitPoint      |
| terminate      |
