# Extensibilitätsnachweis

Arbeitsdokument zur Extensibilitätsbehauptung: kann eine neue CIM-Sprache bzw. ein neues PSM-Ziel hinzugefügt werden, ohne bestehende Komponenten zu ändern? Das ist das binäre Kriterium aus dem Proposal (Abschnitt 2.3) und operationalisiert AR3.

Das Dokument ist in drei Teile gegliedert: zunächst der Nachweis aus der tatsächlichen MERODE-Integration (neuer CIM-Agent), danach der Nachweis aus der tatsächlichen SQL-Agent-Integration (neuer PSM-Agent, Abschnitt 5), zuletzt eine Einordnung, welche Form der Extensibilität damit insgesamt belegt ist.

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

Abgrenzung: diese Aussagen beziehen sich auf den Diff der MERODE-Integration. Unabhängig davon wurde `pim-to-mendix-agent.ts` am 2026-09-14 nach einem Mapping-Review korrigiert: B11/B12 (ein Workflow je DEMO-Region statt eines sequenziellen Workflows, `ACR_<Entity>` als After-Create-Handler mit Commit, DD13) und B15 (Status bei Self-Transitionen). Diese Änderungen betreffen auch den DEMO-Pfad, sind aber Fehlerbehebungen zur Korrektheit bestehender Regeln und keine Folge einer Spracherweiterung. Sie gehen daher nicht in den Extensibilitätsnachweis ein.

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

## 5. Der SQL-Agent als ausgeführtes zweites Extensibilitätsexperiment

Ein ursprünglich geplantes drittes-Agenten-Experiment (ein ER-Diagramm-CIM-Agent, E1-E2) war als formaler, aber rein hypothetischer Nachweis vorgesehen - mit vorhergesagten, nicht tatsächlich verifizierten Dateiänderungen. Dieser Plan wurde durch ein reales, ausgeführtes Experiment ersetzt: `pim-to-sql-agent.ts`, ein zweiter PSM-Agent, der PostgreSQL-DDL statt einer Mendix-App erzeugt. Er konsumiert exakt dasselbe `model.pim.created`-Artefakt wie `pim-to-mendix-agent.ts` und ist damit kein Spielzeug-Format, sondern eine echte, andersartige Zielplattform.

Der SQL-Agent ist ein stärkerer Extensibilitätsnachweis als der geplante ER-Agent aus zwei Gründen: er testet die Behauptung auf der PSM-Seite (bisher nur auf der CIM-Seite durch MERODE belegt), und er wurde tatsächlich gebaut, getestet und gegen echtes PostgreSQL validiert statt nur vorhergesagt.

### Neue Dateien (rein additiv, keine bestehende Datei geändert)

- `mda-agents/pim-to-sql-agent.ts` (vollständig neu, ~310 Zeilen inkl. Bus-Wrapper)
- `mda-agents/tests/test-sql-agent.ts` (vollständig neu, Offline-Test)
- `mda-agents/tests/rent-a-car-pim-full.json` (vollständig neues Testfixture)
- `mda-agents/output/.gitkeep` (leeres Zielverzeichnis für generierte DDL)
- `thesis-notes/SqlMappingRules.md` (vollständig neu)

### Additiv geänderte Infrastrukturdateien

- `docker-compose.yml`: ein neuer Service-Block (`sql-agent`) hinzugefügt, inklusive eines zusätzlichen Volume-Mounts (`./mda-agents/output:/app/output`) für den Datei-Output - die einzige strukturelle Abweichung vom Service-Block-Muster der bestehenden Agenten, begründet durch die Notwendigkeit, generierte `.sql`-Dateien aus dem Container herauszureichen (der Mendix-Agent braucht das nicht, weil sein Output über die Mendix Cloud API geht, kein lokales Dateiartefakt ist). Keine bestehenden Service-Definitionen geändert.
- `mda-agents/package.json`: ein neues Script (`"pim-to-sql-agent"`).
- `.gitignore`: ein neues Pattern (`mda-agents/output/*.sql`) in der bereits bestehenden "Generated pipeline outputs"-Sektion.
- `tests/README.md`: neue Zeilen in der Dateitabelle sowie ein neuer Abschnitt mit einem reproduzierbaren Docker-Kommando für den Ausführbarkeitsnachweis gegen echtes PostgreSQL.

Bewusste Design-Entscheidung: kein permanenter Postgres-Service in `docker-compose.yml`. Der Agent schreibt ausschließlich `.sql`-Dateien; eine echte Datenbank wird nur bei Bedarf als Wegwerf-Container gestartet (dokumentiert in `tests/README.md`). Das hält den permanenten Ressourcen- und Angriffsflächen-Fußabdruck auf dem Raspberry Pi unverändert.

### Unveränderte Kerndateien

`bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `pimuml-schema.json`, `demo-schema.json` und `merode-schema.json` haben null Änderungen erhalten. Das ist der entscheidende Unterschied zur MERODE-Integration (Abschnitt 2): dort musste `pimuml-schema.json` additiv erweitert werden, weil MERODE neue PIM-Konzepte (benannte Lebenszykluszustände) einführte. Der SQL-Agent konsumiert ausschließlich bereits bestehende pimUML-Konstrukte und braucht daher keinerlei Schema-Änderung - nicht einmal eine additive.

### Zeilenänderungs-Analyse

| Datei | Änderungstyp | Ungefähre Zeilen |
|-------|-------------|-----------------|
| `pim-to-sql-agent.ts` | Neue Datei | ~310 |
| `test-sql-agent.ts` | Neues Testskript | ~200 |
| `rent-a-car-pim-full.json` | Neues Testfixture | ~180 |
| `SqlMappingRules.md` | Neue Thesis-Doku | ~165 |
| `docker-compose.yml` | Neuer Service-Block | ~15 |
| `package.json` | Neue Script-Zeile | 1 |
| `.gitignore` | Neue Pattern-Zeile | 1 |
| `tests/README.md` | Neue Abschnitte | ~30 |
| `bus-client.ts` | Keine Änderungen | 0 |
| `agent-utils.ts` | Keine Änderungen | 0 |
| `demo-to-pim-agent.ts` | Keine Änderungen | 0 |
| `merode-to-pim-agent.ts` | Keine Änderungen | 0 |
| `pim-to-mendix-agent.ts` | Keine Änderungen | 0 |
| `pimuml-schema.json` | Keine Änderungen | 0 |

Gesamter neuer Code: ca. 900 Zeilen, verteilt auf ausschließlich neue Dateien. Geänderte bestehende Dateien: ca. 47 Zeilen, ausnahmslos additive Infrastruktur-Ergänzungen (ein neuer Service-Block, ein neues Script, ein neues `.gitignore`-Pattern). Kein bestehendes Core-File wurde angetastet - der `git diff` dieses Arbeitspakets zeigt ausschließlich neue Dateien plus drei einzeilige/kleinteilige additive Ergänzungen.

### Ausführbarkeitsnachweis

Anders als beim Mendix-Pfad (dessen Korrektheit sich nur indirekt über die Schema-Validierungsrate der Mendix-Studio-Pro-Öffnung zeigen lässt) lässt sich die DDL-Korrektheit des SQL-Agenten direkt und maschinell verifizieren: die generierte DDL läuft fehlerfrei gegen eine echte PostgreSQL-Instanz (reproduzierbares Docker-Kommando in `mda-agents/tests/README.md`). Das ist ein strengerer Korrektheitsnachweis als eine reine Struktur-/Schema-Validierung, weil er die tatsächliche Ausführbarkeit auf der Zielplattform demonstriert, nicht nur die syntaktische Plausibilität der Ausgabe.

Korrektur 2026-09-14: der Nachweis lief ursprünglich nur gegen die Fixture `rent-a-car-pim-full.json`. Die DDL aus den echten Pipeline-PIMs (`EVAL/demo-pim-output.json`, `merode-pim-output.json`) enthielt doppelte FK-Spalten und war nicht ausführbar (`LIMITATIONS.md` Abschnitt 5, S8). Der Fix betrifft ausschließlich `pim-to-sql-agent.ts` und seinen Test, also Dateien des neuen Agenten, und ändert die Diff-Aussage oben nicht. Er ist ein nachträglicher Bugfix und nicht Teil des ursprünglichen Erweiterungs-Diffs.

---

## 6. Was "Extensibilität" in dieser Thesis bedeutet

Das Kapitel sollte präzise sein, welche Art von Extensibilität beansprucht wird und was nicht.

Beansprucht wird: das Hinzufügen einer neuen CIM-Sprache mit strukturellen Konzepten (Klassen, Attribute, Assoziationen) erfordert nur einen neuen CIM-Agenten und sein Schema, keine Änderungen an bestehenden Komponenten.

Nicht beansprucht wird: das Hinzufügen einer neuen CIM-Sprache mit genuinen neuen PIM-Konzepten erfordert eine minimale additive Schema-Erweiterung sowie neue B-Regeln im PSM-Agenten. Das ist ein erwarteter Preis für das Einführen genuiner neuer Semantik und kein Verstoß gegen die Extensibilitätsarchitektur.

**The boundary:** The architecture is extensible at the *structural* level without any downstream changes. It is extensible at the *behavioural* level with minimal, additive changes to the shared PIM schema and to the PSM agent's rule set. This boundary is itself a finding: it shows where a common PIM's vocabulary needs to grow when a new paradigm is introduced.

This framing turns the MERODE schema extension from a potential embarrassment ("the schema had to change") into a contribution: "we can now say exactly what a shared PIM needs to support to accommodate both fact-oriented and lifecycle-oriented CIM languages."

Der SQL-Agent (Abschnitt 5) belegt dieselbe Behauptung auf der PSM-Seite, mit einem saubereren Ergebnis: das Hinzufügen eines zweiten, strukturell andersartigen PSM-Ziels für bereits bestehende PIM-Semantik erfordert weder eine Schema-Erweiterung noch Änderungen an einem bestehenden Agenten - nur neue Dateien und additive Infrastruktur. Zusammengenommen zeigen die beiden Experimente die vollständige Grenze: neue *Sprachen* (CIM oder PSM) für bereits abgedeckte PIM-Konzepte sind rein additiv; nur genuin neue PIM-*Konzepte* (wie MERODEs sequenzielle Lebenszyklen) zwingen den gemeinsamen Vertrag zur Weiterentwicklung.
