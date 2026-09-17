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
| `rent-a-car-case-demo.json` | **Eingabe** - fallnahes DEMO Fact Model nach Bzowskis Rent-A-Car-Faktmodell (zweite Untersuchungseinheit, keine Regelabdeckung) |
| `rent-a-car-case-merode.json` | **Eingabe** - MERODE-Gegenstück zum fallnahen DEMO-Modell |
| `test-transform.ts` | **Offline-Smoke-Test** - Teilausschnitt A3/A5/A12 ohne MQTT-Broker, schreibt `rent-a-car-pim-from-bus.json` |
| `smoke-m9-m3.ts` | **Offline-Smoke-Test** - M3/M9-EDG-Propagation ohne MQTT-Broker (bekannte `markInvoicePaid`-Abweichung, s. o.) |
| `pim-subscriber.ts` | **Bus-Utility** - abonniert `model.pim.created`, schreibt `rent-a-car-pim-from-bus.json` |
| `rent-a-car-pim-from-bus.json` | *Generiert* durch `test-transform.ts` bzw. `pim-subscriber` - nicht versioniert (.gitignore) |
| `rent-a-car-pim-full.json` | **Eingabe** - vollständige pimUML-Fixture für `test-sql-agent.ts` (Enums, DataTypes, AssociationClass, Generalisierung, Assoziationen, orthogonale FSM) |
| `test-sql-agent.ts` | **Offline-Test** - `pim-to-sql-agent`, ein Fall pro S-Regel + End-to-End-Lauf, schreibt `../output/rent-a-car.sql`, prüft zusätzlich `thesis-notes/EVAL/{demo,merode}-pim-output.json` auf doppelte Spalten und schreibt `../output/rent-a-car-{demo,merode}.sql` |
| `test-mendix-status.ts` | **Offline-Test** - `resolveStatusTarget()` aus `pim-to-mendix-agent` (B15-Zielzustand, Self-Transitionen lassen den Status unverändert), inline-Fixture + `thesis-notes/EVAL/merode-pim-output.json` |
| `test-mendix-workflows.ts` | **Offline-Test** - `planRegionWorkflows()` aus `pim-to-mendix-agent` (B11/B12, ein Workflow je DEMO-Region), gegen `thesis-notes/EVAL/demo-pim-output.json` |
| `dump-mendix-domain.ts` | **Rücklesetest** - liest den Zielzustand über das Platform SDK aus der Mendix-App zurück (rein lesend, kein Commit), schreibt `thesis-notes/EVAL/Eval_new/<name>.mendix.json` |
| `check-mendix-against-input.ts` | **Gegenprüfung** - stellt das zurückgelesene Mendix-Modell gegen das DEMO-/MERODE-Eingabemodell, prüft Entities, Attributtypen, Enum-Literale, Assoziationsrichtung, Generalisierung, Status-Enums und Verhaltensartefakte |
| `../output/*.sql` | *Generiert* durch `test-sql-agent.ts` bzw. `pim-to-sql-agent` im Live-Betrieb - nicht versioniert (.gitignore) |

---

## pim-to-sql-agent - DDL-Ausführungsnachweis gegen echtes PostgreSQL

Die von `pim-to-sql-agent` erzeugte DDL soll nicht nur syntaktisch plausibel aussehen,
sondern nachweislich fehlerfrei gegen eine echte PostgreSQL-Instanz laufen. Dafür reicht
ein Wegwerf-Container (kein Eintrag in `docker-compose.yml`, kein persistenter State):

```bash
# 1. DDL erzeugen (schreibt mda-agents/output/rent-a-car.sql, rent-a-car-demo.sql, rent-a-car-merode.sql)
cd mda-agents && npx ts-node tests/test-sql-agent.ts

# 2. Wegwerf-Postgres starten
docker run -d --name sql-proof -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine

# 3. warten, bis Postgres bereit ist
until docker exec sql-proof pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# 4. jede generierte DDL in einer eigenen Datenbank ausführen (bricht beim ersten Fehler ab)
for f in rent-a-car rent-a-car-demo rent-a-car-merode; do
  db=$(echo $f | tr - _)
  docker exec sql-proof psql -U postgres -c "CREATE DATABASE $db"
  docker exec -i sql-proof psql -U postgres -d $db -v ON_ERROR_STOP=1 < output/$f.sql || echo "FEHLER in $f.sql"
done

# 5. Ergebnis prüfen (listet die Tabellen des MERODE-Skripts)
docker exec sql-proof psql -U postgres -d rent_a_car_merode -c '\dt'

# 6. aufräumen
docker rm -f sql-proof
```

Kein Fehler in Schritt 4 = Ausführbarkeitsnachweis erbracht. Dieser Test ist bewusst
nicht Teil von `test-sql-agent.ts`, da er einen laufenden Docker-Daemon voraussetzt und
damit nicht in jeder Umgebung (z. B. CI ohne Docker) lauffähig wäre.

---

## dump-mendix-domain.ts - unabhängige Gegenprobe des Mendix-Ergebnisses

Die Artefaktzahlen in `thesis-notes/EVAL/FRAMEWORK.md` Abschnitt 8.1 stammen aus dem Log des
`pim-to-mendix-agent` selbst - der Agent berichtet also, was er zu erzeugen glaubt. Dieses
Skript liest den Zielzustand unabhängig davon über das Platform SDK aus dem Team Server zurück
und macht ihn maschinell prüfbar. Es schreibt nichts in die App und committet nichts.

Da `pim-to-mendix-agent.ts` das Modul vor jedem Lauf leert, hält die App immer nur das
Ergebnis des letzten Laufs. Für alle vier Untersuchungseinheiten daher je Modell abwechselnd
anstoßen und zurücklesen:

```bash
# 1. Pipeline anstoßen (läuft auf dem Pi, schreibt in die Mendix-App)
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-demo.json

# 2. warten, bis der mendix-agent "committed to branch" gemeldet hat, dann zurücklesen
cd mda-agents && npx ts-node -r dotenv/config tests/dump-mendix-domain.ts rent-a-car-demo
```

Voraussetzung sind `MENDIX_TOKEN`, `MENDIX_APP_ID`, `MENDIX_MODULE_NAME` und `MENDIX_BRANCH`
in `mda-agents/.env` - dieselben Variablen, die der Agent selbst benutzt. Der Aufruf dauert
rund eine Minute, weil das SDK zuerst eine temporäre Working Copy anlegt.

Die erzeugte JSON-Datei enthält je Entity die Attribute mit ihren Mendix-Typen, je Assoziation
die Richtung (`parent` ist die Viele-Seite, die den Verweis hält) sowie Assoziationstyp und
Owner, dazu alle Enumerations mit ihren Literalen und die Namen aller Microflows, Workflows
und Pages. Mit `--deep` werden zusätzlich alle Microflows geladen und ihre Aktivitätstypen
gezählt - deutlich langsamer, aber nützlich zur Prüfung einzelner B-Regeln.

### Die eigentliche Prüfung

`dump-mendix-domain.ts` liest nur aus. Geprüft wird mit:

```bash
npx ts-node tests/check-mendix-against-input.ts rent-a-car-demo
```

Der Prüfer stellt den Dump **gegen das Eingabemodell**, also gegen `tests/rent-a-car-demo.json`
und nicht gegen das PIM. Damit wird die vollständige Kette CIM -> PIM -> PSM geprüft und nicht
nur ihr letzter Schritt. Geprüft wird jeweils in beide Richtungen, es darf also weder ein
Eingabeelement ohne Entsprechung in Mendix bleiben noch ein Mendix-Artefakt ohne Ursprung im
Eingabemodell stehen:

| Eingabeelement | Erwartung in Mendix |
|----------------|---------------------|
| EntityType / ObjectType | Entity gleichen Namens plus `<Name>ID : Integer` |
| kategorialer ValueType / DomainType | Enumeration mit denselben Literalen in derselben Reihenfolge |
| nicht-kategorialer ValueType / DomainType | eigene Entity (B5) |
| Attribut | Spalte des erwarteten Mendix-Typs, bei nicht-kategorialem Typ stattdessen Assoziation `<Entity>_<Attribut>` |
| Attribut mit `derivationRule` | **keine** Spalte, wird als begründete Auslassung ausgewiesen |
| EventType (DEMO) | Boolean-Spalte mit Vorgabewert `false` (A6) plus `WF_<Entity>_<Ereignis>` und `Set<Entity>_<Ereignis>` |
| FactType | Assoziation, `parent` ist die Rolle mit `upper: "*"`, `child` die Rolle mit `upper: 1` |
| ExistenceDependency | Assoziation, `parent` ist der `dependent`, `child` der `master` |
| Spezialisierung ohne Trigger | Generalisierung Kind -> Eltern (A10) |
| Spezialisierung mit Trigger / abgeleitet | Assoziation `<Kind>IsA<Eltern>`, `parent` ist das Kind (A7, A9) |
| `lifecycleStates` | `<ObjectType>_Status` mit denselben Zuständen plus `status`-Spalte |
| BusinessEventType Rolle C / E / M | `Create_<OT>` / `End_<OT>` / `Set_<OT>_<Ereignis>` |

Die Richtungsprüfung ist der Kern: in Mendix hält die `parent`-Seite einer Reference den
Verweis, sie muss also die Viele-Seite sein. Sind die Seiten vertauscht, liegt der
Fremdschlüssel auf der falschen Entity - der Prüfer meldet das ausdrücklich. Ist ein FactType
beidseitig `upper: "*"`, meldet er, dass eine Reference diese Multiplizität nicht tragen kann.

Der Exit-Code ist 0 wenn nichts abweicht und 1 sonst, der Prüfer eignet sich also auch als
Regressionstest. Begründete Auslassungen (`NOTMAPPED`) zählen nicht als Abweichung.

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

---

## rent-a-car-case-demo.json / rent-a-car-case-merode.json - fallnahes Modellpaar

Dieses zweite Paar verfolgt **nicht** das Ziel der Regelabdeckung. Es bildet Bzowskis
veröffentlichtes DEMO-Faktmodell für Rent-A-Car nach (Diplomarbeit TU Wien 2025,
Abbildungen 6.2 bis 6.4 und Anhang G, Tabellen G.1 bis G.5), das seinerseits auf
Dietz und Mulder, Kapitel 15, zurückgeht. Zweck ist die externe Validität: die
Transformationsqualität soll auch an einem Modell gemessen werden, das nicht auf dieses
Artefakt hin entworfen wurde.

Entsprechend feuern hier **nicht** alle Regeln. A8 (AssociationClass), A9 (abgeleitete
Spezialisierung), A10 (schlichte Generalisierung) und die Ableitungsregeln bleiben inaktiv,
weil Bzowskis Faktmodell die zugehörigen Konstrukte nicht enthält. A7 feuert dafür viermal,
einmal je ereignisgetriggerter Spezialisierung von RENTAL.

| Element | `rent-a-car-case-demo.json` | `rent-a-car-case-merode.json` |
|---------|------|--------|
| ValueTypes / DomainTypes | 4 | 4 |
| EntityTypes / ObjectTypes | 14 | 10 |
| FactTypes / ExistenceDependencies | 14 | 8 |
| EventTypes / BusinessEventTypes | 7 | 30 |

Drei Konstrukte aus Bzowskis Modell sind im Eingabeschema nicht ausdrückbar und werden
inhaltstreu, aber formverändert abgebildet: der aggregierte Entitätstyp
`{CAR GROUP} * {YEAR}` wird zum Entitätstyp `YearlyCarGroup`, der attributierte Werttyp
`{YEAR}` wird zum Entitätstyp `Year`, und `{CAR GROUP}` erhält Literale, weil ein leerer
Enum `pimuml-schema.json` verletzt. Die vollständige Abweichungsliste mit Begründungen
steht in `thesis-notes/EVAL/FRAMEWORK.md`, Abschnitt 4.2.

Testbefehle gegen die Live-Pipeline:

```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: demo" \
  -d @mda-agents/tests/rent-a-car-case-demo.json

curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-case-merode.json
```
