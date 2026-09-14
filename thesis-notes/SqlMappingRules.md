# pimUML nach PostgreSQL-DDL: Formale Abbildungsregeln (S1-S12)

Zweiter PSM-Pfad neben den B-Regeln (`MAPPING_NOTES.md` Abschnitt 5). Beide Pfade konsumieren
denselben `model.pim.created`-Artefakt und denselben Datenvertrag (`pimuml-schema.json`); sie
unterscheiden sich nur in der Zielplattform. Die S-Regeln dienen in dieser Thesis als der reale,
ausgeführte Extensibilitätsnachweis (siehe `EXTENSIBILITY_EVIDENCE.md`), der in Abschnitt 5 des
Proposals als "eher Future Work" eingestufte ER-Diagramm-Agent wurde dafür nicht gebraucht.

---

## 1. Abbildungstabelle

| ID  | pimUML-Quellkonzept | SQL-Ziel | Bezug zu den B-Regeln |
|-----|---------------------|----------|------------------------|
| S1  | `enumerations[]` | `CREATE TYPE <name>_enum AS ENUM (...)` | analog zu B4 |
| S2  | `dataTypes[]` | eigene Tabelle, nur `id SERIAL PRIMARY KEY` | analog zu B5 (spiegelt dieselbe PIM-Limitation) |
| S3  | `associationClasses[]` | Junction-Tabelle mit zwei NOT-NULL-FKs + eigenen Attributspalten | analog zu B8 |
| S4  | `classes[].ownedAttributes[]` (nicht abgeleitet, kein DataType-Typ) | Spalte mit typgemapptem SQL-Typ | analog zu B6/B7 |
| S5  | `ownedAttributes[].isDerived === true` | Spalte wird ausgelassen | analog zu B7 (kein OCL-Äquivalent) |
| S6  | Attribut mit `type` = Name eines `dataTypes[]`-Eintrags | FK-Spalte auf die DataType-Tabelle (S2) statt Inline-Spalte | analog zu B5 |
| S7  | `generalizations[]` | Kind-Tabelle bekommt zusätzliche `<parent>_id`-FK-Spalte, `ON DELETE CASCADE` | analog zu B10 |
| S8  | `associations[]` (1:1, 1:n) | FK-Spalte `<Rolle>_id` auf der Tabelle des Viele-Endes, verweist auf die Tabelle des Eins-Endes, `NOT NULL` wenn das Eins-Ende `lower >= 1` hat. Kollidiert der Spaltenname in der Tabelle, heißt die Spalte `<Association>_id` | analog zu B9 |
| S9  | `associations[]` (n:m, beide Enden `upper === "*"`) | eigene Junction-Tabelle mit zwei NOT-NULL-FKs | analog zu B9 (Owner/Reference wird bei n:m zu zwei FKs) |
| S10 | `stateMachines[]` mit sequenzieller Region (`isMerodeFSM`-Diskriminator) | `status`-Spalte vom Typ `<Entity>_status_enum` + `CREATE TYPE` aus den `simple`-State-Namen | analog zu B13 |
| S11 | DEMO-orthogonale FSMs (`forEvent` gesetzt) | keine Sonderregel - boolesche Attribute laufen bereits über S4 | kein B-Pendant nötig (B11/B12 sind Workflow-spezifisch, DDL kennt keine Workflows) |
| S12 | Tabellenreihenfolge im Ausgabeskript | topologischer Sort (Kahn) über den FK-Abhängigkeitsgraphen | kein B-Pendant (Mendix-SDK ist reihenfolgeunabhängig, ein SQL-Skript nicht) |

Implementierungsort: `mda-agents/pim-to-sql-agent.ts`, exportierte reine Funktion `pimToSql(pim: PimModel): string`. Alle 12 Regeln sind implementiert und gegen die vollständige pimUML-Fixture `tests/rent-a-car-pim-full.json` validiert (`tests/test-sql-agent.ts`, ein Testfall pro Regel plus ein End-to-End-Lauf). Seit 2026-09-14 läuft derselbe Test zusätzlich gegen die beiden echten Pipeline-PIMs `thesis-notes/EVAL/demo-pim-output.json` und `merode-pim-output.json` (Abschnitt 5a).

---

## 2. Regelweiser Begründungstext

**S1 - Enumeration nach `CREATE TYPE ... AS ENUM`.**
pimUML-Enumerationen haben eine feste, benannte Literalmenge (analog zu Bzowskis A1/M3). PostgreSQL bildet das direkt auf einen benutzerdefinierten Enum-Typ ab, der danach wie jeder eingebaute Typ als Spaltentyp verwendet werden kann. Anders als B4 (Mendix-Enumeration mit separaten `EnumerationValue`-Objekten und Captions) braucht DDL keine UI-Repräsentation der Literale, nur ihre Namen als Enum-Werte. Bezug: analog zu B4.

**S2 - DataType nach eigener, leerer Tabelle.**
pimUML-DataTypes tragen im aktuellen Schema keine eigene Struktur (siehe `LIMITATIONS.md` Abschnitt 4, "pimUML-Schema approximiert UML-Metaclasses vereinfacht") - dieselbe Limitation, die B5 im Mendix-Agenten dazu zwingt, ein DataType als eigenständige Entity statt als Inline-Attributtyp zu behandeln. Die S-Regel spiegelt das bewusst 1:1: eine Tabelle mit nur einer `id`-Spalte, referenziert über S6. Eine SQL-spezifische Abkürzung (z. B. den DataType stillschweigend als Inline-Spalte behandeln) würde die beiden PSM-Outputs strukturell auseinanderlaufen lassen, ohne dass das an einer echten pimUML-Eigenschaft läge. Bezug: analog zu B5, spiegelt dieselbe PIM-Limitation.

**S3 - AssociationClass nach Junction-Tabelle mit Attributspalten.**
Eine pimUML-AssociationClass ist eine Assoziation, die selbst Eigenschaften trägt (analog zu Bzowskis A8). Die SQL-Entsprechung ist eine Tabelle mit einem synthetischen `id`, einer NOT-NULL-FK-Spalte pro `memberEnd` und einer Spalte pro eigenem `ownedAttribute`. Das ist die relationale Standardauflösung einer n:m-Beziehung mit Nutzdaten und entspricht strukturell B8 (Entity + zwei Associations in Mendix). Bezug: analog zu B8.

**S4 - Klassenattribut nach typgemappter Spalte.**
Jedes nicht abgeleitete, nicht-DataType-typisierte `ownedAttribute` einer Klasse wird zu einer Spalte mit einem über `sqlType()` gemappten PostgreSQL-Typ (`String->TEXT`, `Integer->INTEGER`, `Boolean->BOOLEAN`, `Date/DateTime->TIMESTAMP`, `Number/Decimal/Real->NUMERIC`, Enum-Name -> `<name>_enum`, unbekannt -> `TEXT`-Fallback). Das ist die direkte SQL-Entsprechung zu B6/B7. Ein Attribut mit `isID: true` wird zusätzlich `PRIMARY KEY`; hat keine Klasse ein solches Attribut, ergänzt die Regel automatisch eine synthetische `id SERIAL PRIMARY KEY`-Spalte, damit jede Tabelle referenzierbar bleibt (relevant für DataType-Tabellen aus S2, die per Definition kein PIM-Attribut haben). Bezug: analog zu B6/B7.

**S5 - Abgeleitetes Attribut wird ausgelassen.**
`ownedAttributes[].isDerived === true` (z. B. aus A9/M-Ableitungen) hat kein natives DDL-Äquivalent - eine generierte Spalte (`GENERATED ALWAYS AS`) würde einen OCL/ALF-Ausdrucksparser voraussetzen, der außerhalb des Prototyp-Scopes liegt (vgl. DD3 in `DESIGN_DECISIONS.md`, dieselbe Begründung wie beim B-Pendant). Die Regel überspringt solche Attribute ersatzlos, statt eine falsche Näherung zu erzeugen. Bezug: analog zu B7-Verhalten bei abgeleiteten Attributen.

**S6 - DataType-typisiertes Attribut nach FK statt Inline-Spalte.**
Verweist der `type`-String eines Attributs auf einen Namen in `pim.dataTypes[]`, erzeugt die Regel keine Inline-Spalte, sondern eine `<attributname>_id INTEGER REFERENCES <datatype_tabelle>(id)`-Spalte gegen die in S2 erzeugte Tabelle. Das hält die referenzielle Struktur identisch zu B5 im Mendix-Agenten (dort wird derselbe Fall über eine Mendix-Association statt eines Attributs gelöst). Diese FK-Kante wird im `dependsOn`-Array der Tabelle vermerkt, damit S12 die Erzeugungsreihenfolge korrekt auflöst. Bezug: analog zu B5.

**S7 - Generalisierung nach Pflicht-FK mit Kaskadenlöschung.**
Für jeden Eintrag in `pim.generalizations[]` bekommt die Kind-Tabelle eine zusätzliche `<parent>_id INTEGER NOT NULL REFERENCES <parent_tabelle>(...) ON DELETE CASCADE`-Spalte. Das ist eine bewusste Vereinfachung: pimUML vergibt jeder Klasse - auch einer Generalisierungs-Kind-Klasse - ein eigenes, unabhängiges `isID`-Attribut statt einer geteilten Primärschlüssel-Konvention (klassisches Table-per-Type ohne PK-Sharing). Eine PK-geteilte Variante (Kind-PK = Eltern-PK) wäre relational eleganter, hätte aber eine PIM-seitige Konvention vorausgesetzt, die es nicht gibt. Dokumentiert in `LIMITATIONS.md`. Bezug: analog zu B10 (Mendix-Generalization/Specialization, wo Mendix intern dieselbe Art von Fremdschlüssel verwaltet).

**S8 - Binäre 1:1/1:n-Assoziation nach FK auf der "Eins"-Seite.**
Für jede Assoziation, bei der nicht beide Enden `upper === "*"` haben, bestimmt dieselbe Eins-/Viele-Logik wie in `pim-to-mendix-agent.ts:222` (`end0.upper === "*" ? [end1, end0] : [end0, end1]`), wohin die FK-Spalte kommt: die Tabelle des Viele-Endes erhält eine Spalte `<oneEnd.name>_id`, die auf die Tabelle des Eins-Endes verweist (bei 1:1 trägt die Tabelle von `end1` die Spalte). Rollennamen sind im pimUML nur innerhalb einer Assoziation eindeutig, nicht innerhalb einer Klasse. M4 nennt jedes Master-Ende `master`, und das DEMO-PIM hat mit `RentalPickedUpAt` und `RentalReturnedAt` zwei Assoziationen von Rental zu Branch mit der Rolle `branch`. Würde derselbe Spaltenname in einer Tabelle mehrfach entstehen oder mit einer Attributspalte kollidieren, heißt die FK-Spalte stattdessen `<assoc.name>_id` (z. B. `rental_picked_up_at_id`, `rental_depends_on_car_id`). Die Umbenennung betrifft alle kollidierenden Spalten gleichermaßen, nicht erst die zweite, damit der Name nicht von der Reihenfolge in `associations[]` abhängt. Die Spalte hat keine `ON DELETE`-Klausel, es gilt also das PostgreSQL-Default `NO ACTION`: ein Master mit abhängigen Zeilen kann nicht gelöscht werden. Ob diese Spalte `NOT NULL` wird, hängt von `oneEnd.lower` ab - eine untere Schranke `>= 1` auf der "Eins"-Seite bedeutet, jede Instanz der "Viele"-Seite muss immer mit genau einer Instanz assoziiert sein. Bemerkenswert: die Spaltennamen entstehen direkt aus dem PIM-Rollennamen des `memberEnd` - eine A9/A7-artige Spezialisierungsassoziation mit der Rolle `"parent"` erzeugt automatisch eine `parent_id`-Spalte, ohne dass S8 selbst etwas über Generalisierung "weiß" (siehe Validierungsbeispiel in Abschnitt 5). Bezug: analog zu B9.

**S9 - n:m-Assoziation nach Junction-Tabelle ohne Attributspalten.**
Haben beide `memberEnds` `upper === "*"`, reicht eine einzelne FK-Spalte auf keiner Seite aus - die Regel erzeugt stattdessen eine neue Tabelle mit synthetischem `id`, benannt nach der Assoziation selbst, und zwei NOT-NULL-FK-Spalten. Der Unterschied zu S3 (AssociationClass): eine reine n:m-Assoziation trägt keine eigenen Attribute, daher entfällt der Attributspalten-Teil. Bezug: analog zu B9 (Mendix löst n:m intern über eine verdeckte Zwischentabelle, DDL macht dieselbe Auflösung explizit sichtbar).

**S10 - MERODE-sequenzielle FSM nach Status-Spalte + Enum-Typ.**
Für jede StateMachine, die der `isMerodeFSM()`-Diskriminator (identisch zu `pim-to-mendix-agent.ts:66`, siehe `LIMITATIONS.md` Abschnitt 4 zur Fragilität dieses Diskriminators) als sequenziell erkennt, erzeugt die Regel einen `<entity>_status_enum`-Typ aus den Namen aller `simple`-Zustände und fügt der zugehörigen Klassentabelle eine `status`-Spalte dieses Typs hinzu. Das ist die direkte strukturelle Entsprechung zu B13 (Mendix-`<Entity>_Status`-Enumeration). Anders als B14-B16 (Create-/Set-/End-Microflows) hat S10 kein Verhaltens-Äquivalent - reines DDL kennt keine Ereignisverarbeitung, daher bleiben Übergänge und Aktivitäten (`transitions`, `activities`) für die S-Regeln vollständig `NotMapped`. Bezug: analog zu B13, ohne B14-B16-Entsprechung.

**S11 - DEMO-orthogonale FSM: keine Sonderregel nötig.**
DEMO-Ereignisse werden bereits in A6 als boolesche `ownedAttributes` auf der Klasse selbst kodiert (`false`/`true`-Zustandspaar pro Region), nicht als separates Konstrukt. Diese Attribute laufen deshalb automatisch durch S4 (normale Spaltenregel) - ohne dass die S-Regeln jemals `stateMachines[].regions[].forEvent` inspizieren müssten. Das ist selbst ein dokumentierenswerter Befund: derselbe PIM-Input, der bei MERODE eine dedizierte Regel (S10) braucht, benötigt bei DEMO keine, weil die DEMO-A-Regeln den Zustand bereits vollständig auf Attributebene abgebildet haben, bevor die S-Regeln überhaupt ansetzen. Bezug: kein B-Pendant nötig.

**S12 - Tabellenreihenfolge nach topologischem Sort.**
Anders als das Mendix-SDK (das Entities und Associations unabhängig von der Deklarationsreihenfolge anlegt) ist ein SQL-Skript zeilenweise sequenziell: ein `CREATE TABLE` mit einer `REFERENCES`-Klausel auf eine noch nicht existierende Tabelle scheitert zur Ausführungszeit. Jede FK-erzeugende Regel (S3, S6, S7, S8, S9) trägt ihre Abhängigkeit in `TableDef.dependsOn` ein; `topoSortTables()` löst diesen Graphen per Kahn-Algorithmus in eine gültige Erzeugungsreihenfolge auf, unabhängig von der Reihenfolge in `pim.classes[]`. Findet der Algorithmus einen echten Zyklus (zwei Tabellen mit wechselseitiger Pflicht-FK), bricht er mit einer Fehlermeldung ab, statt eine unausführbare Teilreihenfolge stillschweigend auszugeben - ein Zyklus würde ohnehin zur Ausführungszeit scheitern, ein früher, klarer Fehler ist strikt nützlicher. Bezug: kein B-Pendant, reines Artefakt der Zielplattform SQL.

---

## 3. Designentscheidung: kein SQL-spezifisches Sonderformat für DataTypes

Eine naheliegende Alternative zu S2/S6 wäre gewesen, ein pimUML-DataType direkt als Inline-Spaltentyp zu behandeln (z. B. `MoneyAmount` als `NUMERIC`-Spalte statt als eigene Tabelle mit FK). Das wäre relational schlanker und hätte in der generierten DDL weniger Tabellen erzeugt.

Dagegen spricht: pimUML-DataTypes tragen im aktuellen Schema keine Typinformation, die diese Abkürzung rechtfertigen würde - ein DataType ist im Schema nur ein Name, keine Menge von Feldern oder ein Basistyp. Eine SQL-spezifische Sonderbehandlung hätte daher entweder eine willkürliche Annahme getroffen (z. B. "jeder DataType ist NUMERIC") oder eine PIM-Erweiterung erfordert, die die Extensibilitätsbehauptung - kein bestehendes Schema wird angetastet - verletzt hätte. Die gewählte Lösung spiegelt stattdessen exakt dieselbe Limitation, die B5 im Mendix-Agenten bereits akzeptiert, und hält beide PSM-Outputs strukturell vergleichbar: derselbe PIM-Input erzeugt in beiden Zielsprachen eine zusätzliche "leere" Tabelle/Entity pro DataType. Empfohlen und implementiert.

---

## 4. pimUML-Erweiterungsanforderungen

Keine. Der `pim-to-sql-agent` ist ein reiner Konsument des bestehenden `pimuml-schema.json` - er liest ausschließlich Konstrukte, die bereits für den Mendix-Pfad existieren (`enumerations`, `dataTypes`, `classes`, `associations`, `associationClasses`, `generalizations`, `stateMachines`). Das unterscheidet den SQL-Agenten grundlegend von der MERODE-Integration: MERODE führte neue PIM-Konzepte ein (benannte Lebenszykluszustände, `end`-Aktivitäten) und musste das gemeinsame Schema additiv erweitern (`MerodeMappingRules.md` Abschnitt 4). Ein zweiter PSM-Agent für eine bereits abgedeckte PIM-Semantik braucht das nicht - er ist ein reiner Downstream-Konsument.

Das ist selbst der zentrale Befund für die Extensibilitätsbehauptung dieser Arbeit: das Hinzufügen eines zweiten, strukturell andersartigen PSM-Ziels erfordert null Änderungen an `pimuml-schema.json`, `bus-client.ts`, `agent-utils.ts`, `demo-to-pim-agent.ts`, `merode-to-pim-agent.ts` oder `pim-to-mendix-agent.ts`. Details und Diff-Nachweis: `EXTENSIBILITY_EVIDENCE.md`.

---

## 5. Rent-A-Car-Validierung

Quellmodell (pimUML): `mda-agents/tests/rent-a-car-pim-full.json` - eine vollständige Fixture mit Enumeration (`CarGroup`), DataType (`MoneyAmount`), Generalisierung (`Car`->`Vehicle`), AssociationClass (`BookingDetail`), zwei A9-artigen Spezialisierungsassoziationen (`PremiumCustomerIsAPerson`, `ActiveRentalIsARental`) und einer DEMO-orthogonalen FSM auf `Rental`.

Generierte DDL (`mda-agents/output/rent-a-car.sql`, via `npx ts-node tests/test-sql-agent.ts`):

```sql
-- Generated by pim-to-sql-agent from pimUML model "Rent-A-Car - pimUML"
-- Do not edit by hand.

CREATE TYPE car_group_enum AS ENUM ('economy', 'compact', 'luxury');

CREATE TABLE "money_amount" (
  "id" SERIAL PRIMARY KEY
);

CREATE TABLE "vehicle" (
  "vehicle_id" INTEGER PRIMARY KEY,
  "license_plate" TEXT
);

CREATE TABLE "person" (
  "person_id" INTEGER PRIMARY KEY,
  "name" TEXT
);

CREATE TABLE "car" (
  "car_id" INTEGER PRIMARY KEY,
  "group" car_group_enum,
  "vehicle_id" INTEGER NOT NULL REFERENCES "vehicle"("vehicle_id") ON DELETE CASCADE
);

CREATE TABLE "premium_customer" (
  "premium_customer_id" INTEGER PRIMARY KEY,
  "parent_id" INTEGER NOT NULL REFERENCES "person"("person_id")
);

CREATE TABLE "rental" (
  "rental_id" INTEGER PRIMARY KEY,
  "starting_day" TEXT,
  "ending_day" TEXT,
  "rental_started" BOOLEAN DEFAULT false,
  "rental_completed" BOOLEAN DEFAULT false,
  "rental_line_id" INTEGER,
  "car_id" INTEGER NOT NULL REFERENCES "car"("car_id"),
  "renter_id" INTEGER NOT NULL REFERENCES "person"("person_id")
);

CREATE TABLE "rental_line" (
  "rental_line_id" INTEGER PRIMARY KEY,
  "quantity" INTEGER,
  "rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")
);

CREATE TABLE "active_rental" (
  "active_rental_id" INTEGER PRIMARY KEY,
  "parent_id" INTEGER NOT NULL REFERENCES "rental"("rental_id")
);

CREATE TABLE "booking_detail" (
  "id" SERIAL PRIMARY KEY,
  "rental_id" INTEGER NOT NULL REFERENCES "rental"("rental_id"),
  "car_id" INTEGER NOT NULL REFERENCES "car"("car_id"),
  "price_per_day" INTEGER,
  "notes" TEXT
);
```

Validierungsbeobachtungen:

- **S1/S2** - `CarGroup` wird zu `car_group_enum`, `MoneyAmount` zu einer eigenen, leeren `money_amount`-Tabelle (S2), obwohl kein Attribut in diesem Ausschnitt sie referenziert - die Tabelle wird unabhängig von ihrer tatsächlichen Nutzung erzeugt, konsistent mit B5.
- **S4/S5** - `Rental.rentalStarted`/`rentalCompleted` (aus A6, DEMO-Ereignistypen) laufen als normale `BOOLEAN`-Spalten mit `DEFAULT false` durch S4, ohne jede FSM-Sonderbehandlung (S11-Befund direkt sichtbar).
- **S7** - `Car` erhält eine `vehicle_id`-Pflicht-FK mit `ON DELETE CASCADE` aus der einzigen `generalizations[]`-Eintragung.
- **S8 auf A9-Spezialisierungsassoziationen** - `PremiumCustomerIsAPerson` und `ActiveRentalIsARental` sind reguläre `associations[]`-Einträge (keine `generalizations[]`), deren "Eins"-Ende jeweils die PIM-Rolle `"parent"` trägt. S8 erzeugt daraus `parent_id`-Spalten auf `premium_customer` bzw. `active_rental` - der Spaltenname entsteht ausschließlich aus dem PIM-Rollennamen, S8 selbst unterscheidet nicht zwischen "echter" Generalisierung (S7) und Spezialisierungsassoziation. Das ist korrektes Verhalten, keine Verwechslung: A9/A7-Spezialisierungen sind im pimUML-Schema bewusst als Association modelliert, nicht als Generalization (siehe A7/A9 in `MAPPING_NOTES.md` Abschnitt 3).
- **S3** - `BookingDetail` (AssociationClass, `triggerEvent` wird für DDL ignoriert, da verhaltenslos) erzeugt eine Junction-Tabelle mit zwei Pflicht-FKs (`rental_id`, `car_id`) und den eigenen Attributspalten `price_per_day`, `notes`.
- **S12** - `money_amount`, `vehicle`, `person` erscheinen vor `car` (hängt von `vehicle` ab) und `rental` (hängt von `car`, `person` ab); `rental_line`, `active_rental`, `booking_detail` erscheinen zuletzt, da sie von `rental` abhängen. Diese Reihenfolge entsteht rein aus dem topologischen Sort, unabhängig von der Deklarationsreihenfolge in `pim.classes[]` (siehe `test-sql-agent.ts`, S12-Testfall mit absichtlich vertauschter Deklarationsreihenfolge).

Ausführbarkeitsnachweis gegen echtes PostgreSQL: reproduzierbares Docker-Kommando in `mda-agents/tests/README.md`.

## 5a. Validierung gegen die echten Pipeline-PIMs

Die Fixture aus Abschnitt 5 enthält pro Klassenpaar höchstens eine Assoziation mit eindeutigem Rollennamen. Die von `demo-to-pim-agent` und `merode-to-pim-agent` tatsächlich publizierten PIMs (`thesis-notes/EVAL/demo-pim-output.json`, `merode-pim-output.json`) tun das nicht. Bis 2026-09-14 erzeugte S8 daraus doppelte Spalten, die PostgreSQL mit "column specified more than once" ablehnt:

- DEMO: `rental` erhielt `branch_id` zweimal (`RentalPickedUpAt`, `RentalReturnedAt`).
- MERODE: `rental` erhielt `master_id` dreimal (`RentalDependsOnCar`, `...Person`, `...Branch`).

Nach dem Fix (Kollisionsregel in S8) entsteht:

| PIM | Tabelle | FK-Spalten |
|-----|---------|-----------|
| DEMO | `rental` | `car_id`, `renter_id`, `rental_picked_up_at_id`, `rental_returned_at_id` |
| DEMO | `rental_line` | `rental_id` |
| MERODE | `rental` | `rental_depends_on_car_id`, `rental_depends_on_person_id`, `rental_depends_on_branch_id` |
| MERODE | `rental_line` | `master_id` (keine Kollision, bleibt beim Rollennamen) |
| MERODE | `invoice` | `master_id` (keine Kollision) |

`tests/test-sql-agent.ts` prüft für beide PIMs, dass keine Tabelle einen Spaltennamen doppelt enthält, und schreibt `output/rent-a-car-demo.sql` und `output/rent-a-car-merode.sql` für den Postgres-Nachweis. Ausgeführt am 2026-09-14 gegen `postgres:16-alpine` mit `ON_ERROR_STOP=1` (Kommando in `mda-agents/tests/README.md`): alle drei Skripte fehlerfrei. DEMO erzeugt 1 Typ und 14 Tabellen, MERODE 7 Typen und 7 Tabellen, die Fixture 1 Typ und 9 Tabellen. Beobachtung: in `merode-pim-output.json` ist `master_id` auf `rental_line` und `invoice` wenig sprechend, aber korrekt. Der Name stammt aus M4, nicht aus S8.
