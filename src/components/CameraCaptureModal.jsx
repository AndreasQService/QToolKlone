import React, { useRef, useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

export default function CameraCaptureModal({ onClose, onCapture }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [error, setError] = useState(null);
    const [facingMode, setFacingMode] = useState('environment'); // default to rear

    const startCamera = async () => {
        try {
            // Cleanup old stream if exists
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: facingMode
                },
                audio: false
            };

            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setError(null);
        } catch (err) {
            console.error("Camera access error:", err);
            setError("Kamera-Zugriff verweigert oder nicht verfügbar. Bitte prüfen Sie Ihre Berechtigungen.");
        }
    };

    useEffect(() => {
        startCamera();
        return () => {
            // Cleanup on unmount
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facingMode]);

    const handleCapture = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to Blob/File
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `capture_${Date.now()}.png`, { type: 'image/png' });
                onCapture(file);
                onClose();
            }
        }, 'image/png');
    };

    const handleSwitchCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    // Clean shutdown when closing via button
    const handleClose = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        onClose();
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
        }}>
            {/* Close Button */}
            <button
                onClick={handleClose}
                style={{
                    position: 'absolute', top: '1rem', right: '1rem',
                    background: 'none', border: 'none', color: 'white', cursor: 'pointer',
                    padding: '10px'
                }}
            >
                <X size={32} />
            </button>

            {/* Error Message */}
            {error ? (
                <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>
                    <p style={{ marginBottom: '1rem', color: '#ef4444' }}>{error}</p>
                    <button onClick={handleClose} style={{
                        padding: '8px 16px', borderRadius: '6px',
                        backgroundColor: '#333', color: 'white', border: '1px solid #555',
                        cursor: 'pointer'
                    }}>
                        Schliessen
                    </button>
                </div>
            ) : (
                <>
                    {/* Video Preview */}
                    <div style={{
                        width: '100%', maxWidth: '90vh',
                        aspectRatio: '3/4', // Portrait orientation preference
                        maxHeight: '80vh',
                        backgroundColor: '#000',
                        position: 'relative',
                        borderRadius: '12px', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {/* Force video to fill */}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>

                    {/* Controls Footer */}
                    <div style={{
                        display: 'flex', gap: '2rem', marginTop: '2rem', alignItems: 'center',
                        justifyContent: 'center', width: '100%'
                    }}>
                        <button
                            onClick={handleSwitchCamera}
                            style={{
                                width: '50px', height: '50px', borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.2)', color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'none', cursor: 'pointer'
                            }}
                            title="Kamera wechseln"
                        >
                            <RefreshCw size={24} />
                        </button>

                        <button
                            onClick={handleCapture}
                            style={{
                                width: '80px', height: '80px', borderRadius: '50%',
                                backgroundColor: 'white',
                                border: '4px solid #444',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                            }}
                        >
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                backgroundColor: 'var(--primary, #007bff)',
                                border: '2px solid white'
                            }}></div>
                        </button>

                        <div style={{ width: '50px' }}></div> {/* Spacer for balance */}
                    </div>

                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </>
            )}
        </div>
    );
}
