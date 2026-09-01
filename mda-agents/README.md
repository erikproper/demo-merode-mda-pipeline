# mda-agents

TypeScript-Agenten für die MDA-Transformationspipeline der Masterarbeit.

Implementiert zwei CIM-Sprachen und zwei PSM-Zielplattformen über eine gemeinsame,
schema-validierte PIM-Zwischenschicht (pimUML):

```
DEMO Fact Model (CIM)  --  demo-to-pim-agent.ts    (Regeln A1-A12)  --+
                                                                       |
MERODE Domain Model (CIM) -- merode-to-pim-agent.ts (Regeln M1-M9) --+--> pimUML (PIM)
                                                                       |
                                                                       +--> pim-to-mendix-agent.ts (Regeln B1-B16) --> Mendix (PSM)
                                                                       +--> pim-to-sql-agent.ts    (Regeln S1-S12) --> PostgreSQL-DDL (PSM)
```

Alle Agenten kommunizieren über den **BIG Modelling Bus** (MQTT, Eclipse Mosquitto/HiveMQ CE).
Details zu den Mapping-Regeln: `thesis-notes/MAPPING_NOTES.md` (DEMO/MERODE->pimUML) und
`thesis-notes/MAPPING_NOTES.md`-S-Regeln-Abschnitt (pimUML->SQL). Diese README hält bewusst
keine eigene Kopie der Regeltabellen mehr, um Doku-Drift zu vermeiden.

---

## Projektstruktur

```
mda-agents/
+-- bus-client.ts           # MQTT-Client (Layer 1-3, spiegelt Go-Bus-Architektur)
+-- agent-utils.ts          # Gemeinsame Helfer: Bus-Config, Ajv-Validierung, Meta-Extraktion
+-- demo-publisher.ts       # Liest rent-a-car-demo.json -> publiziert auf Bus
+-- demo-to-pim-agent.ts    # Abonniert DEMO-Modell -> transformiert (A1-A12) -> publiziert PIM
+-- merode-to-pim-agent.ts  # Abonniert MERODE-Modell -> transformiert (M1-M9) -> publiziert PIM
+-- pim-to-mendix-agent.ts  # Abonniert PIM (DEMO+MERODE) -> generiert Mendix-App (B1-B16)
+-- pim-to-sql-agent.ts     # Abonniert PIM (DEMO+MERODE) -> generiert PostgreSQL-DDL (S1-S12)
+-- api-server.ts           # HTTP-Eingang: POST /api/model (X-Input-Format: demo|merode)
|
+-- schemas/
|   +-- demo-schema.json    # JSON Schema (Draft-07) für das DEMO Fact Model (CIM)
|   +-- merode-schema.json  # JSON Schema (Draft-07) für das MERODE Domain Model (CIM)
|   +-- pimuml-schema.json  # JSON Schema (Draft-07) für das pimUML-Modell (PIM)
|   +-- types.ts            # TypeScript-Interfaces, generiert aus den Schemas
|
+-- tests/
|   +-- rent-a-car-demo.json    # Valides DEMO-Modell (Rent-A-Car Use Case)
|   +-- rent-a-car-merode.json  # Valides MERODE-Modell (Rent-A-Car Use Case)
|   +-- test-transform.ts       # Offline-Smoke-Test: Teilausschnitt A3/A5/A12, kein Broker nötig
|   +-- smoke-m9-m3.ts          # Offline-Smoke-Test für M3/M9 (EDG-Propagation), kein Broker nötig
|   +-- test-sql-agent.ts       # Offline-Test für pim-to-sql-agent.ts
|   +-- pim-subscriber.ts       # Bus-Subscriber: zeigt empfangenes PIM-Modell an
|   +-- README.md               # Details + Caveats zu den Offline-Tests
|
+-- output/                 # Generierte SQL-DDL-Dateien (pim-to-sql-agent.ts), git-ignored
+-- docker-compose.yml      # Startet MQTT-Broker + alle Agenten als Services
+-- mosquitto.conf          # Mosquitto-Konfiguration (anonymous, kein Persist)
+-- package.json
+-- tsconfig.json
```

> Hinweis zu den Offline-Tests: `test-transform.ts` und `smoke-m9-m3.ts` sind eigenständige,
> handgeschriebene Teilreimplementierungen der jeweiligen Transformationslogik (nicht die
> echten `transform()`-Funktionen aus `demo-to-pim-agent.ts`/`merode-to-pim-agent.ts`). Sie
> eignen sich als schneller Rauchtest ohne Broker, sind aber **kein** Ersatz für einen
> End-to-End-Lauf über den Bus (Option B unten) oder gegen die Live-Pipeline. Details in
> `tests/README.md` und `thesis-notes/PROTOTYPE_TODOS.md`.

---

## Voraussetzungen

| Tool | Version | Prüfen |
|------|---------|--------|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |
| Docker Desktop | ≥ 24 | `docker --version` |

```bash
# Einmalig: Dependencies installieren
cd mda-agents
npm install
```

---

## Testen

### Option A - Offline (kein Broker nötig)

```bash
npm run test:transform              # DEMO: Teilausschnitt A3/A5/A12
npx ts-node tests/smoke-m9-m3.ts    # MERODE: M3/M9 (EDG-Propagation)
npx ts-node tests/test-sql-agent.ts # pim-to-sql-agent (S1-S12)
```

Diese drei Skripte sind eigenständige Rauchtests ohne MQTT-Broker. Wichtig: `test-transform.ts`
und `smoke-m9-m3.ts` sind **keine** Aufrufe der echten `transform()`-Funktionen aus
`demo-to-pim-agent.ts`/`merode-to-pim-agent.ts`, sondern separat gepflegte Teilreimplementierungen
zur schnellen Kontrolle einzelner Regeln. Für einen Test der tatsächlichen Produktionslogik ist
Option B (voller Bus-Durchlauf) oder ein Lauf gegen die Live-Pipeline auf dem Pi maßgeblich.
Details, aktuelle Fixture-Kennzahlen und bekannte Einschränkungen: `tests/README.md`.

---

### Option B - Volle Pipeline mit Bus (4 Terminals)

**Terminal 1 - MQTT-Broker starten**
```bash
cd mda-agents
npm run broker:up
# Mosquitto läuft auf localhost:1883
```

**Terminal 2 - Transformer-Agent starten**
```bash
cd mda-agents
npm run demo-to-pim-agent
# Wartet auf eingehende DEMO-Modelle
```

**Terminal 3 - PIM-Subscriber starten** *(optional, zum Beobachten)*
```bash
cd mda-agents
npm run pim-subscriber
# Wartet auf ausgehende PIM-Modelle
```

**Terminal 4 - Publisher triggern** *(löst die Pipeline aus)*
```bash
cd mda-agents
npm run demo-publisher
```

**Erwarteter Ablauf:**

```
Terminal 4 (Publisher)
  -> Liest tests/rent-a-car-demo.json
  -> Publiziert auf Topic:
    big/bus-version-1.0/dev/demo-publisher/artefacts/json/model.demo.raw/demo-v1.0-v1.0/state

Terminal 2 (Transformer)
  -> Empfängt DemoModel
  -> OK Validiert gegen demo-schema.json
  -> Führt A1-A12 aus (15 Klassen, 20 Assoziationen, ...)
  -> OK Validiert gegen pimuml-schema.json
  -> Publiziert auf Topic:
    big/bus-version-1.0/dev/demo-to-pim-agent/artefacts/json/model.pim.created/pimuml-v1.0-v1.0/state

Terminal 3 (Subscriber)
  -> Empfängt PimModel
  -> Schreibt tests/rent-a-car-pim-from-bus.json
```

**Broker stoppen:**
```bash
npm run broker:down
```

---

## Konfiguration

Alle Agenten lesen ihre Verbindungsparameter aus Umgebungsvariablen:

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `MQTT_BROKER` | `localhost` | Broker-Hostname |
| `MQTT_PORT` | `1883` | Broker-Port |
| `MQTT_USER` | `admin` | MQTT-Username |
| `MQTT_PASSWORD` | `admin` | MQTT-Passwort |
| `BUS_PREFIX` | `big` | Topic-Prefix |
| `BUS_ENVIRONMENT_ID` | `dev` | Environment-ID |
| `BUS_AGENT_ID` | *(agent-spezifisch)* | Agent-ID |

Für `pim-to-mendix-agent.ts` zusätzlich (Mendix Platform SDK, siehe `.env.example`):
`MENDIX_TOKEN`, `MENDIX_APP_ID`, `MENDIX_MODULE_NAME`, `MENDIX_BRANCH`.

Beispiel mit eigenem Broker:
```bash
MQTT_BROKER=my-server.example.com MQTT_USER=user MQTT_PASSWORD=pw \
  npm run demo-to-pim-agent
```

---

## Mapping-Regeln

Die vollständigen, aktuell gültigen Regeltabellen (A1-A12 für DEMO, M1-M9 für MERODE,
B1-B16 für Mendix, S1-S12 für PostgreSQL) werden **nicht** hier dupliziert, um Doku-Drift
zu vermeiden, sondern zentral gepflegt in `thesis-notes/MAPPING_NOTES.md`
(siehe auch `thesis-notes/MerodeMappingRules.md` für die MERODE-spezifische Herleitung).
