# Prototype ToDo-Liste

Stand: 2026-07-28. Priorisiert nach Relevanz für die Thesis (Kap. 8 + 9 benötigen Evaluation).

---

## Priorität 1 — Evaluation (Blocker für Thesis-Kapitel 8 + 9)

- [ ] **DEMO-Evaluation** — Ground Truth aus `mda-agents/tests/rent-a-car-mock.json` extrahieren, Pipeline laufen lassen (`X-Input-Format: demo`), Elemente klassifizieren (Correct / Missing / Incorrect / Added), Metriken berechnen. Vorlage: `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 3.
- [ ] **MERODE-Evaluation** — Ground Truth-Tabelle in `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 2 ausfüllen (alle "noch zu prüfen"-Felder), Pipeline laufen lassen (`X-Input-Format: merode`), klassifizieren.
- [ ] **Mendix Studio Pro öffnen** — generiertes Modell in Studio Pro laden, Screenshot vom Fehlerbereich machen, CE/CW-Zählung dokumentieren → Schema Validation Rate (SVR = 100%) nachweisen.
- [ ] **Traceability Coverage** — `_trace`-Array aus MERODE-PIM-Nachricht (MQTT retained message oder Konsolenausgabe) extrahieren, NotMapped-Einträge zählen, Coverage-Prozentsatz berechnen.

---

## Priorität 2 — Implementierung (verbessert Evaluationsergebnis)

- [ ] **M9 — Ereignispropagierung** — Propagierungshülle aus EDG aufbauen, für jedes abhängige Ereignis die Hauptobjekttypen traversieren, M-Rollen-Übergänge in FSMs einfügen. Erhebt MERODE-Completeness von ~73% auf ~100%. Akademisch wichtigste offene Regel. Spec: `thesis-notes/LIMITATIONS.md` Abschnitt 1, `MerodeMappingRules.md` M9.
- [ ] **B16 — End-Microflow fertigstellen** — aktuell nur Stub mit Parameter-Knoten. Design-Entscheidung treffen: Hard-Delete (`DeleteObjectAction`) oder Soft-Delete (Status-Attribut setzen). Aufwand gering nach Entscheidung.
- [ ] **M3 — Attributdomänen** — `merode-schema.json` um `domainTypes`-Array erweitern (analog zu DEMOs `valueTypes`), Enumerations/DataTypes im Agenten erzeugen. Niedrige Prio: Rent-A-Car hat nur String-Attribute, kein Effekt auf aktuelle Evaluation.

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
  -d @mda-agents/tests/rent-a-car-mock.json

# MERODE
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
