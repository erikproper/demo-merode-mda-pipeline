# mda-agents

TypeScript-Agenten für die MDA-Transformationspipeline der Masterarbeit.

Implementiert die zwei Transformationsstufen:

```
DEMO Fact Model (CIM)
        │  demo-to-pim-agent.ts  (Regeln A1–A12)
        ▼
    pimUML (PIM)
        │  [geplant: pim-to-mendix-agent.ts]  (Regeln B1–B24)
        ▼
   Mendix (PSM)
```

Alle Agenten kommunizieren über den **BIG Modelling Bus** (MQTT, Eclipse Mosquitto).

---

## Projektstruktur

```
mda-agents/
├── bus-client.ts          # MQTT-Client (Layer 1–3, spiegelt Go-Bus-Architektur)
├── demo-publisher.ts      # Liest rent-a-car-mock.json → publiziert auf Bus
├── demo-to-pim-agent.ts   # Abonniert DEMO-Modell → transformiert → publiziert PIM
│
├── schemas/
│   ├── demo-schema.json   # JSON Schema (Draft-07) für das DEMO Fact Model (CIM)
│   ├── pimuml-schema.json # JSON Schema (Draft-07) für das pimUML-Modell (PIM)
│   └── types.ts           # TypeScript-Interfaces, generiert aus den Schemas
│
├── tests/
│   ├── rent-a-car-mock.json   # Valides DEMO-Modell (Rent-A-Car Use Case)
│   ├── test-transform.ts      # Offline-Test: Transformation ohne MQTT-Broker
│   └── pim-subscriber.ts      # Bus-Subscriber: zeigt empfangenes PIM-Modell an
│
├── docker-compose.yml     # Startet Eclipse Mosquitto (MQTT-Broker)
├── mosquitto.conf         # Mosquitto-Konfiguration (anonymous, kein Persist)
├── package.json
└── tsconfig.json
```

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

### Option A — Offline (kein Broker nötig)

Testet die Transformation direkt, ohne MQTT:

```bash
npm run test:transform
```

Ablauf:
1. Lädt `tests/rent-a-car-mock.json`
2. Validiert gegen `schemas/demo-schema.json`
3. Führt Mapping-Regeln A1–A12 aus
4. Validiert Ergebnis gegen `schemas/pimuml-schema.json`
5. Schreibt `tests/rent-a-car-pim.json`

---

### Option B — Volle Pipeline mit Bus (4 Terminals)

**Terminal 1 — MQTT-Broker starten**
```bash
cd mda-agents
npm run broker:up
# Mosquitto läuft auf localhost:1883
```

**Terminal 2 — Transformer-Agent starten**
```bash
cd mda-agents
npm run demo-to-pim-agent
# Wartet auf eingehende DEMO-Modelle
```

**Terminal 3 — PIM-Subscriber starten** *(optional, zum Beobachten)*
```bash
cd mda-agents
npm run pim-subscriber
# Wartet auf ausgehende PIM-Modelle
```

**Terminal 4 — Publisher triggern** *(löst die Pipeline aus)*
```bash
cd mda-agents
npm run demo-publisher
```

**Erwarteter Ablauf:**

```
Terminal 4 (Publisher)
  → Liest tests/rent-a-car-mock.json
  → Publiziert auf Topic:
    big/bus-version-1.0/dev/demo-publisher/artefacts/json/model.demo.raw/demo-v1.0-v1.0/state

Terminal 2 (Transformer)
  → Empfängt DemoModel
  → ✓ Validiert gegen demo-schema.json
  → Führt A1–A12 aus (15 Klassen, 20 Assoziationen, ...)
  → ✓ Validiert gegen pimuml-schema.json
  → Publiziert auf Topic:
    big/bus-version-1.0/dev/demo-to-pim-agent/artefacts/json/model.pim.created/pimuml-v1.0-v1.0/state

Terminal 3 (Subscriber)
  → Empfängt PimModel
  → Schreibt tests/rent-a-car-pim-from-bus.json
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

Beispiel mit eigenem Broker:
```bash
MQTT_BROKER=my-server.example.com MQTT_USER=user MQTT_PASSWORD=pw \
  npm run demo-to-pim-agent
```

---

## Mapping-Regeln (Table 10.1)

| Regel | DEMO Fact Model | pimUML |
|-------|----------------|--------|
| A1 | ValueType, kategorisch | Enumeration |
| A2 | ValueType, nicht-kategorisch | PrimitiveType |
| A3 | Declared EntityType | Class + logische ID (Integer) + StateMachine |
| A4 | Derived EntityType | Class + StateMachine |
| A5 | AttributeType | Property |
| A6 | EventType | Boolean-Attribut (default false) + orthogonale SM-Region + Set\<E\>.\<Evt\> Activity |
| A7 | Spezialisierung mit EventType | ID auf Kind + Assoc Kind→Elter + Entry-Activity in trueState + Create\<Kind\> Activity |
| A8 | Spezialisierung von ValueType mit EventType | AssociationClass |
| A9 | Spezialisierung mit Ableitungsregel | ID auf Kind + Assoc Kind→Elter + Create\<Kind\> Activity |
| A10 | Generalisierung | Elternklasse abstract + Generalization auf Kindklasse |
| A11 | Aggregation | shared Association + ID-Property in Ganzes |
| A12 | PropertyType + Kardinalitäten | Association + Multiplizitäten |
