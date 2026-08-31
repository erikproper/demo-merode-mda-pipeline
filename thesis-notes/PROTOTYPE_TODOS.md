# Prototype ToDo-Liste

Stand: 2026-07-28. Priorisiert nach Relevanz für die Thesis (Kap. 8 + 9 benötigen Evaluation).

---

## Priorität 1 - Evaluation (Blocker für Thesis-Kapitel 8 + 9)

- [ ] **DEMO-Evaluation** - Ground Truth aus `mda-agents/tests/rent-a-car-demo.json` extrahieren, Pipeline laufen lassen (`X-Input-Format: demo`), Elemente klassifizieren (Correct / Missing / Incorrect / Added), Metriken berechnen. Vorlage: `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 3.
- [ ] **MERODE-Evaluation** - Ground Truth-Tabelle in `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 2 ausfüllen (alle "noch zu prüfen"-Felder), Pipeline laufen lassen (`X-Input-Format: merode`), klassifizieren.
- [ ] **Mendix Studio Pro öffnen** - generiertes Modell in Studio Pro laden, Screenshot vom Fehlerbereich machen, CE/CW-Zählung dokumentieren -> Schema Validation Rate (SVR = 100%) nachweisen.
- [ ] **Traceability Coverage** - `_trace`-Array aus MERODE-PIM-Nachricht (MQTT retained message oder Konsolenausgabe) extrahieren, NotMapped-Einträge zählen, Coverage-Prozentsatz berechnen.

---

## Priorität 2 - Implementierung (verbessert Evaluationsergebnis)

- [x] **pim-to-sql-agent - PostgreSQL DDL als zweiter PSM-Output** - neuer Agent (`mda-agents/pim-to-sql-agent.ts`), der dasselbe `model.pim.created`-Topic subscribed wie der Mendix-Agent und daraus PostgreSQL-DDL generiert (S1-S12, vollständige Regeltabelle: `thesis-notes/SqlMappingRules.md`). Kein bestehender Core-Code geändert (`bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts`, `pim-to-mendix-agent.ts`, `pimuml-schema.json` - 0 Änderungen), realer Extensibilitätsnachweis für QR5 (`thesis-notes/EXTENSIBILITY_EVIDENCE.md` Abschnitt 5). Output: `mda-agents/output/<modelname>.sql`, Ausführbarkeitsnachweis gegen echtes PostgreSQL via Wegwerf-Docker-Container (Prozedur: `mda-agents/tests/README.md`). Bus-Anbindung (`docker-compose.yml`-Service, `package.json`-Script) implementiert 2026-08-31.

- [x] **M9 - Ereignispropagierung** - Propagierungshülle aus EDG aufgebaut, Self-Transitionen in Master-FSMs eingefügt (`Set_<Master>_<evt>` Aktivitaten). Erhebt MERODE-Completeness auf ~100%. Implementiert 2026-08-03.
- [x] **B16 - End-Microflow** - Hard-Delete via `DeleteObjectAction`: Parameter (Entität) -> DeleteAction -> End. Design-Entscheidung: physische Löschung als bewusste Vereinfachung für den Prototyp (DD12 in DESIGN_DECISIONS.md). Implementiert 2026-08-03.
- [x] **M3 - Attributdomänen** - `merode-schema.json` um `domainTypes`-Array erweitert, `MerodeDomainType`-Interface in `types.ts`, kategorische Domänen -> Enumeration, nicht-kategorische -> DataType. `FuelType`-Beispiel im Rent-A-Car-Fixture. Implementiert 2026-08-03.
- [x] **Bug: doppelte Create_OT/End_OT-Aktivitäten** - Dedup-Guard in M6/M8 (`smActivities.some(...)`) verhindert Mehrfacheinträge wenn ein OT mehrere C- oder E-Ereignisse hat. Behoben 2026-08-03.
- [x] **Bug: nicht-kategorischer DataType -> String-Fallback** - DataType-typisierte Attribute werden jetzt als Associations statt als String-Attribute umgesetzt (B4+B9). Behoben 2026-08-03.

---

## Priorität 3 - Tool-Anbindung (erst nach Marien-Meeting am 20.08.)

- [ ] **YADM-Export analysieren** - Marien schickt Export-Format, ggf. Konverter von YADM-JSON nach `demo-schema.json` bauen.
- [ ] **Sparx XMI** - Social Housing und Desperados als zusätzliche Testfälle, Marienschen Rekonstruktionsskript prüfen.
- [ ] **Merlin .mxp** - Format analysieren, ggf. Konverter nach `merode-schema.json` bauen.

---

## Future Work (kein Scope mehr für diese Thesis)

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
