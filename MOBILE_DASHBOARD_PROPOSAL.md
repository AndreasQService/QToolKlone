# Konzept: Mobiles Dashboard für Techniker

## Ziel
Transformation der aktuellen linearen Formularansicht in ein aufgabenorientiertes Dashboard für mobile Geräte ("Techniker-Modus"). Ziel ist es, die Übersichtlichkeit zu verbessern und den Zugriff auf häufige Funktionen zu beschleunigen.

## Layout-Struktur

### 1. Header-Bereich (Sticky)
*   **Projekt-Titel / Adresse**: Groß und deutlich lesbar.
*   **Status-Badge**: Visuelle kennzeichnung des aktuellen Phasenstatus (z.B. "Schadenaufnahme", "Trocknung").
*   **Schnell-Aktionen**:
    *   📞 **Anruf**: Button zum direkten Anruf beim Auftraggeber/Mieter.
    *   📍 **Navi**: Button zum Öffnen der Adresse in Google Maps/Apple Maps.

### 2. Quick-Actions Grid (Kacheln)
Große, touch-freundliche Kacheln für die häufigsten Aufgaben vor Ort:
*   [ 📷 **Foto** ]: Öffnet direkt den Kamera-Upload für allgemeine Schadensbilder.
*   [ 🎤 **Notiz** ]: Startet sofort die Spracheingabe für das Protokoll.
*   [ 📏 **Messung** ]: Springt direkt zur Raum-Erfassung.
*   [ 💧 **Ursache** ]: Springt zur Ursachen-Ermittlung & Massnahmen.

### 3. Workflow-Sektionen (Akkordeon / Navigation)
Anstatt alle Formularfelder untereinander anzuzeigen, werden diese in logische Gruppen zusammengefasst, die sich auf- und zuklappen lassen oder als Unterseiten fungieren:
*   **📋 Stammdaten**: (Auftraggeber, Versicherung, Verwaltung) - Standardmäßig zugeklappt.
*   **🏠 Räume & Messungen**: Übersichtliche Liste der Räume mit Status (z.B. "WZ: 2 Messungen").
*   **✅ Massnahmen**: (Die neue Sektion).
*   **📝 Abschluss**: Unterschrift & Bericht senden.

### 4. Fortschrittsanzeige
*   Visueller Indikator (z.B. Balken oder "3/5 Räume erledigt").

---

## Technische Umsetzung (Vorschlag)

Wir integrieren eine **"Dashboard View"** in `DamageForm.jsx`, die aktiv ist, wenn `mode === 'technician'`.

### Neuer State
`const [technicianView, setTechnicianView] = useState('dashboard'); // 'dashboard', 'rooms', 'details', ...`

### Ansicht "Dashboard"
Zeigt nur den Header und das Grid. Klicks auf Tiles ändern den `technicianView` oder scrollen zur entsprechenden Sektion.

### Beispiel-Code Struktur
```javascript
{mode === 'technician' && technicianView === 'dashboard' ? (
    <div className="mobile-dashboard">
        <MissionHeader data={formData} />
        <ActionGrid 
           onPhoto={() => ...} 
           onMeasure={() => setTechnicianView('rooms')}
           onCause={() => setTechnicianView('cause')}
        />
        <RoomSummaryList rooms={formData.rooms} />
    </div>
) : (
   // ... Bestehendes Formular oder spezifische Sektionen
)}
```

## Nächste Schritte
Soll dieses Konzept umgesetzt werden? Wir könnten damit beginnen, den **Header** und das **Action Grid** ganz oben im Formular einzubauen, um die Navigation zu testen.
