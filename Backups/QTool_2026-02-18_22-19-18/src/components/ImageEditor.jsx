import React, { useRef, useState, useEffect } from 'react';
import { Save, X, PenTool, Circle as CircleIcon, Undo } from 'lucide-react';

const ImageEditor = ({ image, onSave, onCancel }) => {
    const canvasRef = useRef(null);
    const [context, setContext] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState('pen'); // 'pen', 'circle'
    const [color, setColor] = useState('#EF4444'); // Red by default
    const [lineWidth, setLineWidth] = useState(5);

    // History for Undo
    const [history, setHistory] = useState([]);

    // We use refs for drawing state to avoid react re-render lag during heavy mousemove
    const startPos = useRef({ x: 0, y: 0 });
    const snapshot = useRef(null);

    // Load image onto canvas
    useEffect(() => {
        if (!image || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        setContext(ctx);

        const img = new window.Image();
        img.crossOrigin = 'Anonymous';
        img.src = image.preview;

        img.onload = () => {
            let width = img.naturalWidth;
            let height = img.naturalHeight;

            // Limit max size
            const maxSize = 1200;
            if (width > maxSize || height > maxSize) {
                const ratio = width / height;
                if (width > height) {
                    width = maxSize;
                    height = maxSize / ratio;
                } else {
                    height = maxSize;
                    width = maxSize * ratio;
                }
            }

            canvas.width = width;
            canvas.height = height;

            ctx.drawImage(img, 0, 0, width, height);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Save initial state to history
            const initialState = ctx.getImageData(0, 0, width, height);
            setHistory([initialState]);
        };
    }, [image]);

    // Helper for coordinates
    const getCoordinates = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e) => {
        if (!context) return;
        e.preventDefault(); // Prevent scrolling on touch

        const coords = getCoordinates(e);
        startPos.current = coords;
        setIsDrawing(true);

        // Always save a snapshot of the *current* canvas before this specific stroke starts
        // This is used for the "drag" effect of the circle (to erase previous frames of the drag)
        snapshot.current = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (tool === 'pen') {
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = lineWidth;
            context.moveTo(coords.x, coords.y);
        }
    };

    const draw = (e) => {
        if (!isDrawing || !context) return;
        e.preventDefault();

        const coords = getCoordinates(e);

        if (tool === 'pen') {
            context.lineTo(coords.x, coords.y);
            context.stroke();
        } else if (tool === 'circle') {
            // Restore original image to "erase" old circle frame
            if (snapshot.current) {
                context.putImageData(snapshot.current, 0, 0);
            }

            // Draw new circle
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = lineWidth;

            const radius = Math.sqrt(Math.pow(coords.x - startPos.current.x, 2) + Math.pow(coords.y - startPos.current.y, 2));
            context.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI);
            context.stroke();
        }
    };

    const stopDrawing = (e) => {
        if (!context) return;
        if (isDrawing) {
            if (tool === 'pen') {
                context.closePath();
            }
            setIsDrawing(false);

            // Save state to history after drawing finishes
            const newState = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
            setHistory(prev => [...prev, newState]);
        }
    };

    const handleUndo = () => {
        if (history.length <= 1 || !context) return; // Keep at least initial state

        // Remove the last state (current)
        const newHistory = history.slice(0, -1);
        const previousState = newHistory[newHistory.length - 1];

        // Restore canvas
        context.putImageData(previousState, 0, 0);

        // Update history state
        setHistory(newHistory);
    };

    const handleSave = () => {
        if (!canvasRef.current) return;
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
        onSave(dataUrl);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem',
                backgroundColor: '#1E293B', padding: '0.75rem', borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
                <button
                    onClick={() => setTool('pen')}
                    className={`btn ${tool === 'pen' ? 'btn-primary' : 'btn-outline'}`}
                    style={{
                        color: tool === 'pen' ? 'white' : '#94A3B8',
                        borderColor: tool === 'pen' ? 'transparent' : '#475569',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    <PenTool size={18} /> Stift
                </button>
                <button
                    onClick={() => setTool('circle')}
                    className={`btn ${tool === 'circle' ? 'btn-primary' : 'btn-outline'}`}
                    style={{
                        color: tool === 'circle' ? 'white' : '#94A3B8',
                        borderColor: tool === 'circle' ? 'transparent' : '#475569',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    <CircleIcon size={18} /> Kreis (Ziehen)
                </button>

                <div style={{ width: '1px', height: '2.5rem', backgroundColor: '#475569', margin: '0 0.25rem' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
                        title="Farbe wählen"
                    />
                    <input
                        type="range"
                        min="1" max="20"
                        value={lineWidth}
                        onChange={(e) => setLineWidth(parseInt(e.target.value))}
                        style={{ width: '80px', accentColor: 'var(--primary)' }}
                        title="Strichstärke"
                    />
                </div>

                <div style={{ width: '1px', height: '2.5rem', backgroundColor: '#475569', margin: '0 0.25rem' }}></div>

                <button
                    onClick={handleUndo}
                    className="btn btn-outline"
                    disabled={history.length <= 1}
                    style={{
                        color: history.length > 1 ? 'white' : '#475569',
                        borderColor: '#475569',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        cursor: history.length > 1 ? 'pointer' : 'not-allowed'
                    }}
                    title="Rückgängig"
                >
                    <Undo size={18} />
                </button>
            </div>

            {/* Canvas Container */}
            <div style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        boxShadow: '0 0 0 1px #334155',
                        touchAction: 'none' // Important for touch devices
                    }}
                />
            </div>

            {/* Actions */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button onClick={onCancel} className="btn btn-outline" style={{ backgroundColor: 'white', color: '#334155', fontWeight: 500 }}>
                    <X size={18} style={{ marginRight: '0.5rem' }} /> Abbrechen
                </button>
                <button onClick={handleSave} className="btn btn-primary" style={{ fontWeight: 500 }}>
                    <Save size={18} style={{ marginRight: '0.5rem' }} /> Speichern
                </button>
            </div>
        </div>
    );
};

export default ImageEditor;
