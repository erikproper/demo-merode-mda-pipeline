# tests/

Testdaten und Offline-Skripte für die gesamte Pipeline (DEMO/MERODE -> pimUML -> Mendix/SQL).

**Wichtiger Vorbehalt:** `test-transform.ts` und `smoke-m9-m3.ts` sind eigenständige,
handgeschriebene Teilreimplementierungen der jeweiligen Mapping-Logik - sie rufen **nicht**
die echten `transform()`-Funktionen aus `demo-to-pim-agent.ts`/`merode-to-pim-agent.ts` auf.
`test-transform.ts` deckt nur A3, A5 und A12 ab (Klassen + Attribute + Assoziationen aus
Entity-/Fact-Types), nicht A1/A2/A4/A6-A11. `smoke-m9-m3.ts` bildet die M3/M9-EDG-Propagation
nach, hat aber eine bekannte Abweichung bei `markInvoicePaid` (wird fälschlich als
Selbst-Transition gerendert statt als regulärer Übergang). Beide Skripte sind als schneller
Rauchtest gedacht, nicht als Nachweis der Produktionslogik - der maßgebliche Nachweis ist der
volle Bus-Durchlauf (`mda-agents/README.md`, Option B) bzw. ein Lauf gegen die Live-Pipeline.
Siehe `thesis-notes/PROTOTYPE_TODOS.md` für den aktuellen Stand dieser Einschränkung.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `rent-a-car-demo.json` | **Eingabe** - valides DEMO Fact Model (Rent-A-Car Use Case) |
| `rent-a-car-merode.json` | **Eingabe** - valides MERODE Domain Model (Rent-A-Car Use Case) |
| `test-transform.ts` | **Offline-Smoke-Test** - Teilausschnitt A3/A5/A12 ohne MQTT-Broker, schreibt `rent-a-car-pim-from-bus.json` |
| `smoke-m9-m3.ts` | **Offline-Smoke-Test** - M3/M9-EDG-Propagation ohne MQTT-Broker (bekannte `markInvoicePaid`-Abweichung, s. o.) |
| `pim-subscriber.ts` | **Bus-Utility** - abonniert `model.pim.created`, schreibt `rent-a-car-pim-from-bus.json` |
| `rent-a-car-pim-from-bus.json` | *Generiert* durch `test-transform.ts` bzw. `pim-subscriber` - nicht versioniert (.gitignore) |
| `rent-a-car-pim-full.json` | **Eingabe** - vollständige pimUML-Fixture für `test-sql-agent.ts` (Enums, DataTypes, AssociationClass, Generalisierung, Assoziationen, orthogonale FSM) |
| `test-sql-agent.ts` | **Offline-Test** - `pim-to-sql-agent`, ein Fall pro S-Regel + End-to-End-Lauf, schreibt `../output/rent-a-car.sql` |
| `test-mendix-status.ts` | **Offline-Test** - `resolveStatusTarget()` aus `pim-to-mendix-agent` (B15-Zielzustand, Self-Transitionen lassen den Status unverändert), inline-Fixture + `thesis-notes/EVAL/merode-pim-output.json` |
| `../output/*.sql` | *Generiert* durch `test-sql-agent.ts` bzw. `pim-to-sql-agent` im Live-Betrieb - nicht versioniert (.gitignore) |

---

## pim-to-sql-agent - DDL-Ausführungsnachweis gegen echtes PostgreSQL

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

## rent-a-car-demo.json / rent-a-car-merode.json - aktuelle Abdeckung

Beide Fixtures wurden gezielt so aufgebaut, dass jede A-Regel (DEMO) bzw. M-Regel (MERODE)
mindestens einmal ausgelöst wird (siehe `thesis-notes/EVAL/FRAMEWORK.md` für den vollständigen,
gegen den echten Transform-Output verifizierten Nachweis). Stand: aktueller Fixture-Inhalt.

**rent-a-car-demo.json**

| Element | Anzahl |
|---------|--------|
| ValueTypes | 3 (CarGroup, MoneyAmount, BookingDetail) |
| EntityTypes gesamt (declared + derived) | 12 |
| EventTypes | 17 |
| FactTypes | 5 (RentalHasLines, RentalInvolvesCar, RentalMadeByPerson, RentalPickedUpAt, RentalReturnedAt) |

**rent-a-car-merode.json**

| Element | Anzahl |
|---------|--------|
| ObjectTypes | 6 (Car, Branch, Person, Rental, RentalLine, Invoice) |
| DomainTypes | 2 (CarGroup, MoneyAmount) |
| ExistenceDependencies | 5 |
| BusinessEventTypes | 20 |

Frühere Versionen dieser Datei beschrieben eine strukturell andere, kleinere DEMO-Fixture
(u. a. mit den inzwischen nicht mehr existierenden Entities `Year`, `RentalYear`,
`ManagingDay`, `YearlyCarGroup`). Diese Iteration wurde durch die aktuelle, breiter
abdeckende Rent-A-Car-Fixture ersetzt - die o.g. Workarounds sind damit gegenstandslos
(z. B. hat `CarGroup` inzwischen reguläre, fachlich sinnvolle Literale statt eines
Platzhalter-Workarounds).
