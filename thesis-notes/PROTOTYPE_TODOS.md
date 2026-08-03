# Prototype ToDo-Liste

Stand: 2026-07-28. Priorisiert nach Relevanz für die Thesis (Kap. 8 + 9 benötigen Evaluation).

---

## Priorität 1 — Evaluation (Blocker für Thesis-Kapitel 8 + 9)

- [ ] **DEMO-Evaluation** — Ground Truth aus `mda-agents/tests/rent-a-car-demo.json` extrahieren, Pipeline laufen lassen (`X-Input-Format: demo`), Elemente klassifizieren (Correct / Missing / Incorrect / Added), Metriken berechnen. Vorlage: `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 3.
- [ ] **MERODE-Evaluation** — Ground Truth-Tabelle in `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 2 ausfüllen (alle "noch zu prüfen"-Felder), Pipeline laufen lassen (`X-Input-Format: merode`), klassifizieren.
- [ ] **Mendix Studio Pro öffnen** — generiertes Modell in Studio Pro laden, Screenshot vom Fehlerbereich machen, CE/CW-Zählung dokumentieren → Schema Validation Rate (SVR = 100%) nachweisen.
- [ ] **Traceability Coverage** — `_trace`-Array aus MERODE-PIM-Nachricht (MQTT retained message oder Konsolenausgabe) extrahieren, NotMapped-Einträge zählen, Coverage-Prozentsatz berechnen.

---

## Priorität 2 — Implementierung (verbessert Evaluationsergebnis)

- [x] **M9 — Ereignispropagierung** — Propagierungshülle aus EDG aufgebaut, Self-Transitionen in Master-FSMs eingefügt (`Set_<Master>_<evt>` Aktivitaten). Erhebt MERODE-Completeness auf ~100%. Implementiert 2026-08-03.
- [x] **B16 — End-Microflow** — Hard-Delete via `DeleteObjectAction`: Parameter (Entität) → DeleteAction → End. Design-Entscheidung: physische Löschung als bewusste Vereinfachung für den Prototyp (DD12 in DESIGN_DECISIONS.md). Implementiert 2026-08-03.
- [x] **M3 — Attributdomänen** — `merode-schema.json` um `domainTypes`-Array erweitert, `MerodeDomainType`-Interface in `types.ts`, kategorische Domänen -> Enumeration, nicht-kategorische -> DataType. `FuelType`-Beispiel im Rent-A-Car-Fixture. Implementiert 2026-08-03.
- [x] **Bug: doppelte Create_OT/End_OT-Aktivitäten** — Dedup-Guard in M6/M8 (`smActivities.some(...)`) verhindert Mehrfacheinträge wenn ein OT mehrere C- oder E-Ereignisse hat. Behoben 2026-08-03.
- [x] **Bug: nicht-kategorischer DataType → String-Fallback** — DataType-typisierte Attribute werden jetzt als Associations statt als String-Attribute umgesetzt (B4+B9). Behoben 2026-08-03.

---

## Priorität 3 — Tool-Anbindung (erst nach Marien-Meeting am 20.08.)

- [ ] **YADM-Export analysieren** — Marien schickt Export-Format, ggf. Konverter von YADM-JSON nach `demo-schema.json` bauen.
- [ ] **Sparx XMI** — Social Housing und Desperados als zusätzliche Testfälle, Marienschen Rekonstruktionsskript prüfen.
- [ ] **Merlin .mxp** — Format analysieren, ggf. Konverter nach `merode-schema.json` bauen.

---

## Future Work (kein Scope mehr für diese Thesis)

- [ ] **Dritter Agent (ER-Diagramm)** — formaler Extensibilitätsnachweis E1-E2. In `thesis-notes/EXTENSIBILITY_EVIDENCE.md` Abschnitt 5 als Future Work dokumentiert. Extensibilitätsnachweis ruht auf MERODE-Integration.

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
