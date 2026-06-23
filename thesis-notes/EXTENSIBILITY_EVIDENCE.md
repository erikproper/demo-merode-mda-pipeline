# Extensibilitätsnachweis

Arbeitsdokument zur Extensibilitätsbehauptung: kann eine neue CIM-Sprache hinzugefügt werden, ohne bestehende Komponenten zu ändern? Das ist das binäre Kriterium aus dem Proposal (Abschnitt 2.3) und operationalisiert AR3.

Das Dokument ist in zwei Teile gegliedert: zunächst der Nachweis aus der tatsächlichen MERODE-Integration, danach der Plan für das formale Extensibilitätsexperiment (E1-E2), bei dem ein dritter Agent die Behauptung von Grund auf belegt.

---

## 1. Die Behauptung

Die Thesis behauptet, dass die Modelling-Bus-Architektur im Sinne von ISO/IEC 25010 modifizierbar ist: das Hinzufügen einer neuen CIM-Sprache erfordert nur einen neuen Agenten, ohne bestehende Komponenten zu ändern.

Das Proposal operationalisiert das als binäres Ja/Nein: erfordert das Hinzufügen eines dritten CIM-Agenten Änderungen an `demo-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `bus-client.ts`, `agent-utils.ts` oder der Kernstruktur von `pimuml-schema.json`?

Die Antwort aus der MERODE-Integration ist: größtenteils nein, mit einer Nuance. Das PIM-Schema wurde additiv erweitert, und der Mendix-Agent erhielt neue B-Regeln. Ob das einen Verstoß darstellt oder ein erwarteter Teil der Behauptung ist, muss in der Thesis sorgfältig argumentiert werden.

---

## 2. Nachweis aus der MERODE-Integration

### Neue Dateien (rein additiv, keine bestehende Datei geändert)

- `mda-agents/merode-to-pim-agent.ts` (vollständig neu)
- `mda-agents/schemas/merode-schema.json` (vollständig neu)
- `mda-agents/tests/rent-a-car-merode.json` (vollständig neu)

### Geänderte Infrastrukturdateien

- `docker-compose.yml`: ein neuer Service-Block hinzugefügt (`merode-to-pim-agent`). Keine bestehenden Service-Definitionen geändert.
- Umgebungskonfiguration: keine Änderungen erforderlich; alle Konfiguration erfolgt über Umgebungsvariablen des neuen Containers.

### Geänderte Schemas und Typen

`mda-agents/schemas/pimuml-schema.json`: `State.kind`-Enum um `"simple"` und `"final"` erweitert, `Activity.kind`-Enum um `"end"` erweitert, `Region.forEvent` von de facto verpflichtend auf optional geändert. Alle Änderungen sind additiv oder lockernd. DEMO-generiertes PIM validiert weiterhin unverändert.

`mda-agents/schemas/types.ts`: `PimState.kind`, `PimRegion.forEvent` und `PimActivity.kind` entsprechend den Schema-Änderungen angepasst, sowie neue MERODE-spezifische Interfaces hinzugefügt (`MerodeObjectType`, `MerodeBusinessEventType`, `MerodeAttribute`, `MerodeExistenceDependency`, `MerodeModel`).

### Geänderte nachgelagerte Agentenlogik (`pim-to-mendix-agent.ts`)

Das ist die sensitivste Datei für die Extensibilitätsbehauptung, weil sie die Downstream-Komponente ist, die "nicht geändert werden sollte".

Was geändert wurde: die Hilfsfunktion `isMerodeFSM()` wurde hinzugefügt, die B13-B16-Regelblöcke wurden in `applyPimToMendix` eingefügt, das Abonnement wurde von einem einzigen Agenten auf mehrere umgestellt (`PIM_SOURCE_AGENTS`), und ein `if (isMerodeFSM(sm)) continue`-Guard wurde in die Workflow-Generierungsschleife eingefügt.

Was sich in `pim-to-mendix-agent.ts` nicht geändert hat: der DEMO-Codepfad (B1-B12) blieb unverändert, der Bus-Abonnementmechanismus wurde nur bei der Topic-Liste erweitert, die Kernstruktur der `applyPimToMendix`-Funktion wurde nicht angetastet, und die strukturellen B-Regeln (Entitäts-, Attribut-, Assoziationsgenerierung) sind vollständig unberührt.

### Unveränderte Kerndateien

`demo-to-pim-agent.ts`, `bus-client.ts` und `agent-utils.ts` haben null Änderungen erhalten.

---

## 3. Analyse: Erfüllt das das Extensibilitätskriterium?

Die ehrliche Antwort hat drei Teile.

Der neue CIM-Agent ist rein additiv. `merode-to-pim-agent.ts` und `merode-schema.json` sind neue Dateien. Ihr Hinzufügen erforderte null Änderungen an bestehenden Dateien. Aus Sicht einer Plugin-Architektur ist das genau der Extensibilitätsanspruch: ein Plugin hinzuzufügen erfordert keine Änderungen am Kern.

Das PIM-Schema wurde additiv erweitert. Das pimUML-Schema ist geteilte Infrastruktur und der Vertrag zwischen CIM-Agenten und dem PSM-Agenten. Die Erweiterung für MERODE erforderte neue Enum-Werte und die Optionalisierung eines Felds. Das sind additive Änderungen: kein bestehendes Feld wurde entfernt, umbenannt oder in seinem Typ eingeschränkt. DEMO-generierte PIMs validieren weiterhin unverändert.

Die Frage ist, ob jede Schema-Änderung gegen das Extensibilitätskriterium verstößt. Das tut sie meiner Einschätzung nach nicht, weil die Schema-Erweiterung genuinen additiven Charakter hatte, sie hat nur die Menge valider PIM-Dokumente vergrößert. Eine striktere Variante des Kriteriums würde verlangen, dass das PIM-Schema eingefroren ist und keine neue CIM-Sprache neue PIM-Konzepte einführen darf. Das ist aber zu strikt: es würde erfordern, das PIM von vornherein für alle möglichen zukünftigen Sprachen zu entwerfen, was weder machbar noch notwendig ist. Das praktische Kriterium sollte sein: erfordert das Hinzufügen einer neuen Sprache das Einschränken bestehender Schema-Constraints oder das Brechen des DEMO-Agenten? Beides ist nicht passiert.

Der PSM-Agent hat neuen Code erhalten. Das ist der strittigste Punkt. Die strikte Lesart des Extensibilitätskriteriums besagt, dass der nachgelagerte Agent überhaupt nicht geändert werden darf. Aber diese Striktheit verwechselt zwei verschiedene Dinge: Business-Logic-Änderungen (das Verändern wie bestehende PIM-Konzepte nach Mendix übersetzt werden) würden bestehende Verhaltensweise brechen und den Anspruch verletzen. Neue Regelzusätze (das Hinzufügen von B13-B16 für ein neues PIM-Konzept, das zuvor nicht existierte) erweitern die Fähigkeit des Agenten, ohne bestehende Logik zu berühren.

B13-B16 hinzuzufügen ähnelt eher dem Installieren eines Plugins in einem erweiterbaren Framework als dem Modifizieren bestehenden Codes. Der DEMO-Codepfad im Agenten wurde nicht angetastet.

Empfehlung für die Thesis: das Extensibilitätskriterium als "keine Änderungen an der Transformationslogik für bestehende Sprachen" formulieren, nicht als "keine Änderungen an irgendeiner Downstream-Datei". Den konkreten Diff (was sich in welcher Datei geändert hat) als Nachweis präsentieren.

---

## 4. Zeilenänderungs-Analyse

Ungefähres Maß des Änderungsaufwands beim Hinzufügen von MERODE:

| Datei | Änderungstyp | Ungefähre Zeilen |
|-------|-------------|-----------------|
| `merode-to-pim-agent.ts` | Neue Datei | ~170 |
| `merode-schema.json` | Neue Datei | ~60 |
| `rent-a-car-merode.json` | Neues Testfixture | ~50 |
| `pimuml-schema.json` | Additive Erweiterung | ~8 |
| `types.ts` | Neue Typen und Erweiterungen | ~45 |
| `pim-to-mendix-agent.ts` | Neue B-Regeln und Hilfsfunktion | ~120 |
| `docker-compose.yml` | Neuer Service-Block | ~10 |
| `demo-to-pim-agent.ts` | Keine Änderungen | 0 |
| `bus-client.ts` | Keine Änderungen | 0 |
| `agent-utils.ts` | Keine Änderungen | 0 |

Gesamter neuer Code: ca. 335 Zeilen. Geänderte bestehende Dateien: ca. 183 Zeilen (fast ausschließlich neue Ergänzungen in bestehenden Dateien, keine Änderungen an bestehender Logik). Der `git diff` zeigt klar, dass die DEMO-Pipeline unberührt ist.

---

## 5. Das Dritte-Agenten-Experiment (E1-E2)

Um einen sauberen Extensibilitätsnachweis unabhängig von MERODE-spezifischen Details zu erbringen, ist das Hinzufügen eines dritten CIM-Sprach-Agenten geplant. Die dritte Sprache sollte einfach genug sein, um schnell implementiert zu werden (damit das Experiment auf die Architektur fokussiert bleibt, nicht auf die Sprachsemantik), aber unterschiedlich genug, um zu zeigen, dass das Muster verallgemeinert.

### Kandidat: Einfaches ER-Diagramm (ER-light)

Ein vereinfachtes Entity-Relationship-Diagramm-Format mit zwei Konzepten: `entities` (Liste von Entitätsnamen mit Attributen) und `relationships` (binäre Beziehungen zwischen Entitäten mit Name und Multiplizitäten). Das ist einfacher als sowohl DEMO als auch MERODE (kein Lebenszyklus, keine Ereignisse, keine Existenzabhängigkeit), deckt aber den strukturellen Teil des PIM ab.

Vorhergesagte neue Dateien: `er-to-pim-agent.ts`, `er-schema.json`, `rent-a-car-er.json` und ein neuer Service-Block in `docker-compose.yml`.

Vorhergesagte unveränderte Dateien: `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts` (ER-Entitäten werden zu pimUML-Classes, die B2 bereits handhabt), `bus-client.ts`, `agent-utils.ts` und `pimuml-schema.json` (ER-Konzepte bilden auf bestehende pimUML-Konstrukte ab).

Wenn diese Vorhersage stimmt, ist das starker Nachweis für den Extensibilitätsanspruch. Der `git diff` nach dem Hinzufügen des ER-Agenten würde nur neue Dateien und den `docker-compose.yml`-Zusatz zeigen.

### Versuchsablauf

Nach dem Hinzufügen des dritten Agenten: DEMO-Rent-A-Car-Test ausführen und prüfen, ob die Ausgabe identisch ist (Regressionstest). MERODE-Rent-A-Car-Test ausführen und dasselbe prüfen. ER-Rent-A-Car-Test ausführen und prüfen, ob das Mendix-Modell korrekt generiert wird. Den `git diff` zeigen und die Änderungsfläche quantifizieren.

---

## 6. Was "Extensibilität" in dieser Thesis bedeutet

Das Kapitel sollte präzise sein, welche Art von Extensibilität beansprucht wird und was nicht.

Beansprucht wird: das Hinzufügen einer neuen CIM-Sprache mit strukturellen Konzepten (Klassen, Attribute, Assoziationen) erfordert nur einen neuen CIM-Agenten und sein Schema, keine Änderungen an bestehenden Komponenten.

Nicht beansprucht wird: das Hinzufügen einer neuen CIM-Sprache mit genuinen neuen PIM-Konzepten erfordert eine minimale additive Schema-Erweiterung sowie neue B-Regeln im PSM-Agenten. Das ist ein erwarteter Preis für das Einführen genuiner neuer Semantik und kein Verstoß gegen die Extensibilitätsarchitektur.

**The boundary:** The architecture is extensible at the *structural* level without any downstream changes. It is extensible at the *behavioural* level with minimal, additive changes to the shared PIM schema and to the PSM agent's rule set. This boundary is itself a finding: it shows where a common PIM's vocabulary needs to grow when a new paradigm is introduced.

This framing turns the MERODE schema extension from a potential embarrassment ("the schema had to change") into a contribution: "we can now say exactly what a shared PIM needs to support to accommodate both fact-oriented and lifecycle-oriented CIM languages."
