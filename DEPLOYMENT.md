# Projekt online verfügbar machen (Deployment)

Um das Projekt "scharf" zu stellen und für andere Teilnehmer sichtbar zu machen, gibt es zwei Hauptwege:

## Option 1: Cloud-Hosting (Empfohlen für weltweiten Zugriff)
Der einfachste Weg für moderne Web-Apps ist die Nutzung von **Vercel** oder **Netlify**. Diese Dienste sind für React-Apps optimiert.

### Voraussetzungen
1.  Der Code muss auf **GitHub** verfügbar sein (das hast du bereits gemacht).
2.  Du benötigst einen Account bei [Vercel](https://vercel.com) oder [Netlify](https://netlify.com).

### Schritte (Beispiel Vercel)
1.  Melde dich bei Vercel mit deinem GitHub-Account an.
2.  Klicke auf "Add New..." -> **"Project"**.
3.  Wähle dein `qservice` Repository aus importiere es.
4.  **WICHTIG: Environment Variables konfigurieren**
    Bevor du auf "Deploy" klickst, musst du die Umgebungsvariablen für Supabase hinzufügen (da diese nicht in GitHub gespeichert sind):
    *   Öffne den Abschnitt **"Environment Variables"**.
    *   Name: `VITE_SUPABASE_URL` -> Wert: (Dein URL aus `.env.local` oder Supabase Settings)
    *   Name: `VITE_SUPABASE_ANON_KEY` -> Wert: (Dein Key aus `.env.local` oder Supabase Settings)
5.  Klicke auf **"Deploy"**.

Sobald der Prozess fertig ist, erhältst du eine URL (z.B. `qservice.vercel.app`), die du mit deinem Team teilen kannst. Jeder mit dieser URL kann auf die App zugreifen.

### Datenbank-Zugriff (Supabase)
Damit die App online funktioniert, muss die Datenbank (Supabase) Anfragen von der öffentlichen URL akzeptieren.
*   **Row Level Security (RLS):** In der Entwicklungsphase haben wir RLS möglicherweise deaktiviert oder sehr offen eingestellt.
    *   Prüfe in Supabase unter "Authentication" -> "Policies", ob die Tabellen `reports` und `devices` für `anon` (unangemeldete Benutzer) les- und schreibbar sind.
    *   Falls nicht, wird die Online-Version keine Daten laden oder speichern können.

---

## Option 2: Lokal im Netzwerk (Nur im gleichen WLAN)
Wenn alle Teilnehmer im gleichen Büro/WLAN sind, kannst du den Computer als Server nutzen.

1.  Öffne das Terminal in VS Code.
2.  Führe den Befehl aus:
    ```bash
    npm run dev -- --host
    ```
3.  Das Terminal zeigt nun "Network: http://192.168.x.x:5173" an.
4.  Teile diese IP-Adresse mit deinen Kollegen. Sie können sie in ihrem Browser öffnen, solange dein Computer läuft und das Terminal offen ist.

**Nachteil:** Funktioniert nicht, wenn du den Laptop zuklappst oder das Büro verlässt.

---

## Checkliste vor dem "Go-Live"
*   [ ] **Datenbank:** Sind die Tabellen `reports` und `devices` in Supabase korrekt angelegt?
*   [ ] **Sicherheit:** Wurden sensible Daten (wie API Keys) aus dem Code entfernt? (Hinweis: Die Supabase URL/Anon Key sind in Frontend-Apps öffentlich sichtbar, das ist normal, aber Service-Role-Keys dürfen nie im Code stehen).
*   [ ] **Build-Test:** Führe lokal einmal `npm run build` aus, um sicherzustellen, dass keine Fehler den Build blockieren.
