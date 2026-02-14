import React, { useRef, useState, useEffect } from 'react';
import { X, Save, Eraser, Pen, Undo, Trash2, FileText, Loader, Check } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const MeasurementModal = ({ isOpen, onClose, onSave, rooms, projectTitle, initialData }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#000000');
    const [lineWidth, setLineWidth] = useState(2);
    const [measurements, setMeasurements] = useState([]);
    const [history, setHistory] = useState([]); // Array of ImageData
    const [historyStep, setHistoryStep] = useState(-1);
    const [globalSettings, setGlobalSettings] = useState({
        date: new Date().toISOString().split('T')[0],
        temp: '',
        humidity: '',
        device: ''
    });
    const [saveAsPdf, setSaveAsPdf] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Initialize measurements based on rooms or initialData
    useEffect(() => {
        if (isSuccess) return; // Prevent reset during success message
        if (isOpen && rooms && rooms.length > 0) {
            // Priority: Load from initialData if available for this room
            // current room is rooms[0]
            const roomData = initialData ? initialData[rooms[0].id] : null;

            if (roomData) {
                // Restore measurements
                setMeasurements(roomData.measurements || []);
                setGlobalSettings(roomData.globalSettings || {
                    date: new Date().toISOString().split('T')[0],
                    temp: '',
                    humidity: '',
                    device: ''
                });

                // Restore canvas
                if (roomData.canvasImage) {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = canvasRef.current;
                        if (canvas) {
                            const ctx = canvas.getContext('2d');
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                            saveParamsToHistory(canvas); // Save restored state to history
                        }
                    };
                    img.src = roomData.canvasImage;
                } else {
                    setTimeout(initCanvas, 100);
                }
            } else {
                // Initialize new
                const initial = [];
                // 12 Measurement points fixed
                for (let i = 1; i <= 12; i++) {
                    initial.push({
                        id: `p${i}`,
                        pointName: `Messpunkt ${i}`,
                        w_value: '', // Wand
                        b_value: '', // Boden
                        notes: ''
                    });
                }
                setMeasurements(initial);
                setGlobalSettings({
                    date: new Date().toISOString().split('T')[0],
                    temp: '',
                    humidity: '',
                    device: ''
                });

                // Clear/Init canvas
                setTimeout(initCanvas, 100);
            }
        }
    }, [isOpen, rooms, initialData, isSuccess]);

    const initCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#ffffff'; // Keep canvas white for drawing contrast, or make it dark if preferred? Usually white paper is better for sketching.
        // Let's keep canvas white but the rest of the modal dark.
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Grid
        drawGrid(ctx, canvas.width, canvas.height);

        // Save initial blank state
        saveParamsToHistory(canvas);
    };

    const saveParamsToHistory = (canvas) => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistory(prev => [...prev.slice(0, historyStep + 1), imageData]);
        setHistoryStep(prev => prev + 1);
    };

    const handleUndo = () => {
        if (historyStep > 0) {
            const newStep = historyStep - 1;
            const imageData = history[newStep];
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            setHistoryStep(newStep);
        }
    };

    const drawGrid = (ctx, w, h) => {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        const gridSize = 40;

        for (let x = 0; x <= w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y <= h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    };

    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            setIsDrawing(false);
            const canvas = canvasRef.current;
            saveParamsToHistory(canvas);
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ctx, canvas.width, canvas.height);
        saveParamsToHistory(canvas);
    };

    const handleSave = async () => {
        if (!containerRef.current || isSaving) return;

        setIsSaving(true);
        try {
            // Capture the entire modal content (sketch + table)
            const canvas = await html2canvas(containerRef.current, {
                scale: 2, // Higher resolution
                backgroundColor: '#ffffff'
            });

            // Capture canvas state as DataURL for restoration
            const toggleCanvas = canvasRef.current;
            const canvasDataUrl = toggleCanvas ? toggleCanvas.toDataURL() : null;

            if (saveAsPdf) {
                // Generate PDF
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

                // Create PDF Blob
                const pdfBlob = pdf.output('blob');
                const file = new File([pdfBlob], `Messprotokoll_${projectTitle || 'Neu'}_${rooms[0]?.name || ''}.pdf`, { type: 'application/pdf' });

                await onSave({
                    file,
                    measurements,
                    globalSettings,
                    canvasImage: canvasDataUrl
                });
            } else {
                // Standard Image Save
                await new Promise((resolve) => {
                    canvas.toBlob(async (blob) => {
                        const file = new File([blob], `Messprotokoll_${projectTitle || 'Neu'}_${Date.now()}.png`, { type: 'image/png' });

                        await onSave({
                            file,
                            measurements,
                            globalSettings,
                            canvasImage: canvasDataUrl
                        });
                        resolve();
                    }, 'image/png');
                });
            }

            // Show success state briefly
            setIsSuccess(true);
            setTimeout(() => {
                setIsSuccess(false);
                setIsSaving(false);
                onClose();
            }, 1000);

        } catch (err) {
            console.error("Error saving sketch:", err);
            alert("Fehler beim Speichern der Skizze.");
            setIsSaving(false);
        }
    };

    const updateMeasurement = (index, field, value) => {
        const newMeasurements = [...measurements];
        newMeasurements[index][field] = value;
        setMeasurements(newMeasurements);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem'
        }}>
            <div ref={containerRef} style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '8px',
                width: '1000px',
                maxWidth: '95vw',
                height: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                color: 'var(--text-main)',
                border: '1px solid var(--border)'
            }}>
                {/* Header */}
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--background)' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Messprotokoll</h3>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {projectTitle} {rooms.length === 1 && ` - ${rooms[0].name}`}
                        </div>
                    </div>
                    <div className="no-print" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            <input
                                type="checkbox"
                                checked={saveAsPdf}
                                onChange={(e) => setSaveAsPdf(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                            />
                            Als PDF speichern
                        </label>
                        <button onClick={onClose} className="btn btn-outline">Abbrechen</button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`btn ${isSuccess ? 'btn-success' : 'btn-primary'}`}
                            style={{
                                display: 'flex', gap: '0.5rem', alignItems: 'center',
                                backgroundColor: isSuccess ? '#10B981' : undefined,
                                borderColor: isSuccess ? '#10B981' : undefined
                            }}
                        >
                            {isSaving ? (
                                <Loader size={18} className="animate-spin" />
                            ) : isSuccess ? (
                                <Check size={18} />
                            ) : (
                                saveAsPdf ? <FileText size={18} /> : <Save size={18} />
                            )}
                            {isSaving ? 'Speichert...' : isSuccess ? 'Gespeichert!' : 'Speichern'}
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                    {/* Toolbar & Canvas */}
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <div className="no-print" style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>Werkzeuge:</span>
                            <button onClick={() => { setColor('#000000'); setLineWidth(2); }} style={{ padding: '0.5rem', borderRadius: '4px', background: color === '#000000' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border)' }} title="Stift Schwarz"><Pen size={16} color="var(--text-main)" /></button>
                            <button onClick={() => { setColor('#ef4444'); setLineWidth(2); }} style={{ padding: '0.5rem', borderRadius: '4px', background: color === '#ef4444' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border)' }} title="Stift Rot"><Pen size={16} color="#ef4444" /></button>
                            <button onClick={() => { setColor('#3b82f6'); setLineWidth(2); }} style={{ padding: '0.5rem', borderRadius: '4px', background: color === '#3b82f6' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border)' }} title="Stift Blau"><Pen size={16} color="#3b82f6" /></button>
                            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.5rem' }}></div>
                            <button onClick={handleUndo} disabled={historyStep <= 0} style={{ padding: '0.5rem', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border)', color: historyStep <= 0 ? 'var(--text-muted)' : 'var(--text-main)', opacity: historyStep <= 0 ? 0.5 : 1 }} title="Rückgängig"><Undo size={16} /></button>
                            <button onClick={clearCanvas} style={{ padding: '0.5rem', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border)', color: '#EF4444' }} title="Alles löschen"><Trash2 size={16} /></button>
                            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Grundriss zeichnen</span>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', touchAction: 'none' }}>
                            <canvas
                                ref={canvasRef}
                                width={960}
                                height={400}
                                style={{ width: '100%', height: '400px', cursor: 'crosshair', display: 'block', backgroundColor: 'white' }}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                            />
                        </div>
                    </div>

                    {/* Room Name Header */}
                    <div style={{ padding: '1rem 1rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)', margin: 0 }}>
                            {rooms.length === 1 ? rooms[0].name : 'Unbekannter Raum'}
                        </h2>
                    </div>

                    {/* Global Room Info */}
                    <div style={{ padding: '0.5rem 1rem 0 1rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Datum</label>
                            <input
                                type="date"
                                value={globalSettings.date}
                                onChange={e => setGlobalSettings({ ...globalSettings, date: e.target.value })}
                                className="form-input"
                                style={{ width: '100%', padding: '0.4rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Raumtemp. (°C)</label>
                            <input
                                type="text"
                                value={globalSettings.temp}
                                onChange={e => setGlobalSettings({ ...globalSettings, temp: e.target.value })}
                                className="form-input"
                                style={{ width: '100%', padding: '0.4rem' }}
                                placeholder="20.5"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Luftfeuchte (%)</label>
                            <input
                                type="text"
                                value={globalSettings.humidity}
                                onChange={e => setGlobalSettings({ ...globalSettings, humidity: e.target.value })}
                                className="form-input"
                                style={{ width: '100%', padding: '0.4rem' }}
                                placeholder="55"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Messgerät</label>
                            <input
                                type="text"
                                value={globalSettings.device}
                                onChange={e => setGlobalSettings({ ...globalSettings, device: e.target.value })}
                                className="form-input"
                                style={{ width: '100%', padding: '0.4rem' }}
                                placeholder="z.B. Trotec"
                            />
                        </div>
                    </div>

                    {/* Measurements Table */}
                    <div style={{ padding: '1rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Messwerte</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '30%', color: 'var(--text-muted)' }}>Messpunkt</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '20%', color: 'var(--text-muted)' }}>Wand</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left', width: '20%', color: 'var(--text-muted)' }}>Boden</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>Bemerkung</th>
                                </tr>
                            </thead>
                            <tbody>
                                {measurements.map((row, idx) => (
                                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.25rem' }}>
                                            <input
                                                type="text"
                                                value={row.pointName}
                                                onChange={(e) => updateMeasurement(idx, 'pointName', e.target.value)}
                                                className="form-input"
                                                style={{ padding: '0.25rem', fontWeight: 500 }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.25rem' }}>
                                            <input
                                                type="text"
                                                value={row.w_value}
                                                onChange={(e) => updateMeasurement(idx, 'w_value', e.target.value)}
                                                className="form-input"
                                                style={{ padding: '0.25rem' }}
                                                placeholder="Wert..."
                                            />
                                        </td>
                                        <td style={{ padding: '0.25rem' }}>
                                            <input
                                                type="text"
                                                value={row.b_value}
                                                onChange={(e) => updateMeasurement(idx, 'b_value', e.target.value)}
                                                className="form-input"
                                                style={{ padding: '0.25rem' }}
                                                placeholder="Wert..."
                                            />
                                        </td>
                                        <td style={{ padding: '0.25rem' }}>
                                            <input
                                                type="text"
                                                value={row.notes}
                                                onChange={(e) => updateMeasurement(idx, 'notes', e.target.value)}
                                                className="form-input"
                                                style={{ padding: '0.25rem' }}
                                                placeholder="..."
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer / Copyright in capture */}
                <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: '#999', borderTop: '1px solid #eee' }}>
                    Erstellt mit Q-Tool | {new Date().toLocaleDateString('de-CH')}
                </div>
            </div>
        </div>
    );
};

export default MeasurementModal;
