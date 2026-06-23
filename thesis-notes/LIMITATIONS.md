# Einschränkungen und Scopegrenzen

Dieses Dokument hält fest, was der Prototyp nicht kann und warum. Für die Thesis gehört dieses Material in einen Limitations-Abschnitt und einen Future-Work-Abschnitt. Der Unterschied: eine Einschränkung ist etwas, das das System innerhalb des definierten Scopes nicht leistet; Future Work liegt außerhalb des Scopes und wäre ein natürlicher nächster Schritt. Jede Einschränkung sollte mit einer Begründung (warum akzeptabel) und einem kurzen Ausblick (was es bräuchte, um sie zu beheben) dargestellt werden.

---

## 1. Lücken bei den M-Regeln

### M3 - Attributdomänen nicht modelliert

Wenn ein MERODE-Attribut eine aufgezählte Domäne hat (z.B. `carGroup: {economy, standard, luxury}`) oder eine benutzerdefinierte skalare Domäne, behandelt die aktuelle Implementierung das Attribut als einfaches `String`-Attribut. Es wird weder eine pimUML-Enumeration noch ein DataType für die Domäne erzeugt.

Das Problem liegt im Schema: `merode-schema.json` definiert den Attributtyp als einfachen String (`"type": { "type": "string" }`). Es gibt keinen Mechanismus, über den angegeben werden kann, dass ein Typname auf eine aufgezählte Domäne mit konkreten Werten verweist. M3 zu implementieren würde erfordern, entweder ein `domains`-Array zum MERODE-Schema hinzuzufügen (analog zu DEMOs `valueTypes`) oder Attribute inline um Enum-Definitionen zu erweitern.

Für die Evaluation bedeutet das: jedes MERODE-Modell, das aufgezählte Attributdomänen verwendet, verliert diese Information beim Durchlaufen der Pipeline. Die Elemente erscheinen in der Vollständigkeitsbewertung als Missing. Für das Rent-A-Car-Fixture, das nur String-Attribute hat, gibt es keine Auswirkung.

Aufwandsschätzung für eine Korrektur: mittel. `merode-schema.json` um ein `domainTypes`-Array erweitern, `types.ts` um einen `MerodeDomainType`-Interface ergänzen, und die Verarbeitungslogik im `merode-to-pim-agent.ts` hinzufügen. Das pimUML-Schema unterstützt Enumeration und DataType bereits.

### M9 - Gemeinsame Ereignisbeteiligung und Propagierung nicht implementiert

In MERODE werden Geschäftsereignisse über mehrere Objekttypen hinweg geteilt. Die Propagierungsregel (Snoeck, Kap. 5.3.1, S. 114) besagt: wenn ein Ereignis einen abhängigen Objekttyp einbezieht, bezieht es automatisch auch alle Hauptobjekttypen mit ein (mit Typ M). Zum Beispiel schließt `startRental` Rental (O/C), Car (A/M) und Person (A/M) ein.

Die aktuelle Implementierung verarbeitet nur die Eigentümerbeteiligung. Das `role`-Feld auf einem BusinessEventType entspricht der C/M/E-Rolle des Eigentümers im OET. Die propagierten A/M-Beteiligungen der Hauptobjekttypen werden nicht verarbeitet.

Warum fehlt das: M9 korrekt zu implementieren erfordert den Aufbau einer Propagierungshülle aus dem EDG (alle Existenzabhängigkeiten transitiv traversieren), für jedes Ereignis mit einem abhängigen Objekt alle über die Abhängigkeitskette erreichbaren Hauptobjekttypen zu finden, M-Rollen-Übergänge in den FSMs dieser Hauptobjekttypen einzufügen und Fälle mit mehrstufigen Propagierungsketten zu behandeln. Das ist nicht trivial, und das Testfixture modelliert nur Eigentümerbeteiligungen explizit.

Auswirkung auf die Evaluation: erheblich. Das OET wird nur teilweise erfasst. Im Rent-A-Car-Fall sollten `startRental` und `completeRental` auch als modifizierende Ereignisse in Car und Person erscheinen, was in der aktuellen Ausgabe nicht der Fall ist. Diese Elemente erscheinen als Missing.

M9 ist aus Forschungsperspektive die interessanteste Regel: sie hat das geringste DEMO-Analogon und zeigt am deutlichsten MERODEs paradigmatischen Unterschied. Die formale Spezifikation von M9 sollte in der Thesis stehen, auch wenn die Implementierung unvollständig ist.

---

## 2. Lücken bei den B-Regeln

### B16 - End-Microflow ist ein Stub

Der `End_<Entity>`-Microflow wird mit einem Parameter-Knoten generiert. Er implementiert kein tatsächliches Beendigungsverhalten: keine Löschung, keine Archivierung, keine Statusänderung.

Wie ein Objekt in Mendix "beendet" werden soll, ist eine Anwendungsentscheidung, keine Modellentscheidung. Möglichkeiten sind das Setzen von `status = final` (wenn das Status-Attribut aus B13 genutzt wird), Soft-Deletion über ein `deletedAt`-Zeitstempel-Attribut mit Filterung, Hard-Deletion über `DeleteObjectAction` oder Archivierung. Die richtige Wahl hängt von den Anwendungsanforderungen ab, die das pimUML-`end`-Aktivitätskonstrukt nicht vorschreibt.

Aufwandsschätzung: gering, sobald die Designentscheidung (Hard-Delete vs. Soft-Delete) getroffen ist.

### Workflow-Generierung für MERODE entfällt

Die DEMO-Pipeline erzeugt für jeden Entitytyp-FSM einen Mendix-Workflow mit WaitForNotification-Aktivitäten. Die MERODE-Pipeline tut das nicht. Der `isMerodeFSM()`-Check im `pim-to-mendix-agent` überspringt die Workflow-Generierung für MERODE-Zustandsmaschinen.

Mendix-Workflows sind für langläufige Prozesse mit menschlichen Interaktionspunkten konzipiert. Sie passen gut zu DEMOs booleschen Regionen, weil jede Region eine Workflow-Warteaktivität werden kann. MERODEs sequenzielle FSMs lassen sich nicht so direkt auf Mendix-Workflows abbilden: die Lebenszykluszustände würden zu Workflow-Aktivitäten, aber die Trigger-und-Übergangs-Struktur ist grundlegend anders.

Konkret: Als der Workflow-Generator auf einen MERODE-FSM traf, versuchte er eine `WaitForNotification`-Aktivität namens `Wait_<forEvent>` anzulegen. MERODE-Regionen haben aber kein `forEvent`, was den Namen `Wait_undefined` erzeugte. Das war der Fehler, der zum `isMerodeFSM()`-Skip geführt hat.

Möglicher Lösungsansatz: jeden Lebenszykluszustand auf einen Workflow-Aktivitätstyp abbilden und jeden Übergang auf die Fortschrittslogik. Das würde neue B-Regel-Definitionen erfordern und ist als Future Work vorgesehen.

---

## 3. Nicht abgedeckte MERODE-Konzepte

Die folgenden MERODE-Konzepte aus Snoeck [21] sind explizit nicht im Scope.

### Vererbung (Kapitel 8)

Snoeck widmet der Vererbung in MERODE ein vollständiges Kapitel. Objekttypen können durch Attribute (attribut-definierte Unterklasse), Existenz (existenz-definierte Unterklasse) oder Zustand (zustands-definierte Unterklasse) spezialisiert werden. Jede Form hat andere Implikationen für Ereignisbeteiligung und Lebenszyklus-Modellierung.

Die aktuelle Implementierung behandelt Vererbung nicht. Das Rent-A-Car-Fallbeispiel benötigt sie nicht, und das Proposal listet sie nicht als erforderliches Lieferobjekt. Vererbung könnte durch M-Regeln analog zu A10 umgesetzt werden und wäre in der Thesis als natürliche Erweiterung zu dokumentieren.

### Constraints (Kapitel 7.2)

Snoeck definiert Eindeutigkeitsbedingungen, Attributbeschränkungen, Methodenbedingungen (Vorbedingungen für Ereignisse), referenzielle Integritätsbedingungen und Sequenzbeschränkungen. Nichts davon wird aktuell in `merode-schema.json` erfasst oder vom Agenten verarbeitet. Das korrekte Erfassen von Constraints würde das Schema erheblich erweitern und entsprechende Mendix-Logik erfordern.

### IS-Service-Schicht und Business-Process-Schicht (Kapitel 9 und 10)

Snoecks IS-Service-Schicht beschreibt Eingabedienste (Ereigniserzeugung) und Ausgabedienste (Informationsabruf). Die Business-Process-Schicht zeigt, wie Geschäftsprozesse mit dem Domänenmodell verknüpft werden. Beides liegt außerhalb des Scopes. Der Fokus liegt auf dem Domänenmodell (EDG, OET und FSMs) als CIM-Eingabe.

---

## 4. Architektonische Einschränkungen

### Der `isMerodeFSM()`-Diskriminator ist fragil

Der Mechanismus, der DEMO-FSMs von MERODE-FSMs im nachgelagerten Agenten unterscheidet, basiert darauf, dass DEMO-Regionen immer `forEvent` setzen und MERODE-Regionen das nie tun. Das ist eine Eigenschaft der PIM-Kodierung, kein explizites Sprach-Tag.

Eine dritte Sprache, die FSMs ohne Ereignisannotationen verwendet, würde vom Diskriminator falsch als "MERODE-artig" klassifiziert. Der sauberere Ansatz wäre ein explizites `fsmStyle: "orthogonal" | "sequential"`-Feld in der StateMachine-Definition. Aber für den aktuellen Scope (DEMO und MERODE) ist der strukturelle Diskriminator ausreichend.

### Einzelne Fallstudie begrenzt den Evaluationsumfang

Die Evaluation (D7) gilt nur für das Rent-A-Car-Fallbeispiel. Snoeck nutzt eine Bibliotheks-Fallstudie als laufendes Beispiel; Bzowski nutzt Rent-A-Car. Der direkte Vergleich mit Bzowskis Ergebnissen ist damit möglich, aber die Evaluation testet keine Randfälle, die im Modell nicht vorkommen: keine Vererbung, keine Constraints, keine mehrstufigen Propagierungsketten, nur ein erzeugender Ereignistyp pro Objekttyp. Eine vollständigere Evaluation würde mehrere Fallstudien verwenden.

### Mendix-Applikation braucht Cloud-Lizenz zum Ausführen

Die Ausgabe ist ein valides Mendix-Modell, das in Mendix Studio Pro geöffnet werden kann. Das tatsächliche Ausführen der Applikation erfordert eine Mendix-Cloud-Umgebung oder eine lokale Runtime-Lizenz. Die Evaluation bewertet daher die strukturelle Validität des generierten Modells (keine Mendix-Fehler/Warnungen), nicht das Laufzeitverhalten.

### Konfigurationsabhängigkeit bei PIM-Quellagenten

Der `pim-to-mendix-agent` abonniert PIM-Topics von den Agenten, die in der Umgebungsvariable `PIM_PUBLISHER_AGENT_IDS` aufgelistet sind. Wenn ein dritter Agent hinzugefügt wird, muss diese Variable aktualisiert werden. Das ist eine Konfigurationsänderung, kein Codechange, aber der nachgelagerte Agent ist dadurch nicht vollständig oblivious gegenüber der Menge der vorgelagerten Agenten. Für das Extensibilitätskriterium ist das ein Grenzfall, der in EXTENSIBILITY_EVIDENCE.md diskutiert wird.

---

## 5. Behobene Implementierungsfehler

Diese werden dokumentiert, falls Gutachter danach fragen.

**CE7247:** Der anfängliche M1-Code nutzte `name: "id"` für den logischen Bezeichner. Mendix reserviert `id` als Systemattributname. Behoben durch Verwendung von `name: \`${ot.name}ID\`` (z.B. `RentalID`).

**CE0117:** Die anfängliche B14-Implementierung umschloss Enum-Literal-Ausdrücke in einfache Anführungszeichen (`'Module.Enum.Value'`). Mendix-Microflow-Ausdrücke verwenden Enum-Referenzen ohne Anführungszeichen (`Module.Enum.Value`). Behoben durch Entfernen der Anführungszeichen aus dem `MemberChange.value`-String.

**CW0263:** Mendix verlangt mindestens einen sprachspezifischen Caption für jeden Enum-Wert. Die anfängliche Implementierung erstellte Enum-Werte ohne Captions. Behoben durch automatisches Hinzufügen eines englischen Captions (erster Buchstabe großgeschrieben) über `texts.Text.createInEnumerationValueUnderCaption(v)`.

**Wait_undefined im Workflow-Generator:** Der Workflow-Generator versuchte eine WaitForNotification-Aktivität namens `Wait_${region.forEvent}` anzulegen. Für MERODE-Regionen, wo `forEvent` undefined ist, ergab das `Wait_undefined`. Behoben durch den `isMerodeFSM()`-Check, der die Workflow-Generierung für MERODE-FSMs überspringt.

**MERODE-PIM erreichte den Mendix-Agenten nicht:** Der `pim-to-mendix-agent` war darauf hardcodiert, nur das MQTT-Topic des DEMO-Agenten zu abonnieren. MERODE-PIM-Nachrichten wurden stillschweigend ignoriert. Behoben durch Umstellung auf den `PIM_SOURCE_AGENTS`-Mehrfach-Abonnement-Ansatz.
