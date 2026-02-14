import React, { useState, useEffect } from 'react';
import OpenAI from "openai";
import { X, ArrowRight, Mail, Settings, Check } from 'lucide-react';
import { swissPLZ } from '../data/swiss_plz';

const EmailImportModalV2 = ({ onClose, onImport }) => {
    const [text, setText] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [loading, setLoading] = useState(false);
    const [useAI, setUseAI] = useState(true);

    useEffect(() => {
        const storedKey = localStorage.getItem('openai_api_key');
        const envKey = import.meta.env.VITE_OPENAI_API_KEY;

        if (storedKey) {
            setApiKey(storedKey);
        } else if (envKey) {
            setApiKey(envKey);
            // Optional: Store it in local storage? No, let's just use it.
            // But if we want to show it in the settings, we should set it.
        } else {
            setShowSettings(true); // Prompts user to enter key first time
        }
    }, []);

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('openai_api_key', key);
        setShowSettings(false);
    };

    const parseWithAI = async () => {
        if (!apiKey) {
            alert("Bitte geben Sie zuerst einen OpenAI API Key in den Einstellungen ein.");
            setShowSettings(true);
            return;
        }

        setLoading(true);
        console.log("Starting AI Analysis with Key:", apiKey.substring(0, 10) + "...");

        try {
            // Check if fetch is supported (modern browsers always support it)
            if (typeof window.fetch === 'undefined') {
                throw new Error("Your browser does not support the Fetch API. Please update your browser.");
            }

            const openai = new OpenAI({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true // Required for client-side usage
            });

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Cost-effective and fast
                messages: [
                    {
                        role: "system",
                        content: `Sie sind ein professioneller Daten-Extraktor für Schadenmeldungen.
                        
                        AUFGABE:
                        Analysieren Sie den Text und extrahieren Sie strukturierte Daten.
                        
                        WICHTIG - UNTERSCHEIDE ADRESSEN:
                        Es gibt fast immer ZWEI Adressen im Text:
                        1. Den SCHADENORT (Objekt, wo der Schaden ist). Dieser steht oft im Betreff oder ganz oben im Text.
                        2. Den ABSENDER (Firma, Verwaltung). Dieser steht meist unten in der Signatur.
                        
                        -> Du musst UNBEDINGT den SCHADENORT als "street", "zip", "city" extrahieren.
                        -> IGNORIERE die Adresse der Verwaltungsfirma (z.B. Weber + Schweizer, A Plus, etc.) für das Feld "street".
                        -> Wenn im Betreff eine Strasse steht, nimm DIESE!

                        WICHTIG FÜR KONTAKTE:
                        1. Suchen Sie nach Namen und Telefonnummern.
                        2. "Wohnung" (ETAGEN-LOGIK):
                           - Analysiere den Kontext EXTREM GENAU.
                           - Finde zuerst die BASIS-Etage (z.B. "Ich wohne im 1. OG").
                           - Wenn steht "Darüber wohnt X", dann RECHNE: 1. OG + 1 = "2. OG".
                           - Wenn steht "Darunter...", dann RECHNE: 1. OG - 1 = "EG".
                           - PLAUSIBILITÄTS-CHECK:
                             - Wenn A im 3. OG wohnt, und B "darunter", muss B im 2. OG sein.
                             - Achte auf die RICHTIGE Reihenfolge im Haus (EG -> 1.OG -> 2.OG -> 3.OG -> DG).
                           - Nutze IMMER Standard-Kürzel: "UG", "EG", "1. OG", "2. OG", "3. OG", "DG".
                           - Nimm Zusatz-Infos wie "Links", "Rechts", "Mitte" dazu.
                           - Wenn keine Info da ist -> leer lassen.
                        3. "Rolle": Wenn die Person ein Handwerker ist (Sanitär, Maler), setze Rolle="Handwerker". Wenn Hauswart, dann "Hauswart". Sonst "Mieter" oder "Eigentümer".
                        
                        Format (JSON):
                        {
                            "projectTitle": "Betreff / Titel",
                            "client": "Auftraggeber (Firma)",
                            "street": "Strasse Nr",
                            "zip": "PLZ",
                            "city": "Ort",
                            "description": "Zusammenfassung des Schadens",
                            "contacts": [
                                { "name": "Vorname Nachname", "phone": "07x...", "role": "Mieter/Hauswart/Handwerker", "apartment": "z.B. 3. OG rechts" }
                            ]
                        }`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.0,
            });

            let aiContent = response.choices[0].message.content.trim();

            // Remove Markdown
            aiContent = aiContent.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');

            let parsedData;
            try {
                parsedData = JSON.parse(aiContent);
            } catch (e) {
                console.error("JSON Parse Error:", e);
                parsedData = { contacts: [] }; // Fallback
            }

            // --- ULTIMATE FALLBACK: Globale Suche im GANZEN Text ---
            // 1. Suche nach ALLEM was wie eine Telefonnummer aussieht
            // Wir entfernen temporär alle Leerzeichen um Nummern leichter zu finden
            // Muster: 0xx xxx xx xx (10 Ziffern) oder 0xx xxx xxxx (10 Ziffern)
            // Oder 084x xxx xxx

            // Backup Array
            if (!parsedData.contacts) parsedData.contacts = [];
            const existingPhones = new Set(parsedData.contacts.map(c => c.phone ? c.phone.replace(/\D/g, '') : '').filter(p => p));

            // Strategie: Finde ALLE Sequenzen von Ziffern, die lang genug sind
            const allNumbers = text.match(/(?:(?:\+|00)41|0)\s*[0-9](?:[\s\.\-\/]*\d){8,}/g);

            if (allNumbers) {
                allNumbers.forEach(rawNum => {
                    let cleanNum = rawNum.replace(/\D/g, '');

                    // IGNORE OFFICE NUMBERS (Weber + Schweizer often 052 209...)
                    if (cleanNum.startsWith('052209')) return;

                    if (cleanNum.length >= 9 && cleanNum.length <= 13 && !existingPhones.has(cleanNum)) {

                        // Finde die Zeile im Originaltext für den Namen
                        let line = text.split('\n').find(l => l.includes(rawNum)) || "";

                        // --- 1. CLEANUP LINE first ---
                        // Remove the number itself
                        let namePart = line.replace(rawNum, '');

                        // Remove labels
                        namePart = namePart.replace(/(?:Tel\.?|Mobile|Natel|G:|P:|Büro|direkt|Mieter|Hauswart|Sanitär|Maler|:)/gi, ' ');

                        // Remove stuff in brackets
                        namePart = namePart.replace(/\(.*?\)/g, '');

                        // Remove specific phrases that might precede name
                        namePart = namePart.replace(/Gerne hier seine Angaben für/gi, '');
                        namePart = namePart.replace(/Unsere Hauswartin ist/gi, '');
                        namePart = namePart.replace(/Vor Ort ist/gi, '');

                        // --- 2. INTELLIGENT NAME EXTRACTION ---
                        // Strategy: Look for capitalized words (Names usually start with Uppercase)
                        // Split into words, filter out small garbage, take the ones that look like names.

                        let words = namePart.split(/\s+/).filter(w => w.length > 1);

                        // Filter out common non-name words (German) even if capitalized at start of sentence
                        const stopWords = ['und', 'oder', 'bei', 'im', 'am', 'der', 'die', 'das', 'wir', 'ich', 'sie', 'es', 'ist', 'hat', 'kann', 'muss', 'soll', 'bitte', 'danke', 'grüsse', 'freundliche', 'von', 'nach', 'vor', 'zu', 'mit', 'für', 'über', 'unter', 'auf', 'aus', 'ein', 'eine'];

                        // Keep only words that:
                        // 1. Are NOT in stopWords
                        // 2. Start with Uppercase letter (heuristic for names)
                        // 3. Are not numbers
                        let candidateWords = words.filter(w => {
                            const clean = w.replace(/[^\wäöüÄÖÜ]/g, '');
                            if (!clean) return false;
                            if (stopWords.includes(clean.toLowerCase())) return false;
                            if (/\d/.test(clean)) return false; // No numbers
                            // Must start with Uppercase? (Risky if typed lowercase, but good filter)
                            return /^[A-ZÄÖÜ]/.test(clean);
                        });

                        // Special handling for "Herr" / "Frau"
                        let finalName = "";
                        const herrIndex = candidateWords.findIndex(w => w.includes('Herr'));
                        const frauIndex = candidateWords.findIndex(w => w.includes('Frau'));

                        if (herrIndex !== -1 && herrIndex + 1 < candidateWords.length) {
                            // Take "Herr" + next word (Lastname) + maybe next (Firstname?)
                            // "Herr Velastegui" -> 2 words
                            finalName = candidateWords.slice(herrIndex, herrIndex + 3).join(' ');
                        } else if (frauIndex !== -1 && frauIndex + 1 < candidateWords.length) {
                            finalName = candidateWords.slice(frauIndex, frauIndex + 3).join(' ');
                        } else {
                            // If no title, take the LAST 2-3 capitalized words found (assuming name is near the number/end of context)
                            // Example: "Maler Milu" -> "Milu" (Maler removed) -> if "Maler" was removed, only "Milu" remains?
                            // If "Svenny Benabdesalam" -> both act like names.
                            if (candidateWords.length > 0) {
                                // Take up to 3 words
                                finalName = candidateWords.slice(-3).join(' ');
                            } else {
                                // Fallback: take original string cleanup
                                finalName = namePart.trim();
                            }
                        }

                        // --- 3. FINAL CLEANUP ---
                        finalName = finalName.replace(/[,.-]+$/, '').trim();
                        // Remove any remaining special chars
                        finalName = finalName.replace(/[^\w\säöüÄÖÜ\-]/g, '');

                        // Heuristics
                        if (finalName.length < 2) finalName = "Kontakt (Tel. gefunden)";
                        if (finalName.length > 40) finalName = finalName.substring(0, 40).trim();

                        let role = "Automatisch";
                        if (line.toLowerCase().includes('mieter')) role = "Mieter";
                        if (line.toLowerCase().includes('hauswart')) role = "Hauswart";
                        if (line.toLowerCase().includes('sanitär') || line.toLowerCase().includes('maler')) role = "Handwerker";

                        parsedData.contacts.push({
                            name: finalName,
                            phone: rawNum.trim(),
                            role: role,
                            apartment: ""
                        });
                        existingPhones.add(cleanNum);
                    }
                });
            }

            // Safe-guard checks
            if (!parsedData.contacts) parsedData.contacts = [];
            parsedData.contacts.forEach(c => {
                if (!c.name) c.name = 'Unbekannt';
                if (!c.phone) c.phone = '';
                if (!c.apartment) c.apartment = '';
            });

            // Specific check: Angela Högger (immer hinzufügen wenn im Text)
            if ((text.toLowerCase().includes('angela') || text.toLowerCase().includes('högger')) &&
                !parsedData.contacts.some(c => c.name && (c.name.toLowerCase().includes('angela') || c.name.toLowerCase().includes('högger')))) {
                parsedData.contacts.push({ name: 'Angela Högger', phone: '', apartment: 'Verwaltung', role: 'Verwaltung' });
            }

            // Weber + Schweizer Sender Logic
            if ((text.toLowerCase().includes('weber') && text.toLowerCase().includes('schweizer')) && !parsedData.client) {
                parsedData.client = 'Weber + Schweizer Immobilien-Treuhand AG';
            }

            // 3. Append original email to description
            parsedData.description = (parsedData.description || '') + "\n\n--- Original Email ---\n" + text;

            // 4. (REMOVED) - Do NOT fill up to 4 slots. We want 1-n dynamic contacts.
            // If the user provided 1 contact, we import 1. If 6, we import 6.

            // 5. Final Mapping for Form
            // Ensure properties exist
            parsedData.contacts = parsedData.contacts.map(c => ({
                name: c.name || '',
                phone: c.phone || '',
                apartment: c.apartment || c.role || ''
            }));

            const debugInfo = `ANALYSEDATEN (ersten 100 Zeichen):\n"${text.substring(0, 100)}..."\n\nErgebnis:\nKunde: ${parsedData.client}\nKontakte (${parsedData.contacts.filter(c => c.name).length}):\n${parsedData.contacts.filter(c => c.name).map(c => `- ${c.name} (${c.phone})`).join('\n')}`;
            alert(debugInfo); // DEBUG ALERT for User

            console.log("Importing Data:", parsedData);
            onImport(parsedData);

        } catch (error) {
            console.error("Full AI Analysis Error:", error);
            alert("Fehler bei der KI-Analyse: " + error.message + "\n\nDetails in der Konsole (F12).");
            // Fallback to regex? Or just let user retry.
        } finally {
            setLoading(false);
        }
    };

    const parseWithRegex = () => {
        // --- IMPROVED REGEX PARSER (V3) ---
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const data = {
            projectTitle: '',
            client: '',
            street: '',
            zip: '',
            city: '',
            description: '',
            contacts: [],
            damageType: ''
        };

        // 1. Title
        const subjectLine = lines.find(l => l.match(/^(?:Betreff|Subject|Aw|Re|Fwd):/i));
        if (subjectLine) {
            data.projectTitle = subjectLine.replace(/^(?:Betreff|Subject|Aw|Re|Fwd):\s*/i, '').trim();
        }

        // 2. Client
        const knownAgencies = ['Weber + Schweizer', 'W+S', 'Livit', 'Wincasa', 'A Plus'];
        if (text.toLowerCase().includes('weber') && text.toLowerCase().includes('schweizer')) {
            data.client = 'Weber + Schweizer Immobilien-Treuhand AG';
        } else {
            const agencyMatch = knownAgencies.find(agency => text.includes(agency));
            if (agencyMatch) data.client = agencyMatch;
        }

        // 3. Address
        const addressRegex = /([A-Za-zäöüÄÖÜ\s.-]+)\s+(\d+[a-zA-Z]?)\s*,\s*(\d{4})\s+([a-zA-ZäöüÄÖÜ\s-]+)/;
        if (data.projectTitle && data.projectTitle.match(addressRegex)) {
            const m = data.projectTitle.match(addressRegex);
            data.street = `${m[1]} ${m[2]}`; data.zip = m[3]; data.city = m[4];
        } else if (!data.street) {
            for (const line of lines) {
                const m = line.match(addressRegex);
                if (m) { data.street = `${m[1]} ${m[2]}`; data.zip = m[3]; data.city = m[4]; break; }
            }
        }

        // 4. Contacts - ULTIMATE FALLBACK LOGIC
        const existingPhones = new Set();

        // Match ANY number sequence of 9-13 digits, allowing spaces/dots/dashes/slashes
        const allNumbers = text.match(/(?:(?:\+|00)41|0)\s*[0-9](?:[\s\.\-\/]*\d){8,}/g);

        if (allNumbers) {
            allNumbers.forEach(rawNum => {
                let cleanNum = rawNum.replace(/\D/g, '');

                // IGNORE OFFICE NUMBERS (Weber + Schweizer often 052 209...)
                if (cleanNum.startsWith('052209')) return;

                if (cleanNum.length >= 9 && cleanNum.length <= 13 && !existingPhones.has(cleanNum)) {

                    // Finde die Zeile im Originaltext für den Namen
                    let line = text.split('\n').find(l => l.includes(rawNum)) || "";

                    // --- 1. CLEANUP LINE first ---
                    // Remove the number itself
                    let namePart = line.replace(rawNum, '');

                    // Remove labels
                    namePart = namePart.replace(/(?:Tel\.?|Mobile|Natel|G:|P:|Büro|direkt|Mieter|Hauswart|Sanitär|Maler|:)/gi, ' ');

                    // Remove stuff in brackets
                    namePart = namePart.replace(/\(.*?\)/g, '');

                    // Remove specific phrases that might precede name
                    namePart = namePart.replace(/Gerne hier seine Angaben für/gi, '');
                    namePart = namePart.replace(/Unsere Hauswartin ist/gi, '');
                    namePart = namePart.replace(/Vor Ort ist/gi, '');

                    // --- 2. INTELLIGENT NAME EXTRACTION ---
                    // Strategy: Look for capitalized words (Names usually start with Uppercase)
                    // Split into words, filter out small garbage, take the ones that look like names.

                    let words = namePart.split(/\s+/).filter(w => w.length > 1);

                    // Filter out common non-name words (German) even if capitalized at start of sentence
                    const stopWords = ['und', 'oder', 'bei', 'im', 'am', 'der', 'die', 'das', 'wir', 'ich', 'sie', 'es', 'ist', 'hat', 'kann', 'muss', 'soll', 'bitte', 'danke', 'grüsse', 'freundliche', 'von', 'nach', 'vor', 'zu', 'mit', 'für', 'über', 'unter', 'auf', 'aus', 'ein', 'eine'];

                    // Keep only words that:
                    // 1. Are NOT in stopWords
                    // 2. Start with Uppercase letter (heuristic for names)
                    // 3. Are not numbers
                    let candidateWords = words.filter(w => {
                        const clean = w.replace(/[^\wäöüÄÖÜ]/g, '');
                        if (!clean) return false;
                        if (stopWords.includes(clean.toLowerCase())) return false;
                        if (/\d/.test(clean)) return false; // No numbers
                        // Must start with Uppercase? (Risky if typed lowercase, but good filter)
                        return /^[A-ZÄÖÜ]/.test(clean);
                    });

                    // Special handling for "Herr" / "Frau"
                    let finalName = "";
                    const herrIndex = candidateWords.findIndex(w => w.includes('Herr'));
                    const frauIndex = candidateWords.findIndex(w => w.includes('Frau'));

                    if (herrIndex !== -1 && herrIndex + 1 < candidateWords.length) {
                        // Take "Herr" + next word (Lastname) + maybe next (Firstname?)
                        // "Herr Velastegui" -> 2 words
                        finalName = candidateWords.slice(herrIndex, herrIndex + 3).join(' ');
                    } else if (frauIndex !== -1 && frauIndex + 1 < candidateWords.length) {
                        finalName = candidateWords.slice(frauIndex, frauIndex + 3).join(' ');
                    } else {
                        // If no title, take the LAST 2-3 capitalized words found (assuming name is near the number/end of context)
                        // Example: "Maler Milu" -> "Milu" (Maler removed) -> if "Maler" was removed, only "Milu" remains?
                        // If "Svenny Benabdesalam" -> both act like names.
                        if (candidateWords.length > 0) {
                            // Take up to 3 words
                            finalName = candidateWords.slice(-3).join(' ');
                        } else {
                            // Fallback: take original string cleanup
                            finalName = namePart.trim();
                        }
                    }

                    // --- 3. FINAL CLEANUP ---
                    finalName = finalName.replace(/[,.-]+$/, '').trim();
                    // Remove any remaining special chars
                    finalName = finalName.replace(/[^\w\säöüÄÖÜ\-]/g, '');

                    // Heuristics
                    if (finalName.length < 2) finalName = "Kontakt (Tel. gefunden)";
                    if (finalName.length > 40) finalName = finalName.substring(0, 40).trim();

                    let role = "Automatisch";
                    if (line.toLowerCase().includes('mieter')) role = "Mieter";
                    if (line.toLowerCase().includes('hauswart')) role = "Hauswart";
                    if (line.toLowerCase().includes('sanitär') || line.toLowerCase().includes('maler')) role = "Handwerker";

                    data.contacts.push({
                        name: finalName,
                        phone: rawNum.trim(),
                        role: role,
                        apartment: ""
                    });
                    existingPhones.add(cleanNum);
                }
            });
        }

        // Angela Högger Check
        if ((text.toLowerCase().includes('angela') || text.toLowerCase().includes('högger')) &&
            !data.contacts.some(c => c.name.toLowerCase().includes('angela'))) {
            data.contacts.push({ name: 'Angela Högger', phone: '', apartment: 'Verwaltung', role: 'Verwaltung' });
        }

        // Fill slots
        while (data.contacts.length < 4) {
            data.contacts.push({ name: '', phone: '', apartment: '', role: '' });
        }

        data.description = lines.join('\n') + "\n\n--- Original Email via Regex V3 ---\n" + text;

        const debugInfo = `REGEX V3 PARSER:\nKunde: ${data.client}\nKontakte (${data.contacts.filter(c => c.name).length}):\n${data.contacts.filter(c => c.name).map(c => `- ${c.name} (${c.phone})`).join('\n')}`;
        alert(debugInfo);

        onImport(data);
    };

    const handleAnalyze = () => {
        if (useAI && apiKey) {
            parseWithAI();
        } else {
            parseWithRegex();
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '8px',
                width: '700px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={24} />
                        Projekt aus Email importieren
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="btn btn-ghost"
                            style={{ padding: '0.5rem', color: useAI && apiKey ? 'var(--primary)' : 'var(--text-muted)' }}
                            title="KI Einstellungen"
                        >
                            <Settings size={20} />
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {showSettings && (
                    <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>OpenAI API Key</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="password"
                                placeholder="sk-..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="form-input"
                                style={{ flex: 1 }}
                            />
                            <button onClick={() => saveApiKey(apiKey)} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
                                Speichern
                            </button>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Der Key wird lokal in deinem Browser gespeichert und nur an OpenAI gesendet.
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Kopiere den Email-Text hier hinein:
                    </div>
                    {apiKey && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={useAI}
                                onChange={(e) => setUseAI(e.target.checked)}
                                style={{ accentColor: 'var(--primary)' }}
                            />
                            <span style={{ fontWeight: 600, color: useAI ? 'var(--primary)' : 'var(--text-muted)' }}>
                                Intelligente KI-Analyse {useAI ? '(Aktiv)' : '(Inaktiv)'}
                            </span>
                        </label>
                    )}
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Email Text hier einfügen..."
                    className="form-input"
                    style={{
                        flex: 1, minHeight: '300px', width: '100%', padding: '1rem',
                        border: '1px solid var(--border)', borderRadius: '4px', resize: 'none',
                        fontFamily: 'monospace', fontSize: '0.9rem',
                        backgroundColor: 'var(--background)',
                        color: 'var(--text-main)'
                    }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} className="btn btn-outline" disabled={loading}>
                        Abbrechen
                    </button>
                    <button
                        onClick={handleAnalyze}
                        className="btn btn-primary"
                        disabled={!text.trim() || loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '160px', justifyContent: 'center' }}
                    >
                        {loading ? (
                            <>Analysiere...</>
                        ) : (
                            <>
                                <ArrowRight size={18} />
                                {useAI && apiKey ? 'KI STARTEN (V3)' : 'REGEX STARTEN (V3)'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailImportModalV2;
