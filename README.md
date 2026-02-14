# Bautrockner-Einsatz Dashboard

Eine React-Anwendung zur Verwaltung von Bautrockner-Einsätzen und Schadensberichten.

## Voraussetzungen

Stellen Sie sicher, dass folgende Software auf Ihrem Computer installiert ist:
- [Node.js](https://nodejs.org/) (Version 18 oder höher empfohlen)
- [Git](https://git-scm.com/)

## Installation auf einem anderen Rechner

Follow these steps to set up the project on a new machine:

1.  **Repository klonen**
    Öffnen Sie ein Terminal (Eingabeaufforderung, PowerShell oder Git Bash) und führen Sie folgenden Befehl aus:
    ```bash
    git clone https://github.com/AndreasQService/Bautrockner-Einsatz.git
    ```

2.  **In das Projektverzeichnis wechseln**
    ```bash
    cd Bautrockner-Einsatz
    ```

3.  **Abhängigkeiten installieren**
    Installieren Sie alle notwendigen Pakete mit npm:
    ```bash
    npm install
    ```

4.  **Umgebungsvariablen konfigurieren**
    Erstellen Sie eine neue Datei namens `.env` im Hauptverzeichnis des Projekts und fügen Sie Ihre Supabase-Zugangsdaten hinzu:
    
    ```env
    VITE_SUPABASE_URL=Ihre_Supabase_URL
    VITE_SUPABASE_ANON_KEY=Ihr_Supabase_Anon_Key
    ```
    *(Diese Daten finden Sie in Ihrem Supabase Dashboard unter Project Settings > API)*

5.  **Anwendung starten**
    Starten Sie den Entwicklungsserver:
    ```bash
    npm run dev
    ```
    Die Anwendung ist nun unter `http://localhost:5173` (oder einem ähnlichen Port) erreichbar.

## Build für Produktion

Um eine optimierte Version für die Veröffentlichung zu erstellen:
```bash
npm run build
```
Die Dateien befinden sich anschließend im `dist`-Ordner.
