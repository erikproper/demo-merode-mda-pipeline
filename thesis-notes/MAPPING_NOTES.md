# Transformationsregeln (D4)

Arbeitsdokument zu den formalen Abbildungsregeln für beide Transformationsstufen. Die A-Regeln (DEMO nach pimUML) stammen aus Bzowski [4]. Die M-Regeln (MERODE nach pimUML) werden in dieser Thesis aus Snoeck [21] abgeleitet. Die B-Regeln (pimUML nach Mendix) stammen ebenfalls aus Bzowski [4], mit den MERODE-Erweiterungen dieser Arbeit.

Das Thesis-Kapitel soll die Regeln formal präsentieren, jede aus der Quellliteratur begründen und DEMO- und MERODE-Regeln dort vergleichen, wo sie auseinanderlaufen.

---

## 1. Überblick über die Transformationskette

```
CIM (DEMO Fact Model)     pimUML (PIM)   Mendix (PSM)
CIM (MERODE Domänenmodell)    |
                          pimuml-schema.json
                          (JSON Schema, strikt)
```

Das pimUML-PIM ist der Knotenpunkt. Die A-Regeln und M-Regeln definieren die beiden vorgelagerten Pfade (CIM nach PIM). Die B-Regeln definieren den einzelnen nachgelagerten Pfad (PIM nach PSM). Das Designziel ist, dass die B-Regeln sprachagnostisch sind: sie operieren auf pimUML-Konstrukten, nicht auf DEMO- oder MERODE-Konstrukten direkt. Ob eine gegebene pimUML-Klasse aus einem DEMO-EntityType oder einem MERODE-ObjectType entstammt, sollte für die B-Regeln keine Rolle spielen. In der Praxis gibt es für FSMs eine sprachspezifische Logik (B13-B16), aber die strukturellen B-Regeln (B1-B12) sind vollständig sprachagnostisch.

---

## 2. Quellkonzepte in MERODE (Kurzreferenz)

Vor den Regeln hilft ein prägnanter Überblick darüber, was MERODE enthält. Basierend auf Snoeck [21], Kapitel 3.

Das Domänenmodell besteht aus drei Teilmodellen. Der Existence-Dependency Graph (EDG) ist die strukturelle Sicht: wie ein UML-Klassendiagramm, aber mit der Bedingung, dass alle Assoziationen Existenzabhängigkeiten ausdrücken müssen. Ein Objekttyp B ist existenzabhängig von A, wenn die Lebenszeit einer B-Instanz immer in der Lebenszeit einer A-Instanz enthalten ist (Snoeck, Kap. 4, S. 79-105). Die Object-Event Table (OET) ist die Interaktionssicht: eine Tabelle mit Geschäftsereignistypen als Zeilen und Objekttypen als Spalten. Jede Zelle gibt an, ob der Objekttyp auf das Ereignis hin erstellt (C), modifiziert (M) oder beendet wird (E). Entscheidend: Eigentümerbeteiligungen werden zunächst manuell markiert, propagierte Beteiligungen werden automatisch aus dem EDG via Propagierungsregel abgeleitet (Snoeck, Kap. 5, S. 107-125). Die Finite-State Machines (FSMs) sind die Lebenszyklussicht: eine FSM pro Objekttyp, die Reihenfolgebeschränkungen für Ereignisse über das hinaus spezifiziert, was die OET bereits impliziert (Snoeck, Kap. 6, S. 127-147).

Wichtige Konzepte im Überblick: Ein ObjectType (Geschäftsobjekttyp) hat eine Identität, einen durch Attribute beschriebenen Zustand und eine Dauer. Er ist immer an mindestens zwei Ereignissen beteiligt (Erzeugung und Beendigung), im Buch in KAPITÄLCHEN geschrieben. Ein BusinessEventType (Geschäftsereignistyp) ist atomar, tritt zu einem Zeitpunkt auf und bezieht einen oder mehrere Objekttypen ein. Eine ExistenceDependency ist eine gerichtete Beziehung, bei der die Lebenszeit des abhängigen Objekttyps vollständig in der Lebenszeit des Hauptobjekttyps enthalten ist. Die OET-Zellenwerte sind: `O/C` = Eigentümer, erzeugt; `O/M` = Eigentümer, modifiziert; `O/E` = Eigentümer, beendet; `A/M` = affiliiert (propagiert), modifiziert. Die `A/M`-Einträge werden automatisch aus der Propagierungsregel abgeleitet und müssen nicht manuell angegeben werden. Lebenszykluszustände sind benannte Phasen im Leben eines Objekts, sequenziell geordnet.

---

## 3. A-Regeln: DEMO Fact Model nach pimUML

Bzowskis Regeln [4], Tabelle 10.1. Hier zur Vollständigkeit und für den Sprachvergleich in Abschnitt 7.

| ID  | DEMO Fact Model Quellkonzept | pimUML Ziel |
|-----|------------------------------|-------------|
| A1  | Value type, benutzerdefiniert, kategorisch | Enumeration |
| A2  | Value type, benutzerdefiniert, nicht-kategorisch | DataType (benutzerdefiniert) |
| A3  | Deklarierter Entitätstyp | Class + Integer-Bezeichner (isID=true) + StateMachine |
| A4  | Abgeleiteter Entitätstyp | Class (isDerived=true) + StateMachine |
| A5  | Attributtyp | Property |
| A6  | Ereignistyp | Boolean Property (Standard false) + orthogonale Region in der Owner-StateMachine mit false/true-Zuständen und Trigger |
| A7  | Spezialisierung eines Entitätstyps mit Ereignistyp | Integer-ID für Kind + gerichtete Association (Kind zu Elternteil, Rolle "parent") + Create-Aktivität im true-Zustand des Elternteils |
| A8  | Spezialisierung eines Value Type mit Ereignistyp und Eigenschaft | AssociationClass |
| A9  | Spezialisierung eines Entitätstyps mit Ableitungsregel | Class (isDerived) + Association (Kind zu Elternteil) + OCL-Ableitungsausdruck |
| A10 | Generalisierung | Abstrakte Eltern-Class + Generalization |
| A11 | Aggregation | Integer-ID für Teil in Ganzklasse + Association mit Aggregations-Adornment |
| A12 | Eigenschaftstyp + Kardinalitätsgesetze | Association + Multiplizitäten |

Implementierungsort: `mda-agents/demo-to-pim-agent.ts`. Alle 12 Regeln sind implementiert und gegen das Rent-A-Car-DEMO-Fixture validiert.

---

## 4. M-Regeln: MERODE Domänenmodell nach pimUML

Diese Regeln werden in dieser Thesis aus Snoeck [21] abgeleitet. Die Nummerierung M1-M9 stammt von mir; sie parallelisiert Bzowskis A-Regeln, wo das möglich ist, und führt neue Regeln für Konzepte ohne DEMO-Gegenstück ein.

### M1 - ObjectType nach Class + Integer-ID

Quellkonzept: MERODE ObjectType. Ziel: pimUML Class + Property (Name: `<TypName>ID`, Typ: Integer, isID: true).

Ein MERODE-ObjectType ist ein Geschäftsobjekt mit Identität, Zustand (Attributen) und Dauer (Snoeck, S. 53). Die strukturelle Projektion entspricht direkt Bzowskis Regel A3: die Class erfasst Identität und strukturelle Beschreibung. Der ganzzahlige logische Bezeichner wird nach der Konvention von A3 hinzugefügt.

Implementierung: `{ name: ot.name, ownedAttributes: [{ name: \`${ot.name}ID\`, type: "Integer", isID: true }, ...] }`

Mendix-Hinweis: `id` ist ein reservierter Systemfeldname in Mendix (CE7247). Der Name `<TypName>ID` umgeht das. Diese Namenskonvention ist konsistent mit A3 in Bzowskis Implementierung.

Bezug zu DEMO: Analog zu A3. Der Hauptunterschied: MERODE-ObjectTypes tragen explizit Lebenszyklusinformationen (`lifecycleStates`), DEMO-Entitätstypen tun das nicht, ihr Lebenszyklus wird vollständig aus der Ereignisbeteiligung abgeleitet. Die StateMachine wird deshalb separat über M5 angehängt.

### M2 - Attribut nach Property

Quellkonzept: MERODE Attribut. Ziel: pimUML Property (Name, Typ).

Attribute beschreiben den beobachtbaren Zustand eines MERODE-Objekttyps (Snoeck, S. 149). Sie bilden 1:1 auf pimUML-Properties ab, äquivalent zu Bzowskis A5. Der deklarierte Typ des Attributs bestimmt den Typ-String der Property. Wenn kein Typ deklariert ist, wird `String` als Standard verwendet.

Implementierung: `{ name: a.name, type: a.type ?? "String" }`

Bezug zu DEMO: Äquivalent zu A5. Keine semantische Divergenz auf dieser Ebene.

### M3 - Attribut mit aufgezählter oder benutzerdefinierter Domäne nach Enumeration/DataType

Quellkonzept: MERODE-Attribut, dessen deklarierter Typ eine bekannte aufgezählte oder benutzerdefinierte Domäne ist. Ziel: pimUML Enumeration (wenn kategorisch) oder DataType (wenn nicht-kategorisch).

Snoeck diskutiert Attributdomänen in Kapitel 7 (S. 149-168). Wenn ein Attribut über eine feste Menge von Literalwerten rangiert (z.B. eine Fahrzeugkategorie: economy, standard, luxury), ist die Domäne kategorisch und bildet auf eine pimUML-Enumeration ab. Wenn es sich um eine benutzerdefinierte skalare Domäne handelt (z.B. ein eigenes Datumsformat), bildet sie auf einen benutzerdefinierten DataType ab.

Das spiegelt die A1/A2-Unterscheidung von Bzowski wider, angewendet auf Attributdomänen statt auf eigenständige Konzepte. Der Unterschied: in DEMO sind Value Types Top-Level-Konzepte im Fact Model. In MERODE lebt die Domänenbeschränkung am Attribut selbst.

Implementierung: `merode-schema.json` hat eine Top-Level-`domainTypes`-Liste. Jeder Eintrag hat `name`, `kind` (`"categorical"` oder `"nonCategorical"`) und optional `literals`. Ein Attribut referenziert eine Domäne über seinen `type`-String. Der Agent verarbeitet `domainTypes` vor der ObjectType-Schleife und erzeugt pimUML Enumerations bzw. DataTypes. Die `CarGroup`-Domäne im Rent-A-Car-Fixture demonstriert einen kategorischen Fall.

```typescript
for (const dt of merode.domainTypes ?? []) {
  if (dt.kind === "categorical") {
    enumerations.push({ name: dt.name, literals: dt.literals ?? [] });
  } else {
    dataTypes.push({ name: dt.name });
  }
}
```

Implementiert in `merode-to-pim-agent.ts`, Schema in `merode-schema.json`, Interface `MerodeDomainType` in `schemas/types.ts`.

### M4 - ExistenceDependency nach Association

Quellkonzept: MERODE ExistenceDependency (abhängig, Hauptobjekt, Multiplizität). Ziel: pimUML Association (gerichtet, mit Multiplizitäten).

Existenzabhängigkeiten sind das Herzstück von MERODE (Snoeck, Kap. 4, S. 79). Eine ExistenceDependency besagt, dass jede Instanz des abhängigen Objekttyps immer mit genau einer Instanz des Hauptobjekttyps assoziiert ist und dass der Abhängige nicht über die Lebenszeit des Hauptobjekts hinaus existieren kann.

Die strukturelle Projektion ist eine gerichtete Association vom Abhängigen zum Hauptobjekt mit den angegebenen Multiplizitäten. Die obligatorische `lower`-Schranke auf der Hauptobjektseite (typischerweise 1) spiegelt die existenzielle Bedingung wider.

Implementierung:
```
associations.push({
  name: dep.name,
  memberEnds: [
    { name: "dependent", type: dep.dependent, lower: 0, upper: "*" },
    { name: "master",    type: dep.master,    lower: dep.lower ?? 1, upper: dep.upper ?? 1 }
  ]
})
```

Lebenszyklus-Implikation (nicht implementiert): Snoeck (S. 88, Abschnitt 4.2.5) weist darauf hin, dass Existenzabhängigkeit Lebenszyklus-Implikationen hat: ein abhängiger Objekttyp muss nach dem Hauptobjekt erzeugt werden und muss vor oder gleichzeitig mit ihm enden. Diese Constraints würden idealerweise als OCL-Invarianten auf der Association ausgedrückt. Das ist als Einschränkung dokumentiert.

Bezug zu DEMO: Analog zu A11/A12. Der wichtigste Unterschied: in MERODE drückt jede Association eine Existenzabhängigkeit aus, es gibt keine "bloßen" Assoziationen. Das ist eine bewusste Designbeschränkung in MERODE, die den EDG semantisch präziser macht als ein Standard-UML-Klassendiagramm.

### M5 - ObjectType-Lebenszyklus nach sequenzieller StateMachine

Quellkonzept: MERODE ObjectType mit `lifecycleStates`-Array. Ziel: pimUML StateMachine mit einer Region, die einen initialen Pseudozustand, benannte Simple-Zustände und einen finalen Zustand enthält.

Das ist die zentrale neue Regel ohne DEMO-Gegenstück.

MERODE ist explizit lebenszyklus-orientiert. Jeder Objekttyp besitzt eine FSM, die die sequenziellen Phasen seines Lebens beschreibt. Die Zustände sind geordnet und schließen sich gegenseitig aus: ein Objekt befindet sich zu jedem Zeitpunkt in genau einem Lebenszykluszustand. Übergänge zwischen Zuständen werden durch Geschäftsereignisse ausgelöst (Snoeck, Kap. 6, S. 127).

Der triviale (Standard-)Lebenszyklus besteht aus einer Erzeugungsphase, null oder mehr Modifikationsphasen und einer Beendigungsphase. Snoeck stellt das als einen einzigen aktiven Zustand mit Schleifen für alle modifizierenden Ereignisse dar (Abb. 3.12, S. 68). Nicht-triviale Lebenszyklen haben Zwischenzustände mit stärker eingeschränkten Übergangssequenzen.

Die pimUML-Kodierung verwendet `kind: "initial"` für den initialen Pseudozustand, `kind: "simple"` für jeden benannten Lebenszykluszustand und `kind: "final"` für den finalen Pseudozustand. Das erforderte die Erweiterung von `State.kind` von `{initial, false, true}` auf `{initial, false, true, simple, final}`, additiv und rückwärtskompatibel (DD5 in DESIGN_DECISIONS.md).

Zum Vergleich DEMO-FSMs vs. MERODE-FSMs: DEMO-FSMs bestehen aus orthogonalen Regionen, eine pro Ereignistyp. Jede Region hat genau zwei Zustände: `false` und `true`. Die Regionen können in beliebiger Kombination gleichzeitig aktiv sein. Ereignisse sind monoton (einmal wahr, immer wahr). MERODE-FSMs haben eine Region mit mehreren benannten, sequenziellen Zuständen. Zustände schließen sich gegenseitig aus. Ereignisse bewegen das Objekt von einem Zustand zum nächsten. Ein Beendigungsereignis bewegt das Objekt in einen finalen Zustand, danach sind keine weiteren Ereignisse möglich.

Der im Prototyp genutzte strukturelle Diskriminator: DEMO-Regionen setzen `forEvent` immer (eine Region pro Ereignis), MERODE-Regionen setzen es nie (eine Region gesamt, keine Ereignisannotation). Das wird von `isMerodeFSM()` im nachgelagerten Agenten genutzt.

Implementierung:
```typescript
stateMachines.push({
  name: `SM_${ot.name}`,
  entityType: ot.name,
  regions: [{
    name: "lifecycle",
    states: [
      { name: "__initial", kind: "initial" },
      ...lcStates.map(s => ({ name: s, kind: "simple" })),
      { name: "__final",   kind: "final" }
    ],
    transitions: smTransitions
  }],
  activities: smActivities
})
```

### M6 - Erzeugendes Ereignis (C) nach Übergang vom Initial-Zustand + Create-Aktivität

Quellkonzept: BusinessEventType mit `role: "C"` für einen ObjectType. Ziel: Übergang von `__initial` zum ersten Lebenszykluszustand mit Trigger = Ereignisname, plus eine `Create_<Typ>`-Aktivität (kind: "create").

In MERODE bringt ein erzeugendes Geschäftsereignis (C im OET) eine Objektinstanz ins Dasein (Snoeck, S. 64). In der sequenziellen FSM wird es als der Übergang modelliert, der den initialen Pseudozustand verlässt.

Der erste Lebenszykluszustand ist immer `lcStates[0]`. Wenn keine expliziten Lebenszykluszustände angegeben sind, wird keine FSM generiert.

Implementierung:
```typescript
smTransitions.push({ from: "__initial", to: lcStates[0], trigger: evt.name })
smActivities.push({ name: `Create_${ot.name}`, kind: "create", targetType: ot.name })
```

Bezug zu DEMO: Analog zu A6/A7, die ebenfalls Create-Aktivitäten erzeugen. Der Unterschied: in DEMO ist die Create-Aktivität am `true`-Zustand der Ereignisregion in der übergeordneten Entitäts-FSM angehängt. In MERODE ist es ein Top-Level-Übergang in der eigenen FSM des Objekttyps.

### M7 - Modifizierendes Ereignis (M) nach Zustandsübergang + Set-Aktivität

Quellkonzept: BusinessEventType mit `role: "M"`, optionale `fromState` und `toState`. Ziel: Übergang zwischen zwei Lebenszykluszuständen + `Set_<Typ>_<Ereignisname>`-Aktivität (kind: "set").

Ein modifizierendes Geschäftsereignis (M) ändert den Zustand eines existierenden Objekts, ohne es zu erzeugen oder zu beenden (Snoeck, S. 64). In der FSM ist es ein Übergang zwischen benannten Lebenszykluszuständen.

Die Felder `fromState` und `toState` im MERODE-Schema erlauben die explizite Angabe, welche Zustände der Übergang verbindet. Wenn nicht angegeben, verfällt die Implementierung auf sequenzielle Reihenfolge innerhalb von `lifecycleStates`.

Implementierung:
```typescript
const from  = evt.fromState ?? lcStates[0]
const toIdx = lcStates.indexOf(from) + 1
const to    = evt.toState ?? (toIdx < lcStates.length ? lcStates[toIdx] : lcStates[lcStates.length - 1])
smTransitions.push({ from, to, trigger: evt.name })
// resolve attribute types from OT definition for PSM generation
const effects = (evt.effects ?? []).map(ef => ({
  attribute: ef.attribute,
  type: ot.attributes?.find(a => a.name === ef.attribute)?.type ?? "String"
}))
smActivities.push({ name: `Set_${ot.name}_${evt.name}`, kind: "set", targetType: ot.name,
  ...(effects.length > 0 ? { effects } : {}) })
```

Das optionale `effects`-Array in `BusinessEventType` (MERODE-Schema) listet die Attribute, die ein M-Event ändert. Der Attributtyp wird zur Transformationszeit aus der OT-Attributliste aufgelöst und in der pimUML-Activity mitgegeben, damit die nachgelagerte B15-Regel korrekt typisierte Microflow-Parameter generieren kann - ohne Rückgriff auf das MERODE-Modell.

Bezug zu DEMO: Analog zu den Set-Aktivitäten von A6. Der Hauptunterschied: in DEMO bewegt der Übergang eine boolesche Region von `false` nach `true` (monoton). In MERODE bewegt er sich zwischen zwei benannten, sich gegenseitig ausschließenden Lebenszykluszuständen, und ändert dabei konkrete Attribute.

### M8 - Beendendes Ereignis (E) nach Übergang zum finalen Zustand + End-Aktivität

Quellkonzept: BusinessEventType mit `role: "E"`. Ziel: Übergang vom letzten Lebenszykluszustand nach `__final` + `End_<Typ>`-Aktivität (kind: "end").

Ein beendendes Geschäftsereignis (E) beendet das Leben des Objekts (Snoeck, S. 64). Das Objekt tritt in den finalen Zustand ein und gilt als "beendet", keine weiteren Ereignisse sind möglich. Snoeck betont (S. 53), dass ein Objekt nicht physisch gelöscht werden muss: es existiert für eine Zeitspanne und hört dann auf, Veränderungen zu unterliegen.

Der Übergang geht immer von `lcStates[lcStates.length - 1]` (dem letzten Lebenszykluszustand) nach `__final`. Das ist konsistent mit dem einfachen sequenziellen Lebenszyklusmodell. Bei einem nicht-trivialen FSM mit mehreren möglichen Endzuständen würde jeder seinen eigenen Beendigungsübergang benötigen, aber das aktuelle Schema und Testfixture setzen einen einzigen terminalen Zustand voraus.

Implementierung:
```typescript
const lastState = lcStates[lcStates.length - 1]
smTransitions.push({ from: lastState, to: "__final", trigger: evt.name })
smActivities.push({ name: `End_${ot.name}`, kind: "end", targetType: ot.name })
```

Bezug zu DEMO: Kein Gegenstück. Das ist eine der beiden genuinen neuen Regeln (die andere ist M9). DEMO-Ereignisse sind monotone boolesche Flags, einmal eingetreten, dauerhaft aufgezeichnet. Ein Konzept des "Beendens" eines Objektlebens gibt es in DEMO nicht, weil DEMO-Entitätstypen in diesem Sinne keine Lebenszyklen haben. Diese Regel ist einzigartig für MERODE und motiviert die `end`-Aktivitätskind-Erweiterung in pimUML.

### M9 - Gemeinsame Ereignisbeteiligung und Propagierungsregel

Quellkonzept: OET-Einträge, bei denen mehrere Objekttypen am selben Ereignis beteiligt sind, einschließlich der `A/M`-Einträge, die über die Propagierungsregel abgeleitet werden. Ziel: synchronisierte Übergangstrigger über mehrere FSMs hinweg (eine pro beteiligtem Objekttyp).

Das ist MERODEs charakteristischstes Feature und das ohne jedes DEMO-Gegenstück. In MERODE wird ein einziges Geschäftsereignis von allen beteiligten Objekttypen geteilt. Wenn das Ereignis `startRental` eintritt, erzeugt es nicht nur ein `Rental`-Objekt (O/C in der Rental-Zeile), sondern löst auch modifizierendes Verhalten in `Car` und `Person` aus (A/M-Einträge aus der Propagierungsregel, Snoeck, Kap. 5.3.1, S. 114).

Die Propagierungsregel besagt: wenn Objekttyp B existenzabhängig von A ist (B hängt von A ab), dann bezieht jedes Ereignis, das B einbezieht, auch A mit Beteiligungstyp M ein. Das bedeutet, dass der vollständige OET nicht nur aus ObjectTypes und BusinessEventTypes abgeleitet werden kann, er benötigt auch die ExistenceDependency-Struktur.

Für die Implementierung würde M9 erfordern: alle Existenzabhängigkeiten zu parsen, um die Propagierungshülle aufzubauen; für jeden BusinessEventType die zusätzlichen Objekttypen, die über transitive Propagierung beteiligt sind, abzuleiten; und M-Rollen-Übergänge in den FSMs der betroffenen Hauptobjekttypen zu generieren.

Implementierung: Ein M9-Vorpass berechnet zuerst den **transitiven Abschluss** des EDG (nicht nur direkte Abhängigkeiten). Für jeden Master-OT werden alle transitiv abhängigen OTs gesammelt; deren Events bilden die propagierte Menge. In der SM-Konstruktion jedes Master-OT werden dann Self-Transitionen hinzugefügt: `{ from: state, to: state, trigger: evtName }` für jeden Lebenszykluszustand und jedes propagierte Ereignis. Eine `Set_<Master>_<Ereignis>`-Aktivität (kind: "set") wird mitgeneriert, identisch zur M7-Konvention.

```typescript
// transitive closure
const directDeps = new Map<string, string[]>();
for (const dep of merode.existenceDependencies ?? []) { ... }

function allTransitiveDependents(master, visited = new Set()): string[] { ... }

const propagatedToMaster = new Map<string, string[]>();
for (const ot of merode.objectTypes) {
  const allDeps = allTransitiveDependents(ot.name);
  // collect all events from allDeps
  propagatedToMaster.set(ot.name, eventNames);
}
```

Für das aktuelle Rent-A-Car-Fixture (6 OTs, 3-Hop-EDG-Kette Invoice -> RentalLine -> Rental -> {Car, Branch, Person}) bedeutet das:
- Car, Branch und Person erhalten je **12** propagierte Self-Transitionen (die 6 Rental-Ereignisse, 1-hop; die 3 RentalLine-Ereignisse, 2-hop; die 3 Invoice-Ereignisse, 3-hop) - da alle drei nur einen Lebenszykluszustand haben, ist das je Objekttyp genau eine Self-Transition pro propagiertem Ereignis.
- Rental erhält 6 propagierte Ereignisse (3 von RentalLine, 3 von Invoice), aber weil Rental 4 Lebenszykluszustände hat (active, depositPaid, returned, invoicePaid), materialisiert jedes Ereignis auf jedem Zustand als eigene Self-Transition - macht **24** Self-Transitionen in SM_Rental.
- RentalLine erhält **3** propagierte Self-Transitionen von Invoice (1-hop, ein Lebenszykluszustand).
- Invoice hat keine Master-Rolle, erhält keine propagierten Transitionen.

Insgesamt sind das 45 atomare (Ereignis x Master)-Propagierungsobligationen, die 63 Self-Transitionen im realen, schemagültigen Transform-Output erzeugen (12+12+12+24+3). Vollständige Klassifikationstabelle: `EVAL/FRAMEWORK.md` Abschnitt 2.

B15 im Mendix-Agenten erzeugt daraus Change-Microflows für den Master, die den Status unverändert lassen, weil alle Transitionen des propagierten Triggers Self-Transitionen sind (semantisch ein Participated-Marker).

Implementiert in `merode-to-pim-agent.ts`. Formale Spezifikation: `MerodeMappingRules.md`.

---

## 5. B-Regeln: pimUML nach Mendix

Bzowskis B-Regeln [4], Tabelle 11.1, mit MERODE-spezifischen Erweiterungen (B13-B16 in der Nummerierung dieses Prototyps, entsprechend neuen Regeln, die nicht in Bzowski enthalten sind).

Hinweis zur Nummerierung: Bzowskis Tabelle geht bis B24. Der Prototyp implementiert nicht alle 24 Regeln (einige werden nur für abgeleitete Typen, Constraints usw. benötigt). Die Prototyp-Nummerierung B1-B16 spiegelt wider, was tatsächlich implementiert ist, nicht eine 1:1-Abbildung auf Bzowskis Nummerierung. Die Thesis (Abschnitt 6.4) verwendet diese Nummerierung und gibt je Regel die entsprechenden Bzowski-Regeln an. Die Code-Kommentare in `pim-to-mendix-agent.ts` folgen seit 2026-09-14 derselben Nummerierung und nennen Bzowskis Nummern als "Bzowski Bn".

| ID  | pimUML Quellkonzept | Mendix Ziel | Status |
|-----|---------------------|-------------|--------|
| B1  | Modell (Top-Level) | Mendix App + Modul | implementiert |
| B2  | Class | Entity (Domänenmodell) | implementiert |
| B3  | Class (isAbstract) | Abstrakte Entity | implementiert |
| B4  | Enumeration + EnumerationLiteral | Mendix Enumeration + EnumerationValue (mit englischem Caption) | implementiert |
| B5  | DataType | Entity (kein direktes Domänenmodell-Äquivalent) | implementiert |
| B6  | Property (isID=true) | Integer-Attribut | implementiert |
| B7  | Property (regulär) | String / Integer / Boolean Attribut | implementiert |
| B8  | AssociationClass | Entity + zwei Associations | implementiert |
| B9  | Association + Multiplizitäten | Mendix Association mit Owner/Reference-Einstellungen | implementiert |
| B10 | Generalization | Mendix Generalization/Specialization | implementiert |
| B11 | StateMachine (DEMO) | `ACR_<Entity>`-Microflow (After-Create-Handler): Commit + eine WorkflowCallAction je Region | implementiert |
| B12 | DEMO-Region + false/true-Zustände | ein Workflow `WF_<Entity>_<forEvent>` je Region: WaitForNotification + CallMicroflowTask (Set, ggf. Create) | implementiert |
| B13 | MERODE StateMachine (Lebenszykluszustände) | `<Entity>_Status`-Enumeration | implementiert |
| B14 | MERODE Create-Aktivität | `Create_<Entity>`-Microflow: CreateObject + Status auf ersten Zustand | implementiert |
| B15 | MERODE Set-Aktivität | `Set_<Entity>_<Ereignis>`-Microflow: ChangeObject Status auf Zielzustand (entfällt bei reinen Self-Transitionen) | implementiert |
| B16 | MERODE End-Aktivität | `End_<Entity>`-Microflow: DeleteAction (Objekt wird aus der DB entfernt) | implementiert |
| | Übersichts- und Detailseiten je Entity | Mendix Pages | implementiert |

### B11/B12 - DEMO-StateMachine nach ACR-Microflow und Workflows je Region

Jede Region einer DEMO-StateMachine (A6) wird ein eigener Mendix-Workflow `WF_<Entity>_<forEvent>` mit dem Entity als `WorkflowContext`. Er besteht aus Start, `WaitForNotification` `Wait_<forEvent>` (Trigger, B23 bei Bzowski), `CallMicroflowTask` auf `Set<Entity>_<forEvent>` (Transitionseffekt), optional einem `CallMicroflowTask` auf die Entry-Activity des true-Zustands, z. B. `CreateDepositPaidRental` (B24 bei Bzowski), und End. Der Microflow `ACR_<Entity>` nimmt das Entity als Parameter, committet es und startet danach alle Region-Workflows nacheinander mit je einer `WorkflowCallAction`. Er ist als After-Create-`EventHandler` am Entity registriert, sodass die Workflows beim Anlegen eines Objekts automatisch starten. Der Commit ist nötig, weil Mendix Workflows nur für committete Objekte startet (DD13). Für Rental entstehen sechs Workflows und ein ACR-Microflow mit Commit und sechs Aufrufen.

Das folgt Bzowski [4], Abschnitt 11.2.2-11.2.3 (ein Workflow je Region, `ACR_Rental` mit einer CallWorkflowActivity je Region). Weil alle Workflows gleichzeitig warten, bleiben die Regionen orthogonal: `depositPaid` kann vor `rentalExtended` eintreten. Die Aufteilung in Workflow-Pläne ist als reine Funktion `planRegionWorkflows()` ausgelagert und offline getestet (`mda-agents/tests/test-mendix-workflows.ts`).

Bis 2026-09-14 erzeugte der Agent einen einzigen Workflow `WF_<Entity>` je StateMachine, in dem die Regionen hintereinander verkettet waren. `WF_Rental` wartete dadurch auf `rentalExtended`, bevor es `depositPaid` überhaupt empfangen konnte. Die Orthogonalität der DEMO-Regionen ging so verloren.

### B13 - MERODE-Lebenszykluszustände nach Mendix-Status-Enumeration

Wenn eine MERODE-StateMachine mit `simple`-kind-Zuständen ankommt, erstellt der Agent eine `<Entity>_Status`-Enumeration im Mendix-Domänenmodell. Jeder Lebenszykluszustandsname wird ein Enumerationswert mit einem englischen Caption (Name mit großgeschriebenem Anfangsbuchstaben). Ein `status`-Attribut dieses Enumerationstyps wird der entsprechenden Entity hinzugefügt.

Das ist der einfachste Weg, Lebenszykluszustand in Mendix ohne Workflows darzustellen. Mendix-Workflows sind der "richtige" Weg für Zustandsmaschinen, aber Workflows für sequenzielle MERODE-FSMs zu generieren erfordert wesentlich komplexeren SDK-Code. Der Status-Attribut-Ansatz ist einfacher umzusetzen und macht den Lebenszykluszustand im Domänenmodell sichtbar und in Microflows abfragbar.

### B14 - MERODE Create-Aktivität nach Create-Microflow

Der `Create_<Entity>`-Microflow erzeugt ein neues Entity-Objekt mit `CreateObjectAction` und setzt das `status`-Attribut auf den ersten Lebenszykluszustand mit einem `ChangeObjectAction` und einem `MemberChange`. Der Ausdruck für die Status-Zuweisung ist `<Modul>.<Entity>_Status.<ersterZustand>` ohne Anführungszeichen, weil Mendix-Microflow-Ausdrücke Enum-Referenzen unquoted verwenden, nicht als String-Literale. Das korrekt zu bekommen hat etwas Debugging erfordert (CE0117 durch gequotete Ausdrücke).

### B15 - MERODE Set-Aktivität nach Change-Microflow

Der `Set_<Entity>_<Ereignisname>`-Microflow nimmt die Entity als Pflichtparameter und führt eine `ChangeObjectAction` aus. Der Zielzustand wird von `resolveStatusTarget()` bestimmt: Aus allen Transitionen der Region mit dem Ereignis als Trigger werden die Self-Transitionen (`from === to`) verworfen. Bleibt genau ein Zielzustand übrig, setzt ein `MemberChange` das `status`-Attribut darauf. Bleibt keiner übrig, weil das Ereignis im Lebenszyklus nur Self-Transitionen auslöst (M7-Ereignis ohne Zustandswechsel oder M9-propagiertes Ereignis), wird kein Status-`MemberChange` erzeugt und der Status bleibt erhalten. Mehrere verschiedene Zielzustände führen zu einer Warnung, verwendet wird der erste.

Enthält die pimUML-Activity zusätzlich `effects`, wird für jedes Effect-Attribut ein weiterer Microflow-Parameter (mit korrektem Typ) und ein zusätzlicher `MemberChange` generiert. Für `Set_Rental_extendRental` entsteht damit: Parameter `rental: Rental`, Parameter `newEndingDay: String`, ChangeObject setzt `rental.endingDay = $newEndingDay` und lässt den Status unverändert (`active -> active`). `Set_Rental_payDeposit` setzt `rental.status = depositPaid`. `Set_Rental_addRentalLine` (propagiert von RentalLine) ändert kein Attribut und committet das Objekt nur. Effects auf DataType-typisierte Attribute (z. B. `depositAmount: MoneyAmount`) erhalten einen String-Parameter, aber keinen `MemberChange`, weil das Attribut nach B5 als Association umgesetzt ist (siehe `LIMITATIONS.md`).

Bis 2026-09-14 nahm der Agent die erste Transition mit passendem Trigger (`transitions.find`). Für die sechs propagierten Rental-Ereignisse ist das die Self-Transition `active -> active`, sodass z. B. `Set_Rental_addRentalLine` eine bereits zurückgegebene Miete wieder auf `active` gesetzt hätte. Offline-Test: `mda-agents/tests/test-mendix-status.ts`.

### B16 - MERODE End-Aktivität nach Delete-Microflow

Der `End_<Entity>`-Microflow nimmt die Entity als Parameter und führt eine `DeleteAction` aus. Das entspricht direkt M8: das Objekt "hört auf zu existieren" in der Geschäftsdomäne (Snoeck, S. 53). In Mendix ist das eine permanente Entfernung aus der Datenbank. Alternativ wäre Soft-Delete möglich (Status-Attribut auf einen "ended"-Wert setzen), was aber einen zusätzlichen Enum-Wert im _Status-Enum erfordert. Hard-Delete ist der einfachere, semantisch korrekte Standardfall für die Thesis-Demonstration.

---

## 6. S-Regeln: pimUML nach PostgreSQL-DDL

Zweiter PSM-Pfad, parallel zu den B-Regeln (Abschnitt 5). Beide Pfade konsumieren denselben `model.pim.created`-Artefakt; der Unterschied liegt ausschließlich in der Zielplattform (Mendix-App vs. PostgreSQL-Skript). Implementiert in `mda-agents/pim-to-sql-agent.ts`.

| ID  | pimUML-Quellkonzept | SQL-Ziel | Status |
|-----|---------------------|----------|--------|
| S1  | `enumerations[]` | `CREATE TYPE <name>_enum AS ENUM (...)` | implementiert |
| S2  | `dataTypes[]` | eigene Tabelle, nur `id SERIAL PRIMARY KEY` | implementiert |
| S3  | `associationClasses[]` | Junction-Tabelle mit zwei NOT-NULL-FKs + eigenen Attributspalten | implementiert |
| S4  | `classes[].ownedAttributes[]` (nicht abgeleitet, kein DataType-Typ) | Spalte mit typgemapptem SQL-Typ | implementiert |
| S5  | `ownedAttributes[].isDerived === true` | Spalte wird ausgelassen | implementiert |
| S6  | Attribut mit `type` = Name eines `dataTypes[]`-Eintrags | FK-Spalte auf die DataType-Tabelle (S2) | implementiert |
| S7  | `generalizations[]` | Kind-Tabelle bekommt `<parent>_id`-FK, `ON DELETE CASCADE` | implementiert |
| S8  | `associations[]` (1:1, 1:n) | FK-Spalte auf der Seite mit `upper !== "*"` | implementiert |
| S9  | `associations[]` (n:m) | eigene Junction-Tabelle mit zwei NOT-NULL-FKs | implementiert |
| S10 | `stateMachines[]`, sequenziell (`isMerodeFSM`) | `status`-Spalte + `<Entity>_status_enum` | implementiert |
| S11 | DEMO-orthogonale FSMs | keine Sonderregel - läuft über S4 | implementiert (kein Zusatzcode nötig) |
| S12 | Tabellenreihenfolge | topologischer Sort (Kahn) über den FK-Abhängigkeitsgraphen | implementiert |

Vollständiger Begründungstext pro Regel, Designentscheidung zur DataType-Spiegelung (S2/S6) und die Rent-A-Car-Validierung: `SqlMappingRules.md`.

Der zentrale Unterschied zur MERODE-Integration: der SQL-Agent ist ein reiner Konsument des bestehenden `pimuml-schema.json` und führt keine PIM-Erweiterung ein. Während MERODE neue PIM-Konzepte einführte und damit das gemeinsame Schema additiv erweitern musste (Abschnitt 4.5, M5), deckt der SQL-Agent dieselben pimUML-Konstrukte ab, die B1-B13 bereits konsumieren - nur mit einer anderen Zielsyntax. Das macht ihn zum saubereren der beiden Extensibilitätsnachweise: null Änderungen an `pimuml-schema.json`, `bus-client.ts`, `agent-utils.ts` oder einem der beiden CIM-Agenten (Diff-Nachweis: `EXTENSIBILITY_EVIDENCE.md`).

---

## 7. Sprachübergreifender Vergleich auf PIM-Ebene

Diese Tabelle zeigt, wie DEMO- und MERODE-Quellkonzepte auf pimUML abbilden, und wie das PIM-Konstrukt anschließend von den beiden PSM-Pfaden (Mendix, SQL) weiterverarbeitet wird. Das ist der Vergleich, den die Thesis braucht, um sowohl den CIM-Heterogenitätsanspruch als auch den PSM-Extensibilitätsanspruch konkret zu machen.

| Konzeptkategorie | DEMO-Quelle | MERODE-Quelle | pimUML-Ziel | Gleichwertig? | Mendix-Ziel (B) | SQL-Ziel (S) |
|------------------|------------|---------------|-------------|---------------|------------------|--------------|
| Geschäftsobjekt | EntityType (deklariert) | ObjectType | Class | Ja | Entity (B2) | Tabelle (S4) |
| Identität | Integer-ID aus A3 | ObjectType (ID aus M1) | Property (isID=true) | Ja | Integer-Attribut (B6) | `PRIMARY KEY`-Spalte (S4) |
| Attribut | AttributeType (A5) | Attribut (M2) | Property | Ja | Attribut (B7) | Spalte (S4) |
| Kategorische Domäne | ValueType/kategorisch (A1) | Attribut mit Enum-Domäne (M3) | Enumeration | Ähnlich | Enumeration + Captions (B4) | `CREATE TYPE ... ENUM` (S1) |
| Skalare Domäne | ValueType/nicht-kat. (A2) | Attribut mit skalarer Domäne (M3) | DataType | Ähnlich | Entity ohne Struktur (B5) | Tabelle ohne Struktur (S2) |
| Beziehung | FactType / Property (A12) | ExistenceDependency (M4) | Association | Ähnlich | Association (B9) | FK-Spalte oder Junction-Tabelle (S8/S9) |
| Aggregation | Aggregation Fact (A11) | Kein direktes Gegenstück | Association mit Aggregation | Einseitig | Association-Adornment (B9) | keine Sonderregel, wie reguläre Association |
| Vererbung | Generalisierung (A10) | Kap. 8, nicht im Scope | Generalization | Einseitig | Generalization/Specialization (B10) | Pflicht-FK mit `ON DELETE CASCADE` (S7) |
| Lebenszyklus-FSM | Orthogonale Regionen-FSM (A6) | Sequenzielle FSM (M5-M8) | StateMachine | Verschieden | Workflow (B11/B12) / Status-Enum (B13) | keine Regel (S11) / Status-Spalte (S10) |
| Erzeugendes Ereignis | Event type (A6/A7) | BET mit Rolle C (M6) | Übergang + Create-Aktivität | Ähnlich, Kontext unterschiedlich | Create-Microflow (B14) | `NotMapped` (DDL kennt kein Verhalten) |
| Modifizierendes Ereignis | Event type (A6) | BET mit Rolle M (M7) | Übergang + Set-Aktivität | Ähnlich, aber monoton vs. sequenziell | Set-Microflow (B15) | `NotMapped` |
| Beendendes Ereignis | Kein Gegenstück | BET mit Rolle E (M8) | Übergang zu final + End-Aktivität | Neu in MERODE | Delete-Microflow (B16) | `NotMapped` |
| Gemeinsames Ereignis / Propagierung | Kein Gegenstück | Propagierungsregel (M9) | Synchronisierte Trigger | Neu in MERODE | Change-Microflow (B15) | `NotMapped` |

Die beiden als "Neu in MERODE" markierten Zeilen (M8, M9) sind es, die MERODE auf PIM-Ebene paradigmatisch von DEMO unterscheiden und die PIM-Erweiterung rechtfertigen. Die FSM-Zeile unterscheidet sich im internen Aufbau, kann aber durch dasselbe PIM-Konstrukt mit unterschiedlicher interner Struktur aufgenommen werden.

Die SQL-Spalte zeigt zusätzlich die Grenze zwischen strukturellem und verhaltensbezogenem PIM-Gehalt: alle strukturellen Zeilen (Geschäftsobjekt bis Vererbung) haben ein SQL-Ziel, alle verhaltensbezogenen Zeilen (Ereignisse, Propagierung) werden von den S-Regeln bewusst als `NotMapped` behandelt - ein PostgreSQL-Schema hat kein natives Konzept für Microflow-Logik. Das ist kein Mangel der S-Regeln, sondern eine Eigenschaft der Zielplattform, und macht den Struktur/Verhalten-Schnitt des pimUML-Metamodells selbst sichtbar.

---

## 8. Hinweise für das Thesis-Kapitel

Die formale Präsentation der M-Regeln sollte Bzowskis Format folgen: eine Tabelle mit Quellkonzept, Zielkonzept und Bezug zu DEMO (für vollständigen Begründungstext: MerodeMappingRules.md). Die S-Regeln (Abschnitt 6) sollten analog präsentiert werden (voller Begründungstext: SqlMappingRules.md).

Der sprachübergreifende Vergleich (Abschnitt 7) eignet sich als Abbildung in der Thesis.

Der FSM-Vergleich (orthogonale Regionen vs. sequenziell) ist der zentrale konzeptuelle Beitrag und verdient einen eigenen Unterabschnitt mit Diagrammen: die DEMO-FSM für `Rental` (mit `startRental`/`completeRental` booleschen Regionen) neben der MERODE-FSM (mit `active`-Zustand und `__initial`/`__final`-Pseudozuständen).

Die pimUML-Schema-Änderungen (State.kind-Erweiterung, Activity.kind-Erweiterung, Region.forEvent optional) sollten als kleine Diff-Tabelle präsentiert werden, nicht als vollständiges Schema-Listing.

Für M9: die formale Regel vollständig präsentieren - die Implementierung ist inzwischen vollständig und gegen echten, schemagültigen Transform-Output verifiziert (3-Hop-EDG-Kette, siehe oben). M9 ist die akademisch interessanteste Regel und rechtfertigt eine vollständige formale Spezifikation in der Thesis.
