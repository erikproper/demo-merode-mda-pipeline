# Evaluationsrahmen (D6)

Arbeitsdokument zur Planung und Durchführung der Evaluation (D7). Die Methodik folgt Proposal-Abschnitt 3.3 und kombiniert das Semiotic Quality Framework [12] mit dem Quality Framework for Conceptual Models [14].

Gemessen werden vier Dimensionen: semantische Vollständigkeit, semantische Validität, Schema Validation Rate und Traceability Coverage. Extensibilität wird separat bewertet (EXTENSIBILITY_EVIDENCE.md).

---

## 1. Evaluationsablauf

Die Evaluation läuft in drei Phasen.

In der ersten Phase wird die Ground Truth extrahiert: alle atomaren Aussagen im Quellmodell (Rent-A-Car DEMO und MERODE) werden aufgelistet. Eine "atomare Aussage" ist die kleinste Bedeutungseinheit in der Quellsprache. Für DEMO sind das: Entitätstypen, Faktentypen (mit Multiplizitäten), Eigenschaftstypen, Werttypen und Ableitungsregeln. Für MERODE: Objekttypen (mit Attributen), Existenzabhängigkeiten (mit Multiplizitäten), Geschäftsereignistypen (mit C/M/E-Rolle) und Lebenszykluszustände (mit Übergangsstruktur).

In der zweiten Phase wird die Pipeline ausgeführt:
```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
Das veröffentlichte PIM (aus MQTT) und die generierte Mendix-Modellstruktur werden festgehalten, ebenso das `_trace`-Array aus der PIM-Nachricht.

In der dritten Phase werden die Ausgabeelemente klassifiziert. Für jede Ground-Truth-Aussage wird das entsprechende Ausgabeelement bewertet:

- **Correct (C):** im Ausgabemodell vorhanden, mit korrektem Typ und korrekter Struktur
- **Missing (M):** nicht vorhanden oder stillschweigend verworfen
- **Incorrect (I):** vorhanden, aber mit falschem Typ, falscher Struktur oder falschen Beziehungen
- **Added (A):** im Ausgabemodell vorhanden, aber ohne Gegenstück im Quellmodell; unterteilt in Added_justified (strukturell notwendig, z.B. `__initial`-Pseudozustände) und Added_unjustified (überflüssige Ergänzungen)

Daraus ergeben sich die Metriken: Completeness = C / (C + M + I), Validity = C / (C + I + Added_unjustified), Schema Validation Rate = immer 100% oder die Pipeline bricht ab, Traceability Coverage = Elemente mit Trace-Links / (alle Elemente ausgenommen explizit NotMapped).

Alle Klassifikationen hier basieren auf statischer Code-Analyse von `merode-to-pim-agent.ts` und `demo-to-pim-agent.ts` gegen die Fixtures. Vor der formalen Abgabe müssen sie gegen tatsächliche Pipeline-Ausgabe verifiziert werden.

---

## 2. Ground Truth: Rent-A-Car MERODE

Quellmodell: `mda-agents/tests/rent-a-car-merode.json`
Agent: `merode-to-pim-agent.ts`, Regeln M1–M9.

### Domänentypen (M3)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M3-1 | DomainType: FuelType (categorical, literals: petrol/diesel/electric) | Enumeration "FuelType" mit 3 Literalen | Correct |
| M3-2 | DomainType: PaymentMethod (categorical, literals: cash/creditCard/bankTransfer) | Enumeration "PaymentMethod" mit 3 Literalen | Correct |
| M3-3 | DomainType: MoneyAmount (non-categorical) | DataType "MoneyAmount" | Correct |

### Objekttypen und Attribute (M1, M2)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M1-1 | ObjectType: Car | Class "Car" + Property "CarID" (Integer, isID) | Correct |
| M1-2 | ObjectType: Person | Class "Person" + Property "PersonID" (Integer, isID) | Correct |
| M1-3 | ObjectType: Rental | Class "Rental" + Property "RentalID" (Integer, isID) | Correct |
| M1-4 | ObjectType: RentalLine | Class "RentalLine" + Property "RentalLineID" (Integer, isID) | Correct |
| M2-1 | Attribut: Car.licensePlate (String) | Property "licensePlate" auf Car | Correct |
| M2-2 | Attribut: Car.fuelType (FuelType) | Property "fuelType" (type: "FuelType") auf Car | Correct |
| M2-3 | Attribut: Car.mileage (Integer) | Property "mileage" auf Car | Correct |
| M2-4 | Attribut: Person.fullName (String) | Property "fullName" auf Person | Correct |
| M2-5 | Attribut: Person.email (String) | Property "email" auf Person | Correct |
| M2-6 | Attribut: Person.preferredPayment (PaymentMethod) | Property "preferredPayment" (type: "PaymentMethod") auf Person | Correct |
| M2-7 | Attribut: Rental.startingDay (String) | Property "startingDay" auf Rental | Correct |
| M2-8 | Attribut: Rental.endingDay (String) | Property "endingDay" auf Rental | Correct |
| M2-9 | Attribut: Rental.totalAmount (MoneyAmount) | Property "totalAmount" (type: "MoneyAmount") auf Rental | Correct |
| M2-10 | Attribut: RentalLine.quantity (Integer) | Property "quantity" auf RentalLine | Correct |
| M2-11 | Attribut: RentalLine.description (String) | Property "description" auf RentalLine | Correct |

### Existenzabhängigkeiten (M4)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M4-1 | ExistenceDependency: RentalDependsOnCar (Rental 0..* → Car 1..1) | Association "RentalDependsOnCar", memberEnds: dependent(Rental,0..*) / master(Car,1..1) | Correct |
| M4-2 | ExistenceDependency: RentalDependsOnPerson (Rental 0..* → Person 1..1) | Association "RentalDependsOnPerson", memberEnds: dependent(Rental,0..*) / master(Person,1..1) | Correct |
| M4-3 | ExistenceDependency: RentalLineDependsOnRental (RentalLine 0..* → Rental 1..1) | Association "RentalLineDependsOnRental", memberEnds: dependent(RentalLine,0..*) / master(Rental,1..1) | Correct |

### Geschäftsereignistypen und Lebenszyklus (M5–M8)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M5-1 | BET: registerCar, C-Rolle für Car | SM_Car: Übergang `__initial → registered`, Trigger registerCar; Activity Create_Car | Correct |
| M5-2 | BET: registerPerson, C-Rolle für Person | SM_Person: Übergang `__initial → registered`, Trigger registerPerson; Activity Create_Person | Correct |
| M5-3 | BET: startRental, C-Rolle für Rental | SM_Rental: Übergang `__initial → active`, Trigger startRental; Activity Create_Rental | Correct |
| M5-4 | BET: addRentalLine, C-Rolle für RentalLine | SM_RentalLine: Übergang `__initial → active`, Trigger addRentalLine; Activity Create_RentalLine | Correct |
| M7-1 | BET: updateCarMileage, M-Rolle für Car, effect: mileage (Integer) | SM_Car: Self-Transition `registered → registered`, Trigger updateCarMileage; Activity Set_Car_updateCarMileage mit typisiertem Effect | Correct |
| M7-2 | BET: updatePersonDetails, M-Rolle für Person, effects: fullName (String), email (String) | SM_Person: Self-Transition `registered → registered`, Trigger updatePersonDetails; Activity Set_Person_updatePersonDetails mit 2 Effects | Correct |
| M7-3 | BET: extendRental, M-Rolle für Rental, effect: endingDay (String) | SM_Rental: Self-Transition `active → active`, Trigger extendRental; Activity Set_Rental_extendRental mit typisiertem Effect | Correct |
| M7-4 | BET: updateRentalLine, M-Rolle für RentalLine, effects: quantity (Integer), description (String) | SM_RentalLine: Self-Transition `active → active`, Trigger updateRentalLine; Activity Set_RentalLine_updateRentalLine mit 2 Effects | Correct |
| M8-1 | BET: deregisterCar, E-Rolle für Car | SM_Car: Übergang `registered → __final`, Trigger deregisterCar; Activity End_Car | Correct |
| M8-2 | BET: deregisterPerson, E-Rolle für Person | SM_Person: Übergang `registered → __final`, Trigger deregisterPerson; Activity End_Person | Correct |
| M8-3 | BET: completeRental, E-Rolle für Rental | SM_Rental: Übergang `active → __final`, Trigger completeRental; Activity End_Rental | Correct |
| M8-4 | BET: removeRentalLine, E-Rolle für RentalLine | SM_RentalLine: Übergang `active → __final`, Trigger removeRentalLine; Activity End_RentalLine | Correct |
| LC-1 | Lebenszyklus: Car hat Zustand "registered" | SM_Car: State {name:"registered", kind:"simple"} | Correct |
| LC-2 | Lebenszyklus: Person hat Zustand "registered" | SM_Person: State {name:"registered", kind:"simple"} | Correct |
| LC-3 | Lebenszyklus: Rental hat Zustand "active" | SM_Rental: State {name:"active", kind:"simple"} | Correct |
| LC-4 | Lebenszyklus: RentalLine hat Zustand "active" | SM_RentalLine: State {name:"active", kind:"simple"} | Correct |

### Propagierte Ereignisse (M9 – transitive Propagierung über EDG)

Transitive Abhängigkeitshülle: Car → [Rental, RentalLine]; Person → [Rental, RentalLine]; Rental → [RentalLine]. Alle Ereignisse der Dependents werden als Self-Transitionen in den Master-SMs materialisiert.

| # | Atomare Quellaussage (A/M-Beteiligung laut EDG) | Erwartete PIM-Ausgabe | Klassifikation |
|---|------------------------------------------------|-----------------------|----------------|
| M9-1 | startRental: A/M für Car (1-hop: Rental depends on Car) | Self-Transition `registered → registered` in SM_Car, trigger=startRental | Correct |
| M9-2 | startRental: A/M für Person (1-hop: Rental depends on Person) | Self-Transition `registered → registered` in SM_Person, trigger=startRental | Correct |
| M9-3 | extendRental: A/M für Car (1-hop) | Self-Transition `registered → registered` in SM_Car, trigger=extendRental | Correct |
| M9-4 | extendRental: A/M für Person (1-hop) | Self-Transition `registered → registered` in SM_Person, trigger=extendRental | Correct |
| M9-5 | completeRental: A/M für Car (1-hop) | Self-Transition `registered → registered` in SM_Car, trigger=completeRental | Correct |
| M9-6 | completeRental: A/M für Person (1-hop) | Self-Transition `registered → registered` in SM_Person, trigger=completeRental | Correct |
| M9-7 | addRentalLine: A/M für Rental (1-hop: RentalLine depends on Rental) | Self-Transition `active → active` in SM_Rental, trigger=addRentalLine | Correct |
| M9-8 | updateRentalLine: A/M für Rental (1-hop) | Self-Transition `active → active` in SM_Rental, trigger=updateRentalLine | Correct |
| M9-9 | removeRentalLine: A/M für Rental (1-hop) | Self-Transition `active → active` in SM_Rental, trigger=removeRentalLine | Correct |
| M9-10 | addRentalLine: A/M für Car (2-hop: via Rental) | Self-Transition `registered → registered` in SM_Car, trigger=addRentalLine | Correct |
| M9-11 | updateRentalLine: A/M für Car (2-hop) | Self-Transition `registered → registered` in SM_Car, trigger=updateRentalLine | Correct |
| M9-12 | removeRentalLine: A/M für Car (2-hop) | Self-Transition `registered → registered` in SM_Car, trigger=removeRentalLine | Correct |
| M9-13 | addRentalLine: A/M für Person (2-hop: via Rental) | Self-Transition `registered → registered` in SM_Person, trigger=addRentalLine | Correct |
| M9-14 | updateRentalLine: A/M für Person (2-hop) | Self-Transition `registered → registered` in SM_Person, trigger=updateRentalLine | Correct |
| M9-15 | removeRentalLine: A/M für Person (2-hop) | Self-Transition `registered → registered` in SM_Person, trigger=removeRentalLine | Correct |

### Hilfsstrukturen (Added_justified)

| Hinzugefügtes Element | Begründung |
|----------------------|-----------|
| Pseudozustand `__initial` in jeder SM | Vom pimUML-StateMachine-Format geforderter initialer Pseudozustand |
| Zustand `__final` in jeder SM | Vom pimUML-StateMachine-Format geforderter finaler Zustand |
| Region "lifecycle" in jeder SM | Notwendiger Wrapper für Zustände und Übergänge (kein forEvent, da MERODE-SM) |
| Activity Create_<OT> für C-Events | Semantisches Äquivalent des C-Ereignisses auf Aktivitätsebene; notwendig für Mendix-Microflow-Generierung |
| Activity Set_<OT>_<evt> für M-Events | Semantisches Äquivalent des M-Ereignisses; notwendig für B15-Microflow-Generierung |
| Activity End_<OT> für E-Events | Semantisches Äquivalent des E-Ereignisses; notwendig für B16-Microflow-Generierung |

Diese zählen als Added_justified und werden nicht als Validitätsfehler gewertet.

### MERODE Zusammenfassung

Gesamt-Quellaussagen: 3 (M3) + 4 (M1) + 11 (M2) + 3 (M4) + 12 (M5–M8) + 4 (LC) + 15 (M9) = **52**

| Metrik | Wert |
|--------|------|
| Correct (C) | 52 |
| Missing (M) | 0 |
| Incorrect (I) | 0 |
| **Completeness** = C/(C+M+I) | **100 %** |
| Added_unjustified | 0 |
| **Validity** = C/(C+I+Added_unjustified) | **100 %** |

---

## 3. Ground Truth: Rent-A-Car DEMO

Quellmodell: `mda-agents/tests/rent-a-car-demo.json`
Agent: `demo-to-pim-agent.ts`, Regeln A1–A12.

### Werttypen (A1, A2, A8)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A1-1 | ValueType: CarGroup (categorical, literals: economy/compact/luxury) | Enumeration "CarGroup" mit 3 Literalen | Correct |
| A2-1 | ValueType: MoneyAmount (non-categorical, kein triggerEvent) | DataType "MoneyAmount" | Correct |
| A8-1 | ValueType: BookingDetail (non-categorical, triggerEvent=rentalStarted, relates: Rental, Car) | AssociationClass "BookingDetail", memberEnds: rental(Rental,0..*)/car(Car,0..*), triggerEvent: rentalStarted | Correct |
| A8-2 | Attribut: BookingDetail.pricePerDay (Integer) | Property "pricePerDay" (Integer) auf BookingDetail | Correct |
| A8-3 | Attribut: BookingDetail.notes (String) | Property "notes" (String) auf BookingDetail | Correct |

### Entitätstypen und Attribute (A3, A5)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A3-1 | EntityType: Car | Class "Car" + Property "CarID" (Integer, isID) | Correct |
| A3-2 | EntityType: Vehicle (isAbstract) | Class "Vehicle" (isAbstract: true) + Property "VehicleID" (Integer, isID) | Correct |
| A3-3 | EntityType: SpecialCar (parent=Car, triggerEvent – kein isDerived) | Class "SpecialCar" + Property "SpecialCarID" (Integer, isID); ID via A3 da !isDerived | Correct |
| A3-4 | EntityType: Person | Class "Person" + Property "PersonID" (Integer, isID) | Correct |
| A3-5 | EntityType: PremiumCustomer (isDerived, parent=Person) | Class "PremiumCustomer" (isDerived: true); ID erst via A9 zugewiesen | Correct |
| A3-6 | EntityType: Rental | Class "Rental" + Property "RentalID" (Integer, isID) | Correct |
| A3-7 | EntityType: ActiveRental (parent=Rental, triggerEvent – kein isDerived) | Class "ActiveRental" + Property "ActiveRentalID" (Integer, isID) | Correct |
| A3-8 | EntityType: RentalLine | Class "RentalLine" + Property "RentalLineID" (Integer, isID) | Correct |
| A5-1 | Attribut: Car.licensePlate (String) | Property "licensePlate" auf Car | Correct |
| A5-2 | Attribut: Car.group (CarGroup) | Property "group" (type: "CarGroup") auf Car | Correct |
| A5-3 | Attribut: Car.mileage (Integer) | Property "mileage" auf Car | Correct |
| A5-4 | Attribut: Vehicle.licensePlate (String) | Property "licensePlate" auf Vehicle | Correct |
| A5-5 | Attribut: Person.fullName (String) | Property "fullName" auf Person | Correct |
| A5-6 | Attribut: Person.email (String) | Property "email" auf Person | Correct |
| A5-7 | Attribut: Rental.startingDay (String) | Property "startingDay" auf Rental | Correct |
| A5-8 | Attribut: Rental.endingDay (String) | Property "endingDay" auf Rental | Correct |
| A5-9 | Attribut: Rental.totalAmount (MoneyAmount) | Property "totalAmount" (type: "MoneyAmount") auf Rental | Correct |
| A5-10 | Attribut: Rental.totalDays (Integer, derivationRule: "self.endingDay - self.startingDay") | DerivedProperty "totalDays" (isDerived: true, derivationRule gesetzt) auf Rental | Correct |
| A5-11 | Attribut: RentalLine.quantity (Integer) | Property "quantity" auf RentalLine | Correct |
| A5-12 | Attribut: RentalLine.description (String) | Property "description" auf RentalLine | Correct |

### Ereignistypen → Boolesche Attribute (A6)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A6-1 | EventType: carRegistered (für Car) | Property "carRegistered" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-2 | EventType: mileageUpdated (für Car) | Property "mileageUpdated" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-3 | EventType: carDeregistered (für Car) | Property "carDeregistered" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-4 | EventType: personRegistered (für Person) | Property "personRegistered" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-5 | EventType: personUpdated (für Person) | Property "personUpdated" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-6 | EventType: personRemoved (für Person) | Property "personRemoved" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-7 | EventType: rentalStarted (für Rental) | Property "rentalStarted" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-8 | EventType: rentalExtended (für Rental) | Property "rentalExtended" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-9 | EventType: rentalCompleted (für Rental) | Property "rentalCompleted" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-10 | EventType: rentalLineAdded (für RentalLine) | Property "rentalLineAdded" (Boolean, defaultValue: "false") auf RentalLine | Correct |
| A6-11 | EventType: rentalLineUpdated (für RentalLine) | Property "rentalLineUpdated" (Boolean, defaultValue: "false") auf RentalLine | Correct |
| A6-12 | EventType: rentalLineRemoved (für RentalLine) | Property "rentalLineRemoved" (Boolean, defaultValue: "false") auf RentalLine | Correct |

### Faktentypen → Assoziationen (A11, A12)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A11-1 | FactType: RentalHasLines (Aggregation, Rental 1..1 / RentalLine 0..*) | Association "RentalHasLines" (isAggregation: true), memberEnds: rental(Rental,1..1)/rentalLine(RentalLine,0..*); A11: Property "rentalLineID" (Integer) auf Rental hinzugefügt | Correct |
| A12-1 | FactType: RentalInvolvesCar (Rental 0..* / Car 1..1) | Association "RentalInvolvesCar", memberEnds: rental(Rental,0..*)/car(Car,1..1) | Correct |
| A12-2 | FactType: RentalMadeByPerson (Rental 0..* / Person 1..1) | Association "RentalMadeByPerson", memberEnds: rental(Rental,0..*)/renter(Person,1..1) | Correct |

### Spezialisierungen (A7, A9, A10)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A7-1 | SpecialCar: parent=Car, triggerEventType=carRegistered | EventTriggeredAssociation "SpecialCarIsACar", triggerEvent: "carRegistered", memberEnds: specialization(SpecialCar,0..*)/parent(Car,1..1) | Correct |
| A7-2 | ActiveRental: parent=Rental, triggerEventType=rentalStarted | EventTriggeredAssociation "ActiveRentalIsARental", triggerEvent: "rentalStarted", memberEnds: specialization(ActiveRental,0..*)/parent(Rental,1..1) | Correct |
| A9-1 | PremiumCustomer: isDerived=true, parent=Person, derivationExpression="Person.rentals->size() > 10" | DerivedAssociation "PremiumCustomerIsAPerson" (isDerived: true, derivationExpression gesetzt), memberEnds: derived(PremiumCustomer,0..*)/parent(Person,1..1); Property "PremiumCustomerID" (Integer, isID) auf PremiumCustomer | Correct |
| A10 | (keine Entity mit parent UND !isDerived UND !triggerEvent im Fixture) | – A10-Regel implementiert, im Rent-A-Car-Fixture nicht aktiviert – | Nicht anwendbar |

### Zustandsmaschinen (A3/A4 – orthogonale Regionen)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| SM-1 | Car hat 3 Ereignisse → 3 orthogonale Regionen | SM_Car: Regionen carRegistered/mileageUpdated/carDeregistered; je 3 Zustände ({ev}_initial, {ev}_false, {ev}_true) + 2 Übergänge; carRegistered_true hat entryActivity "CreateSpecialCar" (A7) | Correct |
| SM-2 | Person hat 3 Ereignisse → 3 orthogonale Regionen | SM_Person: Regionen personRegistered/personUpdated/personRemoved | Correct |
| SM-3 | Rental hat 3 Ereignisse → 3 orthogonale Regionen | SM_Rental: Regionen rentalStarted/rentalExtended/rentalCompleted; rentalStarted_true hat entryActivity "CreateActiveRental" (A7) | Correct |
| SM-4 | RentalLine hat 3 Ereignisse → 3 orthogonale Regionen | SM_RentalLine: Regionen rentalLineAdded/rentalLineUpdated/rentalLineRemoved | Correct |

### Hilfsstrukturen (Added_justified)

| Hinzugefügtes Element | Begründung |
|----------------------|-----------|
| `{ev}_initial`-Pseudozustand in jeder Region | Vom pimUML-StateMachine-Format gefordert (forEvent gesetzt = DEMO-SM) |
| Activity `Set{ET}_{ev}` für jedes Ereignis | Semantisches Äquivalent im Aktivitätsmodell; notwendig für Mendix-B-Regeln |
| Activity `Create{Child}` für getriggerte Spezialisierungen | Strukturhelfer für A7-Semantik (CreateSpecialCar, CreateActiveRental) |
| Activity `Create{Derived}` für abgeleitete Spezialisierungen | Strukturhelfer für A9-Semantik (CreatePremiumCustomer) |
| SM mit 0 Regionen für Vehicle/SpecialCar/PremiumCustomer/ActiveRental | Immer generiert pro EntityType; leer weil keine Events referenzieren diese |
| Property "rentalLineID" auf Rental (A11) | Strukturell notwendiger Identifier-Link der Aggregations-Komposition |

### DEMO Zusammenfassung

Gesamt-Quellaussagen: 5 (A1/A2/A8 + Attribute) + 8 (A3 EntityTypes) + 12 (A5 Attribute) + 12 (A6 Events) + 3 (A11/A12 FactTypes) + 3 (A7/A9 Spezialisierungen) + 4 (A3/A4 SMs) = **47**

| Metrik | Wert |
|--------|------|
| Correct (C) | 47 |
| Missing (M) | 0 |
| Incorrect (I) | 0 |
| **Completeness** = C/(C+M+I) | **100 %** |
| Added_unjustified | 0 |
| **Validity** = C/(C+I+Added_unjustified) | **100 %** |

Hinweis: A10 (nicht-abgeleitete, nicht-getriggerte Generalisierungen) ist implementiert, im Rent-A-Car-DEMO-Fixture aber nicht aktiviert — kein EntityType qualifiziert sich. Das ist eine Lücke in der Testabdeckung, kein Implementierungsfehler.

---

## 4. Mendix-seitige Evaluation (Schema Validation Rate)

Nach dem Ausführen der Pipeline das generierte Mendix-Modell in Mendix Studio Pro öffnen und prüfen: keine Fehler (CE-Präfix) und idealerweise keine Warnungen (CW-Präfix) oder diese dokumentieren.

Nach dem Beheben von CE7247, CE0117 und CW0263 sollte das Modell ohne Fehler öffnen. Diesen Check nach jeder Code-Änderung wiederholen. Screenshot des Mendix-Fehlerbereichs mit Anzahl und Typ möglicher Probleme erstellen, das ist der empirische Nachweis für den 100%-SVR-Anspruch.

---

## 5. Traceability Coverage

Das `_trace`-Array in jeder veröffentlichten PIM-Nachricht enthält Trace-Einträge als `{ sourceType, sourceName, targetType, targetName }`. Zur Berechnung der Traceability Coverage: das `_trace`-Array aus der MERODE-PIM-Nachricht extrahieren (aus der MQTT-Retained-Message oder den Konsolenausgaben), Einträge mit `targetType != "NotMapped"` zählen (nachverfolgte Elemente), Einträge mit `targetType == "NotMapped"` zählen (explizit nicht nachverfolgbar, akzeptabel für A7-Verweise), und Coverage = verfolgt / (verfolgt + nicht verfolgt) berechnen.

M9 ist implementiert (transitive Propagierung). Alle propagierten Ereignisse erhalten einen Trace-Eintrag (`targetType: "Transition"`, `targetName: "<OT>.<evt> (M9 propagated)"`). Es gibt keine NotMapped-Einträge mehr für propagierte Ereignisse. NotMapped-Einträge entstehen nur noch bei explizit übersprungenen Elementen (z.B. A7-SM-Behavior im DEMO-Agenten).

---

## 6. Gliederungsplan für das Thesis-Kapitel

Das Evaluationskapitel sollte folgende Struktur haben: Versuchsaufbau (Fallstudie, Quellmodelle, Pipeline-Konfiguration), Ground-Truth-Extraktion (atomare Aussagen für jede Quellsprache in tabellarischer Form), Transformationsergebnisse für DEMO (Klassifikationstabelle, Vollständigkeit/Validität, Vergleich mit Bzowskis Ergebnissen), Transformationsergebnisse für MERODE (Klassifikationstabelle, explizite Nennung der fehlenden M9-Elemente), Mendix-Modellvalidierung (Screenshot, Fehleranzahl, SVR = 100%), Traceability (Abdeckungsprozentsatz, Liste der NotMapped-Elemente mit Begründungen), Extensibilität (Git-Diff beim Hinzufügen von MERODE, Verweis auf EXTENSIBILITY_EVIDENCE.md) und Diskussion (was die Werte bedeuten, wie die Ergebnisse RQ3 und RQ4 beantworten).

---

## 7. Erwartete Ergebnisse (Vorab-Schätzung aus statischer Code-Analyse)

Alle Klassifikationen basieren auf einer vollständigen manuellen Durchverfolgung des Agentencodes gegen die Fixtures. Verifizierung gegen tatsächliche Pipeline-Ausgabe steht noch aus und kann Abweichungen aufdecken.

**DEMO (47 Quellaussagen):** Alle 47 Aussagen werden korrekt transformiert (C=47, M=0, I=0). Completeness = 100 %, Validity = 100 %. A10-Regel ist implementiert, aber im Fixture nicht aktiviert (kein A10-qualifizierender EntityType). Dieses Ergebnis deckt sich mit Bzowskis Erwartungen für einen vollständig implementierten A-Regelkanon.

**MERODE (52 Quellaussagen):** Alle 52 Aussagen werden korrekt transformiert (C=52, M=0, I=0). Completeness = 100 %, Validity = 100 %. Bekannte Einschränkung: M7-modifizierte Attribute (z.B. `mileage` bei `updateCarMileage`) erscheinen korrekt im PIM mit typisiertem Effect, werden aber im nachgelagerten B15-Microflow nicht auf Mendix-Attribut-Ebene gesetzt — das ist eine dokumentierte B-Regeleinschränkung, keine M-Regeleinschränkung.

**Schema Validation Rate:** Konstruktionsbedingt 100 % — die Pipeline bricht bei jedem Schemaverstoß ab, bevor sie publiziert.

**Traceability Coverage:** Nahe 100 %. Einzige NotMapped-Einträge entstehen beim A7-Trace-Eintrag `{ targetType: "NotMapped", targetName: "StateMachineBehavior" }`, der die nicht-übersetzte SM-Trigger-Semantik explizit kennzeichnet. Diese sind semantisch gerechtfertigt.
