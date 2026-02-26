# Metamodel: pimUML

Das pimUML-Metamodel basiert auf UML Version 2.5.1 und gliedert sich in drei Teile: Klassendiagramm, Zustandsmaschinendiagramm und Aktivitätsdiagramm.

---

## Legende (Figure C.1)

| Darstellung                           | Bedeutung                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Metaclass** (grün hinterlegt, fett) | Konkrete Klasse, in mindestens einer gematchten Pattern-Regel enthalten                          |
| **Metaclass** (weiß, fett)            | Konkrete Klasse, in keiner gematchten Pattern-Regel enthalten                                    |
| _Metaclass_ (grün hinterlegt, kursiv) | Abstrakt, führt keine Attribute oder Referenzen ein, die von konkreten Metaklassen geerbt werden |
| _Metaclass_ (weiß, kursiv)            | Abstrakt, führt Attribute oder Referenzen ein, die von konkreten Metaklassen geerbt werden       |

---

## Figure C.2 – Metamodel des pimUML-Klassenmodells

### Vererbungshierarchie

| Klasse                      | Erbt von                                     | Typ               | Attribute                                                                                   |
| --------------------------- | -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| _NamedElement_              | –                                            | abstrakt          | `+ name: String [0..1]`                                                                     |
| _Namespace_                 | NamedElement                                 | abstrakt          | –                                                                                           |
| _Type_                      | –                                            | abstrakt          | –                                                                                           |
| _TypedElement_              | –                                            | abstrakt          | `+ type → Type`                                                                             |
| _MultiplicityElement_       | –                                            | abstrakt          | `+ /lower: Integer`, `+ /upper: UnlimitedNatural`                                           |
| _ValueSpecification_        | –                                            | abstrakt          | –                                                                                           |
| _Classifier_                | Namespace                                    | abstrakt          | –                                                                                           |
| _StructuredClassifier_      | Classifier                                   | abstrakt          | –                                                                                           |
| _EncapsulatedClassifier_    | StructuredClassifier                         | abstrakt          | –                                                                                           |
| _BehavioredClassifier_      | Classifier                                   | abstrakt          | –                                                                                           |
| _ConnectableElement_        | –                                            | abstrakt          | –                                                                                           |
| _StructuralFeature_         | MultiplicityElement, TypedElement            | abstrakt          | –                                                                                           |
| _Behavior_                  | Class                                        | abstrakt          | –                                                                                           |
| _LiteralSpecification_      | ValueSpecification                           | abstrakt          | –                                                                                           |
| _DataType_                  | Classifier                                   | abstrakt          | –                                                                                           |
| **Class**                   | EncapsulatedClassifier, BehavioredClassifier | konkret (pattern) | `+ name: String [0..1]`, `+ isAbstract: Boolean`                                            |
| **Generalization**          | –                                            | konkret (pattern) | –                                                                                           |
| **Property**                | ConnectableElement, StructuralFeature        | konkret (pattern) | `+ name: String [0..1]`, `+ isID: Boolean = false`, `+ aggregation: AggregationKind = none` |
| **Association**             | Classifier                                   | konkret (pattern) | `+ name: String [0..1]`                                                                     |
| **AssociationClass**        | Association, Class                           | konkret (pattern) | `+ name: String [0..1]`                                                                     |
| **PrimitiveType**           | DataType                                     | konkret (pattern) | –                                                                                           |
| **Enumeration**             | DataType                                     | konkret (pattern) | –                                                                                           |
| **EnumerationLiteral**      | –                                            | konkret (pattern) | `+ /qualifiedName: String [0..1] {readOnly}`                                                |
| **InstanceSpecification**   | –                                            | konkret           | –                                                                                           |
| **LiteralUnlimitedNatural** | LiteralSpecification                         | konkret           | –                                                                                           |
| **LiteralBoolean**          | LiteralSpecification                         | konkret           | –                                                                                           |
| **LiteralInteger**          | LiteralSpecification                         | konkret           | –                                                                                           |

### Assoziationen (Klassenmodell)

| Von                  | Zu                   | Rolle (von)                                  | Rolle (zu)                              | Multiplizität |
| -------------------- | -------------------- | -------------------------------------------- | --------------------------------------- | ------------- |
| Classifier           | Generalization       | `+ specific`                                 | `+ generalization`                      | –             |
| Classifier           | Generalization       | `+ general`                                  | `+ generalization`                      | –             |
| MultiplicityElement  | ValueSpecification   | –                                            | `+ lowerValue`                          | –             |
| MultiplicityElement  | ValueSpecification   | –                                            | `+ upperValue`                          | –             |
| BehavioredClassifier | Behavior             | `+ behavioredClassifier` (subsets namespace) | `+ ownedBehavior` (subsets ownedMember) | `0..1` ↔ `*`  |
| Class                | Property             | `+ class`                                    | `+ ownedAttribute`                      | –             |
| Property             | ValueSpecification   | –                                            | `+ defaultValue`                        | –             |
| Property             | Association          | `+ memberEnd`                                | `+ association`                         | –             |
| Property             | Association          | `+ navigableOwnedEnd` / `+ ownedEnd`         | `+ owningAssociation`                   | –             |
| Property             | LiteralSpecification | `+ owningProperty`                           | –                                       | –             |
| DataType             | Property             | –                                            | `+ ownedAttribute`                      | –             |
| Property             | DataType             | –                                            | `+ datatype`                            | –             |

### Enumeration: AggregationKind

| Wert      |
| --------- |
| none      |
| shared    |
| composite |

---

## Figure C.3 – Metamodel des pimUML-Zustandsmaschinenmodells

### Vererbungshierarchie

| Klasse                   | Erbt von               | Typ               | Attribute                           |
| ------------------------ | ---------------------- | ----------------- | ----------------------------------- |
| _NamedElement_           | –                      | abstrakt          | `+ name: String [0..1]`             |
| _Namespace_              | NamedElement           | abstrakt          | –                                   |
| _Classifier_             | Namespace              | abstrakt          | –                                   |
| _StructuredClassifier_   | Classifier             | abstrakt          | –                                   |
| _EncapsulatedClassifier_ | StructuredClassifier   | abstrakt          | –                                   |
| **Class**                | EncapsulatedClassifier | konkret           | –                                   |
| _Behavior_               | Class                  | abstrakt          | –                                   |
| _Vertex_                 | –                      | abstrakt          | –                                   |
| **StateMachine**         | Behavior               | konkret (pattern) | `+ name: String [0..1]`             |
| **Region**               | –                      | konkret (pattern) | `+ name: String [0..1]`             |
| **Transition**           | –                      | konkret (pattern) | –                                   |
| **Pseudostate**          | Vertex                 | konkret (pattern) | `+ kind: PseudostateKind = initial` |
| **State**                | Vertex                 | konkret (pattern) | `+ name: String [0..1]`             |
| **Trigger**              | –                      | konkret (pattern) | `+ name: String [0..1]`             |

### Assoziationen (Zustandsmaschine)

| Von          | Zu         | Rolle (von)      | Rolle (zu)     | Multiplizität   |
| ------------ | ---------- | ---------------- | -------------- | --------------- |
| StateMachine | Region     | `+ stateMachine` | `+ region`     | `0..1` ↔ `1..*` |
| Region       | Vertex     | `+ container`    | `+ subvertex`  | `0..1` ↔ `*`    |
| Region       | Transition | `+ container`    | `+ transition` | `1` ↔ `*`       |
| Transition   | Vertex     | –                | `+ target`     | – ↔ `1`         |
| Transition   | Vertex     | –                | `+ source`     | – ↔ `1`         |
| Transition   | Trigger    | `+ transition`   | `+ trigger`    | – ↔ `0..1`      |
| Transition   | Behavior   | –                | `+ effect`     | – ↔ `0..1`      |
| Transition   | Transition | `+ transition`   | `+ transition` | `*` ↔ `*`       |
| State        | Behavior   | –                | `+ entry`      | – ↔ `0..1`      |
| State        | Region     | `+ container`    | `+ region`     | `0..1` ↔ `*`    |

### Enumeration: PseudostateKind

| Wert           |
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
