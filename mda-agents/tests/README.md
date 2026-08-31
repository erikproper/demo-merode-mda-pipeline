# tests/

Testdaten und Skripte für die DEMO→pimUML-Transformationspipeline.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `rent-a-car-demo.json` | **Eingabe** — valides DEMO Fact Model (Rent-A-Car, Thesis Abschnitt 6.4 + Appendix G) |
| `test-transform.ts` | **Offline-Test** — Transformation ohne MQTT-Broker, schreibt `rent-a-car-pim.json` |
| `pim-subscriber.ts` | **Bus-Utility** — abonniert `model.pim.created`, schreibt `rent-a-car-pim-from-bus.json` |
| `rent-a-car-pim.json` | *Generiert* durch `test:transform` — nicht versioniert (.gitignore) |
| `rent-a-car-pim-from-bus.json` | *Generiert* durch `pim-subscriber` — nicht versioniert (.gitignore) |
| `rent-a-car-pim-full.json` | **Eingabe** — vollständige pimUML-Fixture für `test-sql-agent.ts` (Enums, DataTypes, AssociationClass, Generalisierung, Assoziationen, orthogonale FSM) |
| `test-sql-agent.ts` | **Offline-Test** — `pim-to-sql-agent`, ein Fall pro S-Regel + End-to-End-Lauf, schreibt `../output/rent-a-car.sql` |
| `../output/*.sql` | *Generiert* durch `test-sql-agent.ts` bzw. `pim-to-sql-agent` im Live-Betrieb — nicht versioniert (.gitignore) |

---

## pim-to-sql-agent — DDL-Ausführungsnachweis gegen echtes PostgreSQL

Die von `pim-to-sql-agent` erzeugte DDL soll nicht nur syntaktisch plausibel aussehen,
sondern nachweislich fehlerfrei gegen eine echte PostgreSQL-Instanz laufen. Dafür reicht
ein Wegwerf-Container (kein Eintrag in `docker-compose.yml`, kein persistenter State):

```bash
# 1. DDL erzeugen (schreibt mda-agents/output/rent-a-car.sql)
cd mda-agents && npx ts-node tests/test-sql-agent.ts

# 2. Wegwerf-Postgres starten
docker run -d --name sql-proof -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine

# 3. warten, bis Postgres bereit ist
until docker exec sql-proof pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# 4. generierte DDL ausführen
docker exec -i sql-proof psql -U postgres < output/rent-a-car.sql

# 5. Ergebnis prüfen (sollte alle CREATE-TABLE-Namen aus output/rent-a-car.sql auflisten)
docker exec sql-proof psql -U postgres -c '\dt'

# 6. aufräumen
docker rm -f sql-proof
```

Kein Fehler in Schritt 4 = Ausführbarkeitsnachweis erbracht. Dieser Test ist bewusst
nicht Teil von `test-sql-agent.ts`, da er einen laufenden Docker-Daemon voraussetzt und
damit nicht in jeder Umgebung (z. B. CI ohne Docker) lauffähig wäre.

---

## rent-a-car-demo.json — Abdeckung

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
