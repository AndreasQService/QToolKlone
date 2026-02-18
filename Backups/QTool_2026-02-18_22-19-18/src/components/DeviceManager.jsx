import { useState, useEffect } from 'react';
import { Plus, Trash, Edit, X, Search, Monitor, Fan, Wind, Thermometer, Wrench, Download, Loader2, LogOut, ExternalLink } from 'lucide-react';
import generatedDevices from '../data/imported_devices.json';
import { supabase } from '../supabaseClient';

const DEVICE_TYPES = [
    'Kondenstrockner',
    'Adsorptionstrockner',
    'Seitenkanalverdichter',
    'HEPA-Filter',
    'Ventilator',
    'Infrarotplatte',
    'Estrich-Dämmschichttrocknung',
    'Bautrockner',
    'Turbinen',
    'Wasserabscheider',
    'Messgeräte'
];

// Simple icons mapping
const DEVICE_ICONS = {
    'Kondenstrockner': <Monitor size={20} />,
    'Adsorptionstrockner': <Monitor size={20} />,
    'Seitenkanalverdichter': <Wind size={20} />,
    'HEPA-Filter': <Wind size={20} />,
    'Ventilator': <Fan size={20} />,
    'Infrarotplatte': <Thermometer size={20} />,
    'Estrich-Dämmschichttrocknung': <Wrench size={20} />,
    'Messgeräte': <Thermometer size={20} />,
    'Sonstiges': <Wrench size={20} />, // Keep legacy mapping just in case
    'Bautrockner': <Monitor size={20} />,
    'Turbinen': <Wind size={20} />,
    'Wasserabscheider': <Wrench size={20} />
};

export default function DeviceManager({ onBack, onNavigateToReport, reports = [] }) {
    const [devices, setDevices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [currentDevice, setCurrentDevice] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial load from Supabase
    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        if (!supabase) {
            setError("Supabase ist nicht konfiguriert. Bitte prüfen Sie Ihre .env Datei.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .order('number', { ascending: true }); // Numeric string sort might be tricky, but ok for now

            if (error) throw error;
            setDevices(data || []);
        } catch (e) {
            console.error("Error loading devices:", e);
            setError("Fehler beim Laden der Geräte: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!currentDevice || !currentDevice.number || !currentDevice.type) return;
        setIsLoading(true);
        try {
            if (currentDevice.id) {
                // Update
                const { error } = await supabase
                    .from('devices')
                    .update({
                        number: currentDevice.number,
                        type: currentDevice.type,
                        model: currentDevice.model,
                        status: currentDevice.status,
                        energy_consumption: currentDevice.energy_consumption || null
                    })
                    .eq('id', currentDevice.id);
                if (error) throw error;
            } else {
                // Create
                const { error } = await supabase
                    .from('devices')
                    .insert([{
                        number: currentDevice.number,
                        type: currentDevice.type,
                        model: currentDevice.model,
                        status: currentDevice.status || 'Aktiv',
                        energy_consumption: currentDevice.energy_consumption || null
                    }]);
                if (error) throw error;
            }
            // Refresh list
            await fetchDevices();
            setIsEditing(false);
            setCurrentDevice(null);
        } catch (e) {
            setError("Fehler beim Speichern: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Gerät wirklich löschen?')) {
            setIsLoading(true);
            try {
                const { error } = await supabase
                    .from('devices')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
                await fetchDevices();
            } catch (e) {
                setError("Fehler beim Löschen: " + e.message);
                setIsLoading(false); // Only set false here because fetchDevices handles it otherwise
            }
        }
    };

    const handleReleaseDevice = async (id, projectName) => {
        if (window.confirm(`Möchten Sie das Gerät wirklich aus dem Projekt "${projectName}" freigeben?\n\nHinweis: Dies setzt nur den Status zurück. Bitte prüfen Sie den Bericht separat, falls nötig.`)) {
            setIsLoading(true);
            try {
                const { error } = await supabase
                    .from('devices')
                    .update({ current_project: null })
                    .eq('id', id);

                if (error) throw error;
                await fetchDevices();
            } catch (e) {
                setError("Fehler beim Freigeben: " + e.message);
                setIsLoading(false);
            }
        }
    };

    const handleImportStandard = async () => {
        if (window.confirm('Möchten Sie die Standard-Geräteliste importieren? Bestehende Daten werden ergänzt.')) {
            setIsLoading(true);
            try {
                // Get existing numbers to avoid duplicates if possible, 
                // but for now let's just insert checking for duplicates might be complex client-side
                // easier to just fetch all numbers first.
                const { data: existingData } = await supabase.from('devices').select('number');
                const existingNumbers = new Set(existingData?.map(d => d.number));

                const devicesToImport = generatedDevices
                    .filter(d => !existingNumbers.has(d.number))
                    .map(d => ({
                        number: d.number,
                        type: d.type,
                        model: d.model,
                        status: d.status
                    }));

                if (devicesToImport.length === 0) {
                    alert('Keine neuen Geräte zum Importieren gefunden (basierend auf Inventar-Nr).');
                } else {
                    const { error } = await supabase.from('devices').insert(devicesToImport);
                    if (error) throw error;
                    alert(`${devicesToImport.length} Geräte erfolgreich importiert.`);
                    await fetchDevices();
                }
            } catch (e) {
                setError("Fehler beim Import: " + e.message);
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Safe filter
    const filteredDevices = devices.filter(d => {
        if (!d) return false;
        const num = d.number ? String(d.number).toLowerCase() : '';
        const mod = d.model ? String(d.model).toLowerCase() : '';
        const typ = d.type ? String(d.type).toLowerCase() : '';
        const search = searchTerm.toLowerCase();
        return num.includes(search) || mod.includes(search) || typ.includes(search);
    });

    return (
        <div className="container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>Geräteverwaltung</h1>
                <button onClick={onBack} className="btn btn-outline">Zurück zum Dashboard</button>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            style={{ paddingLeft: '3rem' }}
                            placeholder="Suche nach Nummer, Modell oder Typ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick={handleImportStandard}
                        title="Standard-Liste importieren"
                        disabled={isLoading}
                    >
                        <Download size={20} style={{ marginRight: '0.5rem' }} />
                        Import
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setCurrentDevice({ number: '', type: 'Kondenstrockner', model: '', status: 'Aktiv', energy_consumption: '' });
                            setIsEditing(true);
                        }}
                        disabled={isLoading}
                    >
                        <Plus size={20} style={{ marginRight: '0.5rem' }} />
                        Neues Gerät
                    </button>
                </div>

                {error && (
                    <div style={{ padding: '1rem', backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <div className="table-container">
                    {isLoading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 1rem' }} />
                            <p>Lade Daten...</p>
                        </div>
                    ) : (
                        <table className="data-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Nr.</th>
                                    <th style={{ textAlign: 'left' }}>Typ</th>
                                    <th style={{ textAlign: 'left' }}>Modell</th>
                                    <th style={{ textAlign: 'right' }}>kW</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th style={{ textAlign: 'left' }}>Einsatzort</th>
                                    <th style={{ textAlign: 'left' }}>Auftraggeber</th>
                                    <th style={{ textAlign: 'left' }}>Bewirtschafter</th>
                                    <th style={{ textAlign: 'right' }}>Aktionen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDevices.map(device => (
                                    <tr key={device.id}>
                                        <td style={{ fontWeight: 'bold' }}>#{device.number}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {DEVICE_ICONS[device.type] || <Wrench size={20} />}
                                                {device.type}
                                            </div>
                                        </td>
                                        <td>{device.model || '-'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text-muted)' }}>{device.energy_consumption ? `${device.energy_consumption} kW` : '-'}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '6px',
                                                backgroundColor: device.current_project ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                                color: device.current_project ? '#FCA5A5' : '#86EFAC',
                                                border: device.current_project ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                whiteSpace: 'nowrap',
                                                minWidth: '80px'
                                            }}>
                                                {device.current_project ? 'Im Einsatz' : 'Lager'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.9rem' }}>
                                            {device.current_project ? (
                                                <button
                                                    onClick={() => onNavigateToReport && onNavigateToReport(device.current_project)}
                                                    className="btn-ghost"
                                                    style={{
                                                        color: 'var(--primary)',
                                                        fontWeight: 500,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        width: '100%',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        fontSize: 'inherit'
                                                    }}
                                                    title={`Zum Auftrag "${device.current_project}" springen`}
                                                >
                                                    {device.current_project}
                                                    <ExternalLink size={14} />
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            {(() => {
                                                const report = device.current_project ? reports.find(r => r.id === device.current_project || r.projectTitle === device.current_project) : null;
                                                return <span style={{ fontSize: '0.9rem' }}>{report?.client || '-'}</span>
                                            })()}
                                        </td>
                                        <td>
                                            {(() => {
                                                const report = device.current_project ? reports.find(r => r.id === device.current_project || r.projectTitle === device.current_project) : null;
                                                return <span style={{ fontSize: '0.9rem' }}>{report?.assignedTo || '-'}</span>
                                            })()}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {device.current_project && (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ color: '#F59E0B', padding: '0.5rem' }}
                                                    onClick={() => handleReleaseDevice(device.id, device.current_project)}
                                                    title={`Gerät aus "${device.current_project}" abmelden (Status zurücksetzen)`}
                                                >
                                                    <LogOut size={18} />
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-ghost"
                                                style={{ color: 'var(--primary)', padding: '0.5rem' }}
                                                onClick={() => {
                                                    setCurrentDevice(device);
                                                    setIsEditing(true);
                                                }}
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                style={{ color: '#EF4444', padding: '0.5rem' }}
                                                onClick={() => handleDelete(device.id)}
                                            >
                                                <Trash size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredDevices.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                                <p>Keine Geräte gefunden.</p>
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={handleImportStandard}
                                                    style={{ padding: '0.75rem 1.5rem' }}
                                                >
                                                    <Download size={20} style={{ marginRight: '0.5rem' }} />
                                                    Standard-Geräteliste importieren
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal for Edit/Create */}
            {isEditing && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                                {currentDevice.id ? 'Gerät bearbeiten' : 'Neues Gerät'}
                            </h2>
                            <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Geräte-Nummer (Inventar-Nr.)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={currentDevice.number}
                                onChange={(e) => setCurrentDevice(prev => ({ ...prev, number: e.target.value }))}
                                placeholder="z.B. 101"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Typ</label>
                            <select
                                className="form-input"
                                value={currentDevice.type}
                                onChange={(e) => setCurrentDevice(prev => ({ ...prev, type: e.target.value }))}
                            >
                                {DEVICE_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Hersteller / Modell</label>
                            <input
                                type="text"
                                className="form-input"
                                value={currentDevice.model}
                                onChange={(e) => setCurrentDevice(prev => ({ ...prev, model: e.target.value }))}
                                placeholder="z.B. Trotec TTK 100"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Energiebedarf (kW)</label>
                            <select
                                className="form-input"
                                value={currentDevice.energy_consumption || ''}
                                onChange={(e) => setCurrentDevice(prev => ({ ...prev, energy_consumption: e.target.value }))}
                            >
                                <option value="">Wählen...</option>
                                <option value="0.1">0.1 kW</option>
                                <option value="0.2">0.2 kW</option>
                                <option value="0.3">0.3 kW</option>
                                <option value="0.4">0.4 kW</option>
                                <option value="0.5">0.5 kW</option>
                                <option value="0.6">0.6 kW</option>
                                <option value="0.7">0.7 kW</option>
                                <option value="0.8">0.8 kW</option>
                                <option value="0.9">0.9 kW</option>
                                <option value="1.0">1.0 kW</option>
                                <option value="1.2">1.2 kW</option>
                                <option value="1.5">1.5 kW</option>
                                <option value="2.0">2.0 kW</option>
                                <option value="2.5">2.5 kW</option>
                                <option value="3.0">3.0 kW</option>
                            </select>
                        </div>



                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <button className="btn btn-outline" onClick={() => setIsEditing(false)}>Abbrechen</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={isLoading}>
                                {isLoading ? 'Speichert...' : 'Speichern'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
