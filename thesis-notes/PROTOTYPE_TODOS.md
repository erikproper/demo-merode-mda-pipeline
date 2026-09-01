# Prototype ToDo-Liste

Stand: 2026-09-01. Priorisiert nach Relevanz für die Thesis (Kap. 8 + 9 benötigen Evaluation).

---

## Priorität 1 - Evaluation (Blocker für Thesis-Kapitel 8 + 9)

- [ ] **DEMO-Evaluation (QR1 Completeness, QR2 Validity)**
  - **Was:** Ground Truth aus `mda-agents/tests/rent-a-car-demo.json` extrahieren (aktuell:
    3 ValueTypes, 12 EntityTypes, 17 EventTypes, 5 FactTypes - Zahlen per `node -e`-Skript
    gegen die Fixture verifiziert), Pipeline live laufen lassen (`X-Input-Format: demo`,
    Testbefehl s. u.), jedes erzeugte pimUML-Element klassifizieren (Correct / Missing /
    Incorrect / Added), QR1/QR2-Metriken berechnen.
  - **Warum wichtig:** QR1/QR2 sind die zentralen quantitativen Erfolgskriterien aus
    `REQUIREMENTS.md` §4 - ohne sie fehlt Kapitel 8 die Kernaussage "die Pipeline transformiert
    korrekt".
  - **Aktueller Stand:** `thesis-notes/EVAL/FRAMEWORK.md` enthält bereits eine vollständige,
    gegen den echten Transform-Output verifizierte Vorlage/Struktur für diese Auswertung
    (100%/100% als Zielwert dokumentiert). Was fehlt, ist der offizielle, für die Thesis
    zitierfähige Lauf: Live-Pipeline auf dem Pi anstoßen, Output sichern, Klassifikation als
    Tabelle in `EVAL/FRAMEWORK.md` bzw. einem `EVAL/`-Unterordner ablegen.
  - **Nächster Schritt:** curl-Testbefehl ausführen, JSON-Antwort/MQTT-Payload archivieren,
    Element-für-Element-Diff gegen die Ground Truth in einer Tabelle festhalten.

- [ ] **MERODE-Evaluation (QR1 Completeness, QR2 Validity)**
  - **Was:** Analog zur DEMO-Evaluation, aber für `rent-a-car-merode.json` (6 ObjectTypes,
    2 DomainTypes, 5 ExistenceDependencies, 20 BusinessEventTypes). Ground-Truth-Tabelle in
    `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 2 mit den finalen, verifizierten Zahlen füllen
    (M9-Propagation: 45 atomare Aussagen -> 63 Selbst-Transitionen in der aktuellen
    6-ObjectType/3-Hop-Fixture, bereits verifiziert und in `FRAMEWORK.md` dokumentiert).
  - **Warum wichtig:** MERODE ist die zweite CIM-Sprache und damit der Beleg, dass die
    Pipeline nicht nur für DEMO funktioniert, sondern die pimUML-Brücke tatsächlich
    sprachunabhängig trägt (AR2/AR3 in `REQUIREMENTS.md`).
  - **Aktueller Stand:** Rechnerisch verifiziert (`FRAMEWORK.md`), aber noch nicht als
    offizieller Live-Pipeline-Lauf durchgeführt/dokumentiert.
  - **Nächster Schritt:** curl-Testbefehl (MERODE) ausführen, Output klassifizieren, Ergebnis
    in `EVAL/FRAMEWORK.md` einpflegen.

- [ ] **Mendix Studio Pro - Schema Validation Rate (QR3, binär, muss 100% sein)**
  - **Was:** Generiertes Mendix-Modell (aus DEMO- und aus MERODE-Lauf) in Studio Pro öffnen,
    Fehlerbereich ("Errors"-Panel) prüfen, Screenshot machen, Anzahl Consistency
    Errors (CE) und Consistency Warnings (CW) dokumentieren.
  - **Warum wichtig:** QR3 ist laut `REQUIREMENTS.md` §4 binär (0 CE = erfüllt, >0 CE =
    nicht erfüllt) - eine reine JSON-Schema-Validierung reicht nicht, weil Mendix eigene,
    über das pimUML-Schema hinausgehende Konsistenzregeln prüft (z. B. Microflow-Typkompatibilität).
  - **Aktueller Stand:** Noch nicht durchgeführt - erfordert manuellen Schritt in Studio Pro
    (kann nicht headless/pipeline-seitig automatisiert werden).
  - **Nächster Schritt:** Nach DEMO- und MERODE-Live-Lauf jeweils die generierte App in
    Studio Pro öffnen, Screenshot des Errors-Panels für beide Fälle anfertigen.

- [ ] **Traceability Coverage (QR4)**
  - **Was:** `_trace`-Array aus der PIM-Bus-Nachricht extrahieren (MQTT retained message
    auf `model.pim.created`, oder Konsolenausgabe des Agenten), `NotMapped`-Einträge zählen,
    Coverage-Prozentsatz (= (Gesamtelemente - NotMapped) / Gesamtelemente) berechnen -
    getrennt für DEMO- und MERODE-Pfad.
  - **Warum wichtig:** QR4 belegt, dass jede Transformationsentscheidung nachvollziehbar ist
    (wichtig für die methodische Nachvollziehbarkeit/Reproduzierbarkeit, Kap. 9).
  - **Aktueller Stand:** Das `_trace`-Array wird bereits von beiden Transform-Agenten befüllt
    (Code vorhanden), aber die Auswertung/Aggregation als Prozentsatz wurde noch nicht
    durchgeführt.
  - **Nächster Schritt:** Nach den beiden Live-Läufen oben die jeweilige `_trace`-Ausgabe
    sichern und auswerten.

- [ ] **Test-Fidelity-Lücke: Offline-Tests testen nicht die echte Produktionslogik**
  - **Was:** `mda-agents/tests/test-transform.ts` und `mda-agents/tests/smoke-m9-m3.ts` sind
    beide eigenständige, handgeschriebene Teilreimplementierungen der jeweiligen
    Transformationslogik - sie rufen **nicht** die echten `transform()`-Funktionen aus
    `demo-to-pim-agent.ts` bzw. `merode-to-pim-agent.ts` auf. `test-transform.ts` deckt nur
    A3/A5/A12 ab (3 von 12 A-Regeln), nicht A1/A2/A4/A6-A11. `smoke-m9-m3.ts` hat eine
    bekannte Abweichung (`markInvoicePaid` wird fälschlich als Selbst-Transition gerendert).
    Es gibt aktuell **kein** dauerhaft im Repo verankertes Testskript, das die tatsächliche
    Produktionslogik (voller A1-A12- bzw. M1-M9-Funktionsumfang) offline gegen die Fixtures
    validiert - die einzige vollständige Verifikation lief bislang über einmalige,
    session-lokale Wegwerf-Skripte, die nicht committet wurden.
  - **Warum wichtig:** Die in `EVAL/FRAMEWORK.md` dokumentierten Zahlen (z. B. die
    45/63-M9-Propagation) sind zwar korrekt verifiziert, aber die Reproduzierbarkeit dieser
    Verifikation für Dritte (Gutachter, spätere Weiterentwicklung) hängt aktuell nicht an
    einem committeten, wiederholbar ausführbaren Test, sondern an dieser Dokumentation
    selbst. Das ist ein Risiko für die methodische Nachvollziehbarkeit (Kap. 9).
  - **Nächster Schritt (Entscheidung offen):** `transform()` in `demo-to-pim-agent.ts` und
    `merode-to-pim-agent.ts` dauerhaft exportieren (falls noch nicht der Fall) und ein neues,
    committetes Testskript schreiben, das diese echten Funktionen gegen die aktuellen
    Fixtures aufruft und gegen `pimuml-schema.json` validiert - als Ersatz/Ergänzung zu den
    bestehenden Smoke-Tests. Umfang und Zeitpunkt (jetzt vs. erst nach den Live-Evaluationen
    oben) noch nicht entschieden.

---

## Priorität 2 - Implementierung (verbessert Evaluationsergebnis)

- [x] **pim-to-sql-agent - PostgreSQL DDL als zweiter PSM-Output** - neuer Agent (`mda-agents/pim-to-sql-agent.ts`), der dasselbe `model.pim.created`-Topic subscribed wie der Mendix-Agent und daraus PostgreSQL-DDL generiert (S1-S12, vollständige Regeltabelle: `thesis-notes/SqlMappingRules.md`). Kein bestehender Core-Code geändert (`bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `pimuml-schema.json` - 0 Änderungen), realer Extensibilitätsnachweis für QR5 (`thesis-notes/EXTENSIBILITY_EVIDENCE.md` Abschnitt 5). Output: `mda-agents/output/<modelname>.sql`, Ausführbarkeitsnachweis gegen echtes PostgreSQL via Wegwerf-Docker-Container (Prozedur: `mda-agents/tests/README.md`). Bus-Anbindung (`docker-compose.yml`-Service, `package.json`-Script) implementiert 2026-08-31.

- [x] **M9 - Ereignispropagierung** - Propagierungshülle aus EDG aufgebaut, Self-Transitionen in Master-FSMs eingefügt (`Set_<Master>_<evt>` Aktivitaten). Erhebt MERODE-Completeness auf ~100%. Implementiert 2026-08-03.
- [x] **B16 - End-Microflow** - Hard-Delete via `DeleteObjectAction`: Parameter (Entität) -> DeleteAction -> End. Design-Entscheidung: physische Löschung als bewusste Vereinfachung für den Prototyp (DD12 in DESIGN_DECISIONS.md). Implementiert 2026-08-03.
- [x] **M3 - Attributdomänen** - `merode-schema.json` um `domainTypes`-Array erweitert, `MerodeDomainType`-Interface in `types.ts`, kategorische Domänen -> Enumeration, nicht-kategorische -> DataType. `CarGroup`-Beispiel im Rent-A-Car-Fixture. Implementiert 2026-08-03.
- [x] **Bug: doppelte Create_OT/End_OT-Aktivitäten** - Dedup-Guard in M6/M8 (`smActivities.some(...)`) verhindert Mehrfacheinträge wenn ein OT mehrere C- oder E-Ereignisse hat. Behoben 2026-08-03.
- [x] **Bug: nicht-kategorischer DataType -> String-Fallback** - DataType-typisierte Attribute werden jetzt als Associations statt als String-Attribute umgesetzt (B4+B9). Behoben 2026-08-03.
- [x] **DEMO/MERODE-Fixtures angereichert** - `rent-a-car-demo.json`/`rent-a-car-merode.json` so erweitert, dass jede A-/M-Regel mindestens einmal ausgelöst wird (Grundlage für die Priorität-1-Evaluationsläufe oben). Implementiert 2026-08-31.

---

## Housekeeping / Doku-Konsistenz

- [x] **`mda-agents/README.md` war stark veraltet** - zeigte nur `demo-to-pim-agent.ts` als
  implementiert, `pim-to-mendix-agent.ts` als "[geplant]", MERODE/SQL-Agenten fehlten
  komplett; A2 fälschlich als `PrimitiveType` statt `DataType` gemappt. Korrigiert
  2026-09-01, Regeltabellen jetzt nur noch zentral in `MAPPING_NOTES.md` gepflegt.
- [x] **`mda-agents/tests/README.md` beschrieb eine obsolete DEMO-Fixture** - "Abdeckung"-
  und "Bekannte Abweichungen"-Abschnitte bezogen sich auf eine strukturell andere,
  frühere Fixture-Iteration (u. a. Entities `Year`, `RentalYear`, `ManagingDay`,
  `YearlyCarGroup`, die im aktuellen Fixture nicht mehr existieren). Korrigiert 2026-09-01
  mit den aktuellen, verifizierten Fixture-Kennzahlen.
- [ ] **Lokale Projektnotiz referenziert eine nicht existierende `BUILD_FAHRPLAN.md`** -
  eine lokale, nicht versionierte Notizdatei verweist auf `./BUILD_FAHRPLAN.md` als
  "Detaillierter Bauplan", diese Datei existiert aber nirgends im Repo (geprüft per
  `find`, 2026-09-01). Die tatsächlich gepflegte Planungsdatei ist diese hier
  (`thesis-notes/PROTOTYPE_TODOS.md`). Betrifft nur lokale Arbeitsorganisation, nicht das
  Repo selbst - Referenz bei Gelegenheit entfernen oder auf `PROTOTYPE_TODOS.md` umbiegen.

---

## Future Work (kein Scope mehr für diese Thesis)

- [ ] **Tool-Anbindung** - Konverter von realen Tool-Exporten nach `demo-schema.json` / `merode-schema.json`:
  - **YADM-Export** - Marien schickt Export-Format, ggf. Konverter von YADM-JSON nach `demo-schema.json` bauen.
  - **Sparx XMI** - Social Housing und Desperados als zusätzliche Testfälle, Marienschen Rekonstruktionsskript prüfen.
  - **Merlin .mxp** - Format analysieren, ggf. Konverter nach `merode-schema.json` bauen.

- [ ] **Dritter CIM-Agent (ER-Diagramm)** - ursprünglich als formaler Extensibilitätsnachweis E1-E2 geplant, aber durch den tatsächlich gebauten `pim-to-sql-agent` (siehe oben, Priorität 2) als realen PSM-seitigen Extensibilitätsnachweis ersetzt (`thesis-notes/EXTENSIBILITY_EVIDENCE.md` Abschnitt 5). Ein zusätzlicher dritter CIM-Agent bliebe als natürlicher nächster Schritt, ist aber kein Scope mehr für diese Thesis.

- [ ] **B-neu: Generische Page-Inhalte** - Aktuell werden Overview-Pages nur als leeres Gerüst (Name + Layout + Navigation-Eintrag) generiert. Folgendes soll automatisch aus dem PIM-Modell abgeleitet werden, ohne Hardcoding auf ein konkretes Beispiel:

  - **Overview-Page je Entity:** DataGrid mit allen nicht-abgeleiteten Attributen als Spalten. Kein manueller Aufbau nötig.
  - **Detail-Page je Entity:** DataView (Datenquelle: Objekt aus Navigation-Kontext) mit einem Input-Widget pro Attribut (TextBox für String/Integer, DatePicker für Date, Dropdown für Enum-Attribute). Save-Button der ein Commit ausführt.
  - **Workflow-Trigger-Button je Entity mit FSM:** Auf der Detail-Page einen Button "Start [EntityName] Workflow" generieren, der:
    1. Zuerst ein `CommitObjectAction` ausführt (Fix für "Only committed persistent objects can be used to start a workflow")
    2. Dann den generierten `ACR_<EntityName>`-Microflow aufruft
    Der Button soll nur generiert werden wenn für die Entity ein Workflow (`WF_<EntityName>`) existiert - also bei DEMO-Entities mit `stateMachines`-Eintrag. Kein Button für Entities ohne FSM.
  - **Neue-Objekt-Button auf Overview-Page:** "New [EntityName]"-Button der ein leeres Objekt erstellt, committed und zur Detail-Page navigiert.

  **Warum:** Getestet am 2026-08-21. Pages waren zwar technisch korrekt im Modell vorhanden, aber vollständig leer - kein Inhalt, keine Interaktion möglich ohne manuellen Aufbau in Studio Pro.

---

## Testbefehl

```bash
# DEMO
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-demo.json

# MERODE
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
