# tests/

Testdaten und Skripte für die DEMO→pimUML-Transformationspipeline.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `rent-a-car-mock.json` | **Eingabe** — valides DEMO Fact Model (Rent-A-Car, Thesis Abschnitt 6.4 + Appendix G) |
| `test-transform.ts` | **Offline-Test** — Transformation ohne MQTT-Broker, schreibt `rent-a-car-pim.json` |
| `pim-subscriber.ts` | **Bus-Utility** — abonniert `model.pim.created`, schreibt `rent-a-car-pim-from-bus.json` |
| `rent-a-car-pim.json` | *Generiert* durch `test:transform` — nicht versioniert (.gitignore) |
| `rent-a-car-pim-from-bus.json` | *Generiert* durch `pim-subscriber` — nicht versioniert (.gitignore) |

---

## rent-a-car-mock.json — Abdeckung

| Element | Anzahl | Quelle |
|---------|--------|--------|
| EntityTypes (declared) | 8 | Table G.1 |
| EntityTypes (derived) | 7 | Table G.1 |
| ValueTypes | 3 | Table G.2 |
| EventTypes | 7 | Table G.3 (KT01–KT07) |
| Generalizations | 5 | Table G.3 |
| Aggregations | 1 | Table G.1 (YearlyCarGroup) |
| PropertyTypes | 14 | Table G.5 |

---

## Bekannte Abweichungen vom Thesis-Modell

1. **CarGroup-Literale** — Die Thesis gibt an, dass `CarGroup` zum Schema-Zeitpunkt
   keine Literalwerte hat. `demo-schema.json` verlangt `minItems: 1` für kategorische
   ValueTypes. Workaround: repräsentative Literale hinzugefügt.

2. **Year als EntityType** — `Year` ist in DEMO ein nicht-kategorischer ValueType,
   hat aber Attribute als Domäne. Das Schema erlaubt Attribute nur auf EntityTypes.
   Workaround: `RentalYear` als declared EntityType, `Year` bleibt als ValueType.

3. **ManagingDay (Regel A8)** — Namenlose Ableitung vom ValueType `Day`.
   Das Schema verlangt EntityType-Namen als Generalization-Eltern.
   Workaround: `ManagingDay` als derived EntityType mit `derivationRule`.

4. **Money / Number** — In DEMO vordefinierte ValueTypes, werden als Strings
   in Attributen referenziert, aber nicht in `valueTypes` deklariert.
