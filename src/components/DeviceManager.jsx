import { useState, useEffect } from 'react';
import {
    Plus, Trash, Edit, X, Search, Monitor, Fan, Wind,
    Thermometer, Wrench, Download, Loader2, LogOut,
    ExternalLink, CheckCircle2, AlertCircle, Package,
    Zap, Hash, Activity, MapPin
} from 'lucide-react';
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

const DEVICE_ICONS = {
    'Kondenstrockner': <Monitor size={18} />,
    'Adsorptionstrockner': <Activity size={18} />,
    'Seitenkanalverdichter': <Wind size={18} />,
    'HEPA-Filter': <Wind size={18} />,
    'Ventilator': <Fan size={18} />,
    'Infrarotplatte': <Zap size={18} />,
    'Estrich-Dämmschichttrocknung': <Wrench size={18} />,
    'Messgeräte': <Thermometer size={18} />,
    'Bautrockner': <Monitor size={18} />,
    'Turbinen': <Wind size={18} />,
    'Wasserabscheider': <Package size={18} />,
    'Sonstiges': <Wrench size={18} />
};

export default function DeviceManager({ onBack, onNavigateToReport, reports = [] }) {
    const [devices, setDevices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [currentDevice, setCurrentDevice] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        if (!supabase) {
            setError("Supabase ist nicht konfiguriert.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .order('number', { ascending: true });

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
                setIsLoading(false);
            }
        }
    };

    const handleReleaseDevice = async (id, projectName) => {
        if (window.confirm(`Möchten Sie das Gerät wirklich aus dem Projekt "${projectName}" freigeben ? `)) {
            setIsLoading(true);
            try {
                const { error } = await supabase
                    .from('devices')
                    .update({ current_project: null, current_report_id: null })
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
        if (window.confirm('Möchten Sie die Standard-Geräteliste importieren?')) {
            setIsLoading(true);
            try {
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
                    alert('Keine neuen Geräte zum Importieren gefunden.');
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

    const filteredDevices = devices.filter(d => {
        if (!d) return false;
        const num = d.number ? String(d.number).toLowerCase() : '';
        const mod = d.model ? String(d.model).toLowerCase() : '';
        const typ = d.type ? String(d.type).toLowerCase() : '';
        const search = searchTerm.toLowerCase();
        return num.includes(search) || mod.includes(search) || typ.includes(search);
    });

    return (
        <div className="container" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2.5rem',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '1.5rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                backdropFilter: 'blur(10px)'
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em', margin: 0 }}>
                        Geräteverwaltung
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Zentrale Übersicht und Statuskontrolle des Inventars
                    </p>
                </div>
                <button onClick={onBack} className="btn btn-outline" style={{ borderRadius: '9999px', padding: '0.6rem 1.5rem' }}>
                    Dashboard
                </button>
            </div>

            <div className="card" style={{
                border: '1px solid var(--border)',
                background: 'rgba(30, 41, 59, 0.5)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            style={{
                                paddingLeft: '3.5rem',
                                borderRadius: '9999px',
                                background: 'rgba(15, 23, 42, 0.5)',
                                border: '1px solid var(--border)'
                            }}
                            placeholder="Inventar-Nr., Modell oder Typ durchsuchen..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            className="btn btn-outline"
                            onClick={handleImportStandard}
                            style={{ borderRadius: '9999px', fontSize: '0.9rem' }}
                            disabled={isLoading}
                        >
                            <Download size={18} />
                            Import
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setCurrentDevice({ number: '', type: 'Kondenstrockner', model: '', status: 'Aktiv', energy_consumption: '' });
                                setIsEditing(true);
                            }}
                            style={{ borderRadius: '9999px', fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(15, 110, 163, 0.3)' }}
                            disabled={isLoading}
                        >
                            <Plus size={18} />
                            Gerät hinzufügen
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{
                        padding: '1rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#FCA5A5',
                        borderRadius: 'var(--radius)',
                        marginBottom: '1.5rem',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <AlertCircle size={20} />
                        {error}
                    </div>
                )}

                <div className="table-container" style={{ border: 'none', background: 'transparent' }}>
                    {isLoading ? (
                        <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Loader2 className="animate-spin" size={40} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                            <p style={{ fontWeight: 500 }}>Aktualisiere Inventarliste...</p>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nr.</th>
                                    <th style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Typ</th>
                                    <th style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Modell / kW</th>
                                    <th style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>Status</th>
                                    <th style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Aktueller Einsatz</th>
                                    <th style={{ background: 'transparent', textAlign: 'right' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDevices.map(device => {
                                    const report = device.current_project ? reports.find(r => r.id === device.current_project || r.projectTitle === device.current_project) : null;

                                    return (
                                        <tr key={device.id} style={{ transition: 'background 0.2s' }} className="report-row">
                                            <td style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Hash size={14} style={{ opacity: 0.5 }} />
                                                    {device.number}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '8px',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'var(--primary)'
                                                    }}>
                                                        {DEVICE_ICONS[device.type] || <Package size={18} />}
                                                    </div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{device.type}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{device.model || '-'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Zap size={12} /> {device.energy_consumption || '0.0'} kW
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '0.35rem 1rem',
                                                    borderRadius: '9999px',
                                                    background: device.current_project ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                    color: device.current_project ? '#FCA5A5' : '#10B981',
                                                    border: `1px solid ${device.current_project ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'} `,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    letterSpacing: '0.02em'
                                                }}>
                                                    <div style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: 'currentColor',
                                                        marginRight: '0.5rem',
                                                        boxShadow: '0 0 8px currentColor'
                                                    }}></div>
                                                    {device.current_project ? 'IM EINSATZ' : 'VERFÜGBAR'}
                                                </span>
                                            </td>
                                            <td>
                                                {device.current_project ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                        <button
                                                            onClick={() => onNavigateToReport && onNavigateToReport(device.current_project)}
                                                            style={{
                                                                color: 'var(--text-main)',
                                                                fontWeight: 700,
                                                                fontSize: '0.85rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.5rem',
                                                                padding: 0,
                                                                background: 'transparent',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                textAlign: 'left'
                                                            }}
                                                            title="Zum Projekt springen"
                                                        >
                                                            {device.current_project}
                                                            <ExternalLink size={12} style={{ opacity: 0.6 }} />
                                                        </button>
                                                        <div style={{
                                                            fontSize: '0.75rem',
                                                            color: 'var(--primary)',
                                                            fontWeight: 600,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem'
                                                        }}>
                                                            <MapPin size={10} />
                                                            {report?.locationDetails || 'Schadenort nicht definiert'}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                            {report?.client || 'Kein Kunde'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', opacity: 0.6 }}>Lager</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    {device.current_project && (
                                                        <button
                                                            className="btn btn-ghost"
                                                            style={{ color: '#F59E0B', padding: '0.5rem', borderRadius: '8px' }}
                                                            onClick={(e) => { e.stopPropagation(); handleReleaseDevice(device.id, device.current_project); }}
                                                            title="Freigeben"
                                                        >
                                                            <LogOut size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ color: 'var(--primary)', padding: '0.5rem', borderRadius: '8px' }}
                                                        onClick={(e) => { e.stopPropagation(); setCurrentDevice(device); setIsEditing(true); }}
                                                        title="Bearbeiten"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ color: 'rgba(239, 68, 68, 0.7)', padding: '0.5rem', borderRadius: '8px' }}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(device.id); }}
                                                        title="Löschen"
                                                    >
                                                        <Trash size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredDevices.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                                                <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }}>
                                                    <Package size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                                                </div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 500 }}>
                                                    Keine Geräte in diesem Filter gefunden.
                                                </div>
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={handleImportStandard}
                                                    style={{ borderRadius: '9999px' }}
                                                >
                                                    Standardliste importieren
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
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '500px',
                        padding: '2.5rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                        position: 'relative'
                    }}>
                        <button
                            onClick={() => setIsEditing(false)}
                            style={{
                                position: 'absolute', top: '1.5rem', right: '1.5rem',
                                background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer',
                                width: '32px', height: '32px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--text-muted)', transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'white'}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                                {currentDevice.id ? 'Gerätedaten anpassen' : 'Neues Inventar anlegen'}
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Erfassen Sie die technischen Details für das Inventarsystem.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ opacity: 0.8 }}>Inventar-Nr.</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={currentDevice.number}
                                    onChange={(e) => setCurrentDevice(prev => ({ ...prev, number: e.target.value }))}
                                    placeholder="z.B. QS-101"
                                    style={{ background: 'rgba(15, 23, 42, 0.3)' }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ opacity: 0.8 }}>Gerätetyp</label>
                                <select
                                    className="form-input"
                                    value={currentDevice.type}
                                    onChange={(e) => setCurrentDevice(prev => ({ ...prev, type: e.target.value }))}
                                    style={{ background: 'rgba(15, 23, 42, 0.3)' }}
                                >
                                    {DEVICE_TYPES.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ opacity: 0.8 }}>Hersteller / Modell</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={currentDevice.model}
                                    onChange={(e) => setCurrentDevice(prev => ({ ...prev, model: e.target.value }))}
                                    placeholder="z.B. Trotec TTK 100"
                                    style={{ background: 'rgba(15, 23, 42, 0.3)' }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ opacity: 0.8 }}>Anschlusswert (kW)</label>
                                <select
                                    className="form-input"
                                    value={currentDevice.energy_consumption || ''}
                                    onChange={(e) => setCurrentDevice(prev => ({ ...prev, energy_consumption: e.target.value }))}
                                    style={{ background: 'rgba(15, 23, 42, 0.3)' }}
                                >
                                    <option value="">Nicht definiert</option>
                                    {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0].map(kw => (
                                        <option key={kw} value={kw}>{kw} kW</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem' }}>
                            <button className="btn btn-outline" onClick={() => setIsEditing(false)} style={{ flex: 1, borderRadius: '9999px' }}>
                                Abbrechen
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={isLoading} style={{ flex: 2, borderRadius: '9999px', fontWeight: 700 }}>
                                {isLoading ? <Loader2 className="animate-spin" size={20} /> : (currentDevice.id ? 'Speichern' : 'Hinzufügen')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
