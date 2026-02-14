# Schritt-für-Schritt Anleitung: Deployment mit Vercel

Hier ist die genaue Anleitung, um dein Projekt "scharf" zu schalten.

## 1. Code auf GitHub hochladen (Vorbereitung)
Damit Vercel dein Projekt findet, muss der aktuelle Stand auf GitHub sein.
Führe im Terminal folgende Befehle aus:

```bash
git add .
git commit -m "Bereit für Vercel Deployment"
git push
```

## 2. Vercel Einrichtung
1.  Gehe auf [vercel.com](https://vercel.com) und erstelle einen Account (am einfachsten: **"Continue with GitHub"**).
2.  Im Dashboard: Klicke auf **"Add New..."** -> **"Project"**.
3.  Du siehst eine Liste deiner GitHub-Repositories. Klicke beim Projekt `qservice` (oder wie du es genannt hast) auf den Button **"Import"**.

## 3. Konfiguration (WICHTIG!)
Im Fenster "Configure Project" musst du fast nichts ändern, **außer den Umgebungsvariablen**.

1.  **Project Name:** Kannst du so lassen oder ändern (dies wird Teil deiner URL).
2.  **Framework Preset:** Vercel erkennt automatisch "Vite". Das ist korrekt.
3.  **Root Directory:** `./` (Standard, nicht ändern).
4.  **Environment Variables:** Hier musst du die Zugangsdaten für Supabase eintragen, da diese **nicht** auf GitHub gespeichert sind (Sicherheit).
    *   Öffne deine lokale Datei `.env.local` (in VS Code).
    *   Kopiere den Wert von `VITE_SUPABASE_URL`.
    *   Füge ihn bei Vercel ein:
        *   **Name:** `VITE_SUPABASE_URL`
        *   **Value:** `https://....supabase.co` (dein Wert)
        *   Klicke auf **"Add"**.
    *   Wiederhole das für den Key:
        *   **Name:** `VITE_SUPABASE_ANON_KEY`
        *   **Value:** `eyJ...` (dein langer Key)
        *   Klicke auf **"Add"**.

## 4. Starten ("Deploy")
1.  Klicke auf den großen Button **"Deploy"**.
2.  Warte ca. 1-2 Minuten. Vercel baut nun deine App.
3.  Wenn alles grün ist: **Herzlichen Glückwunsch!** 🎉
4.  Klicke auf das Vorschaubild oder "Go to Dashboard" -> "Visit", um deine lebende Webseite zu sehen.

## 5. Updates machen (Workflow)
Ab jetzt ist es ganz einfach:
1.  Du arbeitest lokal ganz normal weiter.
2.  Wenn du fertig bist, machst du wieder:
    ```bash
    git add .
    git commit -m "Neues Feature: Farben angepasst"
    git push
    ```
3.  **Fertig.** Vercel bemerkt den neuen Code automatisch und aktualisiert die Webseite in wenigen Minuten.

## Häufige Fehlerbehebung
*   **Seite bleibt weiß / Lädt nicht:** Oft fehlen die Environment Variables (Schritt 3). Prüfe in Vercel unter *Settings -> Environment Variables*, ob sie korrekt eingetragen sind. Wenn du sie nachträglich änderst, musst du unter *Deployments* einen neuen "Redeploy" anstoßen.
*   **Datenbank-Fehler:** Prüfe in Supabase unter *Authentication -> Policies*, ob der Zugriff für "anon" (unangemeldete Nutzer) erlaubt ist.
