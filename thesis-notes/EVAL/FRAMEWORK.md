# Evaluationsrahmen (D6)

Arbeitsdokument zur Planung und Durchführung der Evaluation (D7). Die Methodik folgt Proposal-Abschnitt 3.3 und kombiniert das Semiotic Quality Framework [12] mit dem Quality Framework for Conceptual Models [14].

Gemessen werden vier Dimensionen: semantische Vollständigkeit, semantische Validität, Schema Validation Rate und Traceability Coverage. Extensibilität wird separat bewertet (EXTENSIBILITY_EVIDENCE.md).

---

## 1. Evaluationsablauf

Die Evaluation läuft in drei Phasen.

Die Evaluation stützt sich auf zwei Modellpaare. Das erste Paar (Abschnitt 2 und 3) ist ein Regelabdeckungsmodell und dient dem Nachweis, dass jede A- und M-Regel real feuert. Das zweite Paar (Abschnitt 4) bildet ein veröffentlichtes Fallmodell Dritter nach und dient der externen Validität. Beide sind eingebettete Untersuchungseinheiten mit unterschiedlicher Beweislast.

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

**Verifikationsstatus:** Die Klassifikationen in Abschnitt 2 und 3 basieren nicht mehr auf statischer Code-Analyse, sondern auf einem tatsächlichen Aufruf der Produktionsfunktionen `demo-to-pim-agent.ts::transform()` und `merode-to-pim-agent.ts::transform()` gegen die aktuellen Fixtures, mit anschließender Ajv-Validierung des Outputs gegen `pimuml-schema.json` (beide Outputs schemagültig, DEMO: 108 Trace-Einträge, MERODE: 100 Trace-Einträge). Diese Zahlen wurden am 2026-09-07 durch einen echten End-to-End-Lauf über die Live-Pipeline bestätigt (`curl`-POST an `https://mda.tlolab.com/api/model` vom Mac, PIM-Payload per `mosquitto_sub` vom retained MQTT-Topic direkt auf dem Pi gelesen; Rohdaten in `EVAL/demo-pim-output.json` und `EVAL/merode-pim-output.json` archiviert): identische Trace-Anzahl (108/100), identische Struktur (12/6 Klassen, 11/5 Assoziationen, 12/6 State Machines, 45 M9-propagierte Self-Transitionen bei MERODE). Damit ist auch die formale Traceability-Coverage-Berechnung (Abschnitt 6) nicht mehr offen. Offen bleibt nur noch der Live-Mendix-Studio-Pro-Check (Abschnitt 5, QR3), der zwingend manuell erfolgen muss.

---

## 2. Ground Truth: Rent-A-Car MERODE

Quellmodell: `mda-agents/tests/rent-a-car-merode.json`
Agent: `merode-to-pim-agent.ts`, Regeln M1-M9.

### Domänentypen (M3)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M3-1 | DomainType: CarGroup (categorical, literals: economy/compact/luxury) | Enumeration "CarGroup" mit 3 Literalen | Correct |
| M3-2 | DomainType: MoneyAmount (non-categorical) | DataType "MoneyAmount" | Correct |

### Objekttypen (M1)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M1-1 | ObjectType: Car | Class "Car" + Property "CarID" (Integer, isID) | Correct |
| M1-2 | ObjectType: Branch | Class "Branch" + Property "BranchID" (Integer, isID) | Correct |
| M1-3 | ObjectType: Person | Class "Person" + Property "PersonID" (Integer, isID) | Correct |
| M1-4 | ObjectType: Rental | Class "Rental" + Property "RentalID" (Integer, isID) | Correct |
| M1-5 | ObjectType: RentalLine | Class "RentalLine" + Property "RentalLineID" (Integer, isID) | Correct |
| M1-6 | ObjectType: Invoice | Class "Invoice" + Property "InvoiceID" (Integer, isID) | Correct |

### Attribute (M2)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M2-1 | Attribut: Car.licensePlate (String) | Property "licensePlate" auf Car | Correct |
| M2-2 | Attribut: Car.group (CarGroup) | Property "group" (type: "CarGroup") auf Car | Correct |
| M2-3 | Attribut: Car.mileage (Integer) | Property "mileage" auf Car | Correct |
| M2-4 | Attribut: Branch.name (String) | Property "name" auf Branch | Correct |
| M2-5 | Attribut: Branch.city (String) | Property "city" auf Branch | Correct |
| M2-6 | Attribut: Person.fullName (String) | Property "fullName" auf Person | Correct |
| M2-7 | Attribut: Person.email (String) | Property "email" auf Person | Correct |
| M2-8 | Attribut: Rental.startingDay (String) | Property "startingDay" auf Rental | Correct |
| M2-9 | Attribut: Rental.endingDay (String) | Property "endingDay" auf Rental | Correct |
| M2-10 | Attribut: Rental.carGroup (CarGroup) | Property "carGroup" (type: "CarGroup") auf Rental | Correct |
| M2-11 | Attribut: Rental.depositAmount (MoneyAmount) | Property "depositAmount" (type: "MoneyAmount") auf Rental | Correct |
| M2-12 | Attribut: Rental.invoiceAmount (MoneyAmount) | Property "invoiceAmount" (type: "MoneyAmount") auf Rental | Correct |
| M2-13 | Attribut: RentalLine.quantity (Integer) | Property "quantity" auf RentalLine | Correct |
| M2-14 | Attribut: RentalLine.description (String) | Property "description" auf RentalLine | Correct |
| M2-15 | Attribut: Invoice.amount (MoneyAmount) | Property "amount" (type: "MoneyAmount") auf Invoice | Correct |
| M2-16 | Attribut: Invoice.paidOn (String) | Property "paidOn" auf Invoice | Correct |

### Existenzabhängigkeiten (M4)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M4-1 | ExistenceDependency: RentalDependsOnCar (Rental 0..* -> Car 1..1) | Association "RentalDependsOnCar", memberEnds: dependent(Rental,0..*) / master(Car,1..1) | Correct |
| M4-2 | ExistenceDependency: RentalDependsOnPerson (Rental 0..* -> Person 1..1) | Association "RentalDependsOnPerson", memberEnds: dependent(Rental,0..*) / master(Person,1..1) | Correct |
| M4-3 | ExistenceDependency: RentalDependsOnBranch (Rental 0..* -> Branch 1..1) | Association "RentalDependsOnBranch", memberEnds: dependent(Rental,0..*) / master(Branch,1..1) | Correct |
| M4-4 | ExistenceDependency: RentalLineDependsOnRental (RentalLine 0..* -> Rental 1..1) | Association "RentalLineDependsOnRental", memberEnds: dependent(RentalLine,0..*) / master(Rental,1..1) | Correct |
| M4-5 | ExistenceDependency: InvoiceDependsOnRentalLine (Invoice 0..* -> RentalLine 1..1) | Association "InvoiceDependsOnRentalLine", memberEnds: dependent(Invoice,0..*) / master(RentalLine,1..1) | Correct |

### Geschäftsereignistypen (M5-M8) und Lebenszyklus

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M5-1 | BET: registerCar, C-Rolle für Car | SM_Car: Übergang `__initial -> registered`, Trigger registerCar; Activity Create_Car | Correct |
| M7-1 | BET: updateCarMileage, M-Rolle für Car, effect: mileage (Integer) | SM_Car: Self-Transition `registered -> registered`, Trigger updateCarMileage; Activity Set_Car_updateCarMileage mit typisiertem Effect | Correct |
| M8-1 | BET: deregisterCar, E-Rolle für Car | SM_Car: Übergang `registered -> __final`, Trigger deregisterCar; Activity End_Car | Correct |
| M5-2 | BET: openBranch, C-Rolle für Branch | SM_Branch: Übergang `__initial -> open`, Trigger openBranch; Activity Create_Branch | Correct |
| M8-2 | BET: closeBranch, E-Rolle für Branch | SM_Branch: Übergang `open -> __final`, Trigger closeBranch; Activity End_Branch | Correct |
| M5-3 | BET: registerPerson, C-Rolle für Person | SM_Person: Übergang `__initial -> registered`, Trigger registerPerson; Activity Create_Person | Correct |
| M7-2 | BET: updatePersonDetails, M-Rolle für Person, effects: fullName (String), email (String) | SM_Person: Self-Transition `registered -> registered`, Trigger updatePersonDetails; Activity Set_Person_updatePersonDetails mit 2 Effects | Correct |
| M8-3 | BET: deregisterPerson, E-Rolle für Person | SM_Person: Übergang `registered -> __final`, Trigger deregisterPerson; Activity End_Person | Correct |
| M5-4 | BET: startRental, C-Rolle für Rental | SM_Rental: Übergang `__initial -> active`, Trigger startRental; Activity Create_Rental | Correct |
| M7-3 | BET: extendRental, M-Rolle für Rental, fromState=active, toState=active, effect: endingDay (String) | SM_Rental: Self-Transition `active -> active`, Trigger extendRental; Activity Set_Rental_extendRental mit typisiertem Effect | Correct |
| M7-4 | BET: payDeposit, M-Rolle für Rental, fromState=active, toState=depositPaid, effect: depositAmount (MoneyAmount) | SM_Rental: Übergang `active -> depositPaid`, Trigger payDeposit; Activity Set_Rental_payDeposit mit typisiertem Effect | Correct |
| M7-5 | BET: returnCar, M-Rolle für Rental, fromState=depositPaid, toState=returned | SM_Rental: Übergang `depositPaid -> returned`, Trigger returnCar; Activity Set_Rental_returnCar | Correct |
| M7-6 | BET: payInvoice, M-Rolle für Rental, fromState=returned, toState=invoicePaid, effect: invoiceAmount (MoneyAmount) | SM_Rental: Übergang `returned -> invoicePaid`, Trigger payInvoice; Activity Set_Rental_payInvoice mit typisiertem Effect | Correct |
| M8-4 | BET: completeRental, E-Rolle für Rental, fromState=invoicePaid | SM_Rental: Übergang `invoicePaid -> __final`, Trigger completeRental; Activity End_Rental | Correct |
| M5-5 | BET: addRentalLine, C-Rolle für RentalLine | SM_RentalLine: Übergang `__initial -> active`, Trigger addRentalLine; Activity Create_RentalLine | Correct |
| M7-7 | BET: updateRentalLine, M-Rolle für RentalLine, effects: quantity (Integer), description (String) | SM_RentalLine: Self-Transition `active -> active`, Trigger updateRentalLine; Activity Set_RentalLine_updateRentalLine mit 2 Effects | Correct |
| M8-5 | BET: removeRentalLine, E-Rolle für RentalLine | SM_RentalLine: Übergang `active -> __final`, Trigger removeRentalLine; Activity End_RentalLine | Correct |
| M5-6 | BET: issueInvoice, C-Rolle für Invoice | SM_Invoice: Übergang `__initial -> issued`, Trigger issueInvoice; Activity Create_Invoice | Correct |
| M7-8 | BET: markInvoicePaid, M-Rolle für Invoice, fromState=issued, toState=paid, effect: paidOn (String) | SM_Invoice: Übergang `issued -> paid`, Trigger markInvoicePaid; Activity Set_Invoice_markInvoicePaid mit typisiertem Effect | Correct |
| M8-6 | BET: closeInvoice, E-Rolle für Invoice, fromState=paid | SM_Invoice: Übergang `paid -> __final`, Trigger closeInvoice; Activity End_Invoice | Correct |
| LC-1 | Lebenszyklus: Car hat Zustand "registered" | SM_Car: State {name:"registered", kind:"simple"} | Correct |
| LC-2 | Lebenszyklus: Branch hat Zustand "open" | SM_Branch: State {name:"open", kind:"simple"} | Correct |
| LC-3 | Lebenszyklus: Person hat Zustand "registered" | SM_Person: State {name:"registered", kind:"simple"} | Correct |
| LC-4 | Lebenszyklus: Rental hat Zustand "active" | SM_Rental: State {name:"active", kind:"simple"} | Correct |
| LC-5 | Lebenszyklus: Rental hat Zustand "depositPaid" | SM_Rental: State {name:"depositPaid", kind:"simple"} | Correct |
| LC-6 | Lebenszyklus: Rental hat Zustand "returned" | SM_Rental: State {name:"returned", kind:"simple"} | Correct |
| LC-7 | Lebenszyklus: Rental hat Zustand "invoicePaid" | SM_Rental: State {name:"invoicePaid", kind:"simple"} | Correct |
| LC-8 | Lebenszyklus: RentalLine hat Zustand "active" | SM_RentalLine: State {name:"active", kind:"simple"} | Correct |
| LC-9 | Lebenszyklus: Invoice hat Zustand "issued" | SM_Invoice: State {name:"issued", kind:"simple"} | Correct |
| LC-10 | Lebenszyklus: Invoice hat Zustand "paid" | SM_Invoice: State {name:"paid", kind:"simple"} | Correct |

Rental durchläuft damit erstmals einen echten mehrstufigen, sequenziellen Lebenszyklus (4 Zwischenzustände statt nur "active") - das ist die zentrale MERODE-Eigenschaft, die in der ursprünglichen Fixture nicht abgebildet war.

### Transitive Ereignispropagierung (M9 - volle EDG-Hülle)

Existenzabhängigkeitsgraph (EDG), Kanten dependent -> master: Rental->Car, Rental->Person, Rental->Branch, RentalLine->Rental, Invoice->RentalLine. Die transitive Hülle ergibt eine 3-Hop-Kette: Invoice (Tiefe 3) -> RentalLine (Tiefe 2) -> Rental (Tiefe 1) -> {Car, Person, Branch}. `allTransitiveDependents()` sammelt für jeden Master alle (auch mittelbaren) Dependents; jedes Ereignis jedes Dependents wird als Self-Transition auf **jedem** Lebenszyklus-Zustand des Masters materialisiert (inkl. eigener `Set_<Master>_<evt>`-Activity).

Da Car/Branch/Person je nur einen Zustand haben, entsteht dort pro propagiertem Ereignis genau eine Self-Transition. Rental hat jedoch 4 Zustände - jedes auf Rental propagierte Ereignis (von RentalLine bzw. Invoice) erzeugt dort 4 Self-Transitionen, eine je Zustand. Das ist neu gegenüber der vorherigen Fixture-Version (dort hatte Rental nur einen Zustand) und die erste reale Prüfung dieses Mehrzustands-Pfads von M9.

Die folgende Tabelle fasst pro (Ereignisquelle, Ziel-Master)-Paar zusammen, wie viele Einzelereignisse propagieren; jedes Ereignis in einer Zeile ist eine eigene atomare Quellaussage:

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| M9-1 | Alle 6 Rental-Ereignisse (startRental, extendRental, payDeposit, returnCar, payInvoice, completeRental) propagieren auf Car (1-hop) | SM_Car: 6 Self-Transitionen `registered -> registered`, je mit passendem Trigger + `Set_Car_<evt>`-Activity | Correct |
| M9-2 | dieselben 6 Rental-Ereignisse propagieren auf Branch (1-hop) | SM_Branch: 6 Self-Transitionen `open -> open` + `Set_Branch_<evt>`-Activities | Correct |
| M9-3 | dieselben 6 Rental-Ereignisse propagieren auf Person (1-hop) | SM_Person: 6 Self-Transitionen `registered -> registered` + `Set_Person_<evt>`-Activities | Correct |
| M9-4 | Alle 3 RentalLine-Ereignisse (addRentalLine, updateRentalLine, removeRentalLine) propagieren auf Car (2-hop, über Rental) | SM_Car: 3 weitere Self-Transitionen `registered -> registered` | Correct |
| M9-5 | dieselben 3 RentalLine-Ereignisse propagieren auf Branch (2-hop) | SM_Branch: 3 weitere Self-Transitionen `open -> open` | Correct |
| M9-6 | dieselben 3 RentalLine-Ereignisse propagieren auf Person (2-hop) | SM_Person: 3 weitere Self-Transitionen `registered -> registered` | Correct |
| M9-7 | dieselben 3 RentalLine-Ereignisse propagieren auf Rental (1-hop, direkt) | SM_Rental: 3 Ereignisse x 4 Zustände = 12 Self-Transitionen (je `active->active`, `depositPaid->depositPaid`, `returned->returned`, `invoicePaid->invoicePaid`) | Correct |
| M9-8 | Alle 3 Invoice-Ereignisse (issueInvoice, markInvoicePaid, closeInvoice) propagieren auf Car (3-hop, über RentalLine+Rental) | SM_Car: 3 weitere Self-Transitionen `registered -> registered` | Correct |
| M9-9 | dieselben 3 Invoice-Ereignisse propagieren auf Branch (3-hop) | SM_Branch: 3 weitere Self-Transitionen `open -> open` | Correct |
| M9-10 | dieselben 3 Invoice-Ereignisse propagieren auf Person (3-hop) | SM_Person: 3 weitere Self-Transitionen `registered -> registered` | Correct |
| M9-11 | dieselben 3 Invoice-Ereignisse propagieren auf Rental (2-hop, über RentalLine) | SM_Rental: 3 Ereignisse x 4 Zustände = 12 weitere Self-Transitionen | Correct |
| M9-12 | dieselben 3 Invoice-Ereignisse propagieren auf RentalLine (1-hop, direkt) | SM_RentalLine: 3 Self-Transitionen `active -> active` | Correct |

Diese 12 Zeilen fassen 45 einzelne (Ereignis x Master)-Propagierungsobligationen zusammen (6+6+6+3+3+3+3+3+3+3+3+3 = 45 atomare Aussagen), die zusammen 63 Self-Transitionen im Output erzeugen (12 auf Car + 12 auf Branch + 12 auf Person + 24 auf Rental + 3 auf RentalLine). Für die Zusammenfassungsmetrik unten zählen alle 45 atomaren Aussagen einzeln als Correct - alle wurden im echten, schemagültigen Transform-Output verifiziert.

### Hilfsstrukturen (Added_justified)

| Hinzugefügtes Element | Begründung |
|----------------------|-----------|
| Pseudozustand `__initial` in jeder SM | Vom pimUML-StateMachine-Format geforderter initialer Pseudozustand |
| Zustand `__final` in jeder SM | Vom pimUML-StateMachine-Format geforderter finaler Zustand |
| Region "lifecycle" in jeder SM | Notwendiger Wrapper für Zustände und Übergänge (kein forEvent, da MERODE-SM) |
| Activity Create_<OT> für C-Events | Semantisches Äquivalent des C-Ereignisses auf Aktivitätsebene; notwendig für Mendix-Microflow-Generierung |
| Activity Set_<OT>_<evt> für M-Events und M9-propagierte Events | Semantisches Äquivalent des jeweiligen Ereignisses; notwendig für B15-Microflow-Generierung |
| Activity End_<OT> für E-Events | Semantisches Äquivalent des E-Ereignisses; notwendig für B16-Microflow-Generierung |

Diese zählen als Added_justified und werden nicht als Validitätsfehler gewertet.

### MERODE Zusammenfassung

Gesamt-Quellaussagen: 2 (M3) + 6 (M1) + 16 (M2) + 5 (M4) + 20 (M5-M8) + 10 (LC) + 45 (M9) = **104**

| Metrik | Wert |
|--------|------|
| Correct (C) | 104 |
| Missing (M) | 0 |
| Incorrect (I) | 0 |
| **Completeness** = C/(C+M+I) | **100 %** |
| Added_unjustified | 0 |
| **Validity** = C/(C+I+Added_unjustified) | **100 %** |

---

## 3. Ground Truth: Rent-A-Car DEMO

Quellmodell: `mda-agents/tests/rent-a-car-demo.json`
Agent: `demo-to-pim-agent.ts`, Regeln A1-A12.

### Werttypen (A1, A2, A8)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A1-1 | ValueType: CarGroup (categorical, literals: economy/compact/luxury) | Enumeration "CarGroup" mit 3 Literalen | Correct |
| A2-1 | ValueType: MoneyAmount (non-categorical, kein triggerEvent) | DataType "MoneyAmount" | Correct |
| A8-1 | ValueType: BookingDetail (non-categorical, triggerEvent=rentalStarted, relates: Rental, Car) | AssociationClass "BookingDetail", memberEnds: rental(Rental,0..*)/car(Car,0..*), triggerEvent: rentalStarted | Correct |
| A8-2 | Attribut: BookingDetail.pricePerDay (Integer) | Property "pricePerDay" (Integer) auf BookingDetail | Correct |
| A8-3 | Attribut: BookingDetail.notes (String) | Property "notes" (String) auf BookingDetail | Correct |

### Entitätstypen (A3, A4)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A3-1 | EntityType: Vehicle (kein parent) | Class "Vehicle" + Property "VehicleID" (Integer, isID); via A10 später isAbstract:true | Correct |
| A3-2 | EntityType: Car (parent=Vehicle, kein isDerived, kein triggerEvent) | Class "Car" + Property "CarID" (Integer, isID); ID via A3 | Correct |
| A3-3 | EntityType: SpecialCar (parent=Car, triggerEvent=carRegistered, kein isDerived) | Class "SpecialCar" + Property "SpecialCarID" (Integer, isID); ID via A3 da !isDerived | Correct |
| A3-4 | EntityType: Branch (kein parent) | Class "Branch" + Property "BranchID" (Integer, isID) | Correct |
| A3-5 | EntityType: Person (kein parent) | Class "Person" + Property "PersonID" (Integer, isID) | Correct |
| A3-6 | EntityType: PremiumCustomer (isDerived, parent=Person) | Class "PremiumCustomer" (isDerived: true); ID erst via A9 zugewiesen | Correct |
| A3-7 | EntityType: Rental (kein parent) | Class "Rental" + Property "RentalID" (Integer, isID) | Correct |
| A3-8 | EntityType: ActiveRental (parent=Rental, triggerEvent=rentalStarted, kein isDerived) | Class "ActiveRental" + Property "ActiveRentalID" (Integer, isID); ID via A3 | Correct |
| A3-9 | EntityType: DepositPaidRental (parent=Rental, triggerEvent=depositPaid, kein isDerived) | Class "DepositPaidRental" + Property "DepositPaidRentalID" (Integer, isID); ID via A3 | Correct |
| A3-10 | EntityType: ReturnedRental (parent=Rental, triggerEvent=carReturned, kein isDerived) | Class "ReturnedRental" + Property "ReturnedRentalID" (Integer, isID); ID via A3 | Correct |
| A3-11 | EntityType: InvoicePaidRental (parent=Rental, triggerEvent=invoicePaid, kein isDerived) | Class "InvoicePaidRental" + Property "InvoicePaidRentalID" (Integer, isID); ID via A3 | Correct |
| A3-12 | EntityType: RentalLine (kein parent) | Class "RentalLine" + Property "RentalLineID" (Integer, isID) | Correct |

### Attribute (A5)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A5-1 | Attribut: Vehicle.licensePlate (String) | Property "licensePlate" auf Vehicle | Correct |
| A5-2 | Attribut: Car.group (CarGroup) | Property "group" (type: "CarGroup") auf Car | Correct |
| A5-3 | Attribut: Car.mileage (Integer) | Property "mileage" auf Car | Correct |
| A5-4 | Attribut: Branch.name (String) | Property "name" auf Branch | Correct |
| A5-5 | Attribut: Branch.city (String) | Property "city" auf Branch | Correct |
| A5-6 | Attribut: Person.fullName (String) | Property "fullName" auf Person | Correct |
| A5-7 | Attribut: Person.email (String) | Property "email" auf Person | Correct |
| A5-8 | Attribut: Rental.startingDay (String) | Property "startingDay" auf Rental | Correct |
| A5-9 | Attribut: Rental.endingDay (String) | Property "endingDay" auf Rental | Correct |
| A5-10 | Attribut: Rental.carGroup (CarGroup) | Property "carGroup" (type: "CarGroup") auf Rental | Correct |
| A5-11 | Attribut: Rental.totalDays (Integer, derivationRule: "endingDay - startingDay") | DerivedProperty "totalDays" (isDerived: true, derivationRule gesetzt) auf Rental | Correct |
| A5-12 | Attribut: DepositPaidRental.depositAmount (MoneyAmount) | Property "depositAmount" (type: "MoneyAmount") auf DepositPaidRental | Correct |
| A5-13 | Attribut: InvoicePaidRental.invoiceAmount (MoneyAmount) | Property "invoiceAmount" (type: "MoneyAmount") auf InvoicePaidRental | Correct |
| A5-14 | Attribut: RentalLine.quantity (Integer) | Property "quantity" auf RentalLine | Correct |
| A5-15 | Attribut: RentalLine.description (String) | Property "description" auf RentalLine | Correct |

### Ereignistypen -> Boolesche Attribute (A6)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A6-1 | EventType: carRegistered (für Car) | Property "carRegistered" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-2 | EventType: mileageUpdated (für Car) | Property "mileageUpdated" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-3 | EventType: carDeregistered (für Car) | Property "carDeregistered" (Boolean, defaultValue: "false") auf Car | Correct |
| A6-4 | EventType: branchOpened (für Branch) | Property "branchOpened" (Boolean, defaultValue: "false") auf Branch | Correct |
| A6-5 | EventType: branchClosed (für Branch) | Property "branchClosed" (Boolean, defaultValue: "false") auf Branch | Correct |
| A6-6 | EventType: personRegistered (für Person) | Property "personRegistered" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-7 | EventType: personUpdated (für Person) | Property "personUpdated" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-8 | EventType: personRemoved (für Person) | Property "personRemoved" (Boolean, defaultValue: "false") auf Person | Correct |
| A6-9 | EventType: rentalStarted (für Rental) | Property "rentalStarted" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-10 | EventType: rentalExtended (für Rental) | Property "rentalExtended" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-11 | EventType: depositPaid (für Rental) | Property "depositPaid" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-12 | EventType: carReturned (für Rental) | Property "carReturned" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-13 | EventType: invoicePaid (für Rental) | Property "invoicePaid" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-14 | EventType: rentalCompleted (für Rental) | Property "rentalCompleted" (Boolean, defaultValue: "false") auf Rental | Correct |
| A6-15 | EventType: rentalLineAdded (für RentalLine) | Property "rentalLineAdded" (Boolean, defaultValue: "false") auf RentalLine | Correct |
| A6-16 | EventType: rentalLineUpdated (für RentalLine) | Property "rentalLineUpdated" (Boolean, defaultValue: "false") auf RentalLine | Correct |
| A6-17 | EventType: rentalLineRemoved (für RentalLine) | Property "rentalLineRemoved" (Boolean, defaultValue: "false") auf RentalLine | Correct |

### Faktentypen -> Assoziationen (A11, A12)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A11-1 | FactType: RentalHasLines (Aggregation, Rental 1..1 / RentalLine 0..*) | Association "RentalHasLines" (isAggregation: true), memberEnds: rental(Rental,1..1)/rentalLine(RentalLine,0..*); A11: Property "rentalLineID" (Integer) auf Rental hinzugefügt | Correct |
| A12-1 | FactType: RentalInvolvesCar (Rental 0..* / Car 1..1) | Association "RentalInvolvesCar", memberEnds: rental(Rental,0..*)/car(Car,1..1) | Correct |
| A12-2 | FactType: RentalMadeByPerson (Rental 0..* / Person 1..1) | Association "RentalMadeByPerson", memberEnds: rental(Rental,0..*)/renter(Person,1..1) | Correct |
| A12-3 | FactType: RentalPickedUpAt (Rental 0..* / Branch 1..1) | Association "RentalPickedUpAt", memberEnds: rental(Rental,0..*)/branch(Branch,1..1) | Correct |
| A12-4 | FactType: RentalReturnedAt (Rental 0..* / Branch 1..1) | Association "RentalReturnedAt", memberEnds: rental(Rental,0..*)/branch(Branch,1..1) | Correct |

### Spezialisierungen (A7, A9, A10)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| A7-1 | SpecialCar: parent=Car, triggerEventType=carRegistered | EventTriggeredAssociation "SpecialCarIsACar", triggerEvent: "carRegistered", memberEnds: specialization(SpecialCar,0..*)/parent(Car,1..1); SM_Car-Zustand `carRegistered_true` hat entryActivity "CreateSpecialCar" | Correct |
| A7-2 | ActiveRental: parent=Rental, triggerEventType=rentalStarted | EventTriggeredAssociation "ActiveRentalIsARental", triggerEvent: "rentalStarted", memberEnds: specialization(ActiveRental,0..*)/parent(Rental,1..1); entryActivity "CreateActiveRental" | Correct |
| A7-3 | DepositPaidRental: parent=Rental, triggerEventType=depositPaid | EventTriggeredAssociation "DepositPaidRentalIsARental", triggerEvent: "depositPaid", memberEnds: specialization(DepositPaidRental,0..*)/parent(Rental,1..1); entryActivity "CreateDepositPaidRental" | Correct |
| A7-4 | ReturnedRental: parent=Rental, triggerEventType=carReturned | EventTriggeredAssociation "ReturnedRentalIsARental", triggerEvent: "carReturned", memberEnds: specialization(ReturnedRental,0..*)/parent(Rental,1..1); entryActivity "CreateReturnedRental" | Correct |
| A7-5 | InvoicePaidRental: parent=Rental, triggerEventType=invoicePaid | EventTriggeredAssociation "InvoicePaidRentalIsARental", triggerEvent: "invoicePaid", memberEnds: specialization(InvoicePaidRental,0..*)/parent(Rental,1..1); entryActivity "CreateInvoicePaidRental" | Correct |
| A9-1 | PremiumCustomer: isDerived=true, parent=Person, derivationExpression="Person.rentals->size() > 10" | DerivedAssociation "PremiumCustomerIsAPerson" (isDerived: true, derivationExpression gesetzt), memberEnds: derived(PremiumCustomer,0..*)/parent(Person,1..1); Property "PremiumCustomerID" (Integer, isID) auf PremiumCustomer | Correct |
| A10-1 | Car: parent=Vehicle, kein isDerived, kein triggerEventType | generalizations-Eintrag { child: "Car", parent: "Vehicle" }; Class "Vehicle" bekommt isAbstract: true | Correct |

A10 war in der vorherigen Fixture-Version nicht aktiviert (kein qualifizierender EntityType); mit der neu eingeführten Vehicle/Car-Generalisierung feuert die Regel jetzt real und ist im verifizierten Output bestätigt.

### Zustandsmaschinen (A3/A4 - orthogonale Regionen)

| # | Atomare Quellaussage | Erwartete PIM-Ausgabe | Klassifikation |
|---|---------------------|-----------------------|----------------|
| SM-1 | Car hat 3 Ereignisse -> 3 orthogonale Regionen | SM_Car: Regionen carRegistered/mileageUpdated/carDeregistered; je 3 Zustände ({ev}_initial, {ev}_false, {ev}_true) + 2 Übergänge; carRegistered_true hat entryActivity "CreateSpecialCar" (A7) | Correct |
| SM-2 | Branch hat 2 Ereignisse -> 2 orthogonale Regionen | SM_Branch: Regionen branchOpened/branchClosed | Correct |
| SM-3 | Person hat 3 Ereignisse -> 3 orthogonale Regionen | SM_Person: Regionen personRegistered/personUpdated/personRemoved; personRegistered läuft ohne A7-Sonderfall | Correct |
| SM-4 | Rental hat 6 Ereignisse -> 6 orthogonale Regionen | SM_Rental: Regionen rentalStarted/rentalExtended/depositPaid/carReturned/invoicePaid/rentalCompleted; rentalStarted_true/depositPaid_true/carReturned_true/invoicePaid_true haben je eine eigene entryActivity (A7) | Correct |
| SM-5 | RentalLine hat 3 Ereignisse -> 3 orthogonale Regionen | SM_RentalLine: Regionen rentalLineAdded/rentalLineUpdated/rentalLineRemoved | Correct |

### Hilfsstrukturen (Added_justified)

| Hinzugefügtes Element | Begründung |
|----------------------|-----------|
| `{ev}_initial`-Pseudozustand in jeder Region | Vom pimUML-StateMachine-Format gefordert (forEvent gesetzt = DEMO-SM) |
| Activity `Set{ET}_{ev}` für jedes Ereignis | Semantisches Äquivalent im Aktivitätsmodell; notwendig für Mendix-B-Regeln |
| Activity `Create{Child}` für getriggerte Spezialisierungen | Strukturhelfer für A7-Semantik (CreateSpecialCar, CreateActiveRental, CreateDepositPaidRental, CreateReturnedRental, CreateInvoicePaidRental) |
| Activity `Create{Derived}` für abgeleitete Spezialisierungen | Strukturhelfer für A9-Semantik (CreatePremiumCustomer) |
| SM mit 0 Regionen für Vehicle/SpecialCar/PremiumCustomer/ActiveRental/DepositPaidRental/ReturnedRental/InvoicePaidRental | Immer generiert pro EntityType; leer weil keine Events referenzieren diese |
| Property "rentalLineID" auf Rental (A11) | Strukturell notwendiger Identifier-Link der Aggregations-Komposition |

### DEMO Zusammenfassung

Gesamt-Quellaussagen: 5 (A1/A2/A8) + 12 (A3 EntityTypes) + 15 (A5 Attribute) + 17 (A6 Events) + 5 (A11/A12 FactTypes) + 7 (A7/A9/A10 Spezialisierungen) + 5 (A3/A4 SMs) = **66**

| Metrik | Wert |
|--------|------|
| Correct (C) | 66 |
| Missing (M) | 0 |
| Incorrect (I) | 0 |
| **Completeness** = C/(C+M+I) | **100 %** |
| Added_unjustified | 0 |
| **Validity** = C/(C+I+Added_unjustified) | **100 %** |

Alle 12 A-Regeln (A1-A12) sind mit dieser Fixture-Version mindestens einmal real aktiviert - inklusive A10, das in der vorherigen Version nicht feuerte.

---

## 4. Ground Truth: Rent-A-Car Case (fallnahes Modellpaar nach Bzowski)

Quellmodelle: `mda-agents/tests/rent-a-car-case-demo.json` und `mda-agents/tests/rent-a-car-case-merode.json`
PIM-Rohdaten: `EVAL/demo-case-pim-output.json` und `EVAL/merode-case-pim-output.json`

### 4.1 Zweck und Abgrenzung zu den Fixtures aus Abschnitt 2 und 3

Die Fixtures aus Abschnitt 2 und 3 sind Regelabdeckungsmodelle. Sie wurden gezielt so gebaut, dass jede A-Regel und jede M-Regel mindestens einmal feuert (`mda-agents/tests/README.md`). Das ist für den Nachweis der Regelvollständigkeit richtig, taugt aber nicht als Argument für externe Validität, weil der Fallzuschnitt vom Artefakt her gedacht ist.

Dieses zweite Modellpaar schliesst genau diese Lücke. Es bildet nicht die Regelmenge ab, sondern ein veröffentlichtes, von Dritten erstelltes Fallmodell: das DEMO-Faktmodell für Rent-A-Car aus Bzowskis Diplomarbeit [bzowski2025], Abbildungen 6.2 bis 6.4 und Anhang G, Tabellen G.1 bis G.5. Bzowski leitet den Fall seinerseits aus Dietz und Mulder [dietz2020], Kapitel 15, ab. Die Regelabdeckung ist hier kein Ziel und wird auch nicht erreicht. Die beiden Modellpaare sind damit zwei eingebettete Untersuchungseinheiten mit unterschiedlicher Beweislast, nicht zwei Varianten derselben Sache.

### 4.2 Abweichungen vom Referenzmodell

Drei Konstrukte aus Bzowskis Faktmodell sind im DEMO-Eingabeschema dieses Prototyps nicht ausdrückbar. Sie werden inhaltstreu, aber formverändert abgebildet. Die Abweichungen sind vollständig aufgeführt, damit die Fallnähe überprüfbar bleibt.

| Bzowski | Fixture | Grund |
|---------|---------|-------|
| Aggregate entity type `{CAR GROUP} * {YEAR}` mit den Attributen daily rental rate und standard deposit amount | Entitätstyp `YearlyCarGroup` mit den Attributen `carGroup`, `year`, `dailyRentalRate`, `standardDepositAmount` | `demo-schema.json` kennt keinen aggregierten Entitätstyp. Bzowski lässt für genau diesen Typ die Spalten "Standard UML?" und "Mendix?" in Tabelle G.1 leer, die Grenze ist also in der Referenzarbeit selbst belegt |
| Werttyp `{YEAR}` mit den Attributen max rental duration, rental horizon, location fine rate, late return fine rate | Entitätstyp `Year` mit denselben vier Attributen plus `yearNumber` | Werttypen tragen im Schema nur bei `kind: associationClass` Attribute |
| Kategorienwerttyp `{CAR GROUP}` ohne Literale | `CarGroup` mit den Literalen economy, compact, luxury | Bzowski begründet die leere Aufzählung damit, dass DEMO-Kategorienwerttypen ihre Werte erst bei der Instanziierung erhalten. Ein leerer Enum verletzt `pimuml-schema.json` (`Enumeration.literals`, `minItems: 1`) und bricht die Mendix-Seite |

Eine vierte Abweichung betrifft nur die MERODE-Seite. Bzowskis Property `the car of [rental] is [car]` hat als Domäne ausdrücklich *taken rental*, ist also partiell. Im DEMO-Fixture bleibt das erhalten, weil der Fakttyp `TakenRentalUsesCar` an der Spezialisierung hängt. Im MERODE-Fixture geht die Partialität verloren, weil eine Existenzabhängigkeit per Definition total ist. `RentalDependsOnCar` bindet das Fahrzeug damit schon an den frisch angelegten Mietvorgang. Das ist eine Ausdrucksgrenze von MERODE, keine Ungenauigkeit der Modellierung, und gehört als Befund in die Diskussion.

Nicht im Fixture enthalten sind Bzowskis abgeleitete Faktspezifikationen (duration, base charge, fine charge und die übrigen aus Dietz und Mulder, Abschnitt 15.4). Bzowski führt sie in Anhang G nicht als Attributtypen, sondern nur im Fliesstext. Die Ableitungsregeln des DEMO-Agenten bleiben in diesem Paar deshalb ungeprüft und werden weiterhin allein durch das Regelabdeckungsmodell aus Abschnitt 3 abgedeckt.

### 4.3 DEMO-Seite: atomare Quellaussagen

| Kategorie | Anzahl | Klassifikation |
|-----------|--------|----------------|
| Werttypen (A1, A2): CarGroup kategorisch, MoneyAmount, DayNumber, YearNumber nicht-kategorisch | 4 | alle Correct |
| Entitätstypen (A3, A4): Rental, DepositPaidRental, TakenRental, ReturnedRental, InvoicePaidRental, Transport, ManagedDay, Car, Branch, Person, Employee, DrivingLicense, Year, YearlyCarGroup | 14 | alle Correct |
| Attributtypen (A5) | 21 | alle Correct |
| Faktentypen (A11, A12), darunter viermal Ziel Person und viermal Ziel Branch | 14 | alle Correct |
| Ereignistypen (A6), TK01 bis TK07 | 7 | alle Correct |
| Ereignisgetriggerte Spezialisierungen (A7), Diamanten 02 bis 05 | 4 | alle Correct |

Die Klassifikation wurde nicht per Augenschein vorgenommen, sondern für jede einzelne Aussage gegen `EVAL/demo-case-pim-output.json` geprüft: Existenz und Typ des Zielelements, bei Attributen zusätzlich der Typverweis, bei Faktentypen Rollennamen, Rollenziele und beide Kardinalitäten, bei Spezialisierungen das hinterlegte Triggerereignis.

Erzeugtes PIM: 1 Enumeration, 3 DataTypes, 14 Klassen mit 42 Properties, 18 Assoziationen (14 aus Faktentypen, 4 aus ereignisgetriggerten Spezialisierungen), 0 Generalisierungen, 14 State Machines mit 7 Regionen (alle mit gesetztem `forEvent`), 14 Transitionen und 11 Activities (7 Set, 4 Create).

Bemerkenswert ist der Nullwert bei den Generalisierungen. Bzowskis Modell enthält keine schlichte Spezialisierung, sondern ausschliesslich Spezialisierungen mit Ereignistyp. Regel A10 feuert deshalb kein einziges Mal, A7 dagegen viermal. Im Regelabdeckungsmodell ist es genau umgekehrt gewichtet. Das ist der klarste Beleg dafür, dass die beiden Paare unterschiedliche Aussagen tragen.

Ebenfalls unaktiviert bleiben A8 (AssociationClass, Bzowski hat keine), A9 (abgeleitete Spezialisierung) und die Ableitungsregeln aus A5.

### 4.4 MERODE-Seite: atomare Quellaussagen

| Kategorie | Anzahl | Klassifikation |
|-----------|--------|----------------|
| Domänentypen (M3) | 4 | alle Correct |
| Objekttypen (M1) | 10 | alle Correct |
| Attribute (M2) | 20 | alle Correct |
| Existenzabhängigkeiten (M4) | 8 | alle Correct |
| Geschäftsereignistypen (M5 bis M8): 10 C-Rollen, 10 M-Rollen, 10 E-Rollen | 30 | alle Correct |
| Lebenszykluszustände (LC), darunter fünf für Rental und zwei für DrivingLicense | 15 | alle Correct |
| Propagierungsobligationen (M9) | 30 | alle Correct |

Die M9-Zahl ergibt sich aus der transitiven Hülle des Existenzabhängigkeitsgraphen: Person empfängt 9 Ereignisse (6 von Rental, 3 von DrivingLicense), Branch 8 (6 von Rental, 2 von Transport), Car 8 (6 von Rental, 2 von Transport), Year 3 (von YearlyCarGroup) und Employee 2 (von ManagedDay). Jeder dieser Master hat genau einen Lebenszykluszustand, weshalb pro Ereignis genau eine Self-Transition entsteht.

Anders als im Regelabdeckungsmodell aus Abschnitt 2 gibt es hier keine mehrstufige Propagierungskette und keine Vervielfachung über mehrere Zustände: Rental trägt zwar fünf Zustände, ist aber in Bzowskis Fall von nichts abhängig. Der 3-Hop-Pfad von M9 bleibt allein durch die Fixture aus Abschnitt 2 abgedeckt.

Erzeugtes PIM: 1 Enumeration, 3 DataTypes, 10 Klassen mit 30 Properties, 8 Assoziationen, 10 State Machines mit je einer Region ohne `forEvent`, 60 Transitionen (10 C, 10 M, 10 E, 30 propagiert) und 60 Activities (10 Create, 40 Set, 10 End).

### 4.5 Hilfsstrukturen (Added_justified)

DEMO: 14 Identifier-Properties, 7 boolesche Zustandsattribute (A6), 7 Regionen mit je einem `{ev}_initial`-Pseudozustand sowie den Zuständen `{ev}_false` und `{ev}_true`, 7 Set-Activities und 4 Create-Activities für die A7-Spezialisierungen.

MERODE: 10 Identifier-Properties sowie je Zustandsmaschine ein `__initial`- und ein `__final`-Pseudozustand, dazu die Create-, Set- und End-Activities.

Alle diese Elemente sind strukturell notwendig und für die Mendix-Generierung erforderlich. Added_unjustified ist in beiden Modellen leer.

### 4.6 Zusammenfassung des fallnahen Modellpaars

| Metrik | DEMO | MERODE |
|--------|------|--------|
| Atomare Quellaussagen | 64 | 117 |
| Correct (C) | 64 | 117 |
| Missing (M) | 0 | 0 |
| Incorrect (I) | 0 | 0 |
| **Completeness** = C/(C+M+I) | **100 %** | **100 %** |
| Added_unjustified | 0 | 0 |
| **Validity** = C/(C+I+Added_unjustified) | **100 %** | **100 %** |
| Trace-Einträge | 103 | 112 |
| davon NotMapped | 4 | 0 |
| **Traceability Coverage** | **96,1 %** | **100 %** |

Die vier NotMapped-Einträge auf der DEMO-Seite sind die A7-Trigger-Ereignisse `rentalDepositPaid`, `rentalTaken`, `rentalReturned` und `rentalInvoicePaid`, jeweils mit `targetName: "StateMachineBehavior"`. Es ist derselbe gerechtfertigte Fall wie in Abschnitt 6, nur mit vier statt fünf Vorkommen.

### 4.7 Durchführung

Der Lauf erfolgte am 2026-09-17 über die unveränderten Produktionsagenten `api-server.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts` und `pim-to-sql-agent.ts` gegen einen lokalen Mosquitto-Broker, weil der Raspberry Pi zu diesem Zeitpunkt nicht im Heimnetz erreichbar war. Es wurde keine Zeile Agentencode und keine Schema-Datei verändert. Die PIM-Nutzlasten stammen aus den retained MQTT-Nachrichten auf `model.pim.created`, gelesen per `mosquitto_sub`, und liegen unverändert in `EVAL/demo-case-pim-output.json` und `EVAL/merode-case-pim-output.json`.

Der SQL-Agent erzeugte dabei 17 `CREATE TABLE` und 1 `CREATE TYPE` für das DEMO-Modell sowie 13 `CREATE TABLE` und 11 `CREATE TYPE` für das MERODE-Modell.

**Nachgereicht am 2026-09-17:** alle drei zu diesem Zeitpunkt offenen Punkte - End-to-End-Lauf über die Live-Pipeline auf dem Pi, Ausführungsnachweis der DDL gegen PostgreSQL 16 und Mendix-Studio-Pro-Check - sind erbracht. Abschnitt 8 hält die Ergebnisse fest.

---

## 5. Mendix-seitige Evaluation (Schema Validation Rate)

Nach dem Ausführen der Pipeline das generierte Mendix-Modell in Mendix Studio Pro öffnen und prüfen: keine Fehler (CE-Präfix) und idealerweise keine Warnungen (CW-Präfix) oder diese dokumentieren.

Nach dem Beheben von CE7247, CE0117 und CW0263 sollte das Modell ohne Fehler öffnen. Diesen Check nach jeder Code-Änderung wiederholen. Screenshot des Mendix-Fehlerbereichs mit Anzahl und Typ möglicher Probleme erstellen, das ist der empirische Nachweis für den 100%-SVR-Anspruch.

Zusätzlich nach den Korrekturen vom 2026-09-14 prüfen:
- Rental hat sechs Workflows `WF_Rental_<forEvent>` und `ACR_Rental` ist unter Entity > Event handlers als After Create eingetragen (Commit + sechs WorkflowCallActions).
- CE0049 trat in einem früheren Implementierungsstand je WorkflowCallAction auf (für Rental sechsmal). Siehe die Klärung am Ende dieses Abschnitts.
- Beim Anlegen eines Rental in der laufenden App starten alle sechs Workflows parallel auf demselben Objekt ohne Fehler.
- `Set_Rental_extendRental` und die propagierten `Set_Rental_*`-Microflows (ChangeObject ohne Status-MemberChange) erzeugen keinen Fehler.

**Durchführung am 2026-09-17 (alle vier Untersuchungseinheiten):** Nach jedem der vier Live-Läufe wurde die erzeugte App in Mendix Studio Pro geöffnet und der Fehlerbereich geprüft. Ergebnis für `rent-a-car-demo`, `rent-a-car-merode`, `rent-a-car-case-demo` und `rent-a-car-case-merode` jeweils **0 Errors und 0 Warnings**. QR3 ist damit für beide CIM-Sprachen und beide Modellpaare erfüllt, einschließlich der erweiterten Fixtures (Vehicle/A10, Branch, mehrstufige Rental-Lebenszyklen, Invoice/3-Hop-M9). Die Prüfung musste zwischen den Läufen erfolgen, weil `pim-to-mendix-agent` das Zielmodell vor jedem Lauf leert.

**Geklärt (2026-09-17):** der oben dokumentierte Befund, CE0049 trete je WorkflowCallAction auf, ließ sich bei diesem Lauf nicht reproduzieren, obwohl das Regelabdeckungs-DEMO 17 Workflows und 5 ACR-Microflows erzeugt. Maßgeblich ist die Messung, nicht die ältere Notiz: alle vier Apps öffnen mit 0 Errors und 0 Warnings. Die Zeile `[warn] CE0049: click OK once in Studio Pro`, die `pim-to-mendix-agent.ts` beim Erzeugen jedes Set-Microflows ausgibt, ist eine fest verdrahtete Vorhersage des Agenten und keine Rückmeldung aus Studio Pro. Sie beschreibt einen Implementierungsstand vor dem Umweg über `MicroflowParameterObject`. CE0049 wird daher nicht mehr als offene Einschränkung geführt, sondern in `LIMITATIONS.md` als nicht mehr beobachtet dokumentiert.

---

## 6. Traceability Coverage

Das `_trace`-Array in jeder veröffentlichten PIM-Nachricht enthält Trace-Einträge als `{ sourceType, sourceName, targetType, targetName }`. Zur Berechnung der Traceability Coverage: das `_trace`-Array aus der MERODE-PIM-Nachricht extrahieren (aus der MQTT-Retained-Message oder den Konsolenausgaben), Einträge mit `targetType != "NotMapped"` zählen (nachverfolgte Elemente), Einträge mit `targetType == "NotMapped"` zählen (explizit nicht nachverfolgbar, akzeptabel für A7-Verweise), und Coverage = verfolgt / (verfolgt + nicht verfolgt) berechnen.

M9 ist implementiert (transitive Propagierung). Alle propagierten Ereignisse erhalten einen Trace-Eintrag (`targetType: "Transition"`, `targetName: "<OT>.<evt> (M9 propagated)"`). Es gibt keine NotMapped-Einträge mehr für propagierte Ereignisse. NotMapped-Einträge entstehen nur noch bei explizit übersprungenen Elementen (z.B. A7-SM-Behavior im DEMO-Agenten).

Referenzwerte aus dem verifizierten Testlauf (Abschnitt 1): DEMO-Trace enthält 108 Einträge, MERODE-Trace enthält 100 Einträge (davon 45 für M9-propagierte Self-Transitionen). Die formale Coverage-Berechnung wurde am 2026-09-07 gegen die per `mosquitto_sub` aus der retained MQTT-Nachricht extrahierten `_trace`-Arrays durchgeführt (`EVAL/demo-pim-output.json`, `EVAL/merode-pim-output.json`):

- **DEMO:** 108 Trace-Einträge gesamt, davon 5 `NotMapped` (alle vom Typ `StateMachineBehavior`, für die A7-Trigger-Ereignisse `carRegistered`, `rentalStarted`, `depositPaid`, `carReturned`, `invoicePaid` - semantisch gerechtfertigt, s. o.). Coverage = (108 - 5) / 108 = **95,4 %**.
- **MERODE:** 100 Trace-Einträge gesamt, 0 `NotMapped`. Coverage = 100 / 100 = **100 %**.

---

## 7. Gliederungsplan für das Thesis-Kapitel

Das Evaluationskapitel sollte folgende Struktur haben: Versuchsaufbau (Fallstudie, Quellmodelle, Pipeline-Konfiguration), Ground-Truth-Extraktion (atomare Aussagen für jede Quellsprache in tabellarischer Form), Transformationsergebnisse für DEMO (Klassifikationstabelle, Vollständigkeit/Validität, Vergleich mit Bzowskis Ergebnissen), Transformationsergebnisse für MERODE (Klassifikationstabelle, explizite Nennung des mehrstufigen Rental-Lebenszyklus und der 3-Hop-M9-Propagierung), Mendix-Modellvalidierung (Screenshot, Fehleranzahl, SVR = 100%), Traceability (Abdeckungsprozentsatz, Liste der NotMapped-Elemente mit Begründungen), Extensibilität (Git-Diff beim Hinzufügen von MERODE, Verweis auf EXTENSIBILITY_EVIDENCE.md) und Diskussion (was die Werte bedeuten, wie die Ergebnisse RQ3 und RQ4 beantworten).

---

## 8. Ergebnisse (verifiziert gegen echten Transform-Output)

Die folgenden Zahlen stammen aus einem tatsächlichen Aufruf von `demo-to-pim-agent.ts::transform()` und `merode-to-pim-agent.ts::transform()` gegen die aktuellen Fixtures, mit Ajv-Validierung des Outputs gegen `pimuml-schema.json` (nicht mehr aus statischer Code-Analyse geschätzt).

**DEMO (66 Quellaussagen):** Alle 66 Aussagen werden korrekt transformiert (C=66, M=0, I=0). Completeness = 100 %, Validity = 100 %. Alle 12 A-Regeln sind mindestens einmal real aktiviert, inklusive A10 (Vehicle/Car-Generalisierung), das in der vorherigen Fixture-Version nicht feuerte. Output ist schemagültig, 108 Trace-Einträge.

**MERODE (104 Quellaussagen):** Alle 104 Aussagen werden korrekt transformiert (C=104, M=0, I=0). Completeness = 100 %, Validity = 100 %. Rental durchläuft erstmals einen echten mehrstufigen sequenziellen Lebenszyklus (4 Zwischenzustände), und M9 propagiert erstmals über eine 3-Hop-Kette (Invoice -> RentalLine -> Rental -> {Car, Person, Branch}), inklusive korrekter Vervielfachung der Self-Transitionen auf Rentals 4 Zuständen. Output ist schemagültig, 100 Trace-Einträge. Bekannte Einschränkung: M7-Effects auf einfache Attribute (z. B. `mileage: Integer` bei `updateCarMileage`) werden im B15-Microflow als Parameter plus MemberChange gesetzt. Effects auf DataType-Attribute (`depositAmount`, `invoiceAmount` vom Typ `MoneyAmount`) erhalten nur einen String-Parameter, aber keine MemberChange, weil das Attribut nach B5 eine Assoziation ist - das ist eine dokumentierte B-Regeleinschränkung (LIMITATIONS.md, B15), keine M-Regeleinschränkung.

**Schema Validation Rate:** Konstruktionsbedingt 100 % - die Pipeline bricht bei jedem Schemaverstoß ab, bevor sie publiziert. Dieser Anspruch wurde im Zuge dieser Verifikation selbst bestätigt: ein zuvor unentdeckter Fixture-Fehler (fehlendes `literals`-Array bei DEMOs `CarGroup`-ValueType) führte dazu, dass der reale Output beim ersten Testlauf tatsächlich am `pimuml-schema.json`-Constraint `Enumeration.literals minItems:1` scheiterte - ein Beleg dafür, dass die Schema-Validierung wirksam greift, nicht nur eine unbewiesene Behauptung. Nach Behebung (Ergänzung der Literale) ist der Output schemagültig.

**Traceability Coverage:** DEMO 95,4 % (103/108, 5 gerechtfertigte NotMapped-Einträge), MERODE 100 % (100/100, keine NotMapped-Einträge). Einzige NotMapped-Einträge entstehen beim A7-Trace-Eintrag `{ targetType: "NotMapped", targetName: "StateMachineBehavior" }`, der die nicht-übersetzte SM-Trigger-Semantik explizit kennzeichnet. Diese sind semantisch gerechtfertigt (s. Abschnitt 6).

**Live-Pipeline-Bestätigung (2026-09-07):** Beide obigen Ergebnisse wurden zusätzlich über einen echten End-to-End-Lauf verifiziert - `curl`-POST an `https://mda.tlolab.com/api/model` (Mac, öffentlicher Cloudflare Tunnel), PIM-Payload per `mosquitto_sub` vom retained Topic `model.pim.created` direkt auf dem Pi gelesen (`EVAL/demo-pim-output.json`, `EVAL/merode-pim-output.json`). Alle Struktur- und Trace-Zahlen sind identisch zum Direktaufruf-Testlauf oben; Completeness und Validity bleiben damit für beide Sprachen bei 100 %.

**Fallnahes Modellpaar (Abschnitt 4, Lauf vom 2026-09-17):** DEMO 64 Quellaussagen, MERODE 117 Quellaussagen, jeweils C = alle, M = 0, I = 0. Completeness und Validity liegen für beide Sprachen bei 100 %. Traceability Coverage: DEMO 96,1 % (99/103, vier gerechtfertigte NotMapped-Einträge für die A7-Trigger-Ereignisse), MERODE 100 % (112/112). Dieses Paar aktiviert bewusst nicht alle Regeln: A8, A9, A10 und die Ableitungsregeln feuern nicht, weil Bzowskis Faktmodell die zugehörigen Konstrukte nicht enthält. Umgekehrt feuert A7 hier viermal statt einmal. Der Vergleich der beiden Paare zeigt damit, dass die gemessenen Werte nicht vom Fallzuschnitt abhängen.

### 8.1 Live-Pipeline-Lauf aller vier Untersuchungseinheiten (2026-09-17)

Alle vier Modelle wurden nacheinander über den öffentlichen Endpunkt `https://mda.tlolab.com/api/model` an die auf dem Raspberry Pi laufende Pipeline geschickt. Die Rohbelege jedes Laufs - Agent-Logs, PIM vom retained Topic und erzeugte DDL - liegen unter `EVAL/Eval_new/`. Es wurde keine Zeile Agentencode und keine Schema-Datei verändert.

**Identität mit den Direktaufruf-Läufen:** die vier über den Bus gelesenen PIM-Nutzlasten sind nach Entfernen der Bus-Metadaten byte-identisch mit den zuvor archivierten Ergebnissen `demo-pim-output.json`, `merode-pim-output.json`, `demo-case-pim-output.json` und `merode-case-pim-output.json`. Die Trace-Längen betragen unverändert 108, 100, 103 und 112 Einträge. Completeness, Validity und Traceability Coverage aus den Abschnitten oben gelten damit unverändert für den Live-Betrieb. Insbesondere entfällt die frühere Asymmetrie, dass das fallnahe Modellpaar nur gegen einen lokalen Broker gelaufen war.

**Erzeugte Mendix-Artefakte je Lauf** (gezählt aus den `+`-Zeilen der `pim-to-mendix-agent`-Logs, alle vier Läufe enden mit `committed to branch`):

| Artefakt | DEMO | MERODE | DEMO Case | MERODE Case |
|----------|------|--------|-----------|-------------|
| Entities (B2) | 12 | 6 | 14 | 10 |
| DataType-Entities (B4) | 1 | 1 | 3 | 3 |
| Enumerations (B3) | 1 | 1 | 1 | 1 |
| Status-Enums (B13) | 0 | 6 | 0 | 10 |
| Attribute (B6) | 42 | 19 | 29 | 18 |
| Assoziationen aus Fakten-/Abhängigkeitsbeziehungen (B9) | 11 | 5 | 18 | 8 |
| DataType-Assoziationen (B5) | 2 | 3 | 13 | 12 |
| Assoziationen gesamt | 13 | 8 | 31 | 20 |
| Association Class (B8) | 1 | 0 | 0 | 0 |
| Generalisierung (B7) | 1 | 0 | 0 | 0 |
| Microflows (B14-B16) | 23 | 65 | 11 | 60 |
| ACR-Microflows (B12) | 5 | 0 | 3 | 0 |
| Workflows (B11) | 17 | 0 | 7 | 0 |
| Pages | 12 | 6 | 14 | 10 |

Die Assoziationszahlen decken sich mit den PIM-seitigen Zahlen der Abschnitte 2 bis 4.
Die beiden Assoziationszeilen sind disjunkt und nicht ineinander enthalten - eine frühere
Fassung dieser Tabelle bezeichnete die erste Zeile als "gesamt" und die zweite als "davon",
was die Gesamtzahl um die DataType-Assoziationen zu niedrig auswies. Die Gesamtzeile stimmt
mit den Fremdschlüsselzahlen der DDL in Abschnitt 8.2 überein (8, 31 und 20 für MERODE,
DEMO Case und MERODE Case, beim Regelabdeckungs-DEMO liegen die Fremdschlüssel wegen
Generalisierung und Association Class höher).

**Vorbehalt zu den Zahlen dieser Tabelle:** sie sind aus dem Log des `pim-to-mendix-agent`
gezählt, der Agent berichtet dort also seine eigene Sicht. Zwei Zählkonventionen des Logs sind
dabei zu beachten: die Zeile "Attribute (B6)" enthält die Status-Attribute aus B13 nicht, und
der Agent protokolliert die beiden Member-End-Assoziationen und die Attribute einer Association
Class nicht einzeln, sondern nur die Association Class selbst. Abschnitt 8.1.1 löst beides
gegen den zurückgelesenen Zielzustand auf. Bemerkenswert bleibt, dass das fallnahe DEMO-Modell **keine** Generalisierung erzeugt, weil dort alle vier abgeleiteten Rental-Typen ein Trigger-Ereignis tragen und damit A7 statt A10 auslösen.

**QR3:** alle vier Apps öffnen in Mendix Studio Pro mit 0 Errors und 0 Warnings (Abschnitt 5).

#### 8.1.1 Unabhängige Gegenprobe durch Rücklesen des Zielmodells (2026-09-17)

Die Zahlen in Abschnitt 8.1 stammen aus dem Log des erzeugenden Agenten. Um sie von dieser
Selbstauskunft unabhängig zu machen, wurde der Zielzustand nach jedem Lauf rein lesend über das
Mendix Platform SDK aus dem Team Server zurückgelesen (`mda-agents/tests/dump-mendix-domain.ts`,
Belege `EVAL/Eval_new/<Modell>.mendix.json`). Der Rücklesevorgang schreibt nicht in die App.

| Artefakt (zurückgelesen) | DEMO | MERODE | DEMO Case | MERODE Case |
|--------------------------|------|--------|-----------|-------------|
| Entities | 14 | 7 | 17 | 13 |
| Attribute | 44 | 25 | 29 | 28 |
| Assoziationen | 15 | 8 | 31 | 20 |
| Generalisierungen | 1 | 0 | 0 | 0 |
| Enumerations | 1 | 7 | 1 | 11 |
| Microflows | 28 | 65 | 14 | 60 |
| Workflows | 17 | 0 | 7 | 0 |
| Pages | 12 | 6 | 14 | 10 |

Alle Abweichungen gegenüber Abschnitt 8.1 sind durch die beiden dort genannten
Zählkonventionen vollständig erklärt und lösen sich rechnerisch auf. Entities sind im
Rücklesen die Summe aus B2, B4 und der Association Class, Enumerations die Summe aus B3 und
B13, Microflows die Summe aus B14-B16 und B12. Die Attributzahl des Regelabdeckungs-MERODE
liegt um sechs, die des fallnahen MERODE um zehn höher, genau um die Zahl der Status-Attribute
aus B13. Beim Regelabdeckungs-DEMO liegen Attribute und Assoziationen um je zwei höher, genau
um die nicht protokollierten Artefakte der Association Class `BookingDetail`. Die
Assoziationszahl 15 ist damit der belegte Wert für dieses Modell, nicht die 13 aus dem Log.

**Inhaltliche Prüfung gegen die Eingabemodelle:** die zurückgelesenen Modelle wurden zusätzlich
nicht gegen das PIM, sondern gegen die DEMO- beziehungsweise MERODE-Eingabemodelle geprüft
(`mda-agents/tests/check-mendix-against-input.ts`), womit die vollständige Kette CIM -> PIM ->
PSM geprüft ist und nicht nur ihr letzter Schritt. Geprüft werden Entities, Attributnamen und
-typen, Vorgabewerte, Enum-Literale samt Reihenfolge, Generalisierungen, Status-Enums, Pages,
die Verhaltensartefakte und die Richtung jeder einzelnen Assoziation - in Mendix hält die
`parent`-Seite einer Reference den Verweis, sie muss also die Viele-Seite des CIM-Modells sein.

| Untersuchungseinheit | bestandene Prüfungen | Abweichungen | begründete Auslassungen |
|----------------------|----------------------|--------------|--------------------------|
| DEMO | 104 | 0 | 1 |
| MERODE | 73 | 0 | 0 |
| DEMO Case | 99 | 0 | 0 |
| MERODE Case | 112 | 0 | 0 |

Keine einzige Assoziation ist verdreht, es gibt kein Eingabeelement ohne Entsprechung in Mendix
und kein erzeugtes Artefakt ohne Ursprung im Eingabemodell. Die einzige begründete Auslassung
ist das abgeleitete Attribut `Rental.totalDays` des Regelabdeckungs-DEMO, für das in Mendix kein
OCL-Äquivalent erzeugt wird. Der Prüfer meldet in allen vier Läufen zusätzlich die Page
`Rental_Detail`, die der Agent weder erzeugt noch entfernt - sie stammt aus einer früheren
manuellen Bearbeitung des Moduls und ist in den Page-Zahlen oben nicht mitgezählt.


### 8.2 Ausführungsnachweis der generierten DDL gegen PostgreSQL 16

Die vier vom `pim-to-sql-agent` erzeugten DDL-Dateien wurden in je einer eigenen, leeren Datenbank eines Wegwerf-Containers (`postgres:16-alpine`) mit `psql -v ON_ERROR_STOP=1` eingespielt. Alle vier laufen fehlerfrei durch. Anschließend wurde gegen den Systemkatalog geprüft, dass die Objekte tatsächlich angelegt wurden - ein stärkerer Nachweis als das bloße Ausbleiben einer Fehlermeldung.

| DDL | Tabellen | Enum-Typen | Fremdschlüssel |
|-----|----------|------------|----------------|
| `rent_a_car_demo_pim_uml.sql` | 14 | 1 | 16 |
| `rent_a_car_merode_pim_uml.sql` | 7 | 7 | 8 |
| `rent_a_car_case_demo_pim_uml.sql` | 17 | 1 | 31 |
| `rent_a_car_case_merode_pim_uml.sql` | 13 | 11 | 20 |

Die Tabellen- und Enum-Zahlen stimmen mit den Statements in den Skripten überein, und jeder `REFERENCES`-Ausdruck ist als Constraint in der Datenbank angekommen. Damit ist auch S12 belegt, die topologische Sortierung der `CREATE TABLE`-Reihenfolge nach Kahns Algorithmus: bei falscher Reihenfolge würde eine Tabelle vor ihrem Ziel angelegt und `psql` abbrechen.

Zur früher hier vermerkten offenen Frage zu CE0049 siehe die Klärung am Ende von Abschnitt 5.
