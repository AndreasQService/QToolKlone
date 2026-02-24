import React, { useRef, useState, useEffect } from 'react';
import { X, Save, Eraser, Pen, Undo, Trash2, FileText, Loader, Check, Hand, ChevronUp, ChevronDown, Plus, Edit3 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const MeasurementModal = ({ isOpen, onClose, onSave, rooms, projectTitle, initialData, readOnly, measurementHistory }) => {

    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#000000');
    const [lineWidth, setLineWidth] = useState(2);
    const [measurements, setMeasurements] = useState([]);
    const [history, setHistory] = useState([]); // Array of ImageData
    const [historyStep, setHistoryStep] = useState(-1);
    const [isScrollMode, setIsScrollMode] = useState(false); // New state for Scroll Mode
    const [isCanvasExpanded, setIsCanvasExpanded] = useState(true); // New state for sticky toggle
    const [isSketchLocked, setIsSketchLocked] = useState(true); // Default to Locked for safety
    const [globalSettings, setGlobalSettings] = useState({
        date: new Date().toISOString().split('T')[0],
        temp: '',
        humidity: '',
        device: ''
    });
    const [saveAsPdf, setSaveAsPdf] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [stylusOnlyMode, setStylusOnlyMode] = useState(false); // New state for Palm Rejection

    // Sync locked state with readOnly prop on open
    // Also update history if needed
    useEffect(() => {
        if (isOpen) {
            setIsSketchLocked(!!readOnly);
        }
    }, [isOpen, readOnly]);

    // Calculate History View Data
    // Calculate History View Data - PIVOT
    const { historyColumns, historyRows } = React.useMemo(() => {
        if (!measurementHistory || measurementHistory.length === 0) return { historyColumns: [], historyRows: [] };

        // 1. Get all unique MP names
        const allPointNames = new Set(['Messpunkt 1', 'Messpunkt 2', 'Messpunkt 3', 'Messpunkt 4']); // Ensure at least 4 default points

        // Add current measurements (the "capture" template) to ensure they are visible
        if (measurements && measurements.length > 0) {
            measurements.forEach(m => {
                if (m.pointName) allPointNames.add(m.pointName);
            });
        }

        measurementHistory.forEach(entry => {
            entry.measurements.forEach(m => {
                if (m.pointName) allPointNames.add(m.pointName);
            });
        });

        // Sort columns naturally (MP 1, MP 2, MP 10)
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        const sortedColumns = Array.from(allPointNames).sort(collator.compare);

        // 2. Sort history by Date Descending (Newest first)
        const sortedHistory = [...measurementHistory].sort((a, b) =>
            new Date(b.date || 0) - new Date(a.date || 0)
        );

        // 3. Build Rows
        const rows = sortedHistory.map((entry, idx) => {
            const entryDate = entry.globalSettings?.date || entry.date;

            // Find "previous" (older) entry for comparison
            // Since sorted Descending, previous is at idx + 1
            const prevEntry = sortedHistory[idx + 1];

            const rowData = {
                id: entry.id,
                date: entryDate,
                points: {}
            };

            sortedColumns.forEach(mpName => {
                const currM = entry.measurements.find(m => m.pointName === mpName);
                if (!currM) return; // No data for this MP in this entry

                const cell = {
                    w_value: currM.w_value,
                    b_value: currM.b_value,
                    w_color: 'inherit',
                    b_color: 'inherit'
                };

                // Compare with previous
                if (prevEntry) {
                    const prevM = prevEntry.measurements.find(m => m.pointName === mpName);
                    if (prevM) {
                        const parse = (v) => parseFloat(String(v).replace(',', '.'));

                        const wc = parse(currM.w_value);
                        const wp = parse(prevM.w_value);
                        if (!isNaN(wc) && !isNaN(wp)) {
                            if (wc < wp) cell.w_color = '#10B981'; // Good
                            if (wc > wp) cell.w_color = '#EF4444'; // Bad
                        }

                        const bc = parse(currM.b_value);
                        const bp = parse(prevM.b_value);
                        if (!isNaN(bc) && !isNaN(bp)) {
                            if (bc < bp) cell.b_color = '#10B981';
                            if (bc > bp) cell.b_color = '#EF4444';
                        }
                    }
                }
                rowData.points[mpName] = cell;
            });
            return rowData;
        });

        return { historyColumns: sortedColumns, historyRows: rows };

    }, [measurementHistory, measurements]);

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
                const initial = [
                    { id: `p${Date.now()}`, pointName: 'Messpunkt 1', w_value: '', b_value: '', notes: '' },
                    { id: `p${Date.now() + 1}`, pointName: 'Messpunkt 2', w_value: '', b_value: '', notes: '' },
                    { id: `p${Date.now() + 2}`, pointName: 'Messpunkt 3', w_value: '', b_value: '', notes: '' },
                    { id: `p${Date.now() + 3}`, pointName: 'Messpunkt 4', w_value: '', b_value: '', notes: '' }
                ];
                // Start with 4 points as per latest user request
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
        // Clear instead of fill white
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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



    const startDrawing = (e) => {
        if (isScrollMode || isSketchLocked) return; // Disable drawing in Scroll Mode or Locked

        // Palm Rejection / Stylus Only Mode
        if (stylusOnlyMode && e.pointerType !== 'pen') return;

        // Pointer Capture
        if (e.target.setPointerCapture) {
            e.target.setPointerCapture(e.pointerId);
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        // Calculate scaling factors (visual size vs internal resolution)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        ctx.beginPath();
        ctx.moveTo(x, y);

        if (color === '#ffffff') {
            // Eraser Mode
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)'; // Color doesn't matter for destination-out
        } else {
            // Drawing Mode
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = color;
        }

        ctx.lineWidth = lineWidth;
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        if (stylusOnlyMode && e.pointerType !== 'pen') return; // Safety check

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();

        // Calculate scaling factors (visual size vs internal resolution)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = (e) => {
        if (isDrawing) {
            if (e && e.target.releasePointerCapture) {
                try {
                    e.target.releasePointerCapture(e.pointerId);
                } catch (err) {
                    console.warn("Failed to release pointer capture", err);
                }
            }
            setIsDrawing(false);
            const canvas = canvasRef.current;
            saveParamsToHistory(canvas);
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    const addMeasurement = () => {
        const newId = measurements.length > 0 ? Math.max(...measurements.map(m => parseInt(m.id.substring(1)) || 0)) + 1 : 1;
        // Or simply maintain a logical counter if IDs need to be stable
        const newPoint = {
            id: `p${Date.now()}`, // Unique ID
            pointName: `Messpunkt ${measurements.length + 1}`,
            w_value: '',
            b_value: '',
            notes: ''
        };
        setMeasurements([...measurements, newPoint]);
    };

    const removeMeasurement = (index) => {
        const newMeasurements = measurements.filter((_, i) => i !== index);
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            {/* <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X size={20} />
                            </button> */}
                        </div>
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
                                // saveAsPdf ? <FileText size={18} /> : <Save size={18} />
                                null
                            )}
                            {isSaving ? 'Speichert...' : isSuccess ? 'Gespeichert!' : 'Fertig'}
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                    {/* Toolbar & Canvas - Sticky */}
                    <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid var(--border)',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: 'var(--surface)',
                        zIndex: 10
                    }}>
                        <div className="no-print" style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>Werkzeuge:</span>

                            {isSketchLocked ? (
                                <button
                                    onClick={() => setIsSketchLocked(false)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '4px',
                                        background: 'var(--primary)',
                                        border: '1px solid var(--primary)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.9rem',
                                        fontWeight: 500
                                    }}
                                    title="Zeichnen aktivieren"
                                >
                                    <Edit3 size={16} /> Skizze bearbeiten
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => { setIsScrollMode(false); setColor('#000000'); setLineWidth(2); }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            background: (!isScrollMode && color === '#000000') ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                            border: (!isScrollMode && color === '#000000') ? '1px solid var(--primary)' : '1px solid var(--border)',
                                            color: (!isScrollMode && color === '#000000') ? 'white' : 'var(--text-main)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}
                                        title="Stift Schwarz"
                                    >
                                        <Pen size={16} />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Stift</span>
                                    </button>
                                    <button
                                        onClick={() => { setIsScrollMode(false); setColor('#ef4444'); setLineWidth(2); }}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '6px',
                                            background: (!isScrollMode && color === '#ef4444') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                            border: (!isScrollMode && color === '#ef4444') ? '1px solid #ef4444' : '1px solid var(--border)',
                                            color: '#ef4444'
                                        }}
                                        title="Stift Rot"
                                    >
                                        <Pen size={16} />
                                    </button>
                                    <button
                                        onClick={() => { setIsScrollMode(false); setColor('#3b82f6'); setLineWidth(2); }}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '6px',
                                            background: (!isScrollMode && color === '#3b82f6') ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                                            border: (!isScrollMode && color === '#3b82f6') ? '1px solid #3b82f6' : '1px solid var(--border)',
                                            color: '#3b82f6'
                                        }}
                                        title="Stift Blau"
                                    >
                                        <Pen size={16} />
                                    </button>
                                    <button
                                        onClick={() => { setIsScrollMode(false); setColor('#ffffff'); setLineWidth(15); }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            background: (!isScrollMode && color === '#ffffff') ? '#f1f5f9' : 'rgba(255,255,255,0.05)',
                                            border: (!isScrollMode && color === '#ffffff') ? '1px solid #cbd5e1' : '1px solid var(--border)',
                                            color: '#475569',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}
                                        title="Radiergummi"
                                    >
                                        <Eraser size={16} />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Radierer</span>
                                    </button>
                                    <button
                                        onClick={() => setIsSketchLocked(true)}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            border: '1px solid #10B981',
                                            color: '#10B981',
                                            marginLeft: '0.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                        }}
                                        title="Skizze sperren"
                                    >
                                        <Check size={16} />
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Fertig</span>
                                    </button>
                                </>
                            )}

                            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.5rem' }}></div>

                            <button
                                onClick={() => setStylusOnlyMode(!stylusOnlyMode)}
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    background: stylusOnlyMode ? 'var(--primary)' : 'transparent',
                                    border: '1px solid var(--border)',
                                    color: stylusOnlyMode ? 'white' : 'var(--text-main)',
                                    marginRight: '0.5rem'
                                }}
                                title={stylusOnlyMode ? "Nur Stift (Handballen ignorieren)" : "Touch & Stift"}
                            >
                                <Pen size={16} />
                                {stylusOnlyMode && <span style={{ marginLeft: '4px', fontSize: '0.75rem' }}>Nur Stift</span>}
                            </button>

                            <button
                                onClick={() => setIsScrollMode(!isScrollMode)}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '6px',
                                    background: isScrollMode ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                    border: isScrollMode ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    color: isScrollMode ? 'white' : 'var(--text-main)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                                title={isScrollMode ? "Scrollen aktiv (Zeichnen deaktiviert)" : "Zeichnen aktiv"}
                            >
                                <Hand size={16} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Scrollen</span>
                            </button>

                            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.5rem' }}></div>

                            <button onClick={handleUndo} disabled={historyStep <= 0 || isSketchLocked} style={{ padding: '0.5rem', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border)', color: historyStep <= 0 || isSketchLocked ? 'var(--text-muted)' : 'var(--text-main)', opacity: historyStep <= 0 || isSketchLocked ? 0.5 : 1 }} title="Rückgängig"><Undo size={16} /></button>

                            <button
                                onClick={() => setIsCanvasExpanded(!isCanvasExpanded)}
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    marginLeft: 'auto',
                                    color: 'var(--text-main)'
                                }}
                                title={isCanvasExpanded ? "Skizze einklappen" : "Skizze ausklappen"}
                            >
                                {isCanvasExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>

                        {isCanvasExpanded && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', touchAction: 'none' }}>
                                <canvas
                                    ref={canvasRef}
                                    width={960}
                                    height={400}
                                    style={{
                                        width: '100%',
                                        height: '400px',
                                        cursor: isScrollMode ? 'grab' : 'crosshair',
                                        display: 'block',
                                        backgroundColor: 'white', // Base white
                                        backgroundImage: `
                                            linear-gradient(to right, #e0e0e0 1px, transparent 1px),
                                            linear-gradient(to bottom, #e0e0e0 1px, transparent 1px)
                                        `,
                                        backgroundSize: '40px 40px',
                                        touchAction: 'none'
                                    }}
                                    onPointerDown={startDrawing}
                                    onPointerMove={draw}
                                    onPointerUp={stopDrawing}
                                    onPointerLeave={stopDrawing}
                                    onPointerCancel={stopDrawing}
                                />
                            </div>
                        )}
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
                                style={{ width: '100%', padding: '0.6rem', minHeight: '40px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Raumtemp. (°C)</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={globalSettings.temp}
                                onChange={e => setGlobalSettings({ ...globalSettings, temp: e.target.value })}
                                className="form-input no-spinner"
                                style={{ width: '100%', padding: '0.6rem', minHeight: '40px' }}
                                placeholder="20.5"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Luftfeuchte (%)</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={globalSettings.humidity}
                                onChange={e => setGlobalSettings({ ...globalSettings, humidity: e.target.value })}
                                className="form-input no-spinner"
                                style={{ width: '100%', padding: '0.6rem', minHeight: '40px' }}
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
                                style={{ width: '100%', padding: '0.6rem', minHeight: '40px' }}
                                placeholder="z.B. Trotec"
                            />
                        </div>
                    </div>

                    {/* Measurements Table */}
                    <div style={{ padding: '1rem' }}>
                        {/* Current Measurements Table (Only if not readOnly) */}
                        {!readOnly && (
                            <div style={{ marginBottom: '2rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', width: '30%', color: 'var(--text-muted)' }}>Messpunkt</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', width: '20%', color: 'var(--text-muted)' }}>Wand</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', width: '20%', color: 'var(--text-muted)' }}>Boden</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>Bemerkung</th>
                                            <th style={{ padding: '0.5rem', width: '40px' }}></th>
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
                                                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', minHeight: '44px', userSelect: 'text', WebkitUserSelect: 'text' }}
                                                        autoComplete="off"
                                                    />
                                                </td>
                                                <td style={{ padding: '0.25rem' }}>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={row.w_value}
                                                        onChange={(e) => updateMeasurement(idx, 'w_value', e.target.value)}
                                                        className="form-input no-spinner"
                                                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', minHeight: '44px', touchAction: 'manipulation', userSelect: 'text', WebkitUserSelect: 'text' }}
                                                        placeholder="Wert..."
                                                        autoComplete="off"
                                                    />
                                                </td>
                                                <td style={{ padding: '0.25rem' }}>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={row.b_value}
                                                        onChange={(e) => updateMeasurement(idx, 'b_value', e.target.value)}
                                                        className="form-input no-spinner"
                                                        style={{ width: '100', padding: '0.75rem', fontSize: '1rem', minHeight: '44px', touchAction: 'manipulation', userSelect: 'text', WebkitUserSelect: 'text' }}
                                                        placeholder="Wert..."
                                                        autoComplete="off"
                                                    />
                                                </td>
                                                <td style={{ padding: '0.25rem' }}>
                                                    <input
                                                        type="text"
                                                        value={row.notes}
                                                        onChange={(e) => updateMeasurement(idx, 'notes', e.target.value)}
                                                        className="form-input"
                                                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', minHeight: '44px', userSelect: 'text', WebkitUserSelect: 'text' }}
                                                        placeholder="..."
                                                        autoComplete="off"
                                                    />
                                                </td>
                                                <td style={{ padding: '0.25rem', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => removeMeasurement(idx)}
                                                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                                                        title="Messpunkt löschen"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <button
                                    onClick={addMeasurement}
                                    className="no-print"
                                    style={{
                                        marginTop: '0.5rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem 1rem',
                                        background: 'transparent',
                                        border: '1px dashed var(--border)',
                                        borderRadius: '4px',
                                        color: 'var(--primary)',
                                        cursor: 'pointer',
                                        width: '100%',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Plus size={16} /> weiteren Messpunkt hinzufügen
                                </button>
                            </div>
                        )}

                        {/* History Comparison Table */}
                        {historyRows.length > 0 && (
                            <div style={{ marginTop: (!readOnly ? '2rem' : '0') }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <RotateCcw size={16} /> Bisherige Messverläufe
                                </h4>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                                                <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)', minWidth: '100px' }}>Datum</th>
                                                {historyColumns.map(col => (
                                                    <th key={col} style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-muted)', minWidth: '100px' }}>
                                                        {col}<br />
                                                        <span style={{ fontSize: '0.7em', fontWeight: 'normal' }}>(W / B)</span>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyRows.map(row => (
                                                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: row.id === 'current' ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                                                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                                                        {row.date ? new Date(row.date).toLocaleDateString('de-CH') : '-'}
                                                    </td>
                                                    {historyColumns.map(col => {
                                                        const cell = row.points[col];
                                                        return (
                                                            <td key={col} style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                                {cell ? (
                                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                                                                        <span style={{
                                                                            color: cell.w_color,
                                                                            fontWeight: cell.w_color !== 'inherit' && cell.w_color !== 'var(--text-main)' ? 'bold' : 'normal',
                                                                            minWidth: '25px',
                                                                            textAlign: 'right'
                                                                        }}>
                                                                            {cell.w_value || '-'}
                                                                        </span>
                                                                        <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>/</span>
                                                                        <span style={{
                                                                            color: cell.b_color,
                                                                            fontWeight: cell.b_color !== 'inherit' && cell.b_color !== 'var(--text-main)' ? 'bold' : 'normal',
                                                                            minWidth: '25px',
                                                                            textAlign: 'left'
                                                                        }}>
                                                                            {cell.b_value || '-'}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {historyRows.length === 0 && readOnly && (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <RotateCcw size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                <p>Keine historischen Daten vorhanden.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer / Copyright in capture */}
                <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: '#999', borderTop: '1px solid #eee' }}>
                    Erstellt mit Q-Tool | {new Date().toLocaleDateString('de-CH')}
                </div>
            </div>
        </div >
    );
};

export default MeasurementModal;
