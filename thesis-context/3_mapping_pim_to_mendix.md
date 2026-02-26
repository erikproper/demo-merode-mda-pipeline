## Table 11.1: High-level mapping specification from pimUML to Mendix

| ID  | pimUML                                                    | Mendix                                                                                         |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B1  | Class                                                     | Entity (domain model)                                                                          |
| B2  | Abstract Class                                            | Entity (domain model)                                                                          |
| B3  | Enumeration, EnumerationLiteral                           | EnumerationAttributeType (domain model), Enumeration (domain model)                            |
| B4  | User-defined data type                                    | Entity (domain model)                                                                          |
| B5  | Association Class                                         | Entity (domain model), Association [domain] (domain model), Association [range] (domain model) |
| B6  | Property (`isID == true`)                                 | Attribute Integer (domain model)                                                               |
| B7  | Property (of Datatype)                                    | Attribute (domain model)                                                                       |
| B8  | Property (of Class)                                       | Attribute (domain model)                                                                       |
| B9  | Association                                               | Association (domain model)                                                                     |
| B10 | Generalization                                            | Generalization/Specialization (domain model)                                                   |
| B11 | State Machine                                             | ACR Microflow (domain model + microflow)                                                       |
| B12 | Region, Pseudostate (initial)                             | Call Workflow activity (microflow), Workflow (workflow), Start element (workflow)              |
| B13 | Activity                                                  | Microflow (microflow)                                                                          |
| B14 | InitialNode                                               | StartEvent (microflow)                                                                         |
| B15 | ActivityFinalNode                                         | EndEvent (microflow)                                                                           |
| B16 | Parameter, ActivityParameterNode                          | Entity reference (microflow), Parameter (microflow)                                            |
| B17 | ValueSpecificationAction, AddStructuralFeatureValueAction | Change Object (microflow)                                                                      |
| B18 | AddStructuralFeatureValueAction                           | ChangeObjectAction (microflow)                                                                 |
| B19 | CreateLinkAction                                          | ChangeObjectAction (microflow)                                                                 |
| B20 | CreateObjectAction                                        | CreateObjectAction (microflow)                                                                 |
| B21 | ReadStructuralFeatureAction                               | CreateVariableAction (microflow)                                                               |
| B22 | Control flow                                              | Sequence flow (microflow)                                                                      |
| B23 | Transition, Trigger                                       | CallMicroflowTask (workflow), WaitForNotificationActivity (workflow)                           |
| B24 | State entry activity                                      | CallMicroflowTask (workflow)                                                                   |
