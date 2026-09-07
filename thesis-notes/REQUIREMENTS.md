# Anforderungskatalog (D1)

Arbeitsdokument für das Anforderungskapitel der Thesis. Die Anforderungen stammen aus dem Proposal (RQ1-RQ4, Abschnitt 2.3), aus Erfahrungen beim Aufbau des Prototyps und aus der Analyse beider Quellsprachen. Ziel dieser Notizen ist es, nicht nur festzuhalten was gefordert ist, sondern auch warum und wo Literaturbelege zu finden sind.

---

## 1. Herkunft der Anforderungen

Die Forschung folgt dem Design Science Research-Ansatz (Hevner et al. [7], Peffers et al. [18]). Das bedeutet, Anforderungen müssen aus einer identifizierten Forschungslücke abgeleitet werden, bevor ein Artefakt entworfen wird. Die Lücke wurde in RQ1 über eine Systematic Mapping Study identifiziert: alle bekannten MDA-Pipelines für Enterprise-Modellierungssprachen sind monolithisch und auf genau eine CIM-Eingabesprache zugeschnitten. Eine zweite Sprache hinzuzufügen erfordert ein vollständiges Umschreiben der Pipeline.

Die Anforderungen teilen sich entsprechend in zwei Gruppen. Architekturanforderungen (AR) beschreiben, welche Systemeigenschaften der Modelling Bus erfüllen muss. PIM-Strukturanforderungen (PR) legen fest, was das Zwischenmodellformat leisten muss, um als gemeinsames Ziel für paradigmatisch unterschiedliche Quellsprachen zu dienen. Beide Gruppen werden durch die Erfolgskriterien aus Abschnitt 2.3 des Proposals operationalisiert.

---

## 2. Architekturanforderungen

### AR1 - Mehrsprachige CIM-Eingabe

Das System muss Modelle aus mindestens zwei paradigmatisch unterschiedlichen CIM-Sprachen akzeptieren. Das Wort "paradigmatisch" ist hier entscheidend: die Thesis benötigt explizit DEMO und MERODE, weil sie grundlegend verschiedene Ansätze zur Enterprise-Modellierung repräsentieren. DEMO (Dietz und Mulder [6]) ist faktbasiert und fußt auf PSI-Theorie und Enterprise Ontology. MERODE (Snoeck [21]) ist objekt-lebenszyklus-orientiert und dreht sich um Existenzabhängigkeiten und endliche Automaten. Ein System, das nur zwei Dialekte derselben Denkschule verarbeitet, würde den Extensibilitätsanspruch nicht belegen.

Im aktuellen Prototyp sind beide Sprachen über separate Agenten realisiert: `demo-to-pim-agent` und `merode-to-pim-agent`. Diese Agentenarchitektur ist es, die eine Koppelung der beiden Sprachparser aneinander verhindert.

### AR2 - Sprachenisolation

Die Transformationslogik für jede CIM-Sprache muss in genau einem Agenten gekapselt sein. Kein CIM-spezifisches Wissen darf außerhalb dieses Agenten auftauchen. Konkret bedeutet das: der MQTT-Bus trägt ausschließlich schema-validierte PIM-Nachrichten, niemals rohe CIM-Daten. Der `pim-to-mendix-agent` darf keine Parsing-Logik für DEMO oder MERODE enthalten. Und der `demo-to-pim-agent` ist vollständig ignorant gegenüber MERODE, und umgekehrt.

Das Extensibilitätsexperiment prüft diese Anforderung empirisch: der `pim-to-sql-agent` (S1-S12) wurde als dritter, unabhängiger PSM-Agent gebaut, ohne dass `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts` oder die Bus-Infrastruktur geändert werden mussten (Nachweis mit Diff-Tabelle in `EXTENSIBILITY_EVIDENCE.md` §5). Damit ist AR2 erfüllt.

### AR3 - Additive Erweiterbarkeit

Das Hinzufügen einer neuen CIM-Sprache darf keine Änderungen an bestehenden Komponenten erfordern. Das ist der zentrale Anspruch der Thesis und wird in Abschnitt 2.3 des Proposals als binäres Kriterium nach ISO/IEC 25010 [8] operationalisiert.

"Bestehende Komponenten" sind konkret: `bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts` in seiner Kernlogik und `pimuml-schema.json` insofern bestehende DEMO-erzeugte Felder weiterhin valide sind. Beim Hinzufügen von MERODE wurde kein bestehender Agent in seiner Transformationslogik geändert. Der `pim-to-mendix-agent.ts` hat zusätzliche B-Regeln (B13-B16) bekommen, aber der DEMO-Pfad durch diesen Agenten blieb verhaltensidentisch. Die genaue Diskussion dieser Grenzziehung findet sich in EXTENSIBILITY_EVIDENCE.md.

### AR4 - Schema-validiertes Zwischenformat

Jede PIM-Instanz auf dem Bus muss vor der Weiterverarbeitung eine JSON-Schema-Validierung bestehen. Das Schema verwendet `additionalProperties: false`, um ein stilles Auseinanderlaufen der Feldstruktur zu verhindern. Die Metrik dafür ist die Schema Validation Rate (SVR), die für eine strukturell korrekte Pipeline 100% betragen muss.

Der Prototyp validiert Eingangsmodelle gegen ihr CIM-Schema und Ausgabe-PIM-Modelle gegen `pimuml-schema.json` vor der Veröffentlichung. Ein Validierungsfehler bricht die Transformation mit einer Fehlermeldung ab und veröffentlicht nichts.

### AR5 - Vollständige Automatisierung

Zwischen CIM-Modelleingabe und Mendix-App-Ausgabe darf kein manueller Schritt stattfinden. Die Pipeline wird durch ein einziges HTTP-POST an `/api/model` ausgelöst. Alles Nachgelagerte passiert automatisch. Das unterscheidet den Prototyp von Bzowski [4], dessen Transformation manuell demonstriert wurde.

### AR6 - Lose Kopplung über asynchrones Messaging

Agenten müssen zeitlich und örtlich entkoppelt sein. Der MQTT-Broker ist die einzige geteilte Abhängigkeit. Agenten können unabhängig gestartet, gestoppt und neu gestartet werden. Die Retained-Message-Funktion von MQTT sorgt dafür, dass ein neu gestarteter Agent sofort den letzten bekannten Zustand jedes Artefakts erhält, ohne auf eine neue Veröffentlichung warten zu müssen. Das ist besonders während der Entwicklung und beim Testen wertvoll.

### AR7 - Nachvollziehbarkeit (Traceability)

Jedes Quellkonzept, das in die Pipeline eintritt, muss eine dokumentierte Trace-Verbindung zu seinen Zielkonzepten im PIM haben. Das `TraceEntry[]`-Array in jeder veröffentlichten PIM-Nachricht hält diese Abbildungen fest. Die Metrik ist die Traceability Coverage nach Winkler und Pilgrim [25]: der Anteil der Quellelemente mit mindestens einem dokumentierten Trace-Link im Ausgabemodell.

Hilfsstrukturen wie die `__initial`- und `__final`-Pseudozustände, die beim FSM-Aufbau entstehen, zählen als "Added_justified" und sind nach den Toleranzdefinitionen aus Abschnitt 2.3 des Proposals zulässig, weil sie kein direktes semantisches Gegenstück im Quellmodell haben, aber strukturell notwendig sind.

---

## 3. PIM-Strukturanforderungen

Das PIM ist die zentrale Designherausforderung der Thesis. Es muss ausdrucksstark genug sein, um Konzepte aus sowohl DEMO als auch MERODE zu erfassen, ohne so spezifisch für eine der Sprachen zu sein, dass es beim Hinzufügen der anderen komplett überarbeitet werden muss.

### PR1 - Strukturelle Ausdrucksstärke

Das ist der unkomplizierte Teil. Beide Sprachen beschreiben Geschäftsobjekte mit Attributen und Beziehungen. pimUML deckt das bereits über Class, Property und Association ab. Die DEMO-Regeln A3, A5, A11-A12 und die MERODE-Regeln M1, M2, M4 bilden alle auf dieselben pimUML-Strukturkonstrukte ab. Das ist der Überschneidungsbereich beider Sprachen: was Snoeck als "Datenmodell-Sicht" (EDG) bezeichnet, ist strukturell vergleichbar mit dem DEMO Fact Model.

### PR2 - Verhaltensausdrucksstärke (Lebenszyklus-FSMs)

Hier laufen die Sprachen auseinander. DEMO und MERODE nutzen beide endliche Automaten für Objektlebenszyklen, aber diese FSMs unterscheiden sich grundlegend.

DEMO-FSMs (Bzowski, A6) bestehen aus orthogonalen Regionen, eine pro Ereignistyp. Jede Region hat genau zwei Zustände: `false` (Ereignis noch nicht eingetreten) und `true` (Ereignis eingetreten). Die Regionen sind voneinander unabhängig und können in beliebiger Kombination aktiv sein. Ereignisse sind monoton und können nicht rückgängig gemacht werden.

MERODE-FSMs (Snoeck [21], Kapitel 6) bestehen aus einer einzigen sequenziellen Region mit benannten, sich gegenseitig ausschließenden Lebenszykluszuständen. Ein Objekt bewegt sich von einem Zustand zum nächsten. Beendigungsereignisse führen in einen finalen Zustand, danach sind keine weiteren Ereignisse möglich.

Das PIM muss beides unterstützen. Die gewählte Lösung verwendet eine einzelne `StateMachine` mit `Region`-Elementen, wobei DEMO-Regionen ein `forEvent`-Attribut tragen (eine Region pro Ereignis, boolesches Paar) und MERODE-Regionen keins haben (eine Region pro Objekttyp, sequenzielle benannte Zustände). Das erfordert die Erweiterung von `State.kind` um `simple` und `final` sowie die Optionalisierung von `Region.forEvent`. Diese Änderungen sind in DD5 (DESIGN_DECISIONS.md) dokumentiert.

### PR3 - Aktivitätstypen

Unterschiedliche Transformationsregeln erzeugen unterschiedliche Aktivitätstypen. DEMO erzeugt `create`- und `set`-Aktivitäten. MERODE benötigt zusätzlich `end`-Aktivitäten für Beendigungsereignisse (M8). Das Feld `Activity.kind` wurde entsprechend von `{set, create}` auf `{set, create, end}` erweitert.

### PR4 - JSON-Serialisierbarkeit

Das PIM muss als JSON serialisierbar und durch ein JSON-Schema beschreibbar sein. Das ist Voraussetzung für Schema-Validierung (AR4) und MQTT-Transport. Das pimUML-JSON-Schema (`pimuml-schema.json`) ist die normative Definition des PIM.

### PR5 - Rückwärtskompatibilität bei Erweiterungen

Jede Schema-Erweiterung für MERODE darf bestehende DEMO-erzeugte PIM-Instanzen nicht invalidieren. Neue Felder müssen optional sein, neue Enum-Werte dürfen nicht mit bestehenden kollidieren, und bestehende Pflichtfelder müssen Pflichtfelder bleiben. Alle drei für MERODE vorgenommenen Schema-Änderungen erfüllen diese Bedingung. Ein DEMO-erzeugtes PIM validiert gegen das erweiterte Schema ohne jede Änderung am DEMO-Agenten.

---

## 4. Qualitätsanforderungen (aus Proposal, Abschnitt 2.3)

Das sind die operationalisierten Erfolgskriterien, die die Evaluation (D6, D7) prüft.

### QR1 - Semantische Vollständigkeit (Completeness)

Anteil der Quellaussagen, die korrekt im Zielmodell ankommen. Eine Quellaussage gilt als "erhalten", wenn sie im PIM mit dem richtigen Typ und den richtigen Beziehungen zu anderen Elementen erscheint. Für DEMO sind Quellaussagen: Entitätstypen, Faktentypen, Eigenschaftstypen, Kardinalitäten und Ableitungsregeln. Für MERODE: Objekttypen, Existenzabhängigkeiten, Geschäftsereignistypen und endliche Automaten (gemäß Proposal, Abschnitt 3.3).

Die verwendete Vierfachklassifikation ist: Correct, Missing, Incorrect, Added. Vollständigkeit ergibt sich als C / (C + M + I).

### QR2 - Semantische Validität

Abwesenheit falsch transformierter oder ungerechtfertigt hinzugefügter Elemente. Validität = C / (C + I + Added_unjustified). Strukturell notwendige Hilfselemente wie `__initial`-Pseudozustände zählen als "Added_justified" und werden nicht als Fehler gewertet.

### QR3 - Schema Validation Rate (SVR)

Muss 100% betragen. Ein einziger Validierungsfehler bedeutet, dass die Pipeline strukturell defekt ist. Das ist keine zu optimierende Metrik, sondern eine harte Bedingung.

### QR4 - Traceability Coverage

Anteil der Quellelemente mit mindestens einem Trace-Link. Zielwert: 100% für alle Elemente, die ein semantisches Gegenstück haben. Explizit als NotMapped dokumentierte Elemente (z.B. durch M9 propagierte Ereignisse) werden aus dem Nenner herausgenommen.

### QR5 - Erweiterbarkeit

Binäres Kriterium. Ein dritter CIM-Agent kann integriert werden, ohne bestehende Komponenten zu ändern. Operationalisiert als: müssen `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts` oder `pimuml-schema.json` geändert werden? Wenn nicht (von additiven Änderungen abgesehen), ist das Kriterium erfüllt.

---

## 5. Nicht-funktionale Anforderungen

Das System muss auf Consumer-Hardware (Raspberry Pi 4) lauffähig sein. Alle Agenten müssen unter vernünftigen Speicherbeschränkungen operieren.

Zur Transformationslatenz gibt es keine formale Anforderung, aber die Durchlaufzeit vom HTTP-POST bis zur Mendix-Modellaktualisierung sollte für Modelle in Fallstudiengröße im Bereich von Sekunden, nicht Minuten liegen.

Die Schemas müssen maschinell lesbar sein (JSON Schema Draft-07), damit Validierung in CI automatisiert werden kann.

---

## 6. Bewusst nicht im Scope

Für ein Produktionssystem wären folgende Anforderungen relevant, fallen aber explizit aus dem Scope der Thesis heraus: Sicherheit (Authentifizierung, Autorisierung, TLS für MQTT), Skalierbarkeit bei gleichzeitigen Modell-Einreichungen, Fehlerwiederherstellung bei Agent-Abstürzen während der Transformation, Mendix-Plattform-Versionierung und Reverse-Engineering (Mendix-Modelle zurück zu CIM).
