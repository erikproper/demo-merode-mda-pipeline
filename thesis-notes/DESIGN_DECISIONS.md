# Designentscheidungen (D2)

Architekturdokumentation des Modelling Bus. Diese Notizen halten fest, welche Entscheidungen wann und warum getroffen wurden, einschließlich verworfener Alternativen. Das Ziel ist, das Designkapitel der Thesis auf dieser Grundlage schreiben zu können und die typische Frage "warum nicht X stattdessen?" beantworten zu können.

---

## 1. Systemüberblick

Der Modelling Bus ist eine lose gekoppelte, agentenbasierte MDA-Pipeline. Die Grundidee, die von Blanc et al. [2] übernommen und erweitert wurde, besteht darin, die Transformationslogik jeder CIM-Sprache in einen eigenständigen Agenten auszulagern, der auf einem gemeinsamen Bus veröffentlicht. Beliebig viele Agenten können nebeneinander existieren. Der nachgelagerte Agent (`pim-to-mendix-agent`) abonniert PIM-Artefakte unabhängig davon, welcher vorgelagerte Agent sie veröffentlicht hat.

Das System hat drei Schichten. Die CIM-Schicht enthält formatspezifische Agenten, die CIM-Modelle einlesen und PIM-Modelle ausgeben. Die Bus-Schicht ist der MQTT-Broker (Eclipse Mosquitto), über den schema-validierte PIM-Nachrichten fließen. Die PSM-Schicht besteht aus dem `pim-to-mendix-agent`, der PIM-Modelle konsumiert und Mendix-SDK-Aufrufe erzeugt.

Was diesen Ansatz von bisherigen Arbeiten unterscheidet: Bzowski [4] hat das pimUML-Vokabular und die A-Regeln theoretisch definiert, aber die Pipeline nie automatisiert. Krouwel et al. [11] haben eine Pipeline automatisiert, aber DEMO als einzige Eingabe hartcodiert und kein explizites PIM verwendet. Diese Thesis automatisiert Bzowskis Pipeline und erweitert sie auf mehrere Eingabesprachen, indem das PIM zum Vertrag zwischen den Schichten wird.

---

## 2. Entscheidungsprotokoll

### DD1 - MQTT als Nachrichtenbus

Eclipse Mosquitto (MQTT 3.1.1) wurde als Broker gewählt, nachdem mehrere Ansätze verglichen wurden.

REST/HTTP scheidet aus, weil es synchron und eng gekoppelt ist: Agent B müsste Agents A Adresse kennen, was AR6 verletzt. Eine geteilte Datenbank wäre ebenfalls möglich, würde aber mehr Kopplung einführen und es schwerer machen, Agenten unabhängig zu starten. Apache Kafka wäre leistungsfähiger, aber für einen Forschungsprototyp deutlich überdimensioniert; das Consumer-Group-Modell bringt hier keinen Mehrwert, weil keine Partitionierung benötigt wird.

MQTT ist leichtgewichtig, publish/subscribe-basiert und für verteilte Agentenarchitekturen gut geeignet. Eclipse Mosquitto läuft trivial als Docker-Container. Das entscheidende Feature ist die Retained-Message-Funktion: jeder Agent, der sich verbindet, erhält sofort den letzten bekannten Zustand jedes Topics, ohne auf eine Neuveröffentlichung warten zu müssen. Das macht den Broker zu einem persistenten Zustandsspeicher, was die Entwicklung und das Debugging erheblich vereinfacht. Das Publish/Subscribe-Modell setzt die Entkopplung von AR2 auf natürliche Weise um.

Bekannte Einschränkungen: MQTT garantiert keine geordnete Auslieferung über verschiedene Topics hinweg, und der Broker ist ein Single Point of Failure. Beides ist für einen Forschungsprototyp akzeptabel.

### DD2 - JSON Schema als PIM-Metasprache

Das pimUML-PIM wird als JSON-Schema-validiertes JSON-Dokument repräsentiert. Bzowski [4] definierte pimUML als UML-Profil, aber für die Automatisierung der Pipeline wird ein konkretes Serialisierungsformat benötigt. Das Proposal verweist explizit auf Colantoni et al. [5], die zeigen, dass JSON Schema als Metasprache für MDE-Artefakte geeignet ist.

XMI als Standard-UML-Format scheidet aus, weil es eine schwere Toolchain (Eclipse, Ecore-Metamodelle) erfordert und schlecht zur TypeScript-nativen Mendix-SDK-Umgebung passt. YAML ist menschenlesbar, hat aber keine bessere Tooling-Unterstützung für Schema-Validierung als JSON. Reine TypeScript-Interfaces verlieren die Sprachneutralität und erlauben keine programmatische Schema-Compliance-Prüfung.

JSON ist im Mendix-SDK nativ, wird nativ über MQTT transportiert und lässt sich direkt mit AJV validieren. Die `additionalProperties: false`-Enforcement ist genau das, was gebraucht wird, um stilles Schema-Drift zu verhindern. Dieses Designprinzip kommt bereits von Bzowski.

### DD3 - pimUML als PIM-Sprache

Die Thesis baut direkt auf Bzowski [4] auf. Er hat die A-Regeln von DEMO Fact Model zu pimUML und die B-Regeln von pimUML zu Mendix definiert. Die Aufgabe hier ist, diese Regeln zu automatisieren und pimUML auf MERODE zu erweitern.

Ein vollständig neues PIM zu definieren wäre ein größerer Beitrag, würde aber auch erfordern, jede Designentscheidung eigenständig zu rechtfertigen. Das Aufbauen auf Bzowski verankert das PIM in vorhandener akademischer Arbeit und erlaubt es, den Thesis-Beitrag auf Pipelinearchitektur und MERODE-Erweiterung zu konzentrieren, nicht auf das PIM-Sprachdesign selbst.

pimUML deckt drei UML-Diagrammtypen ab: Klassendiagramm (strukturell), Zustandsmaschinendiagramm (verhaltensbezogen) und Aktivitätsdiagramm (Operationen). Im Prototyp werden Klassen- und Zustandsmaschinendiagramme vollständig genutzt; das Aktivitätsdiagramm wird teilweise genutzt (Aktivitäten werden als typisierte Objekte im PIM erfasst, aber nicht als vollständige UML-Aktivitätsdiagramme dargestellt).

### DD4 - Sequenzielle FSM für MERODE-Lebenszyklen

MERODE-Objektlebenszyklen werden als sequenzielle Zustandsmaschinen mit benannten, geordneten Zuständen und einem finalen Zustand repräsentiert, nicht als orthogonale boolesche Regionen wie bei DEMO.

Das war die folgenreichste Designentscheidung in der MERODE-Erweiterung. Drei Optionen standen zur Wahl.

Option A hätte die boolesche Regionenkodierung von DEMO wiederverwendet: jeder Geschäftsereignistyp als orthogonale Region mit `false`/`true`-Zuständen, unabhängig von der Quellsprache. Das hätte maximale Schema-Wiederverwendung bedeutet, wäre aber semantisch falsch. MERODE-Lebenszykluszustände schließen sich gegenseitig aus (ein Objekt ist entweder `active` oder `completed`, nie beides), boolesche Regionen repräsentieren aber unabhängige Flags in beliebiger Kombination. Das hätte strukturell invalide Modelle erzeugt, und die Thesis könnte für MERODE keine semantische Korrektheit beanspruchen.

Option C hätte MERODE-FSMs komplett aus dem Scope herausgenommen. Das hätte die Extensibilitätseigenschaft des Schemas unangetastet gelassen, würde aber bedeuten, für MERODE nur strukturelle Transformation zu beanspruchen, nicht verhaltensbezogene. Das würde den Heterogenitätsanspruch der Thesis untergraben.

Option B wurde gewählt: eine Region, ein initialer Pseudozustand, benannte Lebenszykluszustände (kind: `simple`), ein finaler Zustand. Das entspricht Snoecks Beschreibung in Kapitel 6: "life cycle states are successive phases of the object's life" (S. 127). Der Preis ist eine minimale PIM-Erweiterung. Der Gewinn ist semantische Treue. Dass diese Option eine Erweiterung erzwingt, ist selbst ein Befund: das für DEMO entworfene pimUML-Schema ist fast, aber nicht vollständig, ausreichend für MERODE. Genau das zu dokumentieren ist ein Beitrag zur Frage, was ein "gemeinsames PIM" für heterogene Enterprise-Modelle leisten muss.

### DD5 - Additive, rückwärtskompatible PIM-Schema-Erweiterung

`pimuml-schema.json` wurde minimal erweitert, sodass alle DEMO-erzeugten PIM-Instanzen weiterhin ohne Änderungen am DEMO-Agenten validieren.

Drei Änderungen wurden vorgenommen. `State.kind` wurde von `["initial","false","true"]` auf `["initial","false","true","simple","final"]` erweitert, wobei DEMO-Zustände nur `initial`, `false`, `true` verwenden und MERODE-Zustände `initial`, `simple`, `final`, kein Konflikt. `Activity.kind` wurde von `["set","create"]` auf `["set","create","end"]` erweitert, weil MERODE `end`-Aktivitäten für Beendigungsereignisse benötigt; der DEMO-Agent erzeugt keine `end`-Aktivitäten, also ändert sich dort nichts. `Region.forEvent` wurde von de facto verpflichtend auf optional geändert, weil MERODE-Regionen keine Pro-Ereignis-Annotation haben.

Der debattierbare Punkt ist die Optionalisierung von `forEvent`: das ist technisch eine Lockerung einer Beschränkung, nicht eine rein additive Ergänzung. In der Praxis schlägt kein DEMO-generiertes PIM deshalb fehl, alle setzen dieses Feld weiterhin. Konzeptuell ist es aber eine Relaxierung, die in LIMITATIONS.md dokumentiert ist.

### DD6 - Der `isMerodeFSM()`-Unterscheider im PSM-Agenten

Der `pim-to-mendix-agent` nutzt eine Hilfsfunktion `isMerodeFSM(sm)`, um MERODE-Zustandsmaschinen von DEMO-Zustandsmaschinen zu unterscheiden und entsprechend verschiedene B-Regeln anzuwenden.

Wenn das PIM beim Mendix-Agenten ankommt, trägt es keine Metadaten mehr über die Quellsprache. Aber die B-Regeln für DEMO-FSMs (B11-B12: Workflow-Generierung) und MERODE-FSMs (B13-B16: Status-Enum und Microflows) sind verschieden.

Die Unterscheidungsfunktion gibt `true` zurück, wenn alle Regionen in der Zustandsmaschine keine `forEvent`-Annotation tragen. DEMO-FSMs setzen `forEvent` immer (eine Region pro Ereignis). MERODE-FSMs tun es nie (eine Region pro Objekttyp, keine Ereignisannotation). Das ist eine strukturelle Eigenschaft der PIM-Kodierung, kein explizites Sprach-Tag.

Ein explizites `sourceLanguage`-Tag im PIM würde AR2 verletzen, weil das PIM ein sprachneutrales Zwischenformat sein soll. Wenn der nachgelagerte Agent wüsste, welche CIM-Sprache das Modell erzeugt hat, würde das die Sprachenisolation aufheben. Die Verwendung einer strukturellen PIM-Eigenschaft als Unterscheidungsmerkmal hält die Isolation intakt.

Bekannte Einschränkung: der Ansatz ist elegant, aber fragil, wenn eine dritte Sprache eine ähnliche FSM-Struktur ohne Ereignisannotationen verwendet. Für den aktuellen Scope (DEMO und MERODE) ist der Diskriminator eindeutig. Ein robusteres Design würde ein explizites `fsmStyle: "orthogonal" | "sequential"`-Feld in der StateMachine-Definition verwenden, was aber eine intrusivere Schema-Änderung wäre.

### DD7 - TypeScript/Node.js für alle Agenten

Alle Agenten sind in TypeScript auf Node.js implementiert. Das Mendix Platform SDK ist TypeScript-nativ, was für den Agenten, der das SDK aufruft, keine echte Alternative lässt. Dieselbe Sprache für alle Agenten zu verwenden reduziert den kognitiven Overhead und ermöglicht das Teilen von Hilfscode (`bus-client.ts`, `agent-utils.ts`). Bzowski [4] hat TypeScript für seine manuellen Transformationen genutzt, was die Anknüpfung an frühere Arbeiten erleichtert. AJV als JSON-Schema-Validator ist im TypeScript-Ökosystem ausgezeichnet.

Python hat gute NLP/KI-Bibliotheken, aber kein Mendix-SDK. Java und Go scheiden aus demselben Grund aus.

### DD8 - Docker Compose für das Deployment

Alle Dienste (MQTT-Broker, API-Server, Agenten) laufen als Docker-Container, orchestriert durch Docker Compose auf einem Raspberry Pi 4. Docker Compose liefert eine reproduzierbare, versionierte Deployment-Konfiguration. Einen neuen Agenten hinzuzufügen bedeutet, einen Service-Block in `docker-compose.yml` einzufügen. Das ist ein konkreter Indikator für den Aufwand "neue Sprache hinzufügen".

Der Raspberry Pi als Zielplattform demonstriert, dass das System leichtgewichtig ist und keine schwere Infrastruktur erfordert.

### DD9 - Retained MQTT-Nachrichten

Alle veröffentlichten Artefakte verwenden das MQTT-Flag `retain: true`. Ohne Retained Messages würde ein Agent, der sich nach einer Veröffentlichung verbindet, nichts empfangen und den aktuellen Busstatus nicht kennen. Mit Retained Messages wirkt der Broker wie ein persistenter Zustandsspeicher. Ein frisch gestarteter `pim-to-mendix-agent` empfängt sofort das aktuelle PIM für jedes Artefakt. Das macht den Bus semantisch bedeutsam: er repräsentiert den zuletzt vereinbarten Zustand jedes Artefakts, nicht nur einen flüchtigen Kommunikationskanal.

### DD10 - `X-Input-Format`-Header für die Sprachauswahl

Der API-Server dispatcht basierend auf dem Header `X-Input-Format` (Werte: `demo` oder `merode`) an den richtigen CIM-Schema-Validator und das richtige MQTT-Topic. Eine automatische Spracherkennung aus der Modellstruktur wurde verworfen, weil zwei Sprachen strukturelle Gemeinsamkeiten haben können, die eine zuverlässige Erkennung erschweren. Ein expliziter Header ist einfacher und klarer.

### DD11 - Mehrfach-Abonnement im Mendix-Agenten

Der `pim-to-mendix-agent` abonniert PIM-Artefakte von allen CIM-Agenten, nicht nur vom DEMO-Agenten. Der ursprüngliche Prototyp hatte `SOURCE_AGENT_ID = "demo-to-pim-agent"` hartcodiert. Als MERODE hinzugefügt wurde, empfing der Mendix-Agent zwar MERODE-PIM-Nachrichten, ignorierte sie aber, weil er nur das DEMO-Agenten-Topic abonniert hatte.

Die Lösung war eine Umgebungsvariable `PIM_PUBLISHER_AGENT_IDS` (Standardwert: `"demo-to-pim-agent,merode-to-pim-agent"`), aus der beim Start alle Agenten-IDs ausgelesen werden. Das ist eine Änderung am Mendix-Agenten und damit für die Extensibilitätsbehauptung relevant, was in EXTENSIBILITY_EVIDENCE.md diskutiert wird.

### DD12 - Hard-Delete für MERODE-Beendigungsereignisse

Das pimUML-Konstrukt `activity.kind = "end"` (M8) wird auf einen Mendix-`DeleteObjectAction`-Microflow abgebildet: das Objekt wird physisch aus der Datenbank gelöscht.

Snoeck (Kap. 4.4) sagt: "the END event is the last event in which an object participates. After the END event the object no longer exists in the business domain." Das legt physische Nicht-Existenz nahe. Drei Alternativen wurden erwogen.

Soft-Delete (Status-Attribut auf `final` setzen): Das Status-Attribut aus B13 würde als "Tombstone" genutzt. Vorteil: Datenverlust durch versehentliches Löschen vermeidbar, historische Daten bleiben erhalten. Nachteil: alle Abfragen müssten um `status != final`-Filter erweitert werden; das erfordert Applikationslogik, die über den Prototyp-Scope hinausgeht.

Archivierung (in Archivtabelle verschieben): In produktiven Mendix-Apps gängige Praxis. Erfordert eine Archiv-Entity pro Objekttyp — zu aufwändig für den Prototyp.

Hard-Delete über `DeleteObjectAction` wurde gewählt, weil es Snoecks Semantik am direktesten abbildet und keine zusätzliche Infrastruktur erfordert. Der Preis ist, dass Mendix Cascade-Delete greift: wenn Dependents noch existieren, schlägt die Löschung fehl. Das ist kein Fehler, sondern die korrekte Enforcemet der Existenzabhängigkeit (ein Rental kann nicht gelöscht werden, solange RentalLines existieren).

Für eine produktive Applikation wäre Soft-Delete oder Archivierung die bessere Wahl. Die Einschränkung ist in LIMITATIONS.md dokumentiert.

---

## 3. Implementierungsdetails ohne Architekturcharakter

Einige Entscheidungen sind pragmatisch und brauchen keine Thesis-Level-Rechtfertigung, werden aber der Vollständigkeit halber festgehalten.

Der logische Bezeichner heißt `${ot.name}ID` statt `id`, weil Mendix `id` als reservierten Systemfeldnamen behandelt (CE7247). Enum-Literale in Microflow-Ausdrücken werden ohne Anführungszeichen geschrieben (`Module.Enum.Value`), weil Mendix keine gequoteten Enum-Referenzen akzeptiert (CE0117). Enum-Werte bekommen automatisch einen englischen Caption mit großgeschriebenem ersten Buchstaben, weil Mendix mindestens einen Sprachcaption verlangt und sonst CW0263 wirft. Für MERODE-FSMs wird keine Mendix-Workflow-Generierung durchgeführt, weil MERODE-Regionen kein `forEvent` tragen und die Workflow-Generierung sonst `Wait_undefined` produziert.
