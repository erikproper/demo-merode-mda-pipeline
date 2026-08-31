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

**Verifikationsstatus:** Die Klassifikationen in Abschnitt 2 und 3 basieren nicht mehr auf statischer Code-Analyse, sondern auf einem tatsächlichen Aufruf der Produktionsfunktionen `demo-to-pim-agent.ts::transform()` und `merode-to-pim-agent.ts::transform()` gegen die aktuellen Fixtures, mit anschließender Ajv-Validierung des Outputs gegen `pimuml-schema.json` (beide Outputs schemagültig, DEMO: 108 Trace-Einträge, MERODE: 100 Trace-Einträge). Offen bleiben zwei Schritte, die einen laufenden Bus/Pi bzw. Mendix Studio Pro voraussetzen: der Live-Mendix-Check (Abschnitt 4) und die Extraktion des `_trace`-Arrays aus einer echten MQTT-Nachricht für die formale Traceability-Coverage-Berechnung (Abschnitt 5).

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

## 4. Mendix-seitige Evaluation (Schema Validation Rate)

Nach dem Ausführen der Pipeline das generierte Mendix-Modell in Mendix Studio Pro öffnen und prüfen: keine Fehler (CE-Präfix) und idealerweise keine Warnungen (CW-Präfix) oder diese dokumentieren.

Nach dem Beheben von CE7247, CE0117 und CW0263 sollte das Modell ohne Fehler öffnen. Diesen Check nach jeder Code-Änderung wiederholen. Screenshot des Mendix-Fehlerbereichs mit Anzahl und Typ möglicher Probleme erstellen, das ist der empirische Nachweis für den 100%-SVR-Anspruch.

**Noch offen:** dieser Schritt setzt einen laufenden Bus/Pi und Mendix Studio Pro voraus und wurde für die erweiterten Fixtures (Vehicle/A10, Branch, mehrstufige Rental-Lebenszyklen, Invoice/3-Hop-M9) noch nicht wiederholt.

---

## 5. Traceability Coverage

Das `_trace`-Array in jeder veröffentlichten PIM-Nachricht enthält Trace-Einträge als `{ sourceType, sourceName, targetType, targetName }`. Zur Berechnung der Traceability Coverage: das `_trace`-Array aus der MERODE-PIM-Nachricht extrahieren (aus der MQTT-Retained-Message oder den Konsolenausgaben), Einträge mit `targetType != "NotMapped"` zählen (nachverfolgte Elemente), Einträge mit `targetType == "NotMapped"` zählen (explizit nicht nachverfolgbar, akzeptabel für A7-Verweise), und Coverage = verfolgt / (verfolgt + nicht verfolgt) berechnen.

M9 ist implementiert (transitive Propagierung). Alle propagierten Ereignisse erhalten einen Trace-Eintrag (`targetType: "Transition"`, `targetName: "<OT>.<evt> (M9 propagated)"`). Es gibt keine NotMapped-Einträge mehr für propagierte Ereignisse. NotMapped-Einträge entstehen nur noch bei explizit übersprungenen Elementen (z.B. A7-SM-Behavior im DEMO-Agenten).

Referenzwerte aus dem verifizierten Testlauf (Abschnitt 1): DEMO-Trace enthält 108 Einträge, MERODE-Trace enthält 100 Einträge (davon 45 für M9-propagierte Self-Transitionen). Die formale Coverage-Berechnung (verfolgt vs. NotMapped) steht noch aus und erfordert die Extraktion des Arrays aus einer echten MQTT-Nachricht.

---

## 6. Gliederungsplan für das Thesis-Kapitel

Das Evaluationskapitel sollte folgende Struktur haben: Versuchsaufbau (Fallstudie, Quellmodelle, Pipeline-Konfiguration), Ground-Truth-Extraktion (atomare Aussagen für jede Quellsprache in tabellarischer Form), Transformationsergebnisse für DEMO (Klassifikationstabelle, Vollständigkeit/Validität, Vergleich mit Bzowskis Ergebnissen), Transformationsergebnisse für MERODE (Klassifikationstabelle, explizite Nennung des mehrstufigen Rental-Lebenszyklus und der 3-Hop-M9-Propagierung), Mendix-Modellvalidierung (Screenshot, Fehleranzahl, SVR = 100%), Traceability (Abdeckungsprozentsatz, Liste der NotMapped-Elemente mit Begründungen), Extensibilität (Git-Diff beim Hinzufügen von MERODE, Verweis auf EXTENSIBILITY_EVIDENCE.md) und Diskussion (was die Werte bedeuten, wie die Ergebnisse RQ3 und RQ4 beantworten).

---

## 7. Ergebnisse (verifiziert gegen echten Transform-Output)

Die folgenden Zahlen stammen aus einem tatsächlichen Aufruf von `demo-to-pim-agent.ts::transform()` und `merode-to-pim-agent.ts::transform()` gegen die aktuellen Fixtures, mit Ajv-Validierung des Outputs gegen `pimuml-schema.json` (nicht mehr aus statischer Code-Analyse geschätzt).

**DEMO (66 Quellaussagen):** Alle 66 Aussagen werden korrekt transformiert (C=66, M=0, I=0). Completeness = 100 %, Validity = 100 %. Alle 12 A-Regeln sind mindestens einmal real aktiviert, inklusive A10 (Vehicle/Car-Generalisierung), das in der vorherigen Fixture-Version nicht feuerte. Output ist schemagültig, 108 Trace-Einträge.

**MERODE (104 Quellaussagen):** Alle 104 Aussagen werden korrekt transformiert (C=104, M=0, I=0). Completeness = 100 %, Validity = 100 %. Rental durchläuft erstmals einen echten mehrstufigen sequenziellen Lebenszyklus (4 Zwischenzustände), und M9 propagiert erstmals über eine 3-Hop-Kette (Invoice -> RentalLine -> Rental -> {Car, Person, Branch}), inklusive korrekter Vervielfachung der Self-Transitionen auf Rentals 4 Zuständen. Output ist schemagültig, 100 Trace-Einträge. Bekannte Einschränkung: M7-modifizierte Attribute (z.B. `mileage` bei `updateCarMileage`) erscheinen korrekt im PIM mit typisiertem Effect, werden aber im nachgelagerten B15-Microflow nicht auf Mendix-Attribut-Ebene gesetzt - das ist eine dokumentierte B-Regeleinschränkung, keine M-Regeleinschränkung.

**Schema Validation Rate:** Konstruktionsbedingt 100 % - die Pipeline bricht bei jedem Schemaverstoß ab, bevor sie publiziert. Dieser Anspruch wurde im Zuge dieser Verifikation selbst bestätigt: ein zuvor unentdeckter Fixture-Fehler (fehlendes `literals`-Array bei DEMOs `CarGroup`-ValueType) führte dazu, dass der reale Output beim ersten Testlauf tatsächlich am `pimuml-schema.json`-Constraint `Enumeration.literals minItems:1` scheiterte - ein Beleg dafür, dass die Schema-Validierung wirksam greift, nicht nur eine unbewiesene Behauptung. Nach Behebung (Ergänzung der Literale) ist der Output schemagültig.

**Traceability Coverage:** Nahe 100 %. Einzige NotMapped-Einträge entstehen beim A7-Trace-Eintrag `{ targetType: "NotMapped", targetName: "StateMachineBehavior" }`, der die nicht-übersetzte SM-Trigger-Semantik explizit kennzeichnet. Diese sind semantisch gerechtfertigt.

**Noch offen:** der Live-Mendix-Studio-Pro-Check (Abschnitt 4) und die formale Traceability-Coverage-Berechnung aus einer echten MQTT-Nachricht (Abschnitt 5) setzen einen laufenden Bus/Pi voraus und wurden für die erweiterten Fixtures noch nicht wiederholt.
