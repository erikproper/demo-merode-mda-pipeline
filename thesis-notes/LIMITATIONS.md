# Einschränkungen und Scopegrenzen

Dieses Dokument hält fest, was der Prototyp nicht kann und warum. Für die Thesis gehört dieses Material in einen Limitations-Abschnitt und einen Future-Work-Abschnitt. Der Unterschied: eine Einschränkung ist etwas, das das System innerhalb des definierten Scopes nicht leistet; Future Work liegt außerhalb des Scopes und wäre ein natürlicher nächster Schritt. Jede Einschränkung sollte mit einer Begründung (warum akzeptabel) und einem kurzen Ausblick (was es bräuchte, um sie zu beheben) dargestellt werden.

---

## 1. Implementierte M-Regeln (ehemals Lücken)

### M3 - Attributdomänen ✅ implementiert (2026-08-03)

`merode-schema.json` wurde um ein `domainTypes`-Array erweitert. `MerodeDomainType`-Interface in `types.ts`. Kategorische Domänen (z.B. `FuelType`) werden zu pimUML-Enumerationen; nicht-kategorische (z.B. `MoneyAmount`) zu pimUML-DataTypes, die im PSM-Agenten als Mendix-Entity mit Association umgesetzt werden. Vollständig im Rent-A-Car-Fixture getestet.

Verbleibende Einschränkung: der Attributtyp verweist auf den Domänennamen als String — der Zusammenhang wird erst durch das `domainTypes`-Array im selben Modell aufgelöst. Für die Evaluation kein Problem, da das Fixture explizite `domainTypes`-Einträge enthält.

### M9 - Gemeinsame Ereignisbeteiligung und Propagierung ✅ implementiert (2026-08-03)

Die Propagierungshülle wird aus dem EDG berechnet (`allTransitiveDependents()`). Für jedes Master-OT, dessen Dependents Ereignisse besitzen, werden Self-Transitionen auf allen aktiven Lebenszykluszuständen eingefügt (Trigger = Ereignisname). Zusätzlich wird eine `Set_<Master>_<evt>`-Aktivität erzeugt, die im PSM-Agenten zu einem ChangeObjectAction-Microflow wird.

Verbleibende Einschränkung: die Propagierung erzeugt immer Self-Transitionen auf allen Zuständen des Masters, auch wenn das OET für bestimmte Zustandskombinationen keine Beteiligung vorsieht. Das ist eine Überapproximation. Für Rent-A-Car korrekt, da alle Master nur einen Lebenszykluszustand haben.

---

## 2. Lücken bei den B-Regeln

### B16 - End-Microflow ✅ implementiert (2026-08-03)

Der `End_<Entity>`-Microflow generiert: MicroflowParameterObject (Entitätsobjekt) → `DeleteAction` → EndEvent. Die Designentscheidung fiel auf Hard-Delete, weil Snoecks Semantik ("an object ceases to exist") physische Nicht-Existenz impliziert und eine Soft-Delete-Variante eine zusätzliche Filterlogik in allen Abfragen erfordern würde, die über den Prototyp-Scope hinausgeht (DD12 in DESIGN_DECISIONS.md).

Verbleibende Einschränkung: physische Löschung löscht auch alle abhängigen Objekte (Mendix Cascade-Delete), wenn die Associations entsprechend konfiguriert sind. Für MERODE-Modelle mit Existenzabhängigkeiten bedeutet das, dass ein Master nicht gelöscht werden kann, solange Dependents existieren — das spiegelt Snoecks Semantik korrekt wider, muss aber in der Applikation explizit gehandhabt werden.

### Workflow-Generierung für MERODE entfällt

Die DEMO-Pipeline erzeugt für jeden Entitytyp-FSM einen Mendix-Workflow mit WaitForNotification-Aktivitäten. Die MERODE-Pipeline tut das nicht. Der `isMerodeFSM()`-Check im `pim-to-mendix-agent` überspringt die Workflow-Generierung für MERODE-Zustandsmaschinen.

Mendix-Workflows sind für langläufige Prozesse mit menschlichen Interaktionspunkten konzipiert. Sie passen gut zu DEMOs booleschen Regionen, weil jede Region eine Workflow-Warteaktivität werden kann. MERODEs sequenzielle FSMs lassen sich nicht so direkt auf Mendix-Workflows abbilden: die Lebenszykluszustände würden zu Workflow-Aktivitäten, aber die Trigger-und-Übergangs-Struktur ist grundlegend anders.

Konkret: Als der Workflow-Generator auf einen MERODE-FSM traf, versuchte er eine `WaitForNotification`-Aktivität namens `Wait_<forEvent>` anzulegen. MERODE-Regionen haben aber kein `forEvent`, was den Namen `Wait_undefined` erzeugte. Das war der Fehler, der zum `isMerodeFSM()`-Skip geführt hat.

Möglicher Lösungsansatz: jeden Lebenszykluszustand auf einen Workflow-Aktivitätstyp abbilden und jeden Übergang auf die Fortschrittslogik. Das würde neue B-Regel-Definitionen erfordern und ist als Future Work vorgesehen.

---

## 3. Nicht abgedeckte MERODE-Konzepte

Die folgenden MERODE-Konzepte aus Snoeck [21] sind explizit nicht im Scope.

### Vererbung (Kapitel 8)

Snoeck widmet der Vererbung in MERODE ein vollständiges Kapitel. Objekttypen können durch Attribute (attribut-definierte Unterklasse), Existenz (existenz-definierte Unterklasse) oder Zustand (zustands-definierte Unterklasse) spezialisiert werden. Jede Form hat andere Implikationen für Ereignisbeteiligung und Lebenszyklus-Modellierung.

Die aktuelle Implementierung behandelt Vererbung nicht. Das Rent-A-Car-Fallbeispiel benötigt sie nicht, und das Proposal listet sie nicht als erforderliches Lieferobjekt. Vererbung könnte durch M-Regeln analog zu A10 umgesetzt werden und wäre in der Thesis als natürliche Erweiterung zu dokumentieren.

### Constraints (Kapitel 7.2)

Snoeck definiert Eindeutigkeitsbedingungen, Attributbeschränkungen, Methodenbedingungen (Vorbedingungen für Ereignisse), referenzielle Integritätsbedingungen und Sequenzbeschränkungen. Nichts davon wird aktuell in `merode-schema.json` erfasst oder vom Agenten verarbeitet. Das korrekte Erfassen von Constraints würde das Schema erheblich erweitern und entsprechende Mendix-Logik erfordern.

### IS-Service-Schicht und Business-Process-Schicht (Kapitel 9 und 10)

Snoecks IS-Service-Schicht beschreibt Eingabedienste (Ereigniserzeugung) und Ausgabedienste (Informationsabruf). Die Business-Process-Schicht zeigt, wie Geschäftsprozesse mit dem Domänenmodell verknüpft werden. Beides liegt außerhalb des Scopes. Der Fokus liegt auf dem Domänenmodell (EDG, OET und FSMs) als CIM-Eingabe.

---

## 4. Architektonische Einschränkungen

### Der `isMerodeFSM()`-Diskriminator ist fragil

Der Mechanismus, der DEMO-FSMs von MERODE-FSMs im nachgelagerten Agenten unterscheidet, basiert darauf, dass DEMO-Regionen immer `forEvent` setzen und MERODE-Regionen das nie tun. Das ist eine Eigenschaft der PIM-Kodierung, kein explizites Sprach-Tag.

Eine dritte Sprache, die FSMs ohne Ereignisannotationen verwendet, würde vom Diskriminator falsch als "MERODE-artig" klassifiziert. Der sauberere Ansatz wäre ein explizites `fsmStyle: "orthogonal" | "sequential"`-Feld in der StateMachine-Definition. Aber für den aktuellen Scope (DEMO und MERODE) ist der strukturelle Diskriminator ausreichend.

### Einzelne Fallstudie begrenzt den Evaluationsumfang

Die Evaluation (D7) gilt nur für das Rent-A-Car-Fallbeispiel. Snoeck nutzt eine Bibliotheks-Fallstudie als laufendes Beispiel; Bzowski nutzt Rent-A-Car. Der direkte Vergleich mit Bzowskis Ergebnissen ist damit möglich, aber die Evaluation testet keine Randfälle, die im Modell nicht vorkommen: keine Vererbung, keine Constraints, keine mehrstufigen Propagierungsketten, nur ein erzeugender Ereignistyp pro Objekttyp. Eine vollständigere Evaluation würde mehrere Fallstudien verwenden.

### Mendix-Applikation braucht Cloud-Lizenz zum Ausführen

Die Ausgabe ist ein valides Mendix-Modell, das in Mendix Studio Pro geöffnet werden kann. Das tatsächliche Ausführen der Applikation erfordert eine Mendix-Cloud-Umgebung oder eine lokale Runtime-Lizenz. Die Evaluation bewertet daher die strukturelle Validität des generierten Modells (keine Mendix-Fehler/Warnungen), nicht das Laufzeitverhalten.

### pimUML-Schema approximiert UML-Metaclasses vereinfacht

Das `pimuml-schema.json` bildet das pimUML-Metamodell (Bzowski, Figure C.2–C.3) nicht in voller UML-2.5.1-Treue ab. Alle Pattern-relevanten Metaclasses (grün in der Legende) sind vorhanden: `Class`, `Property`, `Association`, `AssociationClass`, `Generalization`, `Enumeration`, `StateMachine`, `Region`, `Transition`, `State`, `Pseudostate`, `Trigger`. Folgende Vereinfachungen wurden zugunsten von JSON-Serialisierbarkeit vorgenommen:

- `AggregationKind` (none/shared/composite auf `Property`) → `isAggregation: boolean` auf `PimAssociation`. Nur der Composite-Fall wird unterschieden; shared Aggregation ist im Prototyp-Scope nicht nötig.
- `ValueSpecification`-Hierarchie (`LiteralInteger`, `LiteralBoolean`, `LiteralUnlimitedNatural`) → `defaultValue?: string`. Literalwerte werden als plain Strings serialisiert statt als typisierte Objekt-Instanzen.
- `PrimitiveType` als formaler Typ-Knoten → Typ-Strings (`"String"`, `"Integer"`, ...). Der Typ eines Attributs wird als String referenziert, nicht als eigenständiges Metamodell-Objekt.
- `InstanceSpecification` → nicht implementiert. Im Prototyp-Scope nicht benötigt.
- `Trigger` als benanntes Objekt → `trigger?: string` auf `PimTransition`. Nur der Name wird serialisiert.
- `Transition.effect → Behavior` → `alfExpression?: string`. Übergangseffekte werden als ALF-Ausdrucks-String dargestellt, nicht als vollständiges Behavior-Objekt.
- `State.entry → Behavior` → `entryActivity?: string`. Entry-Aktivitäten werden als Name-String referenziert.
- `PseudostateKind` mit 10 UML-Werten → `kind: "initial" | "false" | "true" | "simple" | "final"`. Nur die für DEMO und MERODE relevanten Zustände sind definiert.

Das Aktivitätsdiagramm (drittes Teil des pimUML-Metamodells) wird durch das vereinfachte `PimActivity`-Konstrukt (`kind` + `effects`) approximiert — komplexe Kontrollflüsse innerhalb von Aktivitäten sind bewusst ausgeklammert, da sie auf Mendix-Ebene nicht generierbar sind ohne einen eigenen Ausdrucks-Parser. Siehe auch DD3 in DESIGN_DECISIONS.md.

### Konfigurationsabhängigkeit bei PIM-Quellagenten

Der `pim-to-mendix-agent` abonniert PIM-Topics von den Agenten, die in der Umgebungsvariable `PIM_PUBLISHER_AGENT_IDS` aufgelistet sind. Wenn ein dritter Agent hinzugefügt wird, muss diese Variable aktualisiert werden. Das ist eine Konfigurationsänderung, kein Codechange, aber der nachgelagerte Agent ist dadurch nicht vollständig oblivious gegenüber der Menge der vorgelagerten Agenten. Für das Extensibilitätskriterium ist das ein Grenzfall, der in EXTENSIBILITY_EVIDENCE.md diskutiert wird.

---

## 5. Behobene Implementierungsfehler

Diese werden dokumentiert, falls Gutachter danach fragen.

**CE7247:** Der anfängliche M1-Code nutzte `name: "id"` für den logischen Bezeichner. Mendix reserviert `id` als Systemattributname. Behoben durch Verwendung von `name: \`${ot.name}ID\`` (z.B. `RentalID`).

**CE0117:** Die anfängliche B14-Implementierung umschloss Enum-Literal-Ausdrücke in einfache Anführungszeichen (`'Module.Enum.Value'`). Mendix-Microflow-Ausdrücke verwenden Enum-Referenzen ohne Anführungszeichen (`Module.Enum.Value`). Behoben durch Entfernen der Anführungszeichen aus dem `MemberChange.value`-String.

**CW0263:** Mendix verlangt mindestens einen sprachspezifischen Caption für jeden Enum-Wert. Die anfängliche Implementierung erstellte Enum-Werte ohne Captions. Behoben durch automatisches Hinzufügen eines englischen Captions (erster Buchstabe großgeschrieben) über `texts.Text.createInEnumerationValueUnderCaption(v)`.

**CE6685** ("Parameters of the selected microflow have changed"): `CallMicroflowTask`-Schritte im generierten Workflow hatten keine `parameterMappings`-Einträge, weil `MicroflowCallParameterMapping.parameter` einen `MicroflowParameter`-Verweis erfordert, der scheinbar nicht per SDK erstellt werden kann. Behoben (2026-08-25) durch: `MicroflowCallParameterMapping.create(model)`, `expression = "$WorkflowContext"`, und `__parameter.updateWithRawValue("Modul.MicroflowName.parameterName")`. Der Mendix-Modellserver erstellt `MicroflowParameter` beim Flush automatisch aus `MicroflowParameterObject` — die Qualified-Name-Referenz löst sich daher korrekt auf.

**Falsche Association-Kardinalität** (Rental(1)→Person(\*) statt Rental(\*)→Person(1)): `mxAssoc.parent` und `mxAssoc.child` waren vertauscht. Im Mendix SDK gilt: `parent` = Many-Seite (FK-Halter, zeigt als \*), `child` = One-Seite (Referenz, zeigt als 1) — entgegen der intuitiven relational-ORM-Konvention. Behoben (2026-08-25) an allen drei Stellen im Agenten (reguläre Associations, DataType-Associations, AssociationClass-Approximationen).

**Wait_undefined im Workflow-Generator:** Der Workflow-Generator versuchte eine WaitForNotification-Aktivität namens `Wait_${region.forEvent}` anzulegen. Für MERODE-Regionen, wo `forEvent` undefined ist, ergab das `Wait_undefined`. Behoben durch den `isMerodeFSM()`-Check, der die Workflow-Generierung für MERODE-FSMs überspringt.

**MERODE-PIM erreichte den Mendix-Agenten nicht:** Der `pim-to-mendix-agent` war darauf hardcodiert, nur das MQTT-Topic des DEMO-Agenten zu abonnieren. MERODE-PIM-Nachrichten wurden stillschweigend ignoriert. Behoben durch Umstellung auf den `PIM_SOURCE_AGENTS`-Mehrfach-Abonnement-Ansatz.
