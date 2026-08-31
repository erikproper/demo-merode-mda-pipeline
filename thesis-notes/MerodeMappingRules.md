# MERODE nach pimUML: Formale Abbildungsregeln (M1-M9)

Hergeleitet aus Snoeck (2014) [21] und Bzowski (2025) [4], analog zu Bzowskis Tabelle 10.1 (A1-A12).

---

## 1. Abbildungstabelle

| ID | MERODE-Quellkonzept | pimUML-Ziel | Bezug zu DEMO (Bzowski) |
|----|--------------------|-----------|-----------------------|
| M1 | ObjectType (Geschäftsobjekt mit Identität, Attributen, Lebenszyklus) | Class + logischer Bezeichner (Integer) + StateMachine | analog zu A3 (Struktur gleichwertig, Lebenszyklus unterschiedlich) |
| M2 | Attribut eines ObjectType | Property | äquivalent zu A5 |
| M3 | Attribut über aufgezählter / benutzerdefinierter Domäne | Enumeration / benutzerdefinierter DataType | äquivalent zu A1 / A2 |
| M4 | ExistenceDependency (abhängig zu Hauptobjekt, Multiplizität) | Gerichtete Association (abhängig zu Hauptobjekt), Multiplizitäten, verpflichtende Hauptobjektseite (+ optionaler OCL-Lebenszyklus-Constraint) | analog zu A11 / A12 (reichhaltigere Semantik) |
| M5 | ObjectType-Lebenszyklus (sequenzielle FSM) | StateMachine mit einer einzelnen nicht-orthogonalen Region: initialer Pseudozustand, benannte geordnete Zustände, finaler Zustand | grundlegend verschieden von A3/A6; neu; erfordert Schema-Erweiterung |
| M6 | BusinessEventType, erzeugend (C) | Übergang (initial zum ersten Zustand) + Create-Aktivität, in der FSM des Eigentümers | analog zu A6/A7 (create), sequenzieller Kontext |
| M7 | BusinessEventType, modifizierend (M) | Übergang (Zustand zum nächsten Zustand) + Set-Aktivität | analog zu A6 (set), sequenzieller Kontext |
| M8 | BusinessEventType, beendend (E) | Übergang (Zustand zum finalen Zustand) + Terminate-Aktivität; Objekt tritt in finalen ("toten") Zustand ein | grundlegend verschieden (DEMO ist monoton, hat kein Beenden); neu |
| M9 | Gemeinsame Beteiligung und Ereignispropagierung (Eigentümer + Hauptobjekte) | Ein BusinessEventType erzeugt synchronisierte Übergangstrigger in der FSM jedes beteiligten ObjectType (modifizierend in Hauptobjekten) | grundlegend verschieden (DEMO-Ereignisse gehören zu einer Entität); neu |

---

## 2. Regelweiser Begründungstext

**M1 - ObjectType nach Class + logischer Bezeichner + StateMachine.**
In MERODE ist ein Objekttyp ein Geschäftsobjekt, das durch eine Identität, einen durch Attribute beschriebenen Zustand und Verhalten charakterisiert ist, das durch die Beteiligung an Geschäftsereignissen ausgedrückt wird [21]. Der strukturelle Teil dieses Konzepts entspricht direkt dem deklarierten Entitätstyp von DEMO und wird daher, Bzowskis Regel A3 folgend, in eine pimUML-Class mit einem ganzzahligen logischen Bezeichner übersetzt [4]. Wie in A3 wird eine Zustandsmaschine an die Klasse angehängt, um den Lebenszyklus des Objekts zu tragen; ihre interne Struktur unterscheidet sich jedoch grundlegend (siehe M5). Bezug: analog zu A3.

**M2 - Attribut nach Property.**
Attribute beschreiben den Zustand eines MERODE-Objekttyps und machen das Objekt beobachtbar [21]. Sie bilden 1:1 auf pimUML-Properties ab, identisch zu Bzowskis Regel A5, wobei die Attributdomäne den Eigenschaftstyp bestimmt. Es entsteht keine semantische Divergenz zu DEMO auf dieser Ebene. Bezug: äquivalent zu A5.

**M3 - Attributdomäne nach Enumeration / DataType.**
Wenn ein MERODE-Attribut über eine feste aufgezählte Domäne rangiert, wird es in eine pimUML-Enumeration übersetzt; wenn es über eine benutzerdefinierte skalare Domäne rangiert, in einen benutzerdefinierten DataType. Das spiegelt Bzowskis Behandlung von kategorischen und nicht-kategorischen Werttypen (A1, A2) wider [4]. MERODE stellt die Werttyp-Unterscheidung nicht als eigenständiges Konzept in den Vordergrund, daher wird die Regel auf der Ebene der Attributdomäne angewendet. Bezug: äquivalent zu A1/A2.

**M4 - ExistenceDependency nach Association.**
Eine Existenzabhängigkeit besagt, dass ein abhängiger Objekttyp nur existieren kann, solange sein Hauptobjekt existiert; sie trägt eine Multiplizität und induziert Lebenszyklus-Constraints, nämlich dass ein Abhängiger nach dem Hauptobjekt erzeugt und vor ihm beendet wird [21]. Die strukturelle Projektion ist eine gerichtete Association vom Abhängigen zum Hauptobjekt mit entsprechenden Multiplizitäten und einer verpflichtenden Hauptobjektseite, unter Wiederverwendung des Assoziationsmechanismus von Bzowskis Regeln A11/A12. Im Gegensatz zu DEMO-Aggregation impliziert die Existenzabhängigkeit zusätzlich einen referenziellen Integritäts-Constraint über die beiden Lebenszyklen. Da jede wohldefinierte EDG-Association entweder eine Existenzabhängigkeit ausdrückt oder in einen Objekttyp reifiziert wird [21], sind alle MERODE-Assoziationen durch diese einzige Regel abgedeckt. Bezug: analog zu A11/A12.

**M5 - ObjectType-Lebenszyklus (FSM) nach sequenzieller StateMachine. [Kernbeitrag]**
MERODE ist explizit lebenszyklus-orientiert: jeder Objekttyp besitzt eine FSM, deren Zustände die aufeinanderfolgenden Phasen seines Lebens sind und deren Übergänge durch Geschäftsereignisse ausgelöst werden [21]. Das unterscheidet sich strukturell von den Zustandsmaschinen, die Bzowski für DEMO ableitet: orthogonale Regionen, die jeweils ein `false`/`true`-Paar tragen und keine Reihenfolge erzwingen [4]. Das semantisch treue pimUML-Ziel ist daher eine Zustandsmaschine mit einer einzelnen, nicht-orthogonalen Region, die einen initialen Pseudozustand, benannte und sich gegenseitig ausschließende Lebenszykluszustände und einen finalen Zustand enthält. Da pimUMLs `State.kind` auf `{initial, false, true}` beschränkt ist, erfordert die Darstellung beliebiger benannter Lebenszykluszustände eine minimale additive PIM-Erweiterung; das ist genau der Punkt, an dem MERODEs Paradigma das DEMO-geprägte Vokabular von pimUML übersteigt. Bezug: grundlegend verschieden; neu.

**M6 - Erzeugendes Ereignis (C) nach Übergang + Create-Aktivität.**
Ein erzeugendes Geschäftsereignis (C in der OET) bringt eine Objektinstanz ins Dasein [21]. In der FSM des Eigentümerobjekttyps wird es auf den Übergang abgebildet, der den initialen Pseudozustand verlässt und den ersten Lebenszykluszustand betritt, mit einer Create-Aktivität, die die Klasse instantiiert. Das ist direkt analog zu den Create-Aktivitäten, die Bzowski an Ereignistyp-Regionen (A6, A7) anhängt, aber auf einem einzelnen sequenziellen Übergang platziert statt innerhalb einer orthogonalen Region. Bezug: analog zu A6/A7.

**M7 - Modifizierendes Ereignis (M) nach Übergang + Set-Aktivität.**
Ein modifizierendes Geschäftsereignis (M) ändert den Zustand eines existierenden Objekts, ohne es zu erzeugen oder zu beenden [21]. Es wird auf einen Übergang zwischen zwei benannten Lebenszykluszuständen abgebildet, mit dem Ereignis als Trigger und einer Set-Aktivität als Effekt, analog zu den `Set<Entity><Event>`-Aktivitäten von A6 [4]. Der wesentliche Unterschied zu DEMO: Quell- und Zielzustand sind unterschiedliche, sich gegenseitig ausschließende Lebenszykluszustände statt des `false`/`true`-Paars eines einzelnen Booleschen. Bezug: analog zu A6.

**M8 - Beendendes Ereignis (E) nach Übergang zum finalen Zustand + Terminate-Aktivität.**
Ein beendendes Geschäftsereignis (E) beendet das Leben eines Objekts, indem es in einen finalen Zustand tritt; das Objekt wird "tot" und unterliegt keinen weiteren Änderungen, muss aber nicht physisch gelöscht werden [21]. Es wird auf einen Übergang in den finalen Zustand der Objektzustandsmaschine abgebildet, mit einer Terminate-Aktivität als Effekt. DEMO hat kein Gegenstück: in Bzowskis Abbildung sind Ereignisse monotone Boolesche, die sich nur von `false` nach `true` bewegen, sodass es kein Konzept des Lebenszyklus-Beendens gibt [4]. Diese Regel ist daher genuinen neuen Charakters und motiviert eine zusätzliche Aktivitätsart in pimUML. Bezug: grundlegend verschieden; neu.

**M9 - Gemeinsame Beteiligung und Propagierung nach synchronisierten Triggern über FSMs.**
In MERODE wird ein einziges Geschäftsereignis von allen Objekttypen geteilt, die gemeinsam daran beteiligt sind, und die Beteiligung propagiert von einem abhängigen Objekttyp zu jedem seiner Hauptobjekte, die immer (als modifizierend) an den Ereignissen ihrer Abhängigen beteiligt sind [21]. Folglich bildet ein MERODE-BusinessEventType nicht auf einen einzelnen Trigger ab, sondern auf eine Menge synchronisierter Übergangstrigger, einen in der FSM jedes beteiligten Objekttyps. DEMO bietet kein Analogon, da in Bzowskis Abbildung ein Ereignistyp zu genau einer Entität gehört [4]. Bezug: grundlegend verschieden; neu.

---

## 3. Die FSM-Entscheidung (Option A / B / C)

Option A würde BusinessEventTypes als Boolesche Attribute und orthogonale Regionen abbilden (Wiederverwendung von A6). Maximale Schema-Wiederverwendung, aber semantisch falsch für MERODE. Das würde sich gegenseitig ausschließende Lebenszyklusphasen als unabhängige Boolesche Flags darstellen und sowohl die Reihenfolge als auch die gegenseitige Ausschließlichkeit eines MERODE-Lebenszyklusses verwerfen.

Option B bildet MERODE-FSMs auf sequenzielle pimUML-StateMachines ab. Das ist die einzige Option, unter der die Thesis genuine Heterogenitätsbehandlung beanspruchen kann. Der Preis ist eine minimale additive PIM-Erweiterung und neue PSM-Regeln. Aber dieser Preis ist selbst der interessanteste Befund: eine geteilte-PIM-Extensibilitätsarchitektur absorbiert neue strukturelle Paradigmen ohne Kernänderungen, während ein neues verhaltensbezogenes Paradigma den geteilten Vertrag zur Weiterentwicklung zwingt. Diese Grenze zu benennen beantwortet direkt die Gutachtersorge ("neue CIM-Sprachen könnten Konzepte einführen, die nicht durch bestehende PIM-Schemas abgedeckt sind") und verwandelt eine Einschränkung in einen Beitrag. Empfohlen.

Option C würde BusinessEventTypes als NotMapped dokumentieren. Ehrlich, und es bewahrt das saubere "keine Kernänderungen"-Extensibilitätsergebnis, aber es gibt MERODEs definierende Eigenschaft auf. Akzeptabel nur als explizite, gut argumentierte Scopereduktion.

---

## 4. pimUML-Erweiterungsanforderungen

| Nr. | Konstrukt | Änderung | Typ |
|-----|-----------|---------|-----|
| 1 | `State.kind` | Erweiterung von `{initial, false, true}` um benannte Lebenszykluszustände (z.B. `simple` mit `name`, plus initial/final-Markierungen) | additiv, bestehende DEMO-Nutzung unberührt |
| 2 | `Activity.kind` | Hinzufügen einer `end`/`terminate`-Art oder Modellierung des Beendens über einen UML-finalen Zustand | additiv |
| 3 | `Region` | Keine Änderung; eine einzelne nicht-orthogonale Region ist bereits ausdrückbar | keine Änderung |
| 4 | `merode-schema.json` (Eingabeseite) | Erweiterung um FSM-Daten: Zustände, Übergänge und C/M/E-Klassifikation jedes BusinessEventType | unabhängig von A/B/C verpflichtend |

Die Punkte 1 und 2 sind klein und gehören in die Thesis, weil sie Teil des Beitrags sind. Punkt 4 ist für jede Option obligatorisch. Die umfangreichere Arbeit, neue PSM-Regeln zur Realisierung sequenzieller Lebenszyklen in Mendix, sollte in der Thesis spezifiziert und soweit wie möglich implementiert werden; der Rest ist legitimes Future Work, sofern die Grenze explizit genannt wird.

---

## 5. Rent-A-Car-Validierung

Quellmodell (MERODE): `mda-agents/tests/rent-a-car-merode.json`

ObjectTypes: `Car`, `Branch`, `Person`, `Rental`, `RentalLine`, `Invoice`. DomainTypes: `CarGroup` (kategorisch), `MoneyAmount` (nicht-kategorisch). ExistenceDependencies: Rental->Car, Rental->Person, Rental->Branch, RentalLine->Rental, Invoice->RentalLine (3-Hop-Kette).

**Object-Event Table (vollständig, inkl. M9 transitive):**

| Ereignis | Car | Branch | Person | Rental | RentalLine | Invoice |
|---------|-----|--------|--------|--------|------------|---------|
| registerCar | O/C | | | | | |
| updateCarMileage | O/M | | | | | |
| deregisterCar | O/E | | | | | |
| openBranch | | O/C | | | | |
| closeBranch | | O/E | | | | |
| registerPerson | | | O/C | | | |
| updatePersonDetails | | | O/M | | | |
| deregisterPerson | | | O/E | | | |
| startRental | A/M | A/M | A/M | O/C | | |
| extendRental | A/M | A/M | A/M | O/M | | |
| payDeposit | A/M | A/M | A/M | O/M | | |
| returnCar | A/M | A/M | A/M | O/M | | |
| payInvoice | A/M | A/M | A/M | O/M | | |
| completeRental | A/M | A/M | A/M | O/E | | |
| addRentalLine | A/M | A/M | A/M | A/M | O/C | |
| updateRentalLine | A/M | A/M | A/M | A/M | O/M | |
| removeRentalLine | A/M | A/M | A/M | A/M | O/E | |
| issueInvoice | A/M | A/M | A/M | A/M | A/M | O/C |
| markInvoicePaid | A/M | A/M | A/M | A/M | A/M | O/M |
| closeInvoice | A/M | A/M | A/M | A/M | A/M | O/E |

Die A/M-Einträge resultieren aus der **transitiven Propagierung** über die volle EDG-Hülle: RentalLine->Rental (1-hop), Invoice->RentalLine->Rental (2-hop), Invoice->RentalLine->Rental->{Car,Branch,Person} (3-hop). Die Implementierung berechnet den transitiven Abschluss des EDG (`allTransitiveDependents()`); jedes Ereignis eines transitiven Dependents wird auf jedem Lebenszyklus-Zustand des Masters materialisiert - bei Rental (4 Zwischenzustände) entstehen so pro propagiertem Ereignis 4 Self-Transitionen statt einer.

**Resultierendes pimUML, Klassendiagramm (M1-M4):**

- `Car`: Class, `CarID: Integer (isID)`, `licensePlate: String`, `group: CarGroup`, `mileage: Integer`
- `Branch`: Class, `BranchID: Integer (isID)`, `name: String`, `city: String`
- `Person`: Class, `PersonID: Integer (isID)`, `fullName: String`, `email: String`
- `Rental`: Class, `RentalID: Integer (isID)`, `startingDay: String`, `endingDay: String`, `carGroup: CarGroup`, `depositAmount: MoneyAmount`, `invoiceAmount: MoneyAmount`
- `RentalLine`: Class, `RentalLineID: Integer (isID)`, `quantity: Integer`, `description: String`
- `Invoice`: Class, `InvoiceID: Integer (isID)`, `amount: MoneyAmount`, `paidOn: String`
- Enumeration: `CarGroup` [economy, compact, luxury]
- DataType: `MoneyAmount`
- Associations: `RentalDependsOnCar` (Rental 0..* -> Car 1..1), `RentalDependsOnPerson` (Rental 0..* -> Person 1..1), `RentalDependsOnBranch` (Rental 0..* -> Branch 1..1), `RentalLineDependsOnRental` (RentalLine 0..* -> Rental 1..1), `InvoiceDependsOnRentalLine` (Invoice 0..* -> RentalLine 1..1)

**Resultierendes pimUML, Zustandsmaschinen (M5-M9):**

- `SM_Car` / `SM_Branch` / `SM_Person`: je ein direkter C->M->E-Ablauf (`registerCar`/`openBranch`/`registerPerson` -> ... -> `deregisterCar`/`closeBranch`/`deregisterPerson`), plus 12 propagierte Self-Transitionen (6 Rental-, 3 RentalLine-, 3 Invoice-Ereignisse; M9, 1- bis 3-hop)
- `SM_Rental`: sequenzieller 4-Zustands-Lebenszyklus `__initial -[startRental]-> active -[payDeposit]-> depositPaid -[returnCar]-> returned -[payInvoice]-> invoicePaid -[completeRental]-> __final`, dazu Self-Transition `extendRental` auf `active`; plus 6 propagierte Ereignisse (3 RentalLine-, 3 Invoice-Ereignisse) x 4 Zustände = 24 Self-Transitionen (M9, 1- bzw. 2-hop)
- `SM_RentalLine`: `__initial -[addRentalLine]-> active -[updateRentalLine]-> active (self) -[removeRentalLine]-> __final`; plus 3 propagierte Invoice-Ereignisse als Self-Transitionen (M9, 1-hop)
- `SM_Invoice`: `__initial -[issueInvoice]-> issued -[markInvoicePaid]-> paid -[closeInvoice]-> __final`; keine propagierten Events (Invoice ist das Ende der EDG-Kette)

Validierungsbeobachtung: M1-M4 reproduzieren exakt das strukturelle Muster, das Bzowski für DEMO ableitet (Class + ID + Association), was strukturelle Interoperabilität ohne Schema-Änderung bestätigt. M5-M9 demonstrieren die genuinen neuen MERODE-Konzepte: sequenzielle Mehrzustands-FSMs, Terminierung, und transitive Ereignispropagierung über eine 3-Hop-EDG-Kette - inklusive der Vervielfachung propagierter Self-Transitionen auf einem Master mit mehreren Lebenszyklus-Zuständen (Rental). Real gegen `merode-to-pim-agent.ts::transform()` verifiziert (schemagültiger Output, siehe `EVAL/FRAMEWORK.md` Abschnitt 2).
