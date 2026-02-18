# Kontroll- und Korrekturplan: Q-Service Upload & Extraktion

Dieser Plan stellt sicher, dass die Implementierung, vom Frontend bis zur Datenbank und KI-Analyse, korrekt und robust ist.

## 1. Frontend Integration (React)

### A. DamageForm.jsx (Hauptkomponente)
- [ ] **Platzierung prüfen**: `UploadPanel` muss direkt unter dem Header (Projekt-Titel & Status) und *vor* dem "Auftrag & Verwaltung" Block platziert werden.
- [ ] **State Management**:
    - `caseId` muss korrekt an `UploadPanel` übergeben werden.
    - Wenn `UploadPanel` eine neue `caseId` generiert (bei neuen Projekten), muss diese an `DamageForm` zurückgemeldet werden (`setCaseId` oder Update von `formData.id`).
    - **WICHTIG**: Wenn die Extraktion fertig ist, müssen die Daten (Adresse, Kontakte, etc.) in das `formData` des `DamageForm` übernommen werden. Dafür fehlt noch ein Callback (z.B. `onImport`).

### B. UploadPanel.jsx
- [ ] **Case ID Handling**: Sicherstellen, dass eine `caseId` existiert oder erstellt wird, bevor der Upload startet.
- [ ] **Upload Logik**: Upload in Bucket `case-files` mit Pfad `cases/{caseId}/original/{filename}`.
- [ ] **DB Eintrag**: Neuer Eintrag in `case_documents` mit Status `pending`.
- [ ] **Trigger**: Aufruf der Edge Function `extract` via Supabase Client.
- [ ] **Feedback Loop**:
    - Warten auf Antwort der Edge Function.
    - Bei Erfolg: Empfangene Daten (JSON) an `DamageForm` übergeben (neue Prop `onExtractionComplete` notwendig).
    - Status-Anzeige für den User aktualisieren.

## 2. Datenbank (Supabase)

### A. Tabellen & Speicher (Migration)
- [x] **Bucket**: `case-files` existiert und ist public/authenticated accessible.
- [x] **Tabelle**: `case_documents` (Tracking der Dateien).
- [x] **Tabelle**: `case_extractions` (Speichern der Rohergebnisse).
- [x] **RLS**: Policies auf `authenticated` gesetzt (wie gewünscht).

### B. Datenfluss
- [ ] Prüfen, ob der User (auch anonym/lokal) Schreibrechte hat (RLS Policies in `schema.sql` bzw. Migration prüfen). *Korrektur: Policies wurden im letzten Schritt auf 'authenticated' gesetzt. Wenn die App lokal ohne Login läuft, könnte das blockieren. Ggf. 'anon' Policies für Dev-Mode lassen oder Login erzwingen.*

## 3. Backend Logic (Edge Function)

### A. Funktion `extract`
- [ ] **Imports**: Deno-Imports (URL-basierte Imports) müssen korrekt sein.
- [ ] **Ablauf**:
    1. `document_id` empfangen.
    2. Datei aus Storage laden.
    3. (Mock) Text extrahieren (PDF Parsing ist complex on Edge).
    4. (Mock) KI-Analyse simulieren oder an OpenAI senden.
    5. Ergebnis in `case_extractions` speichern.
    6. Ergebnis in `damage_reports` (Spalte `report_data`) mergen.
    7. Ergebnis als JSON Response zurückgeben (für direktes UI Update).

## 4. Durchführung der Korrekturen

1. **UploadPanel.jsx erweitern**: Callback `onUploadComplete` (oder ähnlich) hinzufügen, um extrahierte Daten an `DamageForm` zu senden.
2. **DamageForm.jsx anpassen**:
    - `UploadPanel` an der richtigen Stelle einfügen.
    - Callback-Funktion implementieren, die `formData` mit den neuen Daten mergt (ähnlich wie `handleEmailImport`).
3. **Edge Function Deploy**: Sicherstellen, dass die Function deploybar ist (Syntax-Check).

---

## Nächste Schritte
Ich werde nun Schritt für Schritt diese Punkte abarbeiten. Startend mit dem Einbau in `DamageForm.jsx` an der korrekten Stelle und der Erweiterung des `UploadPanel` um den Callback.
