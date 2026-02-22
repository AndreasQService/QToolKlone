import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import OpenAI from "openai";
import { X, ArrowRight, Mail, Settings, Check, RotateCw, FileUp } from 'lucide-react';
import { swissPLZ } from '../data/swiss_plz';

const EmailImportModalV2 = ({ onClose, onImport, audioDevices, selectedDeviceId, onSelectDeviceId, initialShowSettings = false, onRefreshDevices, deviceError }) => {
    const [text, setText] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showSettings, setShowSettings] = useState(initialShowSettings);
    const [loading, setLoading] = useState(false);
    const [useAI, setUseAI] = useState(true);
    const [isDragging, setIsDragging] = useState(false);

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileUpload({ target: { files: [files[0]] } });
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Basic placeholder since full PDF text extraction requires a library like pdf.js
        // For now, alert that text needs to be pasted or full impl needed
        alert("PDF-Textextraktion erfordert zusätzliche Bibliotheken. Bitte kopieren Sie den Text direkt aus dem PDF.");
    };

    useEffect(() => {
        const storedKey = localStorage.getItem('openai_api_key');
        const envKey = import.meta.env.VITE_OPENAI_API_KEY;

        if (storedKey) {
            setApiKey(storedKey);
        } else if (envKey) {
            setApiKey(envKey);
        } else {
            setShowSettings(true); // Prompts user to enter key first time
        }
    }, []);

    const [previewData, setPreviewData] = useState(null);

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
        try {
            const openai = new OpenAI({
                apiKey: apiKey,
                baseURL: window.location.origin + '/openai-api',
                dangerouslyAllowBrowser: true
            });

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Du extrahierst strukturierte Projektdaten für eine Gebäude-Sanierungsfirma (Q-Service).
Extrahiere: projectTitle, client, manager, street, zip, city, description, contacts.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.0,
                response_format: { type: "json_object" }
            });

            let aiContent = response.choices[0].message.content.trim();
            aiContent = aiContent.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');

            let parsedData;
            try {
                parsedData = JSON.parse(aiContent);
            } catch (e) {
                console.error("JSON Parse Error:", e);
                parsedData = { contacts: [] };
            }

            if (!parsedData.contacts) parsedData.contacts = [];
            setPreviewData(parsedData);

        } catch (error) {
            console.error("Full AI Analysis Error:", error);
            alert("Fehler bei der KI-Analyse: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const parseWithRegex = () => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const data = {
            projectTitle: '', client: '', street: '', zip: '', city: '', description: lines.join('\n'), contacts: [], damageType: '', manager: ''
        };
        setPreviewData(data);
    };

    const handleAnalyze = () => {
        if (useAI && apiKey) {
            parseWithAI();
        } else {
            parseWithRegex();
        }
    };

    // --- PREVIEW UI RENDERER ---
    if (previewData) {
        return createPortal(
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '8px',
                    width: '800px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border)',
                    color: 'var(--text-main)'
                }}>
                    <h3 style={{ marginTop: 0 }}>Vorschau & Korrektur</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>Titel</label>
                            <input className="form-input" style={{ width: '100%' }} value={previewData.projectTitle || ''} onChange={e => setPreviewData({ ...previewData, projectTitle: e.target.value })} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>Auftraggeber</label>
                            <input className="form-input" style={{ width: '100%' }} value={previewData.client || ''} onChange={e => setPreviewData({ ...previewData, client: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>Verwaltung / Zuständig</label>
                            <input className="form-input" style={{ width: '100%' }} value={previewData.manager || ''} onChange={e => setPreviewData({ ...previewData, manager: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 2 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem' }}>Strasse</label>
                                <input className="form-input" style={{ width: '100%' }} value={previewData.street || ''} onChange={e => setPreviewData({ ...previewData, street: e.target.value })} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem' }}>PLZ</label>
                                <input className="form-input" style={{ width: '100%' }} value={previewData.zip || ''} onChange={e => setPreviewData({ ...previewData, zip: e.target.value })} />
                            </div>
                            <div style={{ flex: 2 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem' }}>Ort</label>
                                <input className="form-input" style={{ width: '100%' }} value={previewData.city || ''} onChange={e => setPreviewData({ ...previewData, city: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem' }}>Beschreibung</label>
                        <textarea className="form-input" style={{ width: '100%', minHeight: '80px' }} value={previewData.description || ''} onChange={e => setPreviewData({ ...previewData, description: e.target.value })} />
                    </div>

                    <h4>Kontakte</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {previewData.contacts.map((c, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input className="form-input" placeholder="Rolle" value={c.role || ''} onChange={e => {
                                    const newC = [...previewData.contacts]; newC[idx].role = e.target.value; setPreviewData({ ...previewData, contacts: newC });
                                }} style={{ width: '120px' }} />
                                <input className="form-input" placeholder="Name" value={c.name || ''} onChange={e => {
                                    const newC = [...previewData.contacts]; newC[idx].name = e.target.value; setPreviewData({ ...previewData, contacts: newC });
                                }} style={{ flex: 1 }} />
                                <input className="form-input" placeholder="Tel" value={c.phone || ''} onChange={e => {
                                    const newC = [...previewData.contacts]; newC[idx].phone = e.target.value; setPreviewData({ ...previewData, contacts: newC });
                                }} style={{ width: '120px' }} />
                                <input className="form-input" placeholder="Email" value={c.email || ''} onChange={e => {
                                    const newC = [...previewData.contacts]; newC[idx].email = e.target.value; setPreviewData({ ...previewData, contacts: newC });
                                }} style={{ width: '150px' }} />
                                <button onClick={() => {
                                    const newC = previewData.contacts.filter((_, i) => i !== idx);
                                    setPreviewData({ ...previewData, contacts: newC });
                                }} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                        ))}
                        <button onClick={() => setPreviewData({ ...previewData, contacts: [...previewData.contacts, { role: '', name: '', phone: '', email: '' }] })} className="btn btn-ghost" style={{ alignSelf: 'start' }}>+ Kontakt hinzufügen</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button onClick={() => setPreviewData(null)} className="btn btn-outline">Zurück</button>
                        <button onClick={() => onImport(previewData)} className="btn btn-primary">Übernehmen</button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // --- INPUT UI (Default) ---
    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99999,
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
                        Projekt aus Email / PDF importieren
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
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>Mikrofon auswählen</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                    className="form-input"
                                    value={selectedDeviceId || ''}
                                    onChange={(e) => onSelectDeviceId && onSelectDeviceId(e.target.value)}
                                    style={{ flex: 1 }}
                                >
                                    {audioDevices && audioDevices.length > 0 ? (
                                        audioDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Mikrofon ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="">Keine Mikrofone gefunden</option>
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={onRefreshDevices}
                                    className="btn btn-outline"
                                    title="Liste aktualisieren"
                                    style={{ padding: '0.5rem' }}
                                >
                                    <RotateCw size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    style={{
                        position: 'relative',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.2s ease',
                        border: isDragging ? '2px dashed var(--primary)' : '1px solid transparent',
                        borderRadius: '4px'
                    }}
                >
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Email Text hier einfügen oder PDF Drag & Drop..."
                        className="form-input"
                        style={{
                            flex: 1, minHeight: '300px', width: '100%', padding: '1rem',
                            border: '1px solid var(--border)', borderRadius: '4px', resize: 'none',
                            fontFamily: 'monospace', fontSize: '0.9rem',
                            backgroundColor: isDragging ? 'rgba(var(--primary-rgb), 0.05)' : 'var(--background)',
                            color: 'var(--text-main)'
                        }}
                    />
                    {isDragging && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(var(--primary-active), 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 10, pointerEvents: 'none',
                            color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem',
                            flexDirection: 'column', gap: '0.5rem'
                        }}>
                            <FileUp size={48} style={{ marginBottom: '1rem' }} />
                            <span>Lassen Sie los zum Importieren</span>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} className="btn btn-outline">Abbrechen</button>
                    <button
                        onClick={handleAnalyze}
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '160px', justifyContent: 'center' }}
                    >
                        {loading ? <RotateCw className="spin" size={18} /> : <ArrowRight size={18} />}
                        {loading ? 'Analysieren...' : (useAI && apiKey ? 'KI Analysieren' : 'Regex Analysieren')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EmailImportModalV2;
