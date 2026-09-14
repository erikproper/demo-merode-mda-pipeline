# Einschränkungen und Scopegrenzen

Dieses Dokument hält fest, was der Prototyp nicht kann und warum. Für die Thesis gehört dieses Material in einen Limitations-Abschnitt und einen Future-Work-Abschnitt. Der Unterschied: eine Einschränkung ist etwas, das das System innerhalb des definierten Scopes nicht leistet; Future Work liegt außerhalb des Scopes und wäre ein natürlicher nächster Schritt. Jede Einschränkung sollte mit einer Begründung (warum akzeptabel) und einem kurzen Ausblick (was es bräuchte, um sie zu beheben) dargestellt werden.

---

## 1. Implementierte M-Regeln (ehemals Lücken)

### M3 - Attributdomänen OK implementiert (2026-08-03)

`merode-schema.json` wurde um ein `domainTypes`-Array erweitert. `MerodeDomainType`-Interface in `types.ts`. Kategorische Domänen (z.B. `CarGroup`) werden zu pimUML-Enumerationen; nicht-kategorische (z.B. `MoneyAmount`) zu pimUML-DataTypes, die im PSM-Agenten als Mendix-Entity mit Association umgesetzt werden. Vollständig im Rent-A-Car-Fixture getestet.

Verbleibende Einschränkung: der Attributtyp verweist auf den Domänennamen als String - der Zusammenhang wird erst durch das `domainTypes`-Array im selben Modell aufgelöst. Für die Evaluation kein Problem, da das Fixture explizite `domainTypes`-Einträge enthält.

### M9 - Gemeinsame Ereignisbeteiligung und Propagierung OK implementiert (2026-08-03)

Die Propagierungshülle wird aus dem EDG berechnet (`allTransitiveDependents()`). Für jedes Master-OT, dessen Dependents Ereignisse besitzen, werden Self-Transitionen auf allen aktiven Lebenszykluszuständen eingefügt (Trigger = Ereignisname). Zusätzlich wird eine `Set_<Master>_<evt>`-Aktivität erzeugt, die im PSM-Agenten zu einem ChangeObjectAction-Microflow wird.

Verbleibende Einschränkung: die Propagierung erzeugt immer Self-Transitionen auf allen Zuständen des Masters, auch wenn das OET für bestimmte Zustandskombinationen keine Beteiligung vorsieht. Das ist eine Überapproximation. Für Rent-A-Car korrekt, da alle Master nur einen Lebenszykluszustand haben.

---

## 2. Lücken bei den B-Regeln

### B16 - End-Microflow OK implementiert (2026-08-03)

Der `End_<Entity>`-Microflow generiert: MicroflowParameterObject (Entitätsobjekt) -> `DeleteAction` -> EndEvent. Die Designentscheidung fiel auf Hard-Delete, weil Snoecks Semantik ("an object ceases to exist") physische Nicht-Existenz impliziert und eine Soft-Delete-Variante eine zusätzliche Filterlogik in allen Abfragen erfordern würde, die über den Prototyp-Scope hinausgeht (DD12 in DESIGN_DECISIONS.md).

Verbleibende Einschränkung: physische Löschung löscht auch alle abhängigen Objekte (Mendix Cascade-Delete), wenn die Associations entsprechend konfiguriert sind. Für MERODE-Modelle mit Existenzabhängigkeiten bedeutet das, dass ein Master nicht gelöscht werden kann, solange Dependents existieren - das spiegelt Snoecks Semantik korrekt wider, muss aber in der Applikation explizit gehandhabt werden.

### B15 - Status bei Self-Transitionen OK behoben (2026-09-14)

Der `Set_<Entity>_<evt>`-Microflow setzte den Status auf das Ziel der ersten Transition mit passendem Trigger. Bei M9-propagierten Ereignissen ist das die Self-Transition des ersten Zustands, für Rental also immer `active`, unabhängig vom tatsächlichen Zustand. Jetzt werden Self-Transitionen ignoriert (`resolveStatusTarget()`), und der Status bleibt bei reinen Self-Transitionen unverändert. Test: `mda-agents/tests/test-mendix-status.ts`.

Verbleibende Einschränkungen:
- Der Microflow prüft den Ausgangszustand nicht. `Set_Rental_payDeposit` setzt `depositPaid` auch dann, wenn die Miete bereits `returned` ist. MERODEs Sequenzbedingung wird also in Mendix nicht erzwungen. Behebung: Decision-Element vor der ChangeObjectAction, das `status` gegen die `from`-Zustände der Transitionen prüft.
- Führt ein Trigger in verschiedene Zielzustände (z. B. aus zwei Zuständen in zwei unterschiedliche Folgezustände), wird nur der erste verwendet und eine Warnung geloggt. Im Rent-A-Car-Modell tritt das nicht auf.
- Effects auf DataType-typisierte Attribute (`Set_Rental_payDeposit.depositAmount`, `Set_Rental_payInvoice.invoiceAmount`, beide `MoneyAmount`) werden nicht gesetzt. Der Parameter `new<Attr>` entsteht als String, das Attribut existiert in Mendix aber nur als Association auf die DataType-Entity (B5), daher loggt der Agent `effect attribute ... not found` und erzeugt keinen `MemberChange`. Behebung: DataType-Werte inline als Attribut abbilden oder im Microflow ein DataType-Objekt anlegen und verknüpfen.
- Ob Studio Pro eine `ChangeObjectAction` ohne `MemberChange` (propagierter Microflow ohne Effects) ohne Warnung akzeptiert, ist im QR3-Check zu prüfen.

### B11/B12 - Ein Workflow je DEMO-Region OK behoben (2026-09-14)

Vorher wurden alle Regionen einer DEMO-StateMachine in einem einzigen Workflow `WF_<Entity>` hintereinander verkettet. Damit mussten die Ereignisse in Regionsreihenfolge eintreten, was der Orthogonalität der Regionen widerspricht. Jetzt entsteht je Region ein Workflow `WF_<Entity>_<forEvent>`, und `ACR_<Entity>` startet alle (wie bei Bzowski [4], Abschnitt 11.2.3). Test: `mda-agents/tests/test-mendix-workflows.ts`.

Verbleibende Einschränkungen:
- CE0049 betrifft jetzt jede `WorkflowCallAction` im ACR-Microflow. Für Rental muss der Aufrufdialog in Studio Pro sechsmal statt einmal mit OK bestätigt werden.
- Ob Mendix mehrere parallel laufende Workflows mit demselben Context-Objekt ohne Warnung zulässt, ist im QR3-Check zu prüfen.
- `ACR_<Entity>` ist noch nicht als After-Create-Event-Handler am Entity registriert und muss manuell aufgerufen werden.

### Workflow-Generierung für MERODE entfällt

Die DEMO-Pipeline erzeugt für jede Region einer Entitytyp-FSM einen Mendix-Workflow mit einer WaitForNotification-Aktivität (B12). Die MERODE-Pipeline tut das nicht. Der `isMerodeFSM()`-Check im `pim-to-mendix-agent` überspringt die Workflow-Generierung für MERODE-Zustandsmaschinen.

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

Das `pimuml-schema.json` bildet das pimUML-Metamodell (Bzowski, Figure C.2-C.3) nicht in voller UML-2.5.1-Treue ab. Alle Pattern-relevanten Metaclasses (grün in der Legende) sind vorhanden: `Class`, `Property`, `Association`, `AssociationClass`, `Generalization`, `Enumeration`, `StateMachine`, `Region`, `Transition`, `State`, `Pseudostate`, `Trigger`. Folgende Vereinfachungen wurden zugunsten von JSON-Serialisierbarkeit vorgenommen:

- `AggregationKind` (none/shared/composite auf `Property`) -> `isAggregation: boolean` auf `PimAssociation`. Nur der Composite-Fall wird unterschieden; shared Aggregation ist im Prototyp-Scope nicht nötig.
- `ValueSpecification`-Hierarchie (`LiteralInteger`, `LiteralBoolean`, `LiteralUnlimitedNatural`) -> `defaultValue?: string`. Literalwerte werden als plain Strings serialisiert statt als typisierte Objekt-Instanzen.
- `PrimitiveType` als formaler Typ-Knoten -> Typ-Strings (`"String"`, `"Integer"`, ...). Der Typ eines Attributs wird als String referenziert, nicht als eigenständiges Metamodell-Objekt.
- `InstanceSpecification` -> nicht implementiert. Im Prototyp-Scope nicht benötigt.
- `Trigger` als benanntes Objekt -> `trigger?: string` auf `PimTransition`. Nur der Name wird serialisiert.
- `Transition.effect -> Behavior` -> `alfExpression?: string`. Übergangseffekte werden als ALF-Ausdrucks-String dargestellt, nicht als vollständiges Behavior-Objekt.
- `State.entry -> Behavior` -> `entryActivity?: string`. Entry-Aktivitäten werden als Name-String referenziert.
- `PseudostateKind` mit 10 UML-Werten -> `kind: "initial" | "false" | "true" | "simple" | "final"`. Nur die für DEMO und MERODE relevanten Zustände sind definiert.

Das Aktivitätsdiagramm (drittes Teil des pimUML-Metamodells) wird durch das vereinfachte `PimActivity`-Konstrukt (`kind` + `effects`) approximiert - komplexe Kontrollflüsse innerhalb von Aktivitäten sind bewusst ausgeklammert, da sie auf Mendix-Ebene nicht generierbar sind ohne einen eigenen Ausdrucks-Parser. Siehe auch DD3 in DESIGN_DECISIONS.md.

### Konfigurationsabhängigkeit bei PIM-Quellagenten

Der `pim-to-mendix-agent` abonniert PIM-Topics von den Agenten, die in der Umgebungsvariable `PIM_PUBLISHER_AGENT_IDS` aufgelistet sind. Wenn ein dritter Agent hinzugefügt wird, muss diese Variable aktualisiert werden. Das ist eine Konfigurationsänderung, kein Codechange, aber der nachgelagerte Agent ist dadurch nicht vollständig oblivious gegenüber der Menge der vorgelagerten Agenten. Für das Extensibilitätskriterium ist das ein Grenzfall, der in EXTENSIBILITY_EVIDENCE.md diskutiert wird.

---

## 4a. Einschränkungen der S-Regeln (pim-to-sql-agent)

Der SQL-Agent ist ein reiner Downstream-Konsument von `pimuml-schema.json` (siehe `SqlMappingRules.md` Abschnitt 4) und teilt daher viele der oben genannten pimUML-Limitationen unverändert. Zusätzlich hat die SQL-Zielplattform selbst einige spezifische Konsequenzen.

### S7 - keine geteilte Primärschlüssel-Konvention bei Generalisierung

Jede Klasse erhält im pimUML-Metamodell ihr eigenes, unabhängiges `isID`-Attribut, auch eine Generalisierungs-Kind-Klasse. `pim-to-sql-agent.ts` bildet Generalisierung deshalb auf eine Pflicht-FK-Spalte (`<parent>_id`, `ON DELETE CASCADE`) statt auf eine relational übliche PK-Sharing-Konvention (Kind-Tabellen-PK = Eltern-Tabellen-PK) ab. Das ist funktional korrekt (referenzielle Integrität ist gewährleistet), aber relational nicht die eleganteste Lösung: eine Kind-Instanz hat zwei unabhängige Integer-Identitäten (ihre eigene `isID`-Spalte und die FK auf den Elternteil) statt einer geteilten. Eine PK-Sharing-Variante würde eine pimUML-seitige Konvention voraussetzen, die es aktuell nicht gibt (z. B. eine explizite Markierung, dass eine Generalisierungs-Kind-Klasse kein eigenes `isID`-Attribut trägt, sondern das des Elternteils übernimmt). Für die Rent-A-Car-Fixture (Car->Vehicle) unproblematisch, da keine Abfrage von der PK-Teilung abhängt.

### S2/S6 - DataType-Tabelle spiegelt eine PIM-Limitation, statt sie zu beheben

Wie bereits für den Mendix-Pfad dokumentiert (Abschnitt 4, "pimUML-Schema approximiert UML-Metaclasses vereinfacht"), trägt ein pimUML-DataType keine eigene Struktur. `pim-to-sql-agent.ts` erzeugt deshalb für jeden DataType eine Tabelle mit ausschließlich einer `id`-Spalte und verweist per FK darauf (S2/S6), statt den DataType als Inline-Spaltentyp zu behandeln. Das ist bewusst keine SQL-spezifische Verbesserung der PIM-Limitation, sondern deren getreue Spiegelung - eine Begründung dazu in `SqlMappingRules.md` Abschnitt 3. Konsequenz: ein DataType wie `MoneyAmount` erzeugt eine praktisch leere Tabelle, die in einer echten Datenbank überflüssig wirkt, bis pimUML DataTypes eine eigene Basistyp-Eigenschaft bekommt.

### S12 - Zyklen brechen die Erzeugung vollständig ab

`topoSortTables()` (Kahn-Algorithmus) wirft bei einer zirkulären Pflicht-FK-Abhängigkeit zwischen zwei oder mehr Tabellen eine Exception und erzeugt gar keine DDL-Datei, statt eine unvollständige oder mit `ALTER TABLE`-Nachträgen aufgelöste Teillösung auszugeben. Das ist eine bewusste Fail-fast-Entscheidung (ein Zyklus würde beim tatsächlichen Ausführen der DDL ohnehin scheitern), bedeutet aber, dass der Agent für ein zyklisches PIM-Modell keinerlei Output produziert - auch nicht für die zyklusfreien Teile des Modells. Eine vollständigere Lösung würde zyklische FKs automatisch als `ALTER TABLE ... ADD CONSTRAINT` nach den `CREATE TABLE`-Anweisungen nachziehen (deferred FK), was den Zyklus auflösen würde, ist aber als Future Work eingestuft, da im Rent-A-Car-Fixture kein solcher Zyklus auftritt.

### S4 - unbekannter PIM-Typ fällt auf TEXT zurück

`sqlType()` mappt einen unbekannten oder nicht deklarierten `Property.type`-String stillschweigend auf `TEXT`, statt einen Fehler zu werfen. Das verhindert, dass ein Tippfehler oder ein noch nicht unterstützter PIM-Typ die gesamte DDL-Erzeugung blockiert, kann aber echte Modellierungsfehler maskieren (ein falsch geschriebener Enum-Name würde z. B. zu einer `TEXT`-Spalte statt zu einem Enum-Typ führen, ohne Warnung). Dieselbe Fallback-Strategie nutzt auch der Mendix-Agent (B7) für den analogen Fall.

---

## 5. Behobene Implementierungsfehler

Diese werden dokumentiert, falls Gutachter danach fragen.

**CE7247:** Der anfängliche M1-Code nutzte `name: "id"` für den logischen Bezeichner. Mendix reserviert `id` als Systemattributname. Behoben durch Verwendung von `name: \`${ot.name}ID\`` (z.B. `RentalID`).

**CE0117:** Die anfängliche B14-Implementierung umschloss Enum-Literal-Ausdrücke in einfache Anführungszeichen (`'Module.Enum.Value'`). Mendix-Microflow-Ausdrücke verwenden Enum-Referenzen ohne Anführungszeichen (`Module.Enum.Value`). Behoben durch Entfernen der Anführungszeichen aus dem `MemberChange.value`-String.

**CW0263:** Mendix verlangt mindestens einen sprachspezifischen Caption für jeden Enum-Wert. Die anfängliche Implementierung erstellte Enum-Werte ohne Captions. Behoben durch automatisches Hinzufügen eines englischen Captions (erster Buchstabe großgeschrieben) über `texts.Text.createInEnumerationValueUnderCaption(v)`.

**CE6685** ("Parameters of the selected microflow have changed"): `CallMicroflowTask`-Schritte im generierten Workflow hatten keine `parameterMappings`-Einträge, weil `MicroflowCallParameterMapping.parameter` einen `MicroflowParameter`-Verweis erfordert, der scheinbar nicht per SDK erstellt werden kann. Behoben (2026-08-25) durch: `MicroflowCallParameterMapping.create(model)`, `expression = "$WorkflowContext"`, und `__parameter.updateWithRawValue("Modul.MicroflowName.parameterName")`. Der Mendix-Modellserver erstellt `MicroflowParameter` beim Flush automatisch aus `MicroflowParameterObject` - die Qualified-Name-Referenz löst sich daher korrekt auf.

**Falsche Association-Kardinalität** (Rental(1)->Person(\*) statt Rental(\*)->Person(1)): `mxAssoc.parent` und `mxAssoc.child` waren vertauscht. Im Mendix SDK gilt: `parent` = Many-Seite (FK-Halter, zeigt als \*), `child` = One-Seite (Referenz, zeigt als 1) - entgegen der intuitiven relational-ORM-Konvention. Behoben (2026-08-25) an allen drei Stellen im Agenten (reguläre Associations, DataType-Associations, AssociationClass-Approximationen).

**Wait_undefined im Workflow-Generator:** Der Workflow-Generator versuchte eine WaitForNotification-Aktivität namens `Wait_${region.forEvent}` anzulegen. Für MERODE-Regionen, wo `forEvent` undefined ist, ergab das `Wait_undefined`. Behoben durch den `isMerodeFSM()`-Check, der die Workflow-Generierung für MERODE-FSMs überspringt.

**MERODE-PIM erreichte den Mendix-Agenten nicht:** Der `pim-to-mendix-agent` war darauf hardcodiert, nur das MQTT-Topic des DEMO-Agenten zu abonnieren. MERODE-PIM-Nachrichten wurden stillschweigend ignoriert. Behoben durch Umstellung auf den `PIM_SOURCE_AGENTS`-Mehrfach-Abonnement-Ansatz.
