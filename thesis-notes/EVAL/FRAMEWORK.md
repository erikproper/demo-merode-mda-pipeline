# Evaluationsrahmen (D6)

Arbeitsdokument zur Planung und Durchführung der Evaluation (D7). Die Methodik folgt Proposal-Abschnitt 3.3 und kombiniert das Semiotic Quality Framework [12] mit dem Quality Framework for Conceptual Models [14].

Gemessen werden vier Dimensionen: semantische Vollständigkeit, semantische Validität, Schema Validation Rate und Traceability Coverage. Extensibilität wird separat bewertet (EXTENSIBILITY_EVIDENCE.md).

---

## 1. Evaluationsablauf

Die Evaluation läuft in drei Phasen.

In der ersten Phase wird die Ground Truth extrahiert: alle atomaren Aussagen im Quellmodell (Rent-A-Car DEMO und MERODE) werden aufgelistet. Eine "atomare Aussage" ist die kleinste Bedeutungseinheit in der Quellsprache. Für DEMO sind das: Entitätstypen, Faktentypen (mit Multiplizitäten), Eigenschaftstypen, Werttypen und Ableitungsregeln. Für MERODE: Objekttypen (mit Attributen), Existenzabhängigkeiten (mit Multiplizitäten), Geschäftsereignistypen (mit C/M/E-Rolle) und Lebenszykluszustände (mit Übergangsstruktur).

In der zweiten Phase wird die Pipeline ausgeführt:
```bash
curl -X POST https://mda.tlolab.com/api/model \
  -H "Content-Type: application/json" \
  -H "X-Input-Format: merode" \
  -d @mda-agents/tests/rent-a-car-merode.json
```
Das veröffentlichte PIM (aus MQTT) und die generierte Mendix-Modellstruktur werden festgehalten, ebenso das `_trace`-Array aus der PIM-Nachricht.

In der dritten Phase werden die Ausgabeelemente klassifiziert. Für jede Ground-Truth-Aussage wird das entsprechende Ausgabeelement bewertet:

- **Correct (C):** im Ausgabemodell vorhanden, mit korrektem Typ und korrekter Struktur
- **Missing (M):** nicht vorhanden oder stillschweigend verworfen
- **Incorrect (I):** vorhanden, aber mit falschem Typ, falscher Struktur oder falschen Beziehungen
- **Added (A):** im Ausgabemodell vorhanden, aber ohne Gegenstück im Quellmodell; unterteilt in Added_justified (strukturell notwendig, z.B. `__initial`-Pseudozustände) und Added_unjustified (überflüssige Ergänzungen)

Daraus ergeben sich die Metriken: Completeness = C / (C + M + I), Validity = C / (C + I + Added_unjustified), Schema Validation Rate = immer 100% oder die Pipeline bricht ab, Traceability Coverage = Elemente mit Trace-Links / (alle Elemente ausgenommen explizit NotMapped).

---

## 2. Ground Truth: Rent-A-Car MERODE

Quellmodell: `mda-agents/tests/rent-a-car-merode.json`

### Objekttypen (M1, M2)

| Aussage | Erwartete PIM-Ausgabe | Klassifikation |
|---------|----------------------|----------------|
| ObjectType: Rental | Class "Rental" + Property "RentalID" (Integer, isID) | noch zu prüfen |
| ObjectType: Car | Class "Car" + Property "CarID" (Integer, isID) | noch zu prüfen |
| ObjectType: Person | Class "Person" + Property "PersonID" (Integer, isID) | noch zu prüfen |
| Attribut: Rental.startingDay (String) | Property "startingDay" auf Rental | noch zu prüfen |
| Attribut: Rental.endingDay (String) | Property "endingDay" auf Rental | noch zu prüfen |
| Attribut: Car.licensePlate (String) | Property "licensePlate" auf Car | noch zu prüfen |
| Attribut: Person.name (String) | Property "name" auf Person | noch zu prüfen |

### Existenzabhängigkeiten (M4)

| Aussage | Erwartete PIM-Ausgabe | Klassifikation |
|---------|----------------------|----------------|
| ExistenceDependency: Rental zu Car (0..* : 1..1) | Association "RentalDependsOnCar" mit korrekten Multiplizitäten | noch zu prüfen |
| ExistenceDependency: Rental zu Person (0..* : 1..1) | Association "RentalDependsOnPerson" mit korrekten Multiplizitäten | noch zu prüfen |

### Geschäftsereignistypen und Lebenszyklus (M5-M8)

| Aussage | Erwartete PIM-Ausgabe | Klassifikation |
|---------|----------------------|----------------|
| BET: startRental, Rolle C für Rental | SM_Rental: Übergang __initial nach active, Trigger startRental | noch zu prüfen |
| BET: completeRental, Rolle E für Rental | SM_Rental: Übergang active nach __final, Trigger completeRental | noch zu prüfen |
| BET: registerCar, Rolle C für Car | SM_Car: Übergang __initial nach registered, Trigger registerCar | noch zu prüfen |
| BET: registerPerson, Rolle C für Person | SM_Person: Übergang __initial nach registered, Trigger registerPerson | noch zu prüfen |
| Lebenszyklus: Rental hat Zustand "active" | SM_Rental: State {name:"active", kind:"simple"} | noch zu prüfen |
| Lebenszyklus: Car hat Zustand "registered" | SM_Car: State {name:"registered", kind:"simple"} | noch zu prüfen |
| Lebenszyklus: Person hat Zustand "registered" | SM_Person: State {name:"registered", kind:"simple"} | noch zu prüfen |

### Propagierte Ereignisse (M9, transitive Propagierung implementiert)

M9 ist implementiert mit vollständigem transitivem Abschluss des EDG. Alle A/M-Einträge werden korrekt abgeleitet:

| Aussage | Erwartete PIM-Ausgabe | Erwartete Klassifikation |
|---------|----------------------|--------------------------|
| BET: startRental, A/M für Car (1-hop) | Self-Transition in SM_Car, trigger=startRental | Correct |
| BET: startRental, A/M für Person (1-hop) | Self-Transition in SM_Person, trigger=startRental | Correct |
| BET: completeRental, A/M für Car (1-hop) | Self-Transition in SM_Car, trigger=completeRental | Correct |
| BET: completeRental, A/M für Person (1-hop) | Self-Transition in SM_Person, trigger=completeRental | Correct |
| BET: addRentalLine, A/M für Rental (1-hop) | Self-Transition in SM_Rental, trigger=addRentalLine | Correct |
| BET: updateRentalLine, A/M für Rental (1-hop) | Self-Transition in SM_Rental, trigger=updateRentalLine | Correct |
| BET: removeRentalLine, A/M für Rental (1-hop) | Self-Transition in SM_Rental, trigger=removeRentalLine | Correct |
| BET: addRentalLine, A/M für Car (2-hop via Rental) | Self-Transition in SM_Car, trigger=addRentalLine | Correct |
| BET: updateRentalLine, A/M für Car (2-hop via Rental) | Self-Transition in SM_Car, trigger=updateRentalLine | Correct |
| BET: removeRentalLine, A/M für Car (2-hop via Rental) | Self-Transition in SM_Car, trigger=removeRentalLine | Correct |
| BET: addRentalLine, A/M für Person (2-hop via Rental) | Self-Transition in SM_Person, trigger=addRentalLine | Correct |
| BET: updateRentalLine, A/M für Person (2-hop via Rental) | Self-Transition in SM_Person, trigger=updateRentalLine | Correct |
| BET: removeRentalLine, A/M für Person (2-hop via Rental) | Self-Transition in SM_Person, trigger=removeRentalLine | Correct |

### Hilfsstrukturen (Added_justified)

Diese erscheinen in der PIM-Ausgabe ohne direktes Gegenstück im Quellmodell, sind aber strukturell notwendig:

| Hinzugefügtes Element | Begründung |
|----------------------|-----------|
| Zustand `__initial` in jeder SM | Vom pimUML-StateMachine-Format geforderter initialer Pseudozustand |
| Zustand `__final` in jeder SM | Vom pimUML-StateMachine-Format geforderter finaler Zustand |
| Region "lifecycle" in jeder SM | Notwendiger Wrapper für Zustände und Übergänge |

Diese zählen als Added_justified und werden nicht als Validitätsfehler gewertet.

---

## 3. Ground Truth: Rent-A-Car DEMO

Quellmodell: `mda-agents/tests/rent-a-car-demo.json`

Dieser Abschnitt wird beim Durchführen der Regressionsevaluation ausgefüllt. Die DEMO-Evaluation folgt derselben Struktur wie Bzowskis Tabelle 10.1.

Zu evaluierende Aussagen: EntityTypes (A3), Car, Person, Rental (zu Classes mit IDs), FactTypes und Assoziationen (A12), EventTypes (A6) mit booleschen Regionen in FSMs, AttributeTypes (A5) auf den Entitätstypen.

Erwartetes Ergebnis: alle vorher korrekt funktionierenden DEMO-Elemente bleiben nach den MERODE-Ergänzungen als Correct klassifiziert. Jede Regression wäre kritisch.

---

## 4. Mendix-seitige Evaluation (Schema Validation Rate)

Nach dem Ausführen der Pipeline das generierte Mendix-Modell in Mendix Studio Pro öffnen und prüfen: keine Fehler (CE-Präfix) und idealerweise keine Warnungen (CW-Präfix) oder diese dokumentieren.

Nach dem Beheben von CE7247, CE0117 und CW0263 sollte das Modell ohne Fehler öffnen. Diesen Check nach jeder Code-Änderung wiederholen. Screenshot des Mendix-Fehlerbereichs mit Anzahl und Typ möglicher Probleme erstellen, das ist der empirische Nachweis für den 100%-SVR-Anspruch.

---

## 5. Traceability Coverage

Das `_trace`-Array in jeder veröffentlichten PIM-Nachricht enthält Trace-Einträge als `{ sourceType, sourceName, targetType, targetName }`. Zur Berechnung der Traceability Coverage: das `_trace`-Array aus der MERODE-PIM-Nachricht extrahieren (aus der MQTT-Retained-Message oder den Konsolenausgaben), Einträge mit `targetType != "NotMapped"` zählen (nachverfolgte Elemente), Einträge mit `targetType == "NotMapped"` zählen (explizit nicht nachverfolgbar, akzeptabel für M9), und Coverage = verfolgt / (verfolgt + nicht verfolgt) berechnen.

M9 ist implementiert (transitive Propagierung). Alle propagierten Ereignisse erhalten einen Trace-Eintrag (`targetType: "Transition"`, `targetName: "<OT>.<evt> (M9 propagated)"`). Es gibt keine NotMapped-Einträge mehr für propagierte Ereignisse. NotMapped-Einträge entstehen nur noch bei BusinessEventTypes ohne Role-Angabe (kein C/M/E).

---

## 6. Gliederungsplan für das Thesis-Kapitel

Das Evaluationskapitel sollte folgende Struktur haben: Versuchsaufbau (Fallstudie, Quellmodelle, Pipeline-Konfiguration), Ground-Truth-Extraktion (atomare Aussagen für jede Quellsprache in tabellarischer Form), Transformationsergebnisse für DEMO (Klassifikationstabelle, Vollständigkeit/Validität, Vergleich mit Bzowskis Ergebnissen), Transformationsergebnisse für MERODE (Klassifikationstabelle, explizite Nennung der fehlenden M9-Elemente), Mendix-Modellvalidierung (Screenshot, Fehleranzahl, SVR = 100%), Traceability (Abdeckungsprozentsatz, Liste der NotMapped-Elemente mit Begründungen), Extensibilität (Git-Diff beim Hinzufügen von MERODE, Verweis auf EXTENSIBILITY_EVIDENCE.md) und Diskussion (was die Werte bedeuten, wie die Ergebnisse RQ3 und RQ4 beantworten).

---

## 7. Erwartete Ergebnisse (Vorab-Schätzung)

Vor der formalen Evaluation eine grobe Einschätzung auf Basis des aktuellen Implementierungsstands.

Für DEMO sollten alle vier Metriken nah an Bzowskis Ergebnissen liegen. Jede Abweichung würde als Regression im DEMO-Pfad sichtbar.

Für MERODE sollte die semantische Vollständigkeit nun nahe 100% liegen, da M9 mit transitivem Abschluss implementiert ist. Die ground-truth-Aussagen umfassen alle OT-Attribute, ExistenzAbhängigkeiten, BETs (O/C, O/M, O/E) und die abgeleiteten A/M-Einträge — alle sind im PIM-Ausgang abgedeckt. Bekannte verbleibende Einschränkung: M7-modifizierte Attribute (z.B. mileage bei updateCarMileage) werden nicht in Mendix gesetzt — nur der Lifecycle-Status. Das ist eine dokumentierte Einschränkung des B15-Microflows.

Die semantische Validität dürfte hoch sein, möglicherweise 100%, wenn keine falsch transformierten Elemente gefunden werden. Die bekannten Fehler CE7247, CE0117 und CW0263 sind behoben.

Die Schema Validation Rate ist konstruktionsbedingt 100%, da die Pipeline bei jedem Validierungsfehler abbricht.

Die Traceability Coverage (ohne NotMapped) dürfte nahe 100% liegen, weil jede implementierte Regel einen Trace-Eintrag erzeugt. Die vier M9-Ereignisse produzieren NotMapped-Einträge.
