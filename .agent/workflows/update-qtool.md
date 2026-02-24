---
description: Workflow für sichere Code-Updates und PDF-Verifikation im QTool
---

Dieser Workflow stellt sicher, dass tiefgreifende Änderungen an den Hauptkomponenten (wie DamageForm.jsx) sicher durchgeführt und verifiziert werden.

1. **Änderung analysieren & umsetzen**:
   Setze die gewünschte Funktion oder Layout-Änderung in der entsprechenden Komponente um.

2. **Syntax-Validierung**:
   Stelle sicher, dass keine JSX-Fehler oder Klammer-Fehler entstanden sind.
   // turbo
   `node check_syntax.js src/components/DamageForm.jsx`

3. **Integrität der PDF-Dokumentation**:
   Falls Änderungen am PDF-Export vorgenommen wurden, prüfe die `src/components/pdf/DamageReportDocument.jsx` ebenfalls auf Syntaxfehler.
   // turbo
   `node check_syntax.js src/components/pdf/DamageReportDocument.jsx`

4. **Git-Sicherung**:
   Erstelle einen präzisen Commit mit allen Änderungen.
   `git add .`
   `git commit -m "[Beschreibung der Änderung]"`

5. **Finaler Push**:
   Pushe den Stand auf das Repository.
   `git push origin main`
