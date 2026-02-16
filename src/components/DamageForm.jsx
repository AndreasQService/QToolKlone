import React, { useState, useEffect, useRef } from 'react';
import { Camera, Image, Trash, X, Plus, Edit3, Save, Upload, FileText, CheckCircle, Circle, AlertTriangle, Play, HelpCircle, ArrowLeft, Mail, Map, MapPin, Folder, Mic, Paperclip, Table, Download, Check, Settings, RotateCcw, ChevronDown, ChevronUp, Briefcase } from 'lucide-react'
import { supabase } from '../supabaseClient';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { swissPLZ } from '../data/swiss_plz';
import { DEVICE_INVENTORY } from '../data/device_inventory';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import ImageEditor from './ImageEditor';
import EmailImportModal from './EmailImportModalV2';
import OpenAI from "openai";
import CameraCaptureModal from './CameraCaptureModal';
import MeasurementModal from './MeasurementModal';
import { generateMeasurementExcel } from '../utils/MeasurementExcelExporter';

const STEPS = ['Schadenaufnahme', 'Leckortung', 'Trocknung', 'Instandsetzung']

const statusColors = {
    'Schadenaufnahme': 'bg-gray-100',
    'Leckortung': 'bg-blue-100',
    'Trocknung': 'bg-yellow-100',
    'Instandsetzung': 'bg-green-100',
    'Abgeschlossen': 'bg-gray-200'
}

const ROOM_OPTIONS = [
    "Wohnzimmer",
    "Bad",
    "Dusche",
    "Flur",
    "Schlafzimmer",
    "Treppenhaus",
    "Keller",
    "Garage",
    "Küche",
    "Abstellraum",
    "Gäste-WC",
    "Kinderzimmer 1",
    "Kinderzimmer 2",
    "Esszimmer",
    "Arbeitszimmer / Büro",
    "Hauswirtschaftsraum (HWR)",
    "Reduit",
    "Estrich",
    "Sonstiges / Eigener Name"
];

const getDaysDiff = (start, end) => {
    if (!start || !end) return 0;
    const date1 = new Date(start);
    const date2 = new Date(end);
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

const addAnnotationToImage = (imgSrc, type = 'circle') => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            if (type === 'circle') {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = Math.max(5, Math.min(canvas.width, canvas.height) * 0.015); // Dynamic line width
                ctx.beginPath();
                const radius = Math.min(canvas.width, canvas.height) * 0.25;
                ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, 2 * Math.PI);
                ctx.stroke();
            }

            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => resolve(imgSrc); // Fallback
        img.src = imgSrc;
    });
};

export default function DamageForm({ onCancel, initialData, onSave, mode = 'desktop' }) {
    // Helper to parse address string if editing
    const parseAddress = (addr) => {
        if (!addr) return { street: '', zip: '', city: '' };
        // Simple heuristic: assumes "Street 123, 1234 City" or similar
        // We try to extract ZIP (4 or 5 digits)
        const zipMatch = addr.match(/\b\d{4,5}\b/);
        let zip = zipMatch ? zipMatch[0] : '';
        let street = '';
        let city = '';

        if (zip) {
            const parts = addr.split(zip);
            street = parts[0].replace(/,\s*$/, '').trim();
            city = parts[1] ? parts[1].trim() : '';
        } else {
            street = addr;
        }
        return { street, zip, city };
    }

    const initialAddressParts = parseAddress(initialData?.address);

    const [formData, setFormData] = useState(() => (initialData ? {
        id: initialData.id, // Keep ID if editing
        projectTitle: initialData.projectTitle || initialData.id || '', // Include projectTitle
        client: initialData.client || '',
        locationDetails: initialData.locationDetails || '', // New field for Schadenort (e.g. "Wohnung ...")
        exteriorPhoto: initialData.exteriorPhoto || null, // New field for Exterior Photo
        clientSource: initialData.clientSource || '',
        propertyType: initialData.propertyType || '',
        damageCategory: initialData.damageCategory || 'Wasserschaden',
        assignedTo: initialData.assignedTo || '',
        address: initialData.address || '', // Store full address as fallback
        street: initialData.street || initialAddressParts.street,
        zip: initialData.zip || initialAddressParts.zip,
        city: initialData.city || initialAddressParts.city,

        contacts: (initialData?.contacts && initialData.contacts.filter(c => c.name || c.phone).length > 0)
            ? initialData.contacts.filter(c => c.name || c.phone)
            : [{ apartment: '', name: '', phone: '', role: 'Mieter' }],
        notes: initialData?.notes || '',
        documents: initialData?.documents || [],

        damageType: initialData.type || '',
        damageTypeImage: initialData.damageTypeImage || null,
        status: initialData.status || 'Schadenaufnahme',
        description: initialData.description || '',
        dryingStarted: initialData.dryingStarted || null,
        dryingEnded: initialData.dryingEnded || null,
        equipment: Array.isArray(initialData.equipment) ? initialData.equipment : [],
        images: Array.isArray(initialData.images)
            ? initialData.images.map(img => typeof img === 'string' ? { preview: img, name: 'Existing Image', date: new Date().toISOString() } : img)
            : [],
        rooms: Array.isArray(initialData.rooms) ? initialData.rooms : []
    } : {
        id: null,
        projectTitle: '',
        client: '',
        locationDetails: '',
        clientSource: '',
        propertyType: '',
        damageCategory: 'Wasserschaden',
        assignedTo: '',
        street: '',
        zip: '',
        city: '',
        // address: '',
        contacts: [
            { apartment: '', name: '', phone: '', role: 'Mieter' }
        ],
        notes: '',
        documents: [],
        damageType: '',
        damageTypeImage: null,
        status: 'Schadenaufnahme',
        description: '',
        dryingStarted: null,
        dryingEnded: null,
        equipment: [],
        images: [],
        rooms: []
    }));

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [visibleRoomImages, setVisibleRoomImages] = useState({}); // Stores roomId -> boolean for toggle
    const [showEmailImportModal, setShowEmailImportModal] = useState(false);


    // Auto-Save Effect
    useEffect(() => {
        // Skip auto-save if it's the very first render/empty (optional check)
        if (!formData.projectTitle && !formData.id) return;

        setIsSaving(true);
        const timer = setTimeout(async () => {
            if (!formData.projectTitle && !formData.id) return; // Re-check inside timeout

            setIsSaving(true);
            // Prepare data similar to handleSubmit
            const fullAddress = `${formData.street}, ${formData.zip} ${formData.city}`;
            const reportData = {
                ...formData,
                address: fullAddress, // Save standardized address string
                type: formData.damageType, // Map back to 'type'
                imageCount: formData.images.length
            };

            try {
                const savedReport = await onSave(reportData, true); // silent=true

                // If the report was new (no ID) and the save generated one, update local state
                if (savedReport && savedReport.id && !formData.id) {
                    setFormData(prev => ({ ...prev, id: savedReport.id }));
                }
            } catch (err) {
                console.error("Auto-save failed", err);
            } finally {
                setIsSaving(false);
                setLastSaved(new Date());
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [formData, onSave]);

    // --- Device Selection Logic ---
    const [availableDevices, setAvailableDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null); // The object from DB
    const [deviceFetchError, setDeviceFetchError] = useState(null);

    // Fetch available devices on mount (and when status changes)
    useEffect(() => {
        if (!supabase) {
            setDeviceFetchError("Supabase connection missing");
            return;
        }
        const fetchAvail = async () => {
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                // .in('status', ['Aktiv', 'Verfügbar']) // Removed strict status check to debug visibility
                .is('current_report_id', null)
                .order('number', { ascending: true });

            if (error) {
                console.error("Error fetching devices:", error);
                setDeviceFetchError(error.message);
            } else {
                setAvailableDevices(data || []);
            }
        };
        fetchAvail();
    }, []);

    const [newRoom, setNewRoom] = useState({
        name: '',
        apartment: '',
        stockwerk: '',
        customName: ''
    })

    const [showImageSelector, setShowImageSelector] = useState(false);
    const [editingImage, setEditingImage] = useState(null);
    const [activeImageMeta, setActiveImageMeta] = useState(null); // For the new Metadata Modal
    const [showEmailImport, setShowEmailImport] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);


    const [showMeasurementModal, setShowMeasurementModal] = useState(false);
    const [isNewMeasurement, setIsNewMeasurement] = useState(false);
    const [isMeasurementReadOnly, setIsMeasurementReadOnly] = useState(false); // Explicit read-only mode for modal
    const [activeRoomForMeasurement, setActiveRoomForMeasurement] = useState(null); // Track which room we are editing
    const [showAddDeviceForm, setShowAddDeviceForm] = useState(false);
    const [showAddRoomForm, setShowAddRoomForm] = useState(false);
    const [unsubscribeStates, setUnsubscribeStates] = useState({}); // { [idx]: { endDate, counterEnd, hours } }

    // Audio Recording State
    const [isRecording, setIsRecording] = useState(false); // false | 'modal' | image.preview
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);

    // Load available microphones
    const [deviceError, setDeviceError] = useState(null);

    const refreshAudioDevices = async () => {
        setDeviceError(null);
        try {
            // Request permission first to get labels and force discovery
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Important: Stop the stream immediately so we don't lock the default device
            stream.getTracks().forEach(track => track.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            setAudioDevices(audioInputs);

            // Set default if not set
            if (audioInputs.length > 0 && !selectedDeviceId) {
                const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
                setSelectedDeviceId(defaultDevice.deviceId);
            }
        } catch (err) {
            console.error("Error fetching audio devices:", err);
            setDeviceError(err.toString()); // Capture error for UI
        }
    };

    // UI State for Technician Mode "Add Room" toggle
    const [isAddRoomExpanded, setIsAddRoomExpanded] = useState(false);

    useEffect(() => {
        // Initial load
        // refreshAudioDevices(); // Potentially blocking if hardware issue

        // Listen for device changes (plugging in/out)
        /*
        navigator.mediaDevices.ondevicechange = () => {
            console.log("Audio devices changed, refreshing list...");
            refreshAudioDevices();
        };
        */

        return () => {
            // navigator.mediaDevices.ondevicechange = null;
        };
    }, []);

    const startRecording = async (targetId = 'modal') => {
        if (!navigator.mediaDevices) {
            return;
        }

        try {
            const constraints = {
                audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            mediaRecorderRef.current = new MediaRecorder(stream);
            const audioChunks = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log("Recording finished. Size:", audioBlob.size, "Type:", audioBlob.type);

                try {
                    if (audioBlob.size > 0) {
                        await transcribeAudio(audioBlob, targetId);
                    } else {
                        console.warn("Empty audio blob properly captured.");
                        alert("Aufnahme war leer.");
                    }
                } catch (error) {
                    console.error("Transcription error inside onstop:", error);
                    alert("Fehler bei der Transkription: " + error.message);
                } finally {
                    setIsTranscribing(false);
                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            // Setup Audio Analysis for Visual Feedback
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateVolume = () => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    analyser.getByteFrequencyData(dataArray);
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const avg = sum / dataArray.length; // 0 to 255
                    setAudioLevel(Math.min(100, (avg / 128) * 100)); // Amplify a bit, cap at 100
                    animationFrameRef.current = requestAnimationFrame(updateVolume);
                }
            };

            // Request data every 200ms to ensure we don't lose the last chunk
            mediaRecorderRef.current.start(200);
            setIsRecording(targetId);
            updateVolume();

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Mikrofon konnte nicht gestartet werden: " + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsTranscribing(true);

            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setAudioLevel(0);
        }
    };

    const transcribeAudio = async (audioBlob, targetId) => {
        // Trim key to avoid copy-paste issues and remove internal whitespace
        const rawKey = localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY || '';
        const apiKey = rawKey.replace(/\s/g, '').trim();

        if (!apiKey) {
            alert("Kein OpenAI API Key gefunden. Bitte in den Einstellungen (Email Import) hinterlegen.");
            return;
        }

        console.log("Transcribing audio... Key ends with:", apiKey.slice(-5));

        const formDataReq = new FormData();
        // Create a proper File object with correct extension
        const mimeType = audioBlob.type || 'audio/webm';
        const ext = mimeType.split('/')[1] ? mimeType.split('/')[1].split(';')[0] : 'webm';
        const filename = `recording.${ext}`;

        const audioFile = new File([audioBlob], filename, { type: mimeType });
        formDataReq.append("file", audioFile);
        formDataReq.append("model", "whisper-1");
        formDataReq.append("language", "de");
        // Add context for better technical term recognition
        formDataReq.append("prompt", "Wasserschaden, Trocknung, Feuchtigkeit, Lavabo, Siphon, Estrich, Dämmschicht, Unterlagsboden, Parkett, Laminat, Sockelleiste, Wandöffnung, Bohrung, Adsorptionstrockner, Gebläse, HEPA-Filter, Wasserzähler, Sanitär, Fugen, Silikon, Schimmel, Leckage, Rohrbruch.");

        try {
            // Use local proxy in dev node to bypass adblockers/CORS, direct in prod
            const apiUrl = import.meta.env.DEV
                ? '/openai-api/audio/transcriptions'
                : 'https://api.openai.com/v1/audio/transcriptions';

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                body: formDataReq
                // mode: 'cors' // Proxy handles this
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("OpenAI Error:", response.status, errorData);
                throw new Error(errorData.error?.message || `API Error ${response.status}`);
            }

            const data = await response.json();

            if (data.text) {
                // Clean up the new text: removing leading dots/whitespace
                let newText = data.text.trim();

                // Filter known Whisper hallucinations (remove them but keep valid text)
                // We use Regex for more robust matching of "Amara.org" variations
                let cleanText = newText;

                // 1. Aggressive removal of Amara.org related phrases
                cleanText = cleanText.replace(/Untertitel\s+der\s+Amara\.org-Community/gi, '');
                cleanText = cleanText.replace(/Untertitel\s+der\s+Amara\.org/gi, '');
                cleanText = cleanText.replace(/Amara\.org/gi, '');

                // 2. Remove isolated "Untertitel" which is a common artifact
                cleanText = cleanText.replace(/\bUntertitel\b/gi, '');

                // 3. Remove "Pfadfinder" or similar known artifacts if they appear alone? 
                // (Keeping it simple for now, focusing on the Amara issue)

                cleanText = cleanText.trim();

                // If nothing remains (or just a dot), it was effectively silence
                if (cleanText === '' || cleanText === '.') {
                    console.warn("Whisper hallucination detected (likely silence):", newText);
                    alert("Keine Sprache erkannt (Stille). Bitte lauter sprechen.");
                    return;
                }

                // Use the cleaned text
                newText = cleanText;

                // Remove a leading dot if it exists (e.g. ". Hello")
                if (newText.startsWith('.')) {
                    newText = newText.substring(1).trim();
                }

                if (targetId === 'modal') {
                    setActiveImageMeta(prev => {
                        const currentDesc = prev.description ? prev.description.trim() : "";
                        // If the current description is just dots (failed previous attempts), overwrite it
                        if (currentDesc === '.' || currentDesc === '..' || currentDesc === '...') {
                            return { ...prev, description: newText };
                        }
                        return {
                            ...prev,
                            description: (currentDesc ? currentDesc + " " : "") + newText
                        };
                    });
                } else {
                    // Update specific image in formData
                    setFormData(prev => ({
                        ...prev,
                        images: prev.images.map(img => {
                            if (img.preview === targetId) {
                                const currentDesc = img.description ? img.description.trim() : "";
                                // Check for garbage in existing description
                                const isGarbage = currentDesc === '.' || currentDesc === '..' || currentDesc === '...';
                                return {
                                    ...img,
                                    description: isGarbage ? newText : (currentDesc ? currentDesc + " " : "") + newText
                                };
                            }
                            return img;
                        })
                    }));
                }
            } else {
                console.warn("No text in response:", data);
            }
        } catch (error) {
            console.error("Fetch/Network Error:", error);
            // Distinguish between network 'Failed to fetch' and other errors
            if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
                alert(`Verbindungsfehler zu OpenAI.\n\nAPI Key: ...${apiKey.slice(-4)}\nDatei: ${filename} (${mimeType})\n\nMögliche Ursachen:\n- Kein Internet\n- Adblocker blockiert api.openai.com\n- Firmen-Firewall/VPN\n- Falscher API Key (prüfen Sie die Einstellungen)`);
            } else {
                alert("Fehler bei der Transkription: " + error.message);
            }
        } finally {
            setIsTranscribing(false);
        }
    };


    const generateEnergyReport = () => {
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text("Energieprotokoll", 20, 20);

        doc.setFontSize(10);
        const today = new Date().toLocaleDateString('de-CH');
        doc.text(`Projekt: ${formData.projectTitle || '-'}`, 20, 30);
        doc.text(`Kunde: ${formData.client || '-'}`, 20, 35);
        doc.text(`Adresse: ${formData.street || ''}, ${formData.zip} ${formData.city || ''}`, 20, 40);
        doc.text(`Erstellt am: ${today}`, 20, 45);

        // Table Data
        const tableData = formData.equipment.map(dev => {
            let consumption = '-';
            let usage = '-';
            if (dev.counterEnd && dev.counterStart) {
                const diff = parseFloat(dev.counterEnd) - parseFloat(dev.counterStart);
                if (!isNaN(diff)) consumption = diff.toFixed(2) + ' kWh';
            }
            if (dev.hours) usage = dev.hours + ' Std.';

            const days = getDaysDiff(dev.startDate, dev.endDate);

            return [
                (dev.room || 'Unbekannt') + (dev.apartment ? ` (${dev.apartment})` : ''),
                dev.deviceNumber || '-',
                dev.startDate || '-',
                dev.endDate || 'Laufend',
                days + ' Tage' + (dev.hours ? ` (${dev.hours} Std.)` : ''),
                dev.counterStart || '-',
                dev.counterEnd || '-',
                usage,
                consumption
            ];
        });

        autoTable(doc, {
            startY: 55,
            head: [['Raum', 'Gerät #', 'Start', 'Ende', 'Tage', 'Zähler Start', 'Zähler Ende', 'Laufzeit', 'Verbrauch']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 8 },
        });

        // Summary
        const totalConsumption = formData.equipment.reduce((acc, dev) => {
            if (dev.counterEnd && dev.counterStart) {
                const val = parseFloat(dev.counterEnd) - parseFloat(dev.counterStart);
                return acc + (isNaN(val) ? 0 : val);
            }
            return acc;
        }, 0);

        const finalY = (doc).lastAutoTable.finalY + 10;
        doc.setFontSize(11);
        doc.text(`Gesamtverbrauch: ${totalConsumption.toFixed(2)} kWh`, 20, finalY);

        doc.save(`Energieprotokoll_${formData.projectTitle || 'Export'}.pdf`);
    };




    const [showReportModal, setShowReportModal] = useState(false);
    const [openSettingsDirectly, setOpenSettingsDirectly] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraContext, setCameraContext] = useState(null);
    const [reportCause, setReportCause] = useState(initialData && initialData.cause ? initialData.cause : '');

    // AUTO-SAVE: Save formData 1 second after last change
    // AND save on unmount/unfocus to prevent data loss

    // Ref to hold latest formData for unmount cleanup
    const latestFormData = useRef(formData);
    // Ref to hold last successfully saved data to prevent loops
    const lastSavedData = useRef(formData);

    useEffect(() => {
        latestFormData.current = formData;
    }, [formData]);

    /*
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (onSave) {
                // DIRTY CHECK: Only save if data has actually changed
                // Performance optimization: Avoid JSON.stringify on large objects (images)
                // We trust that state updates create new object references.
                if (formData !== lastSavedData.current) {
                    // console.log("Auto-Save triggered. Equipment:", formData.equipment.length);
                    onSave(formData, true);
                    lastSavedData.current = formData;
                }
            }
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [formData, onSave]);
    */

    // Save on Unmount
    useEffect(() => {
        return () => {
            console.log("Component Unmounting - Saving final state...");
            // Optimization: Use reference check instead of JSON.stringify
            if (onSave && latestFormData.current !== lastSavedData.current) {
                onSave(latestFormData.current, true);
            }
        };
    }, [onSave]);

    const [newDevice, setNewDevice] = useState({
        deviceNumber: '', // Will be populated from selection
        apartment: '',
        room: '',
        startDate: new Date().toISOString().split('T')[0],
        counterStart: '',
        energyConsumption: ''
    })

    const handleAddDevice = async () => {
        // Validation
        if (!newDevice.room) {
            alert("Bitte wählen Sie einen Raum aus.");
            return false;
        }

        // manual entry fallback if no device selected?
        let deviceToAdd = {
            id: Date.now(),
            deviceNumber: newDevice.deviceNumber,
            type: selectedDevice ? selectedDevice.type : 'Unbekannt', // Fallback
            model: selectedDevice ? selectedDevice.model : '',
            apartment: newDevice.apartment,
            room: newDevice.room,
            startDate: newDevice.startDate || new Date().toISOString().split('T')[0],
            endDate: '',
            hours: '',
            counterStart: newDevice.counterStart,
            counterEnd: '',
            energyConsumption: newDevice.energyConsumption,
            // Link to Supabase ID if available
            dbId: selectedDevice ? selectedDevice.id : null
        };

        // If a real device was selected from DB, update its status
        if (selectedDevice && supabase) {
            console.log("Updating device status in DB...", selectedDevice.id);
            const { error } = await supabase
                .from('devices')
                .update({
                    // status logic removed to keep 'Aktiv'/'Inaktiv' only
                    current_report_id: formData.id,
                    current_project: formData.projectTitle || formData.client
                })
                .eq('id', selectedDevice.id);

            if (error) {
                console.error("Failed to update device status:", error);
                alert("Fehler beim Aktualisieren des Gerätestatus: " + error.message);
                return false; // Stop adding if DB update fails
            }

            // Remove from available list locally
            setAvailableDevices(prev => prev.filter(d => d.id !== selectedDevice.id));
        }

        setFormData(prev => {
            const nextEquipment = [...prev.equipment, deviceToAdd];
            return {
                ...prev,
                equipment: nextEquipment
            };
        })

        // Inputs are reset by the caller
        setSelectedDevice(null);
        return true;
    }

    const handleRemoveDevice = async (id, dbId) => {
        // If it's a linked device, free it up in Supabase
        if (dbId && supabase) {
            const { error } = await supabase
                .from('devices')
                .update({
                    // Keep status as is (Aktiv), just remove project linkage
                    current_report_id: null,
                    current_project: null
                })
                .eq('id', dbId);

            if (error) console.error("Error freeing device:", error);

            // Re-fetch available devices to show it immediately
            const { data } = await supabase.from('devices').select('*').in('status', ['Aktiv', 'Verfügbar']).is('current_report_id', null).order('number');
            if (data) setAvailableDevices(data);
        }

        setFormData(prev => ({
            ...prev,
            equipment: prev.equipment.filter(item => item.id !== id)
        }))
    }

    // --- Contact Handler ---
    const handleAddContact = () => {
        setFormData(prev => ({
            ...prev,
            contacts: [...prev.contacts, { name: '', phone: '', apartment: '', role: 'Mieter' }]
        }));
    };

    const handleRemoveContact = (index) => {
        setFormData(prev => ({
            ...prev,
            contacts: prev.contacts.filter((_, i) => i !== index)
        }));
    };

    // --- Image Upload Handler (Supabase) ---
    const handleImageUpload = async (files, contextData = {}) => {
        if (!files || files.length === 0) return;

        const newImages = [];
        for (const file of files) {
            // Optimistic UI: Show local preview immediately
            const previewUrl = URL.createObjectURL(file);
            const tempId = Math.random().toString(36).substring(7);

            // Basic metadata
            const imageEntry = {
                id: tempId,
                file, // Keep file for potential retry or local usage
                preview: previewUrl,
                name: file.name,
                date: new Date().toISOString(),
                ...contextData,
                includeInReport: true, // Default to true
                uploading: true // Mark as uploading
            };

            // Add to state immediately (optimistic)
            setFormData(prev => ({
                ...prev,
                images: [...prev.images, imageEntry]
            }));

            // Upload to Supabase if client exists
            if (supabase) {
                try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${formData.id || 'temp'}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

                    const { data, error } = await supabase.storage
                        .from('damage-images')
                        .upload(fileName, file);

                    if (error) throw error;

                    // Get Public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('damage-images')
                        .getPublicUrl(fileName);

                    // Update state with real URL and remove uploading flag
                    setFormData(prev => ({
                        ...prev,
                        images: prev.images.map(img =>
                            img.id === tempId ? { ...img, preview: publicUrl, storagePath: fileName, uploading: false } : img
                        )
                    }));

                } catch (error) {
                    console.error('Upload failed:', error);
                    // Mark as error
                    setFormData(prev => ({
                        ...prev,
                        images: prev.images.map(img =>
                            img.id === tempId ? { ...img, error: true, uploading: false } : img
                        )
                    }));
                }
            } else {
                // Offline / No Supabase: Keep local preview, mark as not uploading (simulated success)
                setFormData(prev => ({
                    ...prev,
                    images: prev.images.map(img =>
                        img.id === tempId ? { ...img, uploading: false } : img
                    )
                }));
            }
        }
    };

    const handleRoomImageDrop = (e, room) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.color = 'var(--text-muted)';

        const files = Array.from(e.dataTransfer.files);
        handleImageUpload(files, {
            assignedTo: room.name,
            roomId: room.id
        });
    };

    const handleRoomImageSelect = (e, room) => {
        const files = Array.from(e.target.files);
        handleImageUpload(files, {
            assignedTo: room.name,
            roomId: room.id
        });
    };

    const handleCategoryDrop = (e, category) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.color = 'var(--text-muted)';

        const files = Array.from(e.dataTransfer.files);
        handleImageUpload(files, {
            assignedTo: category
        });
    };

    const handleCategorySelect = (e, category) => {
        const files = Array.from(e.target.files);
        handleImageUpload(files, {
            assignedTo: category
        });
    };


    // --- Excel Export (Messprotokoll) with Images ---
    const generateExcelExport = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Q-Service AG';
        workbook.created = new Date();

        // Load Logo
        let logoId = null;
        try {
            const logoResponse = await fetch('/logo.png');
            if (logoResponse.ok) {
                const logoBuffer = await logoResponse.arrayBuffer();
                logoId = workbook.addImage({
                    buffer: new Uint8Array(logoBuffer), // ExcelJS expects Buffer or Uint8Array
                    extension: 'png',
                });
            }
        } catch (err) {
            console.error("Error loading logo for Excel:", err);
        }

        // Filter rooms that have measurement data
        const roomsWithMeasurements = formData.rooms.filter(room => room.measurementData && room.measurementData.measurements && room.measurementData.measurements.length > 0);

        if (roomsWithMeasurements.length === 0) {
            alert("Keine Messdaten gefunden. Bitte zuerst Messungen durchführen.");
            return;
        }

        for (const room of roomsWithMeasurements) {
            const mData = room.measurementData;
            const settings = mData.globalSettings || {};
            const measurements = mData.measurements || [];

            // Create Worksheet
            const sheetName = room.name.substring(0, 31).replace(/[\\/?*[\]]/g, ""); // Clean name
            const worksheet = workbook.addWorksheet(sheetName);

            // --- Define Columns ---
            // A=1, B=2, C=3, D=4...
            // W/B columns start at D (4)
            const columns = [
                { header: '', key: 'A', width: 15 }, // Datum / Labels
                { header: '', key: 'B', width: 12 }, // Temp / Values
                { header: '', key: 'C', width: 12 }, // RH
            ];
            // Add columns for measurements (1..12) -> 2 cols each
            for (let i = 0; i < measurements.length * 2; i++) {
                columns.push({ header: '', key: `M${i}`, width: 6 });
            }
            worksheet.columns = columns;

            // --- Add Header Rows ---
            // Row 1: Logo & Title
            // Add Logo if available
            if (logoId !== null) {
                worksheet.addImage(logoId, {
                    tl: { col: 0, row: 0 }, // A1
                    ext: { width: 180, height: 60 }, // Adjust size as needed
                    editAs: 'oneCell'
                });
                // Merge Title starting from D
                worksheet.mergeCells('D1', 'AA1');
                // Set Height for Row 1 to accommodate logo
                worksheet.getRow(1).height = 50;
            } else {
                worksheet.mergeCells('A1', 'AA1');
            }

            const titleCell = worksheet.getCell(logoId !== null ? 'D1' : 'A1');
            titleCell.value = 'Messprotokoll';
            titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
            // HEADER COLOR: Dark Blue #0F172A
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

            // Helper for metadata rows
            const addMetaRow = (rowNum, label, value) => {
                worksheet.mergeCells(`B${rowNum}`, `AA${rowNum}`);
                const labelCell = worksheet.getCell(`A${rowNum}`);
                labelCell.value = label;
                labelCell.font = { bold: true };
                labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const valCell = worksheet.getCell(`B${rowNum}`);
                valCell.value = value;
                valCell.alignment = { horizontal: 'left' };
                valCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            };

            // Metadata Rows
            addMetaRow(2, 'Objekt:', formData.projectTitle || '');
            // REMOVED 'Zuständig'
            addMetaRow(3, 'Schadenort:', formData.locationDetails || '');
            addMetaRow(4, 'Strasse:', formData.street || '');
            addMetaRow(5, 'Ort:', `${formData.zip || ''} ${formData.city || ''}`);
            addMetaRow(6, 'Raum:', room.name);
            addMetaRow(7, 'Messmittel:', settings.device || 'Checkatrade');

            // --- Table Header (Row 8 & 9) ---
            const hRowIdx = 8;
            const subHRowIdx = 9;
            const dataRowIdx = 10;

            // A8: Datum (Merge A8:A9)
            worksheet.mergeCells(`A${hRowIdx}:A${subHRowIdx}`);
            const hDate = worksheet.getCell(`A${hRowIdx}`);
            hDate.value = 'Datum';

            // B8: Luft C (Merge B8:B9)
            worksheet.mergeCells(`B${hRowIdx}:B${subHRowIdx}`);
            const hTemp = worksheet.getCell(`B${hRowIdx}`);
            hTemp.value = 'Luft °C';

            // C8: RH % (Merge C8:C9)
            worksheet.mergeCells(`C${hRowIdx}:C${subHRowIdx}`);
            const hRh = worksheet.getCell(`C${hRowIdx}`);
            hRh.value = 'RH %';

            // Style static headers
            [hDate, hTemp, hRh].forEach(cell => {
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Measurement Headers (1..12)
            let colIdx = 4; // D
            measurements.forEach((_, i) => {
                // Merge 2 cells for the Number (e.g. D8:E8)
                const startCol = colIdx;
                const endCol = colIdx + 1;
                worksheet.mergeCells(hRowIdx, startCol, hRowIdx, endCol);

                const numCell = worksheet.getCell(hRowIdx, startCol);
                numCell.value = i + 1;
                numCell.font = { bold: true };
                numCell.alignment = { horizontal: 'center' };
                numCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                // Subheaders W / B (Row 9)
                const wCell = worksheet.getCell(subHRowIdx, startCol);
                wCell.value = 'W';
                wCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                wCell.alignment = { horizontal: 'center' };
                wCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const bCell = worksheet.getCell(subHRowIdx, endCol);
                bCell.value = 'B';
                bCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                bCell.alignment = { horizontal: 'center' };
                bCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                colIdx += 2;
            });

            // --- Data Row (Row 10) ---
            const row = worksheet.getRow(dataRowIdx);
            row.values = [
                settings.date ? new Date(settings.date).toLocaleDateString('de-CH') : '',
                settings.temp || '',
                settings.humidity || '',
                ...measurements.flatMap(m => [m.w_value || '', m.b_value || ''])
            ];

            // Style Data Row
            row.eachCell((cell, colNumber) => {
                cell.alignment = { horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // --- Add Sketch (Canvas Image) ---
            if (mData.canvasImage) {
                // canvasImage is a data URL (base64)
                const imageId = workbook.addImage({
                    base64: mData.canvasImage,
                    extension: 'png',
                });

                // Insert below the table (e.g. Row 12)
                const sketchRowIdx = dataRowIdx + 2; // 12 (1 indexed usually, but here row value)
                // ExcelJS uses 0-indexed for 'tl' property? No, it uses 0-based col and row index for image placement.
                // Row 12 (1-indexed) is index 11.
                // Let's check previous code: tl: { col: 0, row: 9 } was for Row 10.
                // So for Row 12, we need row: 11.

                worksheet.addImage(imageId, {
                    tl: { col: 0, row: sketchRowIdx - 1 }, // Top-Left
                    ext: { width: 800, height: 350 }, // Fixed size approx
                    editAs: 'oneCell'
                });

                // Add Label
                const labelCell = worksheet.getCell(`A${sketchRowIdx}`);
                labelCell.value = 'Skizze / Grundriss:';
                labelCell.font = { bold: true, color: { argb: 'FF666666' } };
            }
        }

        // Save
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const fileName = `Messprotokoll_${formData.projectTitle || 'Projekt'}.xlsx`;

        saveAs(blob, fileName);

        // 27.05.2024: Keep history. Do not clear previous protocols.
        /*
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter(img => img.assignedTo !== 'Messprotokolle')
        }));
        */

        // Add the new file
        const file = new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        handleImageUpload([file], { assignedTo: 'Messprotokolle' });
    };

    const handleAddRoom = () => {
        let finalRoomName = newRoom.name;

        // Handle custom room name
        if (newRoom.name === "Sonstiges / Eigener Name") {
            if (!newRoom.customName || newRoom.customName.trim() === "") {
                alert("Bitte geben Sie einen Namen für den Raum ein.");
                return;
            }
            finalRoomName = newRoom.customName.trim();
        }

        if (!finalRoomName) return;

        const roomEntry = {
            id: Date.now(),
            name: finalRoomName,
            apartment: newRoom.apartment,
            stockwerk: newRoom.stockwerk
        };

        setFormData(prev => ({
            ...prev,
            rooms: [...prev.rooms, roomEntry]
        }));

        // Keep apartment and stockwerk, only clear name/customName
        setNewRoom(prev => ({ ...prev, name: '', customName: '' }));
    }

    const handleRemoveRoom = (id) => {
        setFormData(prev => ({
            ...prev,
            rooms: prev.rooms.filter(r => r.id !== id)
        }));
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    // --- PDF Export (Unified Vector Report) ---
    // --- PDF Export (Unified Vector Report) ---
    const generatePDFExport = async (customFormData = null) => {
        const dataToUse = customFormData || formData;
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // Helper to load image from URL/Blob to Base64
            const urlToDataUrl = async (url) => {
                if (!url) return null;
                if (url.startsWith('data:')) return url; // Already base64

                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.error("Failed to load image:", url, e);
                    return null;
                }
            };

            // Load Logo
            let logoData = null;
            try {
                logoData = await urlToDataUrl('/logo.png');
            } catch (e) { console.error("Logo load error:", e); }

            // --- Cover Page ---
            if (logoData) {
                try {
                    doc.addImage(logoData, 'PNG', 14, 10, 50, 20);
                } catch (e) { console.warn("Logo add failed", e); }
            }

            // Company Address Header
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate-500
            doc.text("Q-Service AG", pageWidth - 14, 15, { align: 'right' });
            doc.text("Kriesbachstrasse 30", pageWidth - 14, 20, { align: 'right' });
            doc.text("8600 Dübendorf", pageWidth - 14, 25, { align: 'right' });

            doc.setFontSize(22);
            doc.setTextColor(14, 165, 233); // Primary Color (Sky-500 equivalent)
            doc.text("Schadensbericht", 14, 50);

            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            if (dataToUse.projectTitle) {
                doc.text(dataToUse.projectTitle, 14, 65);
            }

            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105); // Slate-600

            let yPos = 80;
            const addLine = (label, value) => {
                if (value) {
                    doc.setFont(undefined, 'bold');
                    doc.text(label + ":", 14, yPos);
                    doc.setFont(undefined, 'normal');
                    doc.text(value, 50, yPos);
                    yPos += 7;
                }
            };

            addLine("Strasse", dataToUse.street);
            addLine("Ort", `${dataToUse.zip} ${dataToUse.city}`);
            if (dataToUse.locationDetails) {
                addLine("Lage / Details", dataToUse.locationDetails);
            }
            addLine("Datum", new Date().toLocaleDateString('de-CH'));
            addLine("Sachbearbeiter", dataToUse.clientSource || 'Unbekannt');

            yPos += 5; // Extra spacing

            // Blue Divider Line (Filled Rect for better visibility)
            doc.setFillColor(14, 165, 233); // Primary Blue #0EA5E9
            doc.rect(14, yPos, pageWidth - 28, 0.5, 'F');
            yPos += 10; // Spacing after line

            // Add Schadenursache (Detailed Description) if present
            // Note: dataToUse.cause is the detailed text from the modal
            if (dataToUse.cause) {
                doc.setFont(undefined, 'bold');
                doc.text("Schadenursache:", 14, yPos);
                yPos += 6;
                doc.setFont(undefined, 'normal');

                // Background box for cause
                doc.setFillColor(241, 245, 249); // Slate-100
                doc.setDrawColor(203, 213, 225); // Slate-300

                const splitCause = doc.splitTextToSize(dataToUse.cause, pageWidth - 38); // slightly narrower for padding
                const boxHeight = (splitCause.length * 5) + 10;

                // Check page break
                if (yPos + boxHeight > pageHeight - 20) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.roundedRect(14, yPos, pageWidth - 28, boxHeight, 3, 3, 'FD');
                doc.text(splitCause, 19, yPos + 7); // Padding left/top

                yPos += boxHeight + 10;
            }

            // Damage Type (Art)
            // Damage Type (Art)
            if (dataToUse.damageType) {
                doc.setFont(undefined, 'bold');
                doc.text("Schadenart:", 14, yPos);
                yPos += 6;
                doc.setFont(undefined, 'normal');
                const splitDamageType = doc.splitTextToSize(dataToUse.damageType, pageWidth - 30);
                doc.text(splitDamageType, 14, yPos);
                yPos += (splitDamageType.length * 6) + 4;
            }

            // Image for Schadenursache / Type
            if (dataToUse.damageTypeImage) {
                try {
                    const imgProps = doc.getImageProperties(dataToUse.damageTypeImage);
                    const imgWidth = 80;
                    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                    if (yPos + imgHeight > pageHeight - 20) {
                        doc.addPage();
                        yPos = 20;
                    }

                    doc.addImage(dataToUse.damageTypeImage, imgProps.fileType, 14, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 10;
                } catch (e) {
                    console.warn("Could not add damage type image", e);
                }
            }

            if (dataToUse.description) {
                doc.setFont(undefined, 'bold');
                doc.text("Beschreibung:", 14, yPos);
                yPos += 6;
                doc.setFont(undefined, 'normal');

                const splitDesc = doc.splitTextToSize(dataToUse.description, pageWidth - 30);
                doc.text(splitDesc, 14, yPos);
                yPos += (splitDesc.length * 6) + 10;
            }

            // --- Measurements & Rooms ---
            // Only rooms with actual measurement data OR images assigned to them
            // Actually user wants "Messprotokoll", so mainly measurements. 
            // BUT: "Schadensbericht" implies images too. 
            // Logic: Iterate all rooms that have ANY data.
            const roomsWithContent = dataToUse.rooms.filter(room =>
                dataToUse.images.some(img => (img.roomId === room.id || img.assignedTo === room.name) && img.includeInReport !== false)
            );

            if (roomsWithContent.length > 0) {
                // Sort rooms: Apartment -> Stockwerk -> Name
                roomsWithContent.sort((a, b) => {
                    const aptA = (a.apartment || '').toLowerCase();
                    const aptB = (b.apartment || '').toLowerCase();
                    if (aptA < aptB) return -1;
                    if (aptA > aptB) return 1;

                    const floorA = (a.stockwerk || '').toLowerCase();
                    const floorB = (b.stockwerk || '').toLowerCase();
                    if (floorA < floorB) return -1;
                    if (floorA > floorB) return 1;

                    return (a.name || '').localeCompare(b.name || '');
                });

                // Ensure we start after the cover page content
                if (yPos > pageHeight - 50) {
                    doc.addPage();
                    yPos = 20;
                } else {
                    yPos += 20; // Some spacing after cover
                }

                let currentApartment = null;
                let currentFloor = null;

                for (let i = 0; i < roomsWithContent.length; i++) {
                    const room = roomsWithContent[i];

                    // Check Apartment Change
                    if (room.apartment !== currentApartment) {
                        currentApartment = room.apartment;
                        currentFloor = null; // Reset floor when apartment changes

                        if (currentApartment) {
                            if (yPos + 40 > pageHeight) {
                                doc.addPage();
                                yPos = 20;
                            }
                            doc.setFontSize(16);
                            doc.setTextColor(14, 165, 233); // Primary Blue
                            doc.setFont(undefined, 'bold');
                            doc.text(`Wohnung: ${currentApartment}`, 14, yPos);
                            yPos += 10;

                            // Draw divider line for apartment
                            doc.setDrawColor(14, 165, 233);
                            doc.setLineWidth(0.5);
                            doc.line(14, yPos - 2, pageWidth - 14, yPos - 2);
                            yPos += 5;
                        }
                    }

                    // Check Floor Change
                    if (room.stockwerk !== currentFloor) {
                        currentFloor = room.stockwerk;

                        if (currentFloor) {
                            if (yPos + 30 > pageHeight) {
                                doc.addPage();
                                yPos = 20;
                            }
                            doc.setFontSize(13);
                            doc.setTextColor(71, 85, 105); // Slate-600
                            doc.setFont(undefined, 'bold');
                            doc.text(`Stockwerk: ${currentFloor}`, 14, yPos);
                            yPos += 8;
                        }
                    }

                    // Header for Room
                    doc.setFontSize(12); // Slightly smaller as it's now nested
                    doc.setTextColor(0, 0, 0); // Black
                    doc.setFont(undefined, 'bold');

                    // check space for header and at least one image row
                    if (yPos + 80 > pageHeight) {
                        doc.addPage();
                        yPos = 20;
                        // Repeat headers if logic dictates, but for now just continue
                        if (currentApartment) {
                            doc.setFontSize(10);
                            doc.setTextColor(150, 150, 150);
                            doc.text(`(Fortsetzung ${currentApartment})`, 14, yPos - 5);
                        }
                    }

                    // Draw Room Header (Indented slightly?)
                    doc.text(room.name, 14, yPos);

                    // Optional Date on right
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'normal');
                    // doc.text(`Datum: ${new Date().toLocaleDateString('de-CH')}`, pageWidth - 14, yPos, { align: 'right' }); 
                    // Date per room might be redundant if report has date. Remove to save space? User request "unnötig viele seiten".

                    yPos += 8; // Space below header

                    const roomImages = dataToUse.images.filter(img =>
                        (img.roomId === room.id || img.assignedTo === room.name) &&
                        img.includeInReport !== false
                    );

                    if (roomImages.length > 0) {
                        let imgX = 14;
                        const imgWidth = 80;
                        const imgHeight = 60;
                        const gutter = 10;

                        // Check if we need new page for first row
                        if (yPos + imgHeight + 20 > pageHeight - 20) {
                            doc.addPage();
                            yPos = 20;
                        }

                        // Grid Layout
                        let rowMaxH = 0;

                        for (let j = 0; j < roomImages.length; j++) {
                            const imgItem = roomImages[j];

                            // Check X overflow -> new row
                            if (imgX + imgWidth > pageWidth - 14) {
                                imgX = 14;
                                yPos += rowMaxH + 10; // Move down by row height + gap
                                rowMaxH = 0;

                                // Check Y overflow -> new page
                                if (yPos + imgHeight + 20 > pageHeight - 20) {
                                    doc.addPage();
                                    yPos = 20;
                                }
                            }

                            // Track max height of current row including description
                            let currentItemH = imgHeight;

                            try {
                                const imgData = await urlToDataUrl(imgItem.preview);
                                if (imgData) {
                                    doc.addImage(imgData, 'JPEG', imgX, yPos, imgWidth, imgHeight);

                                    // Description
                                    if (imgItem.description) {
                                        doc.setFontSize(9);
                                        doc.setTextColor(50, 50, 50);
                                        const descLines = doc.splitTextToSize(imgItem.description, imgWidth);
                                        const descHeight = (descLines.length * 4) + 2;
                                        doc.text(descLines, imgX, yPos + imgHeight + 5);
                                        currentItemH += 5 + descHeight;
                                    }
                                }
                            } catch (e) {
                                console.error("Image error", e);
                            }

                            // Update row max height
                            if (currentItemH > rowMaxH) rowMaxH = currentItemH;

                            // Next X
                            imgX += imgWidth + gutter;
                        }

                        // After images loop, add last row height to yPos
                        yPos += rowMaxH + 15; // Space after room
                    }

                    // Add divider between rooms? Optional.
                    // If not last room
                    if (i < roomsWithContent.length - 1) {
                        // Only add small divider if we are NOT changing apartment next
                        if (roomsWithContent[i + 1].apartment === currentApartment) {
                            if (yPos + 20 < pageHeight) {
                                doc.setDrawColor(200, 200, 200);
                                doc.setLineWidth(0.1);
                                doc.line(14, yPos - 5, pageWidth - 14, yPos - 5);
                                yPos += 5;
                            }
                        }
                    }
                }
            } else {
                // If no rooms, maybe just generic images?
                // For now, if no rooms, we just leave cover and done.
            }

            const fileName = `Export_${dataToUse.projectTitle || 'Projekt'}.pdf`;

            // Footer for all pages
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150); // Gray
                const footerText = "Q-Service AG, Kriesbachstrasse 30, 8600 Dübendorf, www.q-service.ch, info@q-service.ch Tel. 043 819 14 18";
                const footerWidth = doc.getTextWidth(footerText);
                doc.text(footerText, (pageWidth - footerWidth) / 2, pageHeight - 10);

                // Page Number
                doc.text(`Seite ${i} von ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
            }

            doc.save(fileName);

            // Add the new file to the list
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

            // Use handleImageUpload to add it to state correctly
            await handleImageUpload([file], { assignedTo: 'Schadensbericht' });

        } catch (error) {
            console.error("PDF Export failed", error);
            alert("Fehler beim Erstellen des PDFs: " + error.message);
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleGeneratePDF = async () => {
        setIsGeneratingPDF(true);
        try {
            await generatePDFExport();
        } catch (error) {
            console.error("PDF Export failed", error);
            alert("Fehler beim Erstellen des PDFs");
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleStartDrying = () => {
        const now = new Date().toISOString().split('T')[0]
        setFormData(prev => ({
            ...prev,
            dryingStarted: now,
            status: 'Trocknung'
        }))
    }

    const handleEndDrying = () => {
        // Validate input
        if (formData.equipment.length > 0) {
            const incompleteDevices = formData.equipment.filter(d => !d.counterEnd || !d.endDate);
            if (incompleteDevices.length > 0) {
                alert(`Bitte erfassen Sie zuerst für alle Geräte die End-Daten (End-Datum, Zähler Ende).\n\nFehlende Einträge bei: ${incompleteDevices.map(d => '#' + d.deviceNumber).join(', ')}`);
                return;
            }
        }

        const now = new Date().toISOString().split('T')[0]
        setFormData(prev => ({
            ...prev,
            dryingEnded: now,
            // Optionally auto-advance status
        }))
    }




    const handleSubmit = (e) => {
        e.preventDefault()

        // Combine address parts
        const fullAddress = `${formData.street}, ${formData.zip} ${formData.city}`;

        // Map form data back to report structure
        const reportData = {
            ...formData,
            address: fullAddress, // Save standardized address string
            type: formData.damageType, // Map back to 'type'
            imageCount: formData.images.length
        }
        onSave(reportData)
    }

    const handleDamageTypeImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({
                ...prev,
                damageTypeImage: reader.result
            }));
        };
        reader.readAsDataURL(file);
    };

    const removeDamageTypeImage = () => {
        setFormData(prev => ({
            ...prev,
            damageTypeImage: null
        }));
    };

    const handleExteriorPhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({
                ...prev,
                exteriorPhoto: reader.result
            }));
        };
        reader.readAsDataURL(file);
    };

    const removeExteriorPhoto = () => {
        setFormData(prev => ({
            ...prev,
            exteriorPhoto: null
        }));
    };



    const generatePDFContent = async () => {
        setIsGeneratingPDF(true);
        // Allow time for render
        setTimeout(async () => {
            try {
                const doc = new jsPDF('p', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 20; // 20mm margin
                const contentWidth = pageWidth - (margin * 2);

                let currentY = margin;

                // Helper to add footer
                const addFooter = (pdfDoc, pageNum) => {
                    pdfDoc.setFontSize(8);
                    pdfDoc.setTextColor(150, 150, 150); // Gray
                    const footerText = `Q-Service AG | Kriesbachstrasse 30, 8600 Dübendorf | www.q-service.ch | +41 43 819 14 18`;
                    const textWidth = pdfDoc.getTextWidth(footerText);
                    pdfDoc.text(footerText, (pageWidth - textWidth) / 2, pageHeight - 10);
                };

                // Get all sections marked for PDF generation
                const sections = document.querySelectorAll('#print-report .pdf-section');

                // Add initial footer
                addFooter(doc, 1);

                for (let i = 0; i < sections.length; i++) {
                    const section = sections[i];

                    // Capture section - TRANSPARENT background so watermark shows through
                    const canvas = await html2canvas(section, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: null // Transparent
                    });

                    const imgData = canvas.toDataURL('image/png');
                    const imgHeight = (canvas.height * contentWidth) / canvas.width;

                    // Check if we need a new page
                    if (currentY + imgHeight > pageHeight - margin) {
                        doc.addPage();
                        currentY = margin;
                        addFooter(doc);
                    }

                    doc.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);

                    // Add some spacing after each section
                    currentY += imgHeight + 5;
                }

                // Generate Blob
                const pdfBlob = doc.output('blob');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const fileName = `Schadensbericht_${formData.id || 'Neu'}_${timestamp}.pdf`;
                const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

                // Add to Documents (Sonstiges)
                const reader = new FileReader();
                reader.readAsDataURL(pdfFile);
                reader.onloadend = () => {
                    // Only add if it doesn't exist (simple check by name to avoid dupes on multiple gens?)
                    // Actually user might want versions. We keep appending.
                    const newImage = {
                        file: pdfFile,
                        preview: null,
                        name: pdfFile.name,
                        assignedTo: 'Sonstiges',
                        roomId: null
                    };
                    setFormData(prev => ({
                        ...prev,
                        images: [...prev.images, newImage]
                    }));
                };

                // Trigger download
                doc.save(fileName);

            } catch (error) {
                console.error('PDF Generation Error:', error);
                alert('Fehler beim Erstellen des PDF Berichts: ' + error.message);
            } finally {
                setIsGeneratingPDF(false);
            }
        }, 500); // 500ms delay to ensure render
    }

    const handleEmailImport = (data) => {
        setFormData(prev => ({
            ...prev,
            projectTitle: data.projectTitle || prev.projectTitle,
            client: data.client || prev.client,
            description: data.description ? (prev.description ? prev.description + '\n\n' + data.description : data.description) : prev.description,
            street: data.street || prev.street,
            zip: data.zip || prev.zip,
            city: data.city || prev.city,
            contacts: data.contacts && data.contacts.length > 0 ? [...prev.contacts, ...data.contacts] : prev.contacts
        }));
        setShowEmailImportModal(false);
    };

    const handlePDFClick = () => {

        setShowReportModal(true);
    }



    if (mode === 'technician' || mode === 'desktop') {
        return (
            <div className="card" style={{ maxWidth: mode === 'desktop' ? '1200px' : '600px', margin: '0 auto', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid var(--primary)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                        {formData.projectTitle || 'Projekt'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setShowEmailImportModal(true)}
                            className="btn btn-outline"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', marginRight: '0.5rem' }}
                            title="Daten aus Email importieren"
                        >
                            <Mail size={16} />
                            <span className="hide-mobile">Email Import</span>
                        </button>
                        <select
                            className="form-input"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem', width: 'auto' }}
                            value={formData.status}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                        >
                            {Object.keys(statusColors).map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 1. Address (Schadenort) */}
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', color: 'var(--text-main)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                        <MapPin size={18} /> Schadenort
                    </h3>
                    <div style={{ fontSize: '1rem', lineHeight: '1.4' }}>
                        {formData.locationDetails && (
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                {formData.locationDetails}
                            </div>
                        )}

                        {(formData.street && formData.street.trim()) ? (
                            <>
                                {formData.street}<br />
                                {formData.zip} {formData.city}
                            </>
                        ) : (
                            formData.address || 'Keine Adresse'
                        )}

                        {(formData.street || formData.address) && (
                            <div style={{ marginTop: '1rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <iframe
                                    width="100%"
                                    height="300"
                                    style={{ border: 0, display: 'block' }}
                                    loading="lazy"
                                    allowFullScreen
                                    src={`https://maps.google.com/maps?q=${encodeURIComponent(formData.street ? `${formData.street}, ${formData.zip} ${formData.city}` : formData.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                    title="Standort Karte"
                                ></iframe>
                            </div>
                        )}
                    </div>
                </div>

                {/* 1a. Project Details (Client / Manager) */}
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', color: 'var(--text-main)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                        <Briefcase size={18} /> Auftrag & Verwaltung
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Auftraggeber</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.client || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, client: e.target.value }))}
                                placeholder="Auftraggeber eingeben"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Zuständige Bewirtschaftung</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.assignedTo || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                                placeholder="Verwaltung / Bewirtschafter eingeben"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Schadensart</label>
                            <select
                                className="form-input"
                                value={formData.damageCategory || 'Wasserschaden'}
                                onChange={(e) => setFormData(prev => ({ ...prev, damageCategory: e.target.value }))}
                                style={{ width: '100%' }}
                            >
                                <option value="Wasserschaden">Wasserschaden</option>
                                <option value="Schimmel">Schimmel</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 1b. Exterior Photo (Aussenaufnahme) - Technician Mode */}
                {(mode === 'desktop' || (formData.status !== 'Trocknung' && formData.status !== 'Leckortung')) && (
                    <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', color: 'var(--text-main)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                            <Camera size={18} /> Aussenaufnahme
                        </h3>

                        {formData.exteriorPhoto ? (
                            <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <img
                                    src={formData.exteriorPhoto}
                                    alt="Aussenaufnahme"
                                    style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block' }}
                                />
                                <button
                                    type="button"
                                    onClick={removeExteriorPhoto}
                                    style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '32px',
                                        height: '32px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        ) : (
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    border: '2px dashed var(--border)',
                                    borderRadius: 'var(--radius)',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s',
                                    backgroundColor: 'rgba(255,255,255,0.02)'
                                }}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <Camera size={20} />
                                <span>Foto hinzufügen</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleExteriorPhotoUpload}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        )}
                    </div>
                )}

                {/* 2. Contacts */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Kontakte</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {formData.contacts.map((contact, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: '8px', position: 'relative' }}>
                                {/* Row 1: Name & Role */}
                                <input
                                    type="text"
                                    placeholder="Name"
                                    className="form-input"
                                    value={contact.name}
                                    onChange={(e) => {
                                        const newContacts = [...formData.contacts];
                                        newContacts[idx].name = e.target.value;
                                        setFormData({ ...formData, contacts: newContacts });
                                    }}
                                    style={{ fontWeight: 600 }}
                                />
                                <select
                                    className="form-input"
                                    value={contact.role || 'Mieter'}
                                    onChange={(e) => {
                                        const newContacts = [...formData.contacts];
                                        newContacts[idx].role = e.target.value;
                                        setFormData({ ...formData, contacts: newContacts });
                                    }}
                                >
                                    <option value="Mieter">Mieter</option>
                                    <option value="Eigentümer">Eigentümer</option>
                                    <option value="Hauswart">Hauswart</option>
                                    <option value="Verwaltung">Verwaltung</option>
                                    <option value="Handwerker">Handwerker</option>
                                    <option value="Sonstiges">Sonstiges</option>
                                </select>

                                {/* Row 2: Apartment & Phone */}
                                <input
                                    type="text"
                                    placeholder="Wohnung / Etage"
                                    className="form-input"
                                    value={contact.apartment}
                                    onChange={(e) => {
                                        const newContacts = [...formData.contacts];
                                        newContacts[idx].apartment = e.target.value;
                                        setFormData({ ...formData, contacts: newContacts });
                                    }}
                                    style={{ fontSize: '0.9rem' }}
                                />
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Telefon"
                                        className="form-input"
                                        value={contact.phone}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[idx].phone = e.target.value;
                                            setFormData({ ...formData, contacts: newContacts });
                                        }}
                                        style={{ flex: 1, fontSize: '0.9rem' }}
                                    />
                                    {contact.phone && (
                                        <a href={`tel:${contact.phone}`} className="btn btn-outline" style={{ padding: '0.4rem', color: 'var(--success)' }} title="Anrufen">
                                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                        </a>
                                    )}
                                </div>

                                {/* Delete Button (Absolute top-right or separate) */}

                            </div>
                        ))}
                    </div>

                    {/* Add Contact Button */}
                    <button
                        type="button"
                        onClick={handleAddContact}
                        style={{
                            marginTop: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: 'var(--primary)',
                            background: 'none',
                            border: 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '0.25rem 0'
                        }}
                    >
                        <Plus size={18} />
                        Kontakt hinzufügen
                    </button>
                    <br />
                </div>

                {/* Pläne & Grundrisse Section - Inserted for Technician View */}
                {(mode === 'desktop' || formData.status !== 'Trocknung') && (
                    <div style={{ marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                            Pläne & Grundrisse
                        </h2>

                        <div className="card" style={{ border: '1px solid var(--border)', padding: '1.5rem' }}>
                            <div
                                style={{
                                    border: '2px dashed var(--border)',
                                    borderRadius: 'var(--radius)',
                                    padding: '2rem 1rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    transition: 'all 0.2s',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)'
                                }}
                                onClick={() => document.getElementById('file-upload-Pläne-tech').click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                    e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                                onDrop={(e) => handleCategoryDrop(e, 'Pläne')}
                            >
                                <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                <span style={{ fontSize: '0.85rem' }}>Plan / Grundriss hochladen (PDF / Bild)</span>

                                <input
                                    id="file-upload-Pläne-tech"
                                    type="file"
                                    multiple
                                    accept="image/*,application/pdf"
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleCategorySelect(e, 'Pläne')}
                                />
                            </div>

                            {/* List of Pläne */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {formData.images.filter(img => img.assignedTo === 'Pläne').map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                        {/* Icon/Preview */}
                                        {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                            <div
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                                onClick={() => {
                                                    if (item.file) {
                                                        const pdfUrl = URL.createObjectURL(item.file);
                                                        window.open(pdfUrl, '_blank');
                                                    } else if (item.preview) {
                                                        window.open(item.preview, '_blank');
                                                    } else {
                                                        alert("PDF Vorschau nicht verfügbar (wurde gespeichert).");
                                                    }
                                                }}
                                            >
                                                <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                                                    <FileText size={24} color="var(--text-main)" />
                                                </div>
                                                <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>
                                                    {item.name}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, cursor: 'pointer' }}
                                                onClick={() => window.open(item.preview, '_blank')}
                                            >
                                                <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                    <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                </div>
                                                <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>
                                            </div>
                                        )}

                                        {/* Delete Action */}
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))}
                                            style={{
                                                color: '#EF4444',
                                                padding: '0.5rem',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'rgba(239, 68, 68, 0.1)'
                                            }}
                                        >
                                            <Trash size={18} />
                                        </button>
                                    </div>
                                ))}
                                {formData.images.filter(img => img.assignedTo === 'Pläne').length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                        Keine Pläne vorhanden.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Rooms & Photos */}
                <div style={{ marginBottom: '2rem' }}>
                    {(
                        <div style={{ marginBottom: '1rem' }}>
                            {mode !== 'technician' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                                        Räume / Fotos
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={handleGeneratePDF}
                                        disabled={isGeneratingPDF}
                                        className="btn btn-outline"
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                                    >
                                        <FileText size={16} />
                                        Schadensbericht
                                    </button>
                                </div>
                            )}

                            {mode === 'technician' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        className={`btn ${showAddRoomForm ? 'btn-ghost' : 'btn-primary'}`}
                                        onClick={() => setShowAddRoomForm(!showAddRoomForm)}
                                        style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', color: showAddRoomForm ? '#EF4444' : undefined, borderColor: showAddRoomForm ? '#EF4444' : undefined }}
                                    >
                                        {showAddRoomForm ? <X size={16} /> : <Plus size={16} />}
                                        {showAddRoomForm ? " Abbrechen" : " Raum hinzufügen"}
                                    </button>

                                    {showAddRoomForm && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <select
                                                    className="form-input"
                                                    value={newRoom.apartment && ![...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].includes(newRoom.apartment) ? 'Sonstiges' : newRoom.apartment}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === 'Sonstiges') {
                                                            setNewRoom(prev => ({ ...prev, apartment: '' }));
                                                        } else {
                                                            setNewRoom(prev => ({ ...prev, apartment: val }));
                                                        }
                                                    }}
                                                    style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                                >
                                                    <option value="">Wohnung wählen... (Pflicht)</option>
                                                    {[...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].map(apt => (
                                                        <option key={apt} value={apt}>{apt}</option>
                                                    ))}
                                                    <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                                </select>

                                                {/* Custom Apartment Input */}
                                                {(!newRoom.apartment || (newRoom.apartment && ![...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].includes(newRoom.apartment))) && (
                                                    <input
                                                        type="text"
                                                        placeholder="Wohnung eingeben"
                                                        value={newRoom.apartment}
                                                        onChange={(e) => setNewRoom(prev => ({ ...prev, apartment: e.target.value }))}
                                                        className="form-input"
                                                        style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                                    />
                                                )}
                                            </div>

                                            <input
                                                type="text"
                                                placeholder="Stockwerk"
                                                value={newRoom.stockwerk}
                                                onChange={(e) => setNewRoom(prev => ({ ...prev, stockwerk: e.target.value }))}
                                                className="form-input"
                                                style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                            />

                                            <select
                                                value={newRoom.name}
                                                onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                                className="form-input"
                                                style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                            >
                                                <option value="">Raum wählen...</option>
                                                {ROOM_OPTIONS.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                                <option value="Sonstiges">Sonstiges / Eigener Name</option>
                                            </select>

                                            {/* Custom Room Input if 'Sonstiges' or not in list */}
                                            {((newRoom.name === 'Sonstiges') || (newRoom.name === 'Sonstiges / Eigener Name') || (newRoom.name && !ROOM_OPTIONS.includes(newRoom.name))) && (
                                                <input
                                                    type="text"
                                                    placeholder="Raum-Name eingeben"
                                                    value={newRoom.name === 'Sonstiges' || newRoom.name === 'Sonstiges / Eigener Name' ? '' : newRoom.name}
                                                    onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                                    className="form-input"
                                                    style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                                    autoFocus
                                                />
                                            )}

                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => {
                                                    handleAddRoom();
                                                    setShowAddRoomForm(false); // Auto-close after add
                                                }}
                                                disabled={!newRoom.name || newRoom.name === 'Sonstiges' || !newRoom.apartment}
                                                style={{ marginTop: '0.5rem' }}
                                            >
                                                <Check size={16} /> Speichern
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {mode === 'technician' && (
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: '2rem', marginBottom: '0.5rem' }}>
                                    Räume / Fotos
                                </h3>
                            )}
                        </div>
                    )}


                    {/* Schadenursache - Cause & Photos (Desktop Only) */}
                    {mode === 'desktop' && (
                        <div className="card" style={{ marginBottom: '2rem', border: '1px solid var(--border)', padding: '1.5rem', backgroundColor: 'var(--surface)' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text-main)' }}>Schadenursache</h3>

                            {/* Cause / Description */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '2rem' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Schadenursache</span>
                                    <textarea
                                        className="form-input"
                                        rows={3}
                                        value={formData.cause || ''}
                                        onChange={e => setFormData({ ...formData, cause: e.target.value })}
                                        placeholder="Beschreibung der Ursache..."
                                    />
                                </label>
                            </div>

                            {/* Photos (Schadenfotos) */}
                            <div>
                                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>Fotos zur Ursache</h4>

                                {/* Upload Zone */}
                                <div
                                    style={{
                                        border: '2px dashed var(--border)',
                                        borderRadius: 'var(--radius)',
                                        padding: '2rem 1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)'
                                    }}
                                    onClick={() => document.getElementById('file-upload-Schadenfotos-desktop').click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    onDrop={(e) => handleCategoryDrop(e, 'Schadenfotos')}
                                >
                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                    <span style={{ fontSize: '0.85rem' }}>Schadenfoto hochladen / Drop</span>
                                    <input id="file-upload-Schadenfotos-desktop" type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={(e) => handleCategorySelect(e, 'Schadenfotos')} />
                                </div>

                                {/* List */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.images.filter(img => img.assignedTo === 'Schadenfotos').map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                            <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                            </div>
                                            <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>
                                            <button type="button" className="btn btn-ghost" onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))} style={{ color: '#EF4444', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}><Trash size={18} /></button>
                                        </div>
                                    ))}
                                    {formData.images.filter(img => img.assignedTo === 'Schadenfotos').length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>Keine Schadenfotos vorhanden.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'desktop' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                            <button
                                type="button"
                                className={`btn ${showAddRoomForm ? 'btn-ghost' : 'btn-primary'}`}
                                onClick={() => setShowAddRoomForm(!showAddRoomForm)}
                                style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', color: showAddRoomForm ? '#EF4444' : undefined, borderColor: showAddRoomForm ? '#EF4444' : undefined }}
                            >
                                {showAddRoomForm ? <X size={16} /> : <Plus size={16} />}
                                {showAddRoomForm ? " Abbrechen" : " Raum hinzufügen"}
                            </button>

                            {showAddRoomForm && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <select
                                            className="form-input"
                                            value={newRoom.apartment && ![...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].includes(newRoom.apartment) ? 'Sonstiges' : newRoom.apartment}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === 'Sonstiges') {
                                                    setNewRoom(prev => ({ ...prev, apartment: '' }));
                                                } else {
                                                    setNewRoom(prev => ({ ...prev, apartment: val }));
                                                }
                                            }}
                                            style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                        >
                                            <option value="">Wohnung wählen... (Pflicht)</option>
                                            {[...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].map(apt => (
                                                <option key={apt} value={apt}>{apt}</option>
                                            ))}
                                            <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                        </select>

                                        {/* Custom Apartment Input */}
                                        {(!newRoom.apartment || (newRoom.apartment && ![...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].includes(newRoom.apartment))) && (
                                            <input
                                                type="text"
                                                placeholder="Wohnung eingeben"
                                                value={newRoom.apartment}
                                                onChange={(e) => setNewRoom(prev => ({ ...prev, apartment: e.target.value }))}
                                                className="form-input"
                                                style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                            />
                                        )}
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Stockwerk"
                                        value={newRoom.stockwerk}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, stockwerk: e.target.value }))}
                                        className="form-input"
                                        style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                    />

                                    <select
                                        value={newRoom.name}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                        className="form-input"
                                        style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                    >
                                        <option value="">Raum wählen...</option>
                                        {ROOM_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                        <option value="Sonstiges">Sonstiges / Eigener Name</option>
                                    </select>

                                    {/* Custom Room Input if 'Sonstiges' or not in list */}
                                    {((newRoom.name === 'Sonstiges') || (newRoom.name === 'Sonstiges / Eigener Name') || (newRoom.name && !ROOM_OPTIONS.includes(newRoom.name))) && (
                                        <input
                                            type="text"
                                            placeholder="Raum-Name eingeben"
                                            value={newRoom.name === 'Sonstiges' || newRoom.name === 'Sonstiges / Eigener Name' ? '' : newRoom.name}
                                            onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                            className="form-input"
                                            style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                            autoFocus
                                        />
                                    )}

                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => {
                                            handleAddRoom();
                                            setShowAddRoomForm(false); // Auto-close after add
                                        }}
                                        disabled={!newRoom.name || newRoom.name === 'Sonstiges' || !newRoom.apartment}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        <Check size={16} /> Speichern
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {(
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {formData.rooms.map(room => (
                                <div key={room.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-main)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0EA5E9' }}>{room.name}</span>
                                            {room.apartment && <span style={{ fontSize: '0.9rem', color: '#94A3B8', fontWeight: 500 }}>{room.apartment}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={!room.measurementData}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (room.measurementData) {
                                                            setActiveRoomForMeasurement(room);
                                                            setIsNewMeasurement(false);
                                                            setIsMeasurementReadOnly(true);
                                                            setShowMeasurementModal(true);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '0.4rem 0.6rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                                        color: 'var(--text-muted)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        fontSize: '0.75rem',
                                                        cursor: room.measurementData ? 'pointer' : 'not-allowed',
                                                        opacity: room.measurementData ? 1 : 0.5
                                                    }}
                                                >
                                                    <FileText size={14} />
                                                    Messung ansehen
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveRoomForMeasurement(room);
                                                        setIsNewMeasurement(true);
                                                        setIsMeasurementReadOnly(false);
                                                        setShowMeasurementModal(true);
                                                    }}
                                                    style={{
                                                        padding: '0.4rem 0.6rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #10B981',
                                                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                        color: '#10B981',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Plus size={14} />
                                                    Messung beginnen
                                                </button>
                                            </>
                                            {mode !== 'technician' && (
                                                <button
                                                    type="button"
                                                    title="Raum löschen"
                                                    onClick={() => {
                                                        if (window.confirm('Raum wirklich löschen?')) handleRemoveRoom(room.id);
                                                    }}
                                                    style={{
                                                        padding: '0.4rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #EF4444',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                        color: '#EF4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Trash size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.75rem' }}>
                                        <>
                                            {(() => {
                                                const roomImages = formData.images.filter(img => img.roomId === room.id);
                                                const shouldCollapse = mode === 'technician' && formData.status === 'Trocknung';
                                                const isVisible = !shouldCollapse || visibleRoomImages[room.id];

                                                return (
                                                    <>
                                                        {shouldCollapse && roomImages.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setVisibleRoomImages(prev => ({ ...prev, [room.id]: !prev[room.id] }))}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '8px',
                                                                    marginBottom: '12px',
                                                                    backgroundColor: '#1E293B',
                                                                    border: '1px solid var(--border)',
                                                                    color: 'white',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '8px',
                                                                    fontWeight: 500,
                                                                    fontSize: '0.9rem'
                                                                }}
                                                            >
                                                                {isVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                {isVisible ? 'Bilder verbergen' : `Bilder anzeigen (${roomImages.length})`}
                                                            </button>
                                                        )}

                                                        {isVisible && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                                                {roomImages.map((img, idx) => (
                                                                    <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'var(--background)' }}>
                                                                        {/* Thumbnail check */}
                                                                        <div style={{ flex: '0 0 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                                            <div style={{ width: '100px', height: '100px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                                                                <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => window.open(img.preview, '_blank')} />
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 2px', alignItems: 'center' }}>
                                                                                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.75rem', cursor: 'pointer', color: '#374151' }}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                                                                                        checked={img.includeInReport !== false}
                                                                                        onChange={(e) => {
                                                                                            const isChecked = e.target.checked;
                                                                                            setFormData(prev => ({
                                                                                                ...prev,
                                                                                                images: prev.images.map(i => i === img ? { ...i, includeInReport: isChecked } : i)
                                                                                            }));
                                                                                        }}
                                                                                    />
                                                                                    <span style={{ fontWeight: 600 }}>Bericht</span>
                                                                                </label>
                                                                                <button
                                                                                    type="button"
                                                                                    title="Bearbeiten"
                                                                                    style={{
                                                                                        border: '1px solid var(--border)',
                                                                                        backgroundColor: '#1E293B',
                                                                                        color: 'white',
                                                                                        cursor: 'pointer',
                                                                                        padding: '8px',
                                                                                        borderRadius: '8px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                                                    }}
                                                                                    onClick={() => setActiveImageMeta(img)}
                                                                                >
                                                                                    <Edit3 size={22} />
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* File Info & Description */}
                                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                                                <textarea
                                                                                    placeholder="Beschreibung..."
                                                                                    className="form-input"
                                                                                    rows={3}
                                                                                    style={{
                                                                                        fontSize: '0.9rem',
                                                                                        padding: '0.5rem',
                                                                                        flex: 1,
                                                                                        width: 'auto',
                                                                                        resize: 'none',
                                                                                        backgroundColor: isRecording === img.preview ? '#450a0a' : '#0F172A',
                                                                                        borderColor: isRecording === img.preview ? '#EF4444' : '#334155',
                                                                                        color: 'white'
                                                                                    }}
                                                                                    value={img.description || ''}
                                                                                    onChange={(e) => {
                                                                                        const newDesc = e.target.value;
                                                                                        setFormData(prev => ({
                                                                                            ...prev,
                                                                                            images: prev.images.map(i => i === img ? { ...i, description: newDesc } : i)
                                                                                        }));
                                                                                    }}
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => isRecording === img.preview ? stopRecording() : startRecording(img.preview)}
                                                                                    title={isRecording === img.preview ? "Aufnahme stoppen" : "Spracheingabe starten"}
                                                                                    style={{
                                                                                        border: isRecording === img.preview ? 'none' : '1px solid var(--border)',
                                                                                        backgroundColor: isRecording === img.preview ? '#EF4444' : '#1E293B',
                                                                                        color: isRecording === img.preview ? 'white' : '#94A3B8',
                                                                                        width: '36px',
                                                                                        height: '36px',
                                                                                        borderRadius: '50%',
                                                                                        cursor: 'pointer',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        transition: 'all 0.2s',
                                                                                        boxShadow: isRecording === img.preview ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                                                                                        flexShrink: 0
                                                                                    }}
                                                                                >
                                                                                    <Mic size={20} className={isRecording === img.preview ? 'animate-pulse' : ''} />
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* Actions: Delete */}
                                                                        <div>
                                                                            {mode !== 'technician' && (
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-ghost"
                                                                                    title="Bild löschen" // Added title for clarity
                                                                                    style={{
                                                                                        color: '#EF4444',
                                                                                        padding: '0',
                                                                                        backgroundColor: '#1E293B',
                                                                                        border: '1px solid var(--border)',
                                                                                        borderRadius: '50%',
                                                                                        width: '36px',
                                                                                        height: '36px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        if (window.confirm('Bild wirklich löschen?')) {
                                                                                            setFormData(prev => ({
                                                                                                ...prev,
                                                                                                images: prev.images.filter(i => i !== img)
                                                                                            }));
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <Trash size={16} />
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                    </div>
                                                                ))}
                                                                {roomImages.length === 0 && (
                                                                    <div style={{ fontSize: '0.85rem', color: '#9CA3AF', fontStyle: 'italic', marginBottom: '0.5rem' }}>Keine Bilder</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}

                                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                {/* Camera Button */}
                                                <label
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        flex: 1,
                                                        padding: '0.75rem',
                                                        backgroundColor: 'var(--primary)',
                                                        color: 'white',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                    }}
                                                    onClick={(e) => {
                                                        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
                                                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                                                            (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));

                                                        if (!isMobile) {
                                                            e.preventDefault();
                                                            setCameraContext({ roomId: room.id, assignedTo: room.name });
                                                            setShowCameraModal(true);
                                                        }
                                                    }}
                                                >
                                                    <Camera size={20} />
                                                    Kamera
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        capture="environment"
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                handleImageUpload(Array.from(e.target.files), { roomId: room.id, assignedTo: room.name });
                                                            }
                                                        }}
                                                        style={{ display: 'none' }}
                                                    />
                                                </label>

                                                {/* Gallery Button */}
                                                <label style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    flex: 1,
                                                    padding: '0.75rem',
                                                    backgroundColor: '#1E293B',
                                                    border: '1px solid var(--border)',
                                                    color: 'white',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                }}>
                                                    <Image size={20} />
                                                    Galerie
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                handleImageUpload(Array.from(e.target.files), { roomId: room.id, assignedTo: room.name });
                                                            }
                                                        }}
                                                        style={{ display: 'none' }}
                                                    />
                                                </label>
                                            </div>
                                        </>
                                    </div>
                                </div>
                            ))}
                            {formData.rooms.length === 0 && (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF', border: '2px dashed #E5E7EB', borderRadius: '8px' }}>
                                    Noch keine Räume angelegt.
                                </div>
                            )}
                        </div>
                    )
                    }
                </div >


                {mode === 'desktop' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginBottom: '3rem' }}>

                        {/* Button for PDF Creation (Desktop Only) - Placed above Arbeitsrapporte */}
                        {/* 1. Arbeitsrapporte (Duplicate for Desktop) */}
                        <div style={{ marginTop: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                                    Arbeitsrapporte
                                </h2>
                            </div>
                            <div className="card" style={{ border: '1px solid var(--border)', padding: '1.5rem' }}>
                                <div
                                    style={{
                                        border: '2px dashed var(--border)',
                                        borderRadius: 'var(--radius)',
                                        padding: '2rem 1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)'
                                    }}
                                    onClick={() => document.getElementById('file-upload-Arbeitsrappporte-desktop').click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    onDrop={(e) => handleCategoryDrop(e, 'Arbeitsrappporte')}
                                >
                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                    <span style={{ fontSize: '0.85rem' }}>Arbeitsrapport hochladen / Drop</span>
                                    <input id="file-upload-Arbeitsrappporte-desktop" type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleCategorySelect(e, 'Arbeitsrappporte')} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.images.filter(img => img.assignedTo === 'Arbeitsrappporte').map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                            {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={() => { if (item.file) { const pdfUrl = URL.createObjectURL(item.file); window.open(pdfUrl, '_blank'); } else if (item.preview) { window.open(item.preview, '_blank'); } else { alert("PDF Vorschau nicht verfügbar."); } }}>
                                                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}><FileText size={24} color="var(--text-main)" /></div>
                                                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>{item.name}</div>
                                                </div>
                                            ) : (
                                                <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                    <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                </div>
                                            )}
                                            {!((item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf'))) && <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>}
                                            <button type="button" className="btn btn-ghost" onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))} style={{ color: '#EF4444', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}><Trash size={18} /></button>
                                        </div>
                                    ))}
                                    {formData.images.filter(img => img.assignedTo === 'Arbeitsrappporte').length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>Keine Arbeitsrapporte vorhanden.</div>}
                                </div>
                            </div>
                        </div>

                        {/* 2. Sonstiges (Duplicate of Reports, mapped to 'Sonstiges') */}
                        <div style={{ marginTop: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                Sonstiges
                            </h2>
                            <div className="card" style={{ border: '1px solid var(--border)', padding: '1.5rem' }}>
                                <div
                                    style={{
                                        border: '2px dashed var(--border)',
                                        borderRadius: 'var(--radius)',
                                        padding: '2rem 1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)'
                                    }}
                                    onClick={() => document.getElementById('file-upload-Sonstiges-desktop').click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    onDrop={(e) => handleCategoryDrop(e, 'Sonstiges')}
                                >
                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                    <span style={{ fontSize: '0.85rem' }}>Sonstiges Dokument hochladen / Drop</span>
                                    <input id="file-upload-Sonstiges-desktop" type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleCategorySelect(e, 'Sonstiges')} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.images.filter(img => img.assignedTo === 'Sonstiges').map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                            {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={() => { if (item.file) { const pdfUrl = URL.createObjectURL(item.file); window.open(pdfUrl, '_blank'); } else if (item.preview) { window.open(item.preview, '_blank'); } }}>
                                                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}><FileText size={24} color="var(--text-main)" /></div>
                                                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>{item.name}</div>
                                                </div>
                                            ) : (
                                                <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                    <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                </div>
                                            )}
                                            {!((item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf'))) && <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>}
                                            <button type="button" className="btn btn-ghost" onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))} style={{ color: '#EF4444', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}><Trash size={18} /></button>
                                        </div>
                                    ))}
                                    {formData.images.filter(img => img.assignedTo === 'Sonstiges').length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>Keine sonstigen Dokumente.</div>}
                                </div>
                            </div>
                        </div>



                        {/* 4. Messprotokolle (Duplicate for Desktop) - Reusing logic by referencing existing or duplicating UI */}
                        <div className="card" style={{ border: '1px solid var(--border)' }}>
                            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', margin: 0 }}>
                                    <FileText size={20} />
                                    Messprotokolle
                                </h3>
                            </div>
                            <div style={{ marginBottom: '2rem' }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>Messen</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.rooms.map(room => {
                                        const hasMeasurement = !!room.measurementData;
                                        const date = hasMeasurement ? (room.measurementData.globalSettings?.date ? new Date(room.measurementData.globalSettings.date).toLocaleDateString('de-CH') : 'Kein Datum') : '-';
                                        return (
                                            <div key={room.id} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '200px', flex: '1 1 auto' }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{room.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{hasMeasurement ? `Letzte Messung: ${date}` : 'Keine Messdaten'}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {hasMeasurement ? (
                                                        <>
                                                            <button type="button" className="btn btn-outline" onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(false); setShowMeasurementModal(true); }}>Ansehen</button>
                                                            <button type="button" className="btn btn-outline" onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(true); setShowMeasurementModal(true); }}>Neu</button>
                                                        </>
                                                    ) : (
                                                        <button type="button" className="btn btn-outline" onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(false); setShowMeasurementModal(true); }}>Messung starten</button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={async () => {
                                        try {
                                            await generateMeasurementExcel(formData);
                                        } catch (error) {
                                            console.error("Excel Export failed:", error);
                                            alert("Fehler beim Erstellen des Excel-Protokolls.");
                                        }
                                    }}
                                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', gap: '0.4rem', borderColor: '#10B981', color: '#10B981', display: 'flex', alignItems: 'center' }}
                                    title="Excel Export aller Messräume (Download)"
                                >
                                    <Table size={16} />
                                    Excel Export
                                </button>
                            </div>

                            {/* Measurement Excel List */}

                        </div>

                    </div>
                )
                }
                {/* 4. Drying Equipment (Only in Trocknung, hidden in Schadenaufnahme/Leckortung) */}
                {
                    (mode === 'desktop' || formData.status === 'Trocknung') && (
                        <div style={{ marginBottom: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', ...(mode === 'desktop' ? { display: 'flex', flexDirection: 'column' } : {}) }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'white' }}>Trocknungsgeräte</h3>





                            {/* Add Device Form */}
                            <div style={{ backgroundColor: '#1E293B', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border)', ...(mode === 'desktop' ? { order: 3, marginTop: '2rem' } : {}) }}>
                                <button
                                    type="button"
                                    className={`btn ${showAddDeviceForm ? 'btn-ghost' : 'btn-primary'}`}
                                    onClick={() => setShowAddDeviceForm(!showAddDeviceForm)}
                                    style={{ width: '100%', marginBottom: showAddDeviceForm ? '1rem' : '0', color: showAddDeviceForm ? '#EF4444' : 'white', borderColor: showAddDeviceForm ? '#EF4444' : 'transparent' }}
                                >
                                    {showAddDeviceForm ? <X size={16} /> : <Plus size={16} />}
                                    {showAddDeviceForm ? " Abbrechen" : " Gerät hinzufügen"}
                                </button>

                                {showAddDeviceForm && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            {/* Inventory Selection (Matches Technician Mode) */}
                                            {deviceFetchError ? (
                                                <div style={{ color: '#EF4444', fontSize: '0.9rem', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #EF4444', borderRadius: '4px' }}>
                                                    Ladefehler: {deviceFetchError}
                                                </div>
                                            ) : (
                                                <select
                                                    className="form-input"
                                                    value={selectedDevice ? selectedDevice.id : ''}
                                                    onChange={(e) => {
                                                        const devId = e.target.value;
                                                        if (!devId) {
                                                            setSelectedDevice(null);
                                                            setNewDevice(prev => ({ ...prev, deviceNumber: '' }));
                                                        } else {
                                                            const dev = availableDevices.find(d => d.id.toString() === devId);
                                                            if (dev) {
                                                                setSelectedDevice(dev);
                                                                setNewDevice(prev => ({ ...prev, deviceNumber: dev.number }));
                                                            }
                                                        }
                                                    }}
                                                    style={{ marginBottom: '0.5rem' }} // Removed explicit colors to rely on class
                                                >
                                                    <option value="">-- Gerät aus Lager wählen --</option>
                                                    {Array.isArray(availableDevices) && availableDevices.length > 0 ? (
                                                        availableDevices.map(device => (
                                                            <option key={device.id} value={device.id}>
                                                                #{device.number} - {device.type} {device.model ? `(${device.model})` : ''}
                                                            </option>
                                                        ))
                                                    ) : (
                                                        <option disabled>Keine verfügbaren Geräte gefunden</option>
                                                    )}
                                                </select>
                                            )}

                                            <input
                                                type="text"
                                                placeholder="Geräte-Nr. (oder oben wählen)"
                                                className="form-input"
                                                value={newDevice.deviceNumber}
                                                onChange={(e) => {
                                                    setNewDevice(prev => ({ ...prev, deviceNumber: e.target.value }));
                                                    setSelectedDevice(null); // Clear selection on manual edit
                                                }}
                                            />

                                            {/* Apartment Selection (Required) */}
                                            <select
                                                className="form-input"
                                                value={newDevice.apartment || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'Sonstiges') {
                                                        setNewDevice(prev => ({ ...prev, apartment: '' })); // Or handle as custom input
                                                    } else {
                                                        setNewDevice(prev => ({ ...prev, apartment: val }));
                                                    }
                                                }}
                                                style={{ borderColor: !newDevice.apartment ? '#F87171' : '' }}
                                            >
                                                <option value="">Wohnung wählen... (Pflicht)</option>
                                                {[...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].map(apt => (
                                                    <option key={apt} value={apt}>{apt}</option>
                                                ))}
                                                <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                            </select>

                                            {/* Custom Apartment Input if 'Sonstiges' or not in list (implicit logic: if value not in list and not empty, it's custom. But simplified: if user picks Sonstiges, we clear and show input below? Or render input if value not in list? Let's keep it simple: Select or Input logic similar to Room) */}
                                            {/* Actually, user might want to just type it if it's new. Use a datalist or similar? React doesn't do datalist easily with state. 
                                                Let's stick to the pattern used for Rooms: Select + Conditional Input if "Sonstiges" or custom.
                                                However, here we want to SUGGEST from existing rooms.
                                            */}
                                            {((newDevice.apartment && ![...new Set(formData.rooms.map(r => r.apartment).filter(Boolean))].includes(newDevice.apartment)) || !formData.rooms.some(r => r.apartment)) && (
                                                <input
                                                    type="text"
                                                    placeholder="Wohnung eingeben (Pflicht)"
                                                    className="form-input"
                                                    value={newDevice.apartment || ''}
                                                    onChange={(e) => setNewDevice(prev => ({ ...prev, apartment: e.target.value }))}
                                                    style={{ marginTop: '0.25rem' }}
                                                />
                                            )}

                                        </div>
                                        <div style={{ marginBottom: '0.5rem' }}>
                                            {/* Room Selection from Existing Rooms + Standard Options */}
                                            {/* Room Selection from Existing Rooms + Standard Options */}
                                            <select
                                                className="form-input"
                                                value={newDevice.isManualRoom ? 'Sonstiges' : newDevice.room}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'Sonstiges') {
                                                        setNewDevice(prev => ({ ...prev, isManualRoom: true, room: '' }));
                                                    } else {
                                                        // Attempt to find matching apartment if room is from project
                                                        const linkedRoom = formData.rooms.find(r => r.name === val);
                                                        if (linkedRoom && linkedRoom.apartment) {
                                                            setNewDevice(prev => ({
                                                                ...prev,
                                                                isManualRoom: false,
                                                                room: val,
                                                                apartment: linkedRoom.apartment,
                                                                isManualApartment: false
                                                            }));
                                                        } else {
                                                            setNewDevice(prev => ({ ...prev, isManualRoom: false, room: val }));
                                                        }
                                                    }
                                                }}
                                            >
                                                <option value="">Raum wählen...</option>
                                                <optgroup label="Projekträume">
                                                    {[...new Set(formData.rooms.map(r => r.name))].map(rName => (
                                                        <option key={rName} value={rName}>{rName}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Standard">
                                                    {ROOM_OPTIONS.filter(opt => !formData.rooms.some(r => r.name === opt)).map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </optgroup>
                                                <option value="Sonstiges">Manuelle Eingabe</option>
                                            </select>

                                            {/* Custom Room Input if 'Sonstiges' */}
                                            {newDevice.isManualRoom && (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ marginTop: '0.5rem' }}
                                                    placeholder="Raum eingeben..."
                                                    value={newDevice.room}
                                                    onChange={(e) => setNewDevice(prev => ({ ...prev, room: e.target.value }))}
                                                    autoFocus
                                                />
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={newDevice.startDate}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, startDate: e.target.value }))}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Zählerstand Start *"
                                                className="form-input"
                                                value={newDevice.counterStart}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, counterStart: e.target.value }))}
                                                style={{ borderColor: !newDevice.counterStart && newDevice.deviceNumber ? '#F87171' : '' }} // Subtle hint if other fields are filled
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{ width: '100%', marginTop: '0.5rem' }}
                                            disabled={!newDevice.deviceNumber || !newDevice.room || !newDevice.apartment || newDevice.counterStart === ''}
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                const success = await handleAddDevice();
                                                if (success) {
                                                    // Do NOT close the form, allowing next entry
                                                    // setShowAddDeviceForm(false); 

                                                    // Optional: Clear specific fields to ready for next device
                                                    setNewDevice(prev => ({
                                                        ...prev,
                                                        deviceNumber: '',
                                                        counterStart: ''
                                                        // Keep Room/Apartment/Date for easier batch entry
                                                    }));

                                                    // Show a small toast or visual feedback? 
                                                    // For now, the user sees the new device appear in the list below.
                                                }
                                            }}
                                        >
                                            <Save size={16} /> Speichern
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Energy Report Button (Inserted between form and list) */}
                            {mode === 'desktop' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', position: 'relative', zIndex: 10, ...(mode === 'desktop' ? { order: 2 } : {}) }}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            try {
                                                generateEnergyReport();
                                            } catch (err) {
                                                alert("Fehler: " + err.message);
                                            }
                                        }}
                                        style={{
                                            backgroundColor: 'transparent',
                                            border: '1px solid #10B981',
                                            color: '#10B981',
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                        title="Energieprotokoll erstellen"
                                    >
                                        <FileText size={18} />
                                        <span>Energieprotokoll (PDF)</span>
                                    </button>

                                    {/* Moved PDF Button HERE */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            // console.log("Setting showReportModal to true"); // Debug log only
                                            setShowReportModal(true);
                                        }}
                                        style={{
                                            backgroundColor: 'transparent',
                                            border: '1px solid #EF4444',
                                            color: '#EF4444',
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginLeft: '1rem' // Space between buttons
                                        }}
                                        title="Schadensbericht erstellen (PDF)"
                                    >
                                        <FileText size={16} />
                                        PDF Erstellen
                                    </button>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', ...(mode === 'desktop' ? { order: 1 } : {}) }}>
                                {formData.equipment
                                    .map((d, i) => ({ ...d, _originalIndex: i }))
                                    .sort((a, b) => {
                                        const aDone = !!a.endDate;
                                        const bDone = !!b.endDate;
                                        if (aDone === bDone) return 0;
                                        return aDone ? 1 : -1;
                                    })
                                    .map((device) => {
                                        const idx = device._originalIndex;
                                        return (
                                            <div key={idx} style={{ backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)', minWidth: '40px' }}>#{device.deviceNumber}</span>
                                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                                            {device.room}
                                                            {device.apartment && <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 400, marginLeft: '4px' }}>({device.apartment})</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ minWidth: '40px' }}></div> {/* Spacer for balance */}
                                                </div>

                                                <div style={{ fontSize: '0.9rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <span>Start: {device.startDate}</span>
                                                    <span>Start-Zähler: {device.counterStart} kWh</span>
                                                </div>

                                                {/* Logic for Unsubscribe */}
                                                {(() => {
                                                    const isUnsubscribing = !!unsubscribeStates[idx];
                                                    const isAbgemeldet = !!device.endDate;
                                                    const draft = unsubscribeStates[idx] || {};

                                                    if (isAbgemeldet) {
                                                        // ALREADY DONE STATE
                                                        return (
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                                    <div style={{ gridColumn: 'span 3' }}>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Abmelde-Datum</label>
                                                                        <input
                                                                            type="date"
                                                                            className="form-input"
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem', width: '100%' }}
                                                                            value={device.endDate}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[idx].endDate = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Zähler Ende</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem' }}
                                                                            value={device.counterEnd || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[idx].counterEnd = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Laufzeit/Std.</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem' }}
                                                                            value={device.hours || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[idx].hours = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    style={{
                                                                        flex: 1, fontSize: '0.9rem', padding: '0.5rem', fontWeight: 600,
                                                                        color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                                        border: '1px solid #10B981', borderRadius: '4px',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', textTransform: 'uppercase'
                                                                    }}
                                                                    onClick={() => {
                                                                        if (window.confirm("Abmeldung rückgängig machen?")) {
                                                                            const newEquipment = [...formData.equipment];
                                                                            newEquipment[idx].endDate = '';
                                                                            newEquipment[idx].counterEnd = '';
                                                                            newEquipment[idx].hours = '';
                                                                            setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                        }
                                                                    }}
                                                                >
                                                                    <Check size={16} /> Abgemeldet
                                                                </button>
                                                            </div>
                                                        );
                                                    } else if (isUnsubscribing) {
                                                        // EDITING STATE (Unsubscribing process)
                                                        return (
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                                    <div style={{ gridColumn: 'span 3' }}>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Abmelde-Datum</label>
                                                                        <input
                                                                            type="date"
                                                                            className="form-input"
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem', width: '100%' }}
                                                                            value={draft.endDate || ''}
                                                                            onChange={(e) => setUnsubscribeStates(prev => ({ ...prev, [idx]: { ...prev[idx], endDate: e.target.value } }))}
                                                                        />
                                                                    </div>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Zähler Ende</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            placeholder="Endstand"
                                                                            autoFocus
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem' }}
                                                                            value={draft.counterEnd || ''}
                                                                            onChange={(e) => setUnsubscribeStates(prev => ({ ...prev, [idx]: { ...prev[idx], counterEnd: e.target.value } }))}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Laufzeit/Std.</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            placeholder="Std."
                                                                            style={{ fontSize: '0.9rem', padding: '0.4rem' }}
                                                                            value={draft.hours || ''}
                                                                            onChange={(e) => setUnsubscribeStates(prev => ({ ...prev, [idx]: { ...prev[idx], hours: e.target.value } }))}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost"
                                                                        style={{ flex: 1, color: '#94A3B8', border: '1px solid var(--border)' }}
                                                                        onClick={() => {
                                                                            // Cancel
                                                                            const newStates = { ...unsubscribeStates };
                                                                            delete newStates[idx];
                                                                            setUnsubscribeStates(newStates);
                                                                        }}
                                                                    >
                                                                        Abbrechen
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-primary"
                                                                        style={{ flex: 1 }}
                                                                        onClick={() => {
                                                                            // Commit
                                                                            const newEquipment = [...formData.equipment];
                                                                            newEquipment[idx].endDate = draft.endDate;
                                                                            newEquipment[idx].counterEnd = draft.counterEnd;
                                                                            newEquipment[idx].hours = draft.hours;
                                                                            setFormData(prev => ({ ...prev, equipment: newEquipment }));

                                                                            // Clear state
                                                                            const newStates = { ...unsubscribeStates };
                                                                            delete newStates[idx];
                                                                            setUnsubscribeStates(newStates);
                                                                        }}
                                                                    >
                                                                        Speichern
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        // IDLE STATE (Active)
                                                        return (
                                                            <div style={{ marginTop: '0.5rem' }}>
                                                                <button
                                                                    type="button"
                                                                    style={{
                                                                        width: '100%', fontSize: '0.9rem', padding: '0.5rem', fontWeight: 600,
                                                                        color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                                                        border: '1px solid #F59E0B', borderRadius: '4px',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', textTransform: 'uppercase'
                                                                    }}
                                                                    onClick={() => {
                                                                        // Start Unsubscribing
                                                                        setUnsubscribeStates(prev => ({
                                                                            ...prev,
                                                                            [idx]: {
                                                                                endDate: new Date().toISOString().split('T')[0],
                                                                                counterEnd: '',
                                                                                hours: ''
                                                                            }
                                                                        }));
                                                                    }}
                                                                >
                                                                    Abmelden
                                                                </button>
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                            </div>
                                        );
                                    })}
                                {formData.equipment.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.9rem' }}>Keine Geräte installiert.</div>
                                )}
                            </div>


                        </div>
                    )
                }

                {/* Spacer to prevent overlap */}
                {/* Spacer to prevent overlap */}
                <div style={{ height: '80px', ...(mode === 'desktop' ? { order: 3 } : {}) }} />

                {/* Mobile / Technician Fixed Footer - AutoSave Version */}
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    maxWidth: '600px',
                    padding: '0.75rem',
                    backgroundColor: '#0F172A',
                    borderTop: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    zIndex: 100,
                    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.5)'
                }}>
                    {/* Status Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: isSaving ? '#fbbf24' : '#10B981', transition: 'color 0.3s' }}>
                        {isSaving ? (
                            <>
                                <RotateCcw size={14} className="spin" /> Speichert...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={14} /> Gespeichert
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onCancel}
                        style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <CheckCircle size={16} />
                        Fertig
                    </button>
                </div>
                {
                    editingImage && (
                        <ImageEditor
                            image={editingImage}
                            onSave={(newPreview) => {
                                setFormData(prev => ({
                                    ...prev,
                                    images: prev.images.map(img => img === editingImage ? { ...img, preview: newPreview } : img)
                                }));
                                setEditingImage(null);
                            }}
                            onCancel={() => setEditingImage(null)}
                        />
                    )
                }

                {/* New Image Metadata Modal */}
                {
                    activeImageMeta && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <div style={{
                                backgroundColor: '#1E293B',
                                padding: '1rem',
                                borderRadius: '16px',
                                width: '95%',
                                maxWidth: '600px',
                                maxHeight: '90vh',
                                overflowY: 'auto',
                                color: 'white',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {/* Left Column: Fields */}
                                    <div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Zuständig</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                style={{ backgroundColor: '#0F172A', borderColor: '#334155', color: 'white', width: '100%' }}
                                                value={activeImageMeta.technician || formData.assignedTo || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setActiveImageMeta(prev => ({ ...prev, technician: val }));
                                                }}
                                                placeholder="Name des Techniker"
                                            />
                                        </div>



                                        <div style={{ marginTop: '2rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={activeImageMeta.includeInReport !== false}
                                                    onChange={(e) => setActiveImageMeta(prev => ({ ...prev, includeInReport: e.target.checked }))}
                                                    style={{ width: '1.25rem', height: '1.25rem', accentColor: '#0EA5E9' }}
                                                />
                                                <span style={{ fontSize: '1rem', fontWeight: 500 }}>Bericht</span>
                                            </label>
                                        </div>

                                        <div style={{ marginTop: '2rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Save activeImageMeta to formData first
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        images: prev.images.map(img => img.preview === activeImageMeta.preview ? activeImageMeta : img)
                                                    }));
                                                    setEditingImage(activeImageMeta);
                                                    setActiveImageMeta(null);
                                                }}
                                                style={{ color: '#0EA5E9', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}
                                            >
                                                <Edit3 size={20} />
                                                Bild bearbeiten (Zeichnen)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right Column: Description & Preview */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Beschreibung</span>
                                                <button
                                                    type="button"
                                                    onClick={isRecording === 'modal' ? stopRecording : () => startRecording('modal')}
                                                    className={`btn ${isRecording === 'modal' ? 'btn-danger' : 'btn-outline'}`}
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        fontSize: '0.8rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        borderColor: isRecording ? '#EF4444' : '#475569',
                                                        color: isRecording ? 'white' : '#94A3B8',
                                                        backgroundColor: isRecording ? '#EF4444' : 'transparent',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Mic size={14} className={isRecording === 'modal' ? 'animate-pulse' : ''} />
                                                    {isRecording === 'modal' ? 'Aufnahme stoppen...' : 'Spracheingabe (KI)'}
                                                </button>
                                            </div>
                                            <textarea
                                                placeholder="Beschreibung hinzufügen..."
                                                style={{
                                                    flex: 1,
                                                    backgroundColor: '#0F172A',
                                                    borderColor: isRecording ? '#EF4444' : '#334155',
                                                    color: 'white',
                                                    padding: '1rem',
                                                    borderRadius: '8px',
                                                    resize: 'none',
                                                    minHeight: '150px',
                                                    transition: 'border-color 0.3s'
                                                }}
                                                value={activeImageMeta.description || ''}
                                                onChange={(e) => setActiveImageMeta(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>

                                        <div style={{ height: '200px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <img src={activeImageMeta.preview} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => setActiveImageMeta(null)}
                                        style={{ color: '#94A3B8' }}
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                images: prev.images.map(img => img.preview === activeImageMeta.preview ? activeImageMeta : img)
                                            }));
                                            setActiveImageMeta(null);
                                        }}
                                        style={{ padding: '0.75rem 2rem' }}
                                    >
                                        <Save size={18} />
                                        Speichern
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
                {
                    showCameraModal && (
                        <CameraCaptureModal
                            onClose={() => setShowCameraModal(false)}
                            onCapture={(file) => {
                                if (cameraContext) {
                                    handleImageUpload([file], cameraContext);
                                }
                                setShowCameraModal(false);
                                setCameraContext(null);
                            }}
                        />
                    )
                }

                <MeasurementModal
                    isOpen={showMeasurementModal}
                    onClose={() => {
                        setShowMeasurementModal(false);
                        setActiveRoomForMeasurement(null);
                        setIsNewMeasurement(false);
                        setIsMeasurementReadOnly(false);
                    }}
                    readOnly={isMeasurementReadOnly}
                    measurementHistory={activeRoomForMeasurement?.measurementHistory || []}
                    rooms={activeRoomForMeasurement ? [activeRoomForMeasurement] : []}
                    projectTitle={formData.projectTitle}
                    initialData={formData.rooms.reduce((acc, r) => {
                        let mData = r.measurementData;
                        // If this is the active room AND we are starting a NEW measurement based on old one
                        if (activeRoomForMeasurement && r.id === activeRoomForMeasurement.id && isNewMeasurement && mData) {
                            mData = {
                                canvasImage: mData.canvasImage, // Keep Sketch
                                globalSettings: {
                                    ...mData.globalSettings,
                                    date: new Date().toISOString().split('T')[0], // Reset Date to Today
                                    temp: '',
                                    humidity: ''
                                },
                                measurements: mData.measurements.map(m => ({
                                    id: m.id,
                                    pointName: m.pointName,
                                    w_value: '', // Clear values
                                    b_value: '',
                                    notes: ''
                                }))
                            };
                        }
                        return { ...acc, [r.id]: mData };
                    }, {})}
                    onSave={async (data) => {
                        const { file, measurements, globalSettings, canvasImage } = data;

                        const uploadPromises = [];

                        // 1. Always upload the file to 'Messprotokolle' category, NOT the room's image list
                        uploadPromises.push(handleImageUpload([file], {
                            assignedTo: 'Messprotokolle',
                            category: 'report'
                        }));

                        // 2. Update room data (Latest & History)
                        if (activeRoomForMeasurement) {
                            setFormData(prev => ({
                                ...prev,
                                rooms: prev.rooms.map(r => {
                                    if (r.id === activeRoomForMeasurement.id) {
                                        // History Entry
                                        const newHistoryEntry = {
                                            id: `hist_${Date.now()}`,
                                            date: globalSettings.date || new Date().toISOString(),
                                            measurements: measurements.map(m => ({ ...m })), // Deep clone
                                            globalSettings: { ...globalSettings },
                                            canvasImage: canvasImage
                                        };
                                        const history = r.measurementHistory ? [...r.measurementHistory] : [];

                                        return {
                                            ...r,
                                            measurementData: { measurements, globalSettings, canvasImage },
                                            measurementHistory: [...history, newHistoryEntry]
                                        };
                                    }
                                    return r;
                                })
                            }));
                        }

                        // 3. ADDITIONAL COPY: Saving to "Sonstiges" if PDF (legacy/requested behavior?)
                        // keeping for safety if it was intentional, but 'Messprotokolle' should suffice.
                        // If user thinks it's wrong to be in images, maybe they don't want it in 'Sonstiges' either?
                        // I will limit it to just Messprotokolle as that seems safest based on "that is wrong".

                        await Promise.all(uploadPromises);
                    }}
                />
                {
                    showEmailImport && (
                        <EmailImportModal
                            onClose={() => {
                                setShowEmailImport(false);
                                setOpenSettingsDirectly(false);
                            }}
                            onImport={handleEmailImport}
                            audioDevices={audioDevices}
                            selectedDeviceId={selectedDeviceId}
                            onSelectDeviceId={setSelectedDeviceId}
                            initialShowSettings={openSettingsDirectly}
                        />
                    )
                }
            </div >
        )
    }

    // Calculate drying summary
    const finishedDrying = formData.equipment.filter(d => d.endDate && d.counterEnd);
    const totalDryingHours = finishedDrying.reduce((acc, curr) => acc + (parseFloat(curr.hours) || 0), 0);
    const totalDryingKwh = finishedDrying.reduce((acc, curr) => acc + ((parseFloat(curr.counterEnd) || 0) - (parseFloat(curr.counterStart) || 0)), 0);

    return (
        <>
            <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                            {formData.projectTitle || 'Projekt'}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Status:</span>
                            <select
                                id="status-header"
                                name="status"
                                className={`status-badge ${statusColors[formData.status] || 'bg-gray-100'}`}
                                value={formData.status}
                                onChange={handleInputChange}
                                style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    padding: '0.25rem 2rem 0.25rem 1rem',
                                    appearance: 'auto',
                                    maxWidth: '200px'
                                }}
                            >
                                {STEPS.map(step => (
                                    <option key={step} value={step} style={{ backgroundColor: 'var(--surface)', color: 'var(--text-main)' }}>{step}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {mode === 'desktop' && (
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => {
                                    setOpenSettingsDirectly(true);
                                    setShowEmailImport(true);
                                }}
                                title="Einstellungen (Mikrofon & API)"
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', borderColor: '#94A3B8' }}
                            >
                                <Settings size={20} />
                            </button>
                        )}
                        {mode === 'desktop' && (
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setShowEmailImport(true)}
                                title="Daten aus Email importieren"
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.75rem' }}
                            >
                                <Mail size={18} />
                                <span style={{ fontSize: '0.9rem' }}>Email Import</span>
                            </button>
                        )}
                        {formData.status === 'Leckortung' && (
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleGeneratePDF}
                                disabled={isGeneratingPDF}
                                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                            >
                                <FileText size={18} />
                                {isGeneratingPDF ? 'Erstelle...' : 'Bericht (PDF) & Speichern'}
                            </button>
                        )}

                        <button className="btn btn-outline" onClick={onCancel} style={{ padding: '0.5rem' }}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                        {/* Auftraggeber */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="client">Auftraggeber</label>
                            <input
                                type="text"
                                id="client"
                                name="client"
                                className="form-input"
                                placeholder="Name des Auftraggebers"
                                value={formData.client}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        {/* Zuständig */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="assignedTo">Bewirtschafter/in</label>
                            <input
                                type="text"
                                id="assignedTo"
                                name="assignedTo"
                                className="form-input"
                                placeholder="Name des Technikers / Zuständigen"
                                value={formData.assignedTo}
                                onChange={handleInputChange}
                            />
                        </div>

                        {/* Kunde von */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="clientSource">Kunde von</label>
                            <select
                                id="clientSource"
                                name="clientSource"
                                className="form-input"
                                value={formData.clientSource}
                                onChange={handleInputChange}
                            >
                                <option value="">Bitte wählen...</option>
                                <option value="Xhemil Ademi">Xhemil Ademi</option>
                                <option value="Adi Shala">Adi Shala</option>
                                <option value="Andreas Strehler">Andreas Strehler</option>
                            </select>
                        </div>

                        {/* Art der Liegenschaft */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="propertyType">Art der Liegenschaft</label>
                            <select
                                id="propertyType"
                                name="propertyType"
                                className="form-input"
                                value={formData.propertyType}
                                onChange={handleInputChange}
                            >
                                <option value="">Bitte wählen...</option>
                                <optgroup label="Wohnimmobilien">
                                    <option value="Einfamilienhaus">Einfamilienhaus</option>
                                    <option value="Mehrfamilienhaus">Mehrfamilienhaus</option>
                                    <option value="Doppelhaushälfte">Doppelhaushälfte</option>
                                    <option value="Reihenhaus">Reihenhaus</option>
                                    <option value="Eigentumswohnung">Eigentumswohnung</option>
                                    <option value="Mietwohnung">Mietwohnung</option>
                                    <option value="Ferienhaus">Ferienhaus</option>
                                </optgroup>
                                <optgroup label="Gewerbeimmobilien">
                                    <option value="Büro / Praxis">Büro / Praxis</option>
                                    <option value="Einzelhandel">Einzelhandel</option>
                                    <option value="Hotel / Gastronomie">Hotel / Gastronomie</option>
                                    <option value="Industrie / Lagerhalle">Industrie / Lagerhalle</option>
                                </optgroup>
                                <optgroup label="Sonstige">
                                    <option value="Öffentliches Gebäude">Öffentliches Gebäude</option>
                                    <option value="Sonstiges">Sonstiges</option>
                                </optgroup>
                            </select>
                        </div>

                        {/* Schaden (Kategorie) */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="damageCategory">Schaden</label>
                            <select
                                id="damageCategory"
                                name="damageCategory"
                                className="form-input"
                                value={formData.damageCategory}
                                onChange={handleInputChange}
                            >
                                <option value="Wasserschaden">Wasserschaden</option>
                                <option value="Schimmel">Schimmel</option>
                            </select>
                        </div>
                    </div>

                    {/* Schadenort & Adresse */}
                    <div className="form-group">
                        <label className="form-label">Schadenort</label>
                        <input
                            type="text"
                            name="locationDetails"
                            className="form-input"
                            placeholder="z.B. Wohnung Meier, 2. OG links"
                            value={formData.locationDetails}
                            onChange={handleInputChange}
                        />

                        <label className="form-label">Adresse</label>

                        {/* Straße & Hausnummer */}
                        <div style={{ marginBottom: '0.5rem' }}>
                            <input
                                type="text"
                                name="street"
                                className="form-input"
                                placeholder="Straße & Hausnummer"
                                value={formData.street}
                                onChange={(e) => {
                                    setFormData(prev => ({ ...prev, street: e.target.value }));
                                }}
                                required
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {/* PLZ */}
                            <div style={{ flex: '0 0 100px' }}>
                                <input
                                    type="text"
                                    name="zip"
                                    list="plz-list"
                                    className="form-input"
                                    placeholder="PLZ"
                                    value={formData.zip}
                                    onChange={(e) => {
                                        const val = e.target.value;

                                        // Auto-fill City if PLZ known
                                        const match = swissPLZ.find(entry => entry.plz === val.trim());
                                        if (match) {
                                            setFormData(prev => ({ ...prev, zip: val, city: match.city }));
                                        } else {
                                            setFormData(prev => ({ ...prev, zip: val }));
                                        }
                                    }}
                                    required
                                />
                                <datalist id="plz-list">
                                    {swissPLZ.map((entry, idx) => (
                                        <option key={idx} value={entry.plz}>{entry.city}</option>
                                    ))}
                                </datalist>
                            </div>

                            {/* Ort */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    type="text"
                                    name="city"
                                    list="city-list"
                                    className="form-input"
                                    placeholder="Ort"
                                    value={formData.city}
                                    onChange={(e) => {
                                        const val = e.target.value;

                                        // Try to find a match for the city
                                        // We find ALL matches to check if current ZIP is valid
                                        const matches = swissPLZ.filter(entry => entry.city.toLowerCase() === val.trim().toLowerCase());

                                        if (matches.length > 0) {
                                            // Check if current zip is among the matches
                                            const currentZipIsValid = matches.some(m => m.plz === formData.zip);

                                            // If current zip is not valid for this city, take the first one
                                            if (!currentZipIsValid) {
                                                setFormData(prev => ({ ...prev, city: val, zip: matches[0].plz }));
                                            } else {
                                                setFormData(prev => ({ ...prev, city: val }));
                                            }
                                        } else {
                                            setFormData(prev => ({ ...prev, city: val }));
                                        }
                                    }}
                                    required
                                />
                                <datalist id="city-list">
                                    {Array.from(new Set(swissPLZ.map(e => e.city))).sort().map(city => (
                                        <option key={city} value={city} />
                                    ))}
                                </datalist>
                            </div>


                        </div>
                    </div>

                    {/* Map Integration & Exterior Photo */}
                    {(formData.street || formData.city || formData.zip) && (
                        <div className="form-group" style={{ marginTop: '0rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                {/* Map Container */}
                                <div style={{
                                    flex: formData.exteriorPhoto ? '0 0 50%' : '1', // 50% if photo exists, else full width
                                    height: '300px',
                                    borderRadius: 'var(--radius)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                    position: 'relative',
                                    transition: 'flex 0.3s ease'
                                }}>
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        frameBorder="0"
                                        scrolling="no"
                                        marginHeight="0"
                                        marginWidth="0"
                                        src={`https://maps.google.com/maps?q=${encodeURIComponent(`${formData.street}, ${formData.zip} ${formData.city}`)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                        title="Standort"
                                    ></iframe>

                                    {/* Button to Add Photo (Overlay on Map if no photo yet?) - Or just below? 
                                        Actually user said: "als option ein foto... hinzufügen"
                                        Let's put a small button overlay on the map or next to it if clear.
                                        Better: A button in the header of this section or absolute in the corner?
                                        Let's put it as a button NEXT to the map if full width, or part of the layout.
                                     */}
                                    {!formData.exteriorPhoto && (
                                        <label
                                            style={{
                                                position: 'absolute',
                                                bottom: '10px',
                                                right: '10px',
                                                backgroundColor: 'var(--surface)',
                                                border: '1px solid var(--border)',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                zIndex: 10
                                            }}
                                            title="Gebäude-Aussenfoto hinzufügen"
                                        >
                                            <Camera size={16} />
                                            + Aussenfoto
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleExteriorPhotoUpload}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    )}
                                </div>

                                {/* Exterior Photo Container */}
                                {formData.exteriorPhoto && (
                                    <div style={{
                                        flex: '1',
                                        height: '300px',
                                        borderRadius: 'var(--radius)',
                                        overflow: 'hidden',
                                        border: '1px solid var(--border)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        position: 'relative',
                                        backgroundColor: '#000'
                                    }}>
                                        <img
                                            src={formData.exteriorPhoto}
                                            alt="Gebäude Aussenansicht"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={removeExteriorPhoto}
                                            style={{
                                                position: 'absolute',
                                                top: '10px',
                                                right: '10px',
                                                backgroundColor: 'rgba(0,0,0,0.5)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}
                                            title="Foto entfernen"
                                        >
                                            <X size={18} />
                                        </button>
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '0',
                                            left: '0',
                                            right: '0',
                                            backgroundColor: 'rgba(0,0,0,0.6)',
                                            color: 'white',
                                            padding: '4px 8px',
                                            fontSize: '0.75rem',
                                            textAlign: 'center'
                                        }}>
                                            Gebäude Aussenansicht
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Kontakte */}
                    <div className="form-group">
                        <label className="form-label">Kontakte (Name / Wohnung / Tel.Nr)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {formData.contacts && formData.contacts.map((contact, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Name"
                                        value={contact.name || ''}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[index] = { ...newContacts[index], name: e.target.value };
                                            setFormData(prev => ({ ...prev, contacts: newContacts }));
                                        }}
                                    />
                                    <select
                                        className="form-input"
                                        value={contact.role || 'Mieter'}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[index] = { ...newContacts[index], role: e.target.value };
                                            setFormData(prev => ({ ...prev, contacts: newContacts }));
                                        }}
                                    >
                                        <option value="Mieter">Mieter</option>
                                        <option value="Eigentümer">Eigentümer</option>
                                        <option value="Hauswart">Hauswart</option>
                                        <option value="Verwaltung">Verwaltung</option>
                                        <option value="Handwerker">Handwerker</option>
                                        <option value="Sonstiges">Sonstiges</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Wohnung"
                                        value={contact.apartment || ''}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[index] = { ...newContacts[index], apartment: e.target.value };
                                            setFormData(prev => ({ ...prev, contacts: newContacts }));
                                        }}
                                    />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Tel.Nr"
                                        value={contact.phone || ''}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[index] = { ...newContacts[index], phone: e.target.value };
                                            setFormData(prev => ({ ...prev, contacts: newContacts }));
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{ padding: '0.5rem', color: 'var(--danger)' }}
                                        onClick={() => {
                                            const newContacts = formData.contacts.filter((_, i) => i !== index);
                                            setFormData(prev => ({ ...prev, contacts: newContacts }));
                                        }}
                                        title="Kontakt entfernen"
                                    >
                                        <Trash size={16} />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="btn btn-outline"
                                style={{ alignSelf: 'flex-start', marginTop: '0.25rem', fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}
                                onClick={() => {
                                    setFormData(prev => ({
                                        ...prev,
                                        contacts: [...(prev.contacts || []), { name: '', apartment: '', phone: '' }]
                                    }));
                                }}
                            >
                                <Plus size={14} /> Kontakt hinzufügen
                            </button>
                        </div>
                    </div>



                    {/* Trocknung Protokoll - Nur sichtbar wenn Status = Trocknung ODER Geräte vorhanden */}
                    {(formData.status === 'Trocknung' || (formData.equipment && formData.equipment.length > 0)) && (
                        <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(56, 189, 248, 0.05)', border: '1px solid var(--border)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--primary)' }}>Trocknung</h3>

                            {/* Equipment Selection */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="form-label" style={{ color: 'var(--primary)' }}>Eingesetzte Geräte</label>

                                {/* List of added devices grouped by Apartment + Room */}
                                {formData.equipment.length > 0 && (
                                    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {Object.entries(
                                            formData.equipment.reduce((acc, item) => {
                                                const key = item.apartment ? `${item.apartment} - ${item.room}` : item.room;
                                                (acc[key] = acc[key] || []).push(item);
                                                return acc;
                                            }, {})
                                        ).map(([groupKey, devices]) => (
                                            <div key={groupKey} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                                                <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary)' }}>Bereich: {groupKey}</h4>

                                                </div>

                                                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    {devices.map((item) => {
                                                        const consumption = (item.counterEnd && item.counterStart)
                                                            ? (parseFloat(item.counterEnd) - parseFloat(item.counterStart)).toFixed(2)
                                                            : null;

                                                        // Find original index in formData.equipment to update correctly
                                                        const originalIndex = formData.equipment.findIndex(i => i.id === item.id);

                                                        return (
                                                            <div key={item.id} style={{ border: '1px solid #E2E8F0', borderRadius: 'var(--radius)', padding: '1rem', backgroundColor: 'var(--surface)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)' }}>Gerät #{item.deviceNumber}</h4>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                                                                    {/* Row 1: Dates */}
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Start-Datum</label>
                                                                        <input
                                                                            type="date"
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.startDate || ''}
                                                                            onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].startDate = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>End-Datum</label>
                                                                        <input
                                                                            type="date"
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.endDate || ''}
                                                                            onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].endDate = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    {/* Row 2: Counters */}
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Zähler Start (kWh)</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.counterStart || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].counterStart = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Zähler Ende (kWh)</label>
                                                                        <input
                                                                            id={`counter-end-${item.id}`}
                                                                            type="number"
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.counterEnd || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].counterEnd = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    {/* Row 3: Usage Stats */}
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Betriebs-Stunden</label>
                                                                        <input
                                                                            type="number"
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.hours || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].hours = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Verbrauch (kWh)</label>
                                                                        <div style={{ padding: '6px 8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                                            {consumption ? `${consumption} kWh` : '-'}
                                                                        </div>
                                                                    </div>

                                                                    {/* Energiebedarf Wahlfeld */}
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Energiebedarf (kW)</label>
                                                                        <select
                                                                            className="form-input"
                                                                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                                                            value={item.energyConsumption || ''}
                                                                            onChange={(e) => {
                                                                                const newEquipment = [...formData.equipment];
                                                                                newEquipment[originalIndex].energyConsumption = e.target.value;
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }}
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
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>

                                                                    <button
                                                                        type="button"
                                                                        // Force visibility with explicit styles
                                                                        style={{
                                                                            fontSize: '0.8rem',
                                                                            padding: '0.4rem 0.8rem',
                                                                            fontWeight: 600,
                                                                            color: item.endDate ? '#10B981' : '#F59E0B', // Green or Amber
                                                                            backgroundColor: item.endDate ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                                            border: item.endDate ? '1px solid #10B981' : '1px solid #F59E0B',
                                                                            borderRadius: '4px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.4rem',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s',
                                                                            textTransform: 'uppercase',
                                                                            letterSpacing: '0.5px'
                                                                        }}
                                                                        onClick={() => {
                                                                            // Correctly find index in current state
                                                                            const currentIndex = formData.equipment.findIndex(i => i.id === item.id);
                                                                            if (currentIndex === -1) return;

                                                                            const newEquipment = [...formData.equipment];
                                                                            // Set End Date to today
                                                                            const today = new Date().toISOString().split('T')[0];
                                                                            newEquipment[currentIndex] = {
                                                                                ...newEquipment[currentIndex],
                                                                                endDate: today
                                                                            };

                                                                            setFormData(prev => ({ ...prev, equipment: newEquipment }));

                                                                            // Focus Zähler Ende input
                                                                            setTimeout(() => {
                                                                                const input = document.getElementById(`counter-end-${item.id}`);
                                                                                if (input) {
                                                                                    input.focus();
                                                                                    input.select();
                                                                                }
                                                                            }, 100);
                                                                        }}
                                                                        title={item.endDate ? "Datum auf heute aktualisieren" : "Gerät abmelden (End-Datum setzen)"}
                                                                    >
                                                                        {item.endDate && <Check size={12} />}
                                                                        {item.endDate ? "Abgemeldet" : "Abmelden"}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost"
                                                                        style={{ padding: '0.25rem', color: 'var(--text-muted)' }}
                                                                        onClick={() => {
                                                                            if (window.confirm("Gerät entfernen?")) {
                                                                                const newEquipment = formData.equipment.filter((_, i) => i !== originalIndex);
                                                                                setFormData(prev => ({ ...prev, equipment: newEquipment }));
                                                                            }
                                                                        }}
                                                                        title="Löschen"
                                                                    >
                                                                        <Trash size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div style={{ padding: '0.5rem', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        // className="btn btn-ghost" // Removing standard class to apply custom styles directly
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            padding: '0.35rem 0.75rem',
                                                            color: 'var(--primary)',
                                                            backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
                                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                                            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                                                        }}
                                                        onClick={() => {
                                                            setNewDevice(prev => ({
                                                                ...prev,
                                                                room: groupKey,
                                                                apartment: devices[0]?.apartment || '',
                                                                startDate: devices[0]?.startDate || new Date().toISOString().split('T')[0]
                                                            }));
                                                            // Scroll to form (optional, or just focus)
                                                            document.getElementById('add-device-form')?.scrollIntoView({ behavior: 'smooth' });
                                                        }}
                                                    >
                                                        <Plus size={14} style={{ marginRight: '0.25rem' }} />
                                                        Gerät hinzufügen
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Report Actions */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={generateEnergyReport}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                                    >
                                        <FileText size={16} /> Energieprotokoll (PDF)
                                    </button>
                                </div>

                                {/* Add new device form */}
                                <div id="add-device-form" style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', marginTop: 0 }}>Neues Gerät hinzufügen</h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {/* Device Selection */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Gerät wählen</label>
                                            <input
                                                list="device-options-tech"
                                                className="form-input"
                                                placeholder="Geräte-Nr. (oder wählen)"
                                                value={newDevice.deviceNumber || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const dev = availableDevices.find(d => d.number.toString() === val);
                                                    if (dev) {
                                                        setSelectedDevice(dev);
                                                        setNewDevice(prev => ({
                                                            ...prev,
                                                            deviceNumber: val,
                                                            energyConsumption: dev.energy_consumption || ''
                                                        }));
                                                    } else {
                                                        setSelectedDevice(null);
                                                        setNewDevice(prev => ({ ...prev, deviceNumber: val }));
                                                    }
                                                }}
                                                onFocus={(e) => e.target.select()} // Auto-select text on focus
                                            />
                                            <datalist id="device-options-tech">
                                                {availableDevices.map(device => (
                                                    <option key={device.id} value={device.number}>
                                                        {device.type} {device.model ? `(${device.model})` : ''}
                                                    </option>
                                                ))}
                                            </datalist>
                                        </div>

                                        {/* Room Selection */}
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Raum</label>
                                            <select
                                                className="form-input"
                                                value={newDevice.room}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, room: e.target.value }))}
                                            >
                                                <option value="">Wählen...</option>
                                                <option value="Wohnzimmer">Wohnzimmer</option>
                                                <option value="Bad">Bad</option>
                                                <option value="Dusche">Dusche</option>
                                                <option value="Flur">Flur</option>
                                                <option value="Schlafzimmer">Schlafzimmer</option>
                                                <option value="Kinderzimmer">Kinderzimmer</option>
                                                <option value="Treppenhaus">Treppenhaus</option>
                                                <option value="Keller">Keller</option>
                                                <option value="Garage">Garage</option>
                                                <option value="Küche">Küche</option>
                                                <option value="Sonstiges">Sonstiges</option>
                                            </select>
                                            {(newDevice.room === 'Sonstiges') && (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ marginTop: '0.25rem' }}
                                                    placeholder="Raum-Name"
                                                    onChange={(e) => setNewDevice(prev => ({ ...prev, room: e.target.value }))}
                                                />
                                            )}
                                        </div>

                                        {/* Start Date */}
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Start-Datum</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={newDevice.startDate || ''}
                                                onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, startDate: e.target.value }))}
                                            />
                                        </div>
                                    </div>



                                    {/* Optional Second Row for Counters/Apartment & Energy */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Wohnung (Optional)</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="z.B. 1. OG"
                                                value={newDevice.apartment || ''}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, apartment: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Zähler Start</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder="kWh"
                                                value={newDevice.counterStart || ''}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, counterStart: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Energiebedarf</label>
                                            <select
                                                className="form-input"
                                                value={newDevice.energyConsumption || ''}
                                                onChange={(e) => setNewDevice(prev => ({ ...prev, energyConsumption: e.target.value }))}
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
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleAddDevice}
                                        disabled={!newDevice.deviceNumber || !newDevice.room}
                                        style={{ width: '100%' }}
                                    >
                                        Gerät hinzufügen
                                    </button>
                                </div>
                            </div>




                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
                        {/* Art des Schadens - Moved here */}
                        {(mode === 'desktop' || formData.status !== 'Trocknung') && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="damageType">Schadenursache</label>
                                <input
                                    type="text"
                                    id="damageType"
                                    name="damageType"
                                    className="form-input"
                                    placeholder="z.B. Rohrbruch, Leckage..."
                                    value={formData.damageType}
                                    onChange={handleInputChange}
                                />
                                {/* Image Upload for Schadenursache */}
                                <div style={{ marginTop: '0.5rem' }}>
                                    {formData.damageTypeImage ? (
                                        <div style={{ position: 'relative', width: 'fit-content' }}>
                                            <img
                                                src={formData.damageTypeImage}
                                                alt="Schadenursache"
                                                style={{ maxHeight: '150px', borderRadius: '8px', border: '1px solid var(--border)' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setEditingImage({ preview: formData.damageTypeImage, isDamageType: true })}
                                                style={{
                                                    position: 'absolute',
                                                    top: '-8px',
                                                    right: '24px',
                                                    background: 'white',
                                                    border: '1px solid #0EA5E9',
                                                    borderRadius: '50%',
                                                    color: '#0EA5E9',
                                                    width: '24px',
                                                    height: '24px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                                title="Bild bearbeiten"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={removeDamageTypeImage}
                                                style={{
                                                    position: 'absolute',
                                                    top: '-8px',
                                                    right: '-8px',
                                                    background: 'white',
                                                    border: '1px solid #EF4444',
                                                    borderRadius: '50%',
                                                    color: '#EF4444',
                                                    width: '24px',
                                                    height: '24px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            {/* OPTION 1: Select from Project (Primary) */}
                                            <button
                                                type="button"
                                                onClick={() => setShowImageSelector(true)}
                                                className="btn btn-primary"
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    height: 'auto',
                                                    padding: '1rem',
                                                    fontSize: '0.9rem'
                                                }}
                                            >
                                                <Image size={20} />
                                                <span>Bild aus Projekt wählen</span>
                                            </button>


                                            {/* OPTION 2: Upload New (Secondary) */}
                                            <div style={{
                                                position: 'relative',
                                                overflow: 'hidden',
                                                flex: 1,
                                                border: '2px dashed #334155',
                                                borderRadius: '8px',
                                                backgroundColor: '#1E293B',
                                                transition: 'all 0.2s',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#94A3B8'
                                            }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#475569';
                                                    e.currentTarget.style.backgroundColor = '#334155';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#334155';
                                                    e.currentTarget.style.backgroundColor = '#1E293B';
                                                }}
                                            >
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleDamageTypeImageUpload}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: '100%',
                                                        opacity: 0,
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Upload size={16} />
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Neu hochladen</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Interne Notizen */}
                    {(mode === 'desktop' || formData.status !== 'Trocknung') && (
                        <div className="form-group">
                            <label className="form-label">Interne Notizen</label>

                            {/* Notes Textarea */}
                            <textarea
                                name="notes"
                                className="form-input"
                                style={{ minHeight: '100px', resize: 'vertical', marginBottom: '1rem' }}
                                placeholder="Notizen, Besonderheiten, Absprachen..."
                                value={formData.notes || ''}
                                onChange={handleInputChange}
                            />


                        </div>
                    )}

                    {/* Pläne & Grundrisse Section - Visible in Both Modes */}
                    {(mode === 'desktop' || formData.status !== 'Trocknung') && (
                        <div style={{ marginTop: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                Pläne & Grundrisse
                            </h2>

                            <div className="card" style={{ border: '1px solid var(--border)', padding: '1.5rem' }}>
                                <div
                                    style={{
                                        border: '2px dashed var(--border)',
                                        borderRadius: 'var(--radius)',
                                        padding: '2rem 1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)'
                                    }}
                                    onClick={() => document.getElementById('file-upload-Pläne').click()}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                        e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                        e.currentTarget.style.color = 'var(--primary)';
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                    }}
                                    onDrop={(e) => handleCategoryDrop(e, 'Pläne')}
                                >
                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                    <span style={{ fontSize: '0.85rem' }}>Plan / Grundriss hochladen (PDF / Bild)</span>

                                    <input
                                        id="file-upload-Pläne"
                                        type="file"
                                        multiple
                                        accept="image/*,application/pdf"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleCategorySelect(e, 'Pläne')}
                                    />
                                </div>

                                {/* List of Pläne */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.images.filter(img => img.assignedTo === 'Pläne').map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                            {/* Icon/Preview */}
                                            {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                <div
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                                    onClick={() => {
                                                        if (item.file) {
                                                            const pdfUrl = URL.createObjectURL(item.file);
                                                            window.open(pdfUrl, '_blank');
                                                        } else if (item.preview) {
                                                            window.open(item.preview, '_blank');
                                                        } else {
                                                            alert("PDF Vorschau nicht verfügbar (wurde gespeichert).");
                                                        }
                                                    }}
                                                >
                                                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                                                        <FileText size={24} color="var(--text-main)" />
                                                    </div>
                                                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>
                                                        {item.name}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, cursor: 'pointer' }}
                                                    onClick={() => window.open(item.preview, '_blank')}
                                                >
                                                    <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                        <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                    </div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>
                                                </div>
                                            )}

                                            {/* Delete Action */}
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))}
                                                style={{
                                                    color: '#EF4444',
                                                    padding: '0.5rem',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                                                }}
                                            >
                                                <Trash size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    {formData.images.filter(img => img.assignedTo === 'Pläne').length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                            Keine Pläne vorhanden.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Arbeitsrapporte Section - For Technician Mode AND Admin */}
                    {(mode === 'technician') && (
                        <div style={{ marginTop: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                                    Arbeitsrapporte
                                </h2>
                                <button
                                    type="button"
                                    onClick={handleGeneratePDF}
                                    disabled={isGeneratingPDF}
                                    className="btn btn-outline"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                                >
                                    <FileText size={16} />
                                    Schadensbericht
                                </button>
                            </div>

                            <div className="card" style={{ border: '1px solid var(--border)', padding: '1.5rem' }}>
                                <div
                                    style={{
                                        border: '2px dashed var(--border)',
                                        borderRadius: 'var(--radius)',
                                        padding: '2rem 1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.2s',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)'
                                    }}
                                    onClick={() => document.getElementById('file-upload-Arbeitsrappporte').click()}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                        e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                        e.currentTarget.style.color = 'var(--primary)';
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                    }}
                                    onDrop={(e) => handleCategoryDrop(e, 'Arbeitsrappporte')}
                                >
                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                    <span style={{ fontSize: '0.85rem' }}>Arbeitsrapport hochladen / Drop</span>

                                    <input
                                        id="file-upload-Arbeitsrappporte"
                                        type="file"
                                        multiple
                                        accept="image/*,application/pdf"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleCategorySelect(e, 'Arbeitsrappporte')}
                                    />
                                </div>

                                {/* List of Arbeitsrappporte */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {formData.images.filter(img => img.assignedTo === 'Arbeitsrappporte').map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                            {/* Icon/Preview */}
                                            {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                <div
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                                    onClick={() => {
                                                        if (item.file) {
                                                            const pdfUrl = URL.createObjectURL(item.file);
                                                            window.open(pdfUrl, '_blank');
                                                        } else if (item.preview) {
                                                            window.open(item.preview, '_blank');
                                                        } else {
                                                            alert("PDF Vorschau nicht verfügbar (wurde gespeichert).");
                                                        }
                                                    }}
                                                >
                                                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                                                        <FileText size={24} color="var(--text-main)" />
                                                    </div>
                                                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>
                                                        {item.name}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                    <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                </div>
                                            )}

                                            {/* Name for images if not PDF */}
                                            {!((item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf'))) && (
                                                <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>{item.name}</div>
                                            )}

                                            {/* Delete Action */}
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))}
                                                style={{
                                                    color: '#EF4444',
                                                    padding: '0.5rem',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                                                }}
                                            >
                                                <Trash size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    {formData.images.filter(img => img.assignedTo === 'Arbeitsrappporte').length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                            Keine Arbeitsrapporte vorhanden.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Document Categories */}
                    {(mode === 'desktop' || formData.status !== 'Trocknung') && (
                        <div style={{ marginTop: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                Bilder & Dokumente
                            </h2>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>


                                {/* Dynamic Room Categories for Erste Begehung & Leckortung & Trocknung */}
                                {(mode === 'desktop' || formData.status === 'Schadenaufnahme' || formData.status === 'Leckortung' || formData.status === 'Trocknung') && (<>
                                    <div style={{ gridColumn: '1 / -1', marginBottom: '1rem' }}>
                                        {/* Room Management UI */}
                                        <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '2rem' }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>Räume verwalten</h4>

                                            {/* Toggle Button for Add Room (Technician Mode optimization) */}
                                            {!isAddRoomExpanded && (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    style={{ width: '100%', marginBottom: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                                                    onClick={() => setIsAddRoomExpanded(true)}
                                                >
                                                    <Plus size={18} /> Raum hinzufügen
                                                </button>
                                            )}

                                            {/* Collapsible Input Area */}
                                            {isAddRoomExpanded && (
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '0.5rem',
                                                    marginBottom: '1rem',
                                                    alignItems: 'flex-end',
                                                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                                    padding: '1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Raum auswählen</label>
                                                        <select
                                                            className="form-input"
                                                            value={newRoom.name}
                                                            onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                                        >
                                                            <option value="">Bitte wählen...</option>
                                                            {ROOM_OPTIONS.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                        {/* Conditional Custom Room Input */}
                                                        {newRoom.name === "Sonstiges / Eigener Name" && (
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                placeholder="Name des Raums eingeben..."
                                                                style={{ marginTop: '0.5rem' }}
                                                                value={newRoom.customName}
                                                                onChange={(e) => setNewRoom(prev => ({ ...prev, customName: e.target.value }))}
                                                            />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Wohnung (Pflicht)</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="z.B. EG Links"
                                                            value={newRoom.apartment}
                                                            onChange={(e) => setNewRoom(prev => ({ ...prev, apartment: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: '150px' }}>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Stockwerk</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="z.B. 1. OG"
                                                            value={newRoom.stockwerk}
                                                            onChange={(e) => setNewRoom(prev => ({ ...prev, stockwerk: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary"
                                                            onClick={() => {
                                                                handleAddRoom();
                                                                setIsAddRoomExpanded(false);
                                                            }}
                                                            disabled={!newRoom.name || !newRoom.apartment}
                                                            style={{ height: '38px', whiteSpace: 'nowrap' }}
                                                        >
                                                            <Check size={18} /> OK
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-outline"
                                                            onClick={() => setIsAddRoomExpanded(false)}
                                                            style={{ height: '38px' }}
                                                            title="Abbrechen"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* List of Added Rooms */}
                                            {formData.rooms.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                    {formData.rooms.map(room => (
                                                        <div key={room.id} style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                            backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0EA5E9',
                                                            padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem'
                                                        }}>
                                                            <span>{room.apartment ? `${room.apartment} - ` : ''}{room.name}</span>
                                                            {mode !== 'technician' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveRoom(room.id)}
                                                                    style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex' }}
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Upload Zones for each Room */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                            {formData.rooms.map(room => {
                                                const roomLabel = room.apartment ? `${room.apartment} - ${room.name}` : room.name;
                                                return (
                                                    <div key={room.id} className="card" style={{ border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                                                <Folder size={18} />
                                                                {roomLabel}
                                                            </h3>
                                                            {/* Measurement Button (New/View) */}
                                                            {!room.measurementData ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-outline"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveRoomForMeasurement(room);
                                                                        setIsNewMeasurement(true);
                                                                        setIsMeasurementReadOnly(false);
                                                                        setShowMeasurementModal(true);
                                                                    }}
                                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', gap: '0.25rem', color: 'var(--success)', borderColor: 'var(--success)' }}
                                                                    title="Messprotokoll erstellen"
                                                                >
                                                                    <Plus size={14} /> Messung beginnen
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();

                                                                            setActiveRoomForMeasurement(room);
                                                                            setIsNewMeasurement(false);
                                                                            setIsMeasurementReadOnly(true);
                                                                            setShowMeasurementModal(true);
                                                                        }}
                                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', gap: '0.25rem', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                                                                        title="Messprotokoll ansehen"
                                                                    >
                                                                        <FileText size={14} /> Messung ansehen
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveRoomForMeasurement(room);
                                                                            setIsNewMeasurement(true);
                                                                            setIsMeasurementReadOnly(false);
                                                                            setShowMeasurementModal(true);
                                                                        }}
                                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', gap: '0.25rem', color: 'var(--success)', borderColor: 'var(--success)' }}
                                                                        title="Neue Messung beginnen"
                                                                    >
                                                                        <Plus size={14} /> Messung beginnen
                                                                    </button>
                                                                </>
                                                            )}

                                                        </div>

                                                        <div
                                                            style={{
                                                                border: '2px dashed var(--border)',
                                                                borderRadius: 'var(--radius)',
                                                                padding: '2rem 1rem',
                                                                textAlign: 'center',
                                                                cursor: 'pointer',
                                                                backgroundColor: 'rgba(255,255,255,0.02)',
                                                                transition: 'all 0.2s',
                                                                marginBottom: '1rem',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'var(--text-muted)'
                                                            }}
                                                            onClick={() => document.getElementById(`file-upload-${room.id}`).click()}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.currentTarget.style.borderColor = 'var(--primary)';
                                                                e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                                                e.currentTarget.style.color = 'var(--primary)';
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.preventDefault();
                                                                e.currentTarget.style.borderColor = 'var(--border)';
                                                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                                                e.currentTarget.style.color = 'var(--text-muted)';
                                                            }}
                                                            onDrop={(e) => handleRoomImageDrop(e, room)}
                                                        >
                                                            <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                                            <span style={{ fontSize: '0.85rem' }}>Bilder hochladen</span>

                                                            <input
                                                                id={`file-upload-${room.id}`}
                                                                type="file"
                                                                multiple
                                                                accept="image/*"
                                                                style={{ display: 'none' }}
                                                                onChange={(e) => handleRoomImageSelect(e, room)}
                                                            />
                                                        </div>

                                                        {/* Previews with Pagination */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                                                            {(() => {
                                                                const roomImages = formData.images.filter(img => img.roomId === room.id);
                                                                const visibleCount = room.visibleImages || 12; // Default 12 images
                                                                const visibleImages = roomImages.slice(0, visibleCount);

                                                                return (
                                                                    <>
                                                                        {visibleImages.map((item, idx) => (
                                                                            <div key={idx} style={{
                                                                                position: 'relative',
                                                                                borderRadius: 'var(--radius)',
                                                                                overflow: 'hidden',
                                                                                border: '1px solid var(--border)',
                                                                                backgroundColor: 'rgba(255,255,255,0.02)',
                                                                                display: 'flex',
                                                                                flexDirection: 'column'
                                                                            }}
                                                                                className="group"
                                                                            >
                                                                                {/* Image Container */}
                                                                                <div style={{ position: 'relative', aspectRatio: '4/3', backgroundColor: 'black' }}>
                                                                                    <img
                                                                                        src={item.preview}
                                                                                        alt=""
                                                                                        loading="lazy"
                                                                                        decoding="async"
                                                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                                                    />

                                                                                    {/* Overlay Actions */}
                                                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                                                                                        style={{
                                                                                            position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
                                                                                            backgroundColor: 'rgba(0,0,0,0.4)',
                                                                                            opacity: 0,
                                                                                            transition: 'opacity 0.2s',
                                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                                                                        }}
                                                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                                                                                    >
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setActiveImageMeta(item)}
                                                                                            style={{
                                                                                                backgroundColor: 'white', border: 'none', borderRadius: '50%', width: '36px', height: '36px',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--primary)'
                                                                                            }}
                                                                                            title="Bearbeiten"
                                                                                        >
                                                                                            <Edit3 size={18} />
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                if (window.confirm('Bild löschen?')) {
                                                                                                    setFormData(prev => ({ ...prev, images: prev.images.filter(img => img !== item) }))
                                                                                                }
                                                                                            }}
                                                                                            style={{
                                                                                                backgroundColor: 'white', border: 'none', borderRadius: '50%', width: '36px', height: '36px',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#EF4444'
                                                                                            }}
                                                                                            title="Löschen"
                                                                                        >
                                                                                            <Trash size={18} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Footer: Description & Actions */}
                                                                                <div style={{
                                                                                    padding: '0.5rem',
                                                                                    borderTop: '1px solid var(--border)',
                                                                                    backgroundColor: 'rgba(0,0,0,0.1)',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    gap: '0.5rem'
                                                                                }}>
                                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                                                        <textarea
                                                                                            key={item.description || 'empty'}
                                                                                            placeholder="Beschreibung..."
                                                                                            rows={2}
                                                                                            className="form-input"
                                                                                            defaultValue={item.description || ''}
                                                                                            onBlur={(e) => {
                                                                                                const newDesc = e.target.value;
                                                                                                if (newDesc !== item.description) {
                                                                                                    setFormData(prev => ({
                                                                                                        ...prev,
                                                                                                        images: prev.images.map(i => i === item ? { ...i, description: newDesc } : i)
                                                                                                    }));
                                                                                                }
                                                                                            }}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            style={{
                                                                                                fontSize: '0.8rem',
                                                                                                lineHeight: '1.2',
                                                                                                padding: '0.4rem',
                                                                                                minHeight: '40px',
                                                                                                flex: 1,
                                                                                                width: '100%',
                                                                                                resize: 'vertical',
                                                                                                backgroundColor: isRecording === item.preview ? '#450a0a' : 'rgba(0,0,0,0.2)',
                                                                                                borderColor: isRecording === item.preview ? '#EF4444' : 'var(--border)'
                                                                                            }}
                                                                                        />
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                isRecording === item.preview ? stopRecording() : startRecording(item.preview);
                                                                                            }}
                                                                                            style={{
                                                                                                width: '32px',
                                                                                                height: '32px',
                                                                                                borderRadius: '50%',
                                                                                                border: isRecording === item.preview ? 'none' : '1px solid var(--border)',
                                                                                                backgroundColor: isRecording === item.preview ? '#EF4444' : 'transparent',
                                                                                                color: isRecording === item.preview ? 'white' : 'var(--text-muted)',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                cursor: 'pointer',
                                                                                                flexShrink: 0
                                                                                            }}
                                                                                        >
                                                                                            <Mic size={14} className={isRecording === item.preview ? 'animate-pulse' : ''} />
                                                                                        </button>
                                                                                    </div>

                                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const newVal = item.includeInReport === false;
                                                                                                setFormData(prev => ({
                                                                                                    ...prev,
                                                                                                    images: prev.images.map(i => i === item ? { ...i, includeInReport: newVal } : i)
                                                                                                }));
                                                                                            }}
                                                                                            style={{
                                                                                                background: 'transparent',
                                                                                                border: 'none',
                                                                                                cursor: 'pointer',
                                                                                                padding: '4px',
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                gap: '0.5rem'
                                                                                            }}
                                                                                            title={item.includeInReport !== false ? "Im Bericht enthalten" : "Nicht im Bericht"}
                                                                                        >
                                                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bild im Bericht verwenden</span>
                                                                                            {item.includeInReport !== false ? (
                                                                                                <CheckCircle size={18} color="#22C55E" />
                                                                                            ) : (
                                                                                                <Circle size={18} color="var(--text-muted)" />
                                                                                            )}
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}

                                                                        {/* Show More Button */}
                                                                        {roomImages.length > visibleCount && (
                                                                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-outline"
                                                                                    onClick={() => {
                                                                                        const newLimit = visibleCount + 24;
                                                                                        setFormData(prev => ({
                                                                                            ...prev,
                                                                                            rooms: prev.rooms.map(r => r.id === room.id ? { ...r, visibleImages: newLimit } : r)
                                                                                        }));
                                                                                    }}
                                                                                    style={{ width: '100%', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.05)' }}
                                                                                >
                                                                                    {roomImages.length - visibleCount} weitere Bilder anzeigen ({roomImages.length} gesamt)
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Schadensbericht Button below room list - DESKTOP ONLY */}
                                    {mode !== 'technician' && (
                                        <div style={{ marginTop: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'flex-start' }}>
                                            <button
                                                type="button"
                                                onClick={handleGeneratePDF}
                                                disabled={isGeneratingPDF}
                                                className="btn btn-primary"
                                                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                            >
                                                <FileText size={18} />
                                                Schadensbericht erstellen
                                            </button>
                                        </div>
                                    )}


                                    {/* Messprotokolle Special Section (Goodnotes / Measurement) */}
                                    {mode === 'technician' && (
                                        <div className="card" style={{ border: '1px solid var(--border)' }}>
                                            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', margin: 0 }}>
                                                    <FileText size={20} />
                                                    Messprotokolle
                                                </h3>
                                            </div>

                                            {/* Section 1: Messen */}
                                            <div style={{ marginBottom: '2rem' }}>
                                                <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>Messen</h4>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                                    Erfassen Sie hier die Messwerte für jeden Raum.
                                                </p>

                                                {/* List of Room Measurements */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {formData.rooms.length > 0 ? (
                                                        formData.rooms.map(room => {
                                                            const hasMeasurement = !!room.measurementData;
                                                            const date = hasMeasurement ? (room.measurementData.globalSettings?.date ? new Date(room.measurementData.globalSettings.date).toLocaleDateString('de-CH') : 'Kein Datum') : '-';

                                                            return (
                                                                <div key={room.id} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', gap: '0.5rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '200px', flex: '1 1 auto' }}>
                                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: hasMeasurement ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                            <Folder size={16} color={hasMeasurement ? '#10B981' : 'var(--text-muted)'} />
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{room.name}</div>
                                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                                {hasMeasurement ? `Letzte Messung: ${date}` : 'Keine Messdaten'}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                        {hasMeasurement ? (
                                                                            <>
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-outline"
                                                                                    onClick={() => {
                                                                                        setActiveRoomForMeasurement(room);
                                                                                        setIsNewMeasurement(false);
                                                                                        setShowMeasurementModal(true);
                                                                                    }}
                                                                                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--text-muted)', borderColor: 'var(--border)', gap: '0.25rem' }}
                                                                                    title="Ansehen / Bearbeiten"
                                                                                >
                                                                                    <FileText size={14} /> Ansehen
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-outline"
                                                                                    onClick={() => {
                                                                                        setActiveRoomForMeasurement(room);
                                                                                        setIsNewMeasurement(true);
                                                                                        setShowMeasurementModal(true);
                                                                                    }}
                                                                                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--success)', borderColor: 'var(--success)' }}
                                                                                    title="Neue Messung basierend auf diesem Protokoll"
                                                                                >
                                                                                    <Plus size={14} style={{ marginRight: '0.25rem' }} /> Neu
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-outline"
                                                                                onClick={() => {
                                                                                    setActiveRoomForMeasurement(room);
                                                                                    setIsNewMeasurement(false);
                                                                                    setShowMeasurementModal(true);
                                                                                }}
                                                                                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                                                            >
                                                                                <Edit3 size={14} style={{ marginRight: '0.25rem' }} /> Messung starten
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center' }}>
                                                            Noch keine Räume erstellt.
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline"
                                                        onClick={async () => {
                                                            try {
                                                                await generateMeasurementExcel(formData);
                                                            } catch (error) {
                                                                console.error("Excel Export failed:", error);
                                                                alert("Fehler beim Erstellen des Excel-Protokolls.");
                                                            }
                                                        }}
                                                        style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', gap: '0.4rem', borderColor: '#10B981', color: '#10B981', display: 'flex', alignItems: 'center' }}
                                                        title="Excel Export aller Messräume (Download)"
                                                    >
                                                        <Table size={16} />
                                                        Excel Export
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Divider */}



                                            {/* Divider */}
                                            <div style={{ borderTop: '1px solid var(--border)', margin: '0 -1.5rem 1.5rem -1.5rem' }}></div>

                                            {/* Section 3: Schadensbericht (PDF) */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                                                    <div>
                                                        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <FileText size={18} className="text-rose-500" style={{ color: '#EF4444' }} />
                                                            Schadensbericht
                                                        </h4>
                                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                            PDF-Exporte des Berichts
                                                        </p>
                                                    </div>

                                                </div>

                                                {/* Calculated / Generated Files List */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {formData.images
                                                        .filter(img => img.assignedTo === 'Schadensbericht') // Now distinct!
                                                        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
                                                        .map((item, idx) => (
                                                            <div
                                                                key={idx}
                                                                onClick={() => {
                                                                    if (item.file) {
                                                                        const url = URL.createObjectURL(item.file);
                                                                        const a = document.createElement('a');
                                                                        a.href = url;
                                                                        a.download = item.name;
                                                                        a.click();
                                                                    } else if (item.preview) {
                                                                        window.open(item.preview, '_blank');
                                                                    }
                                                                }}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.75rem',
                                                                    padding: '0.75rem',
                                                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: 'var(--radius)',
                                                                    cursor: 'pointer',
                                                                    transition: 'background-color 0.2s ease'
                                                                }}
                                                                title="Klicken zum Öffnen"
                                                            >
                                                                <div style={{ padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {/* PDF Icon */}
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
                                                                        <path fill="#EF4444" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                                                        <path fill="rgba(255,255,255,0.5)" d="M14 2v6h6" />
                                                                        <text x="50%" y="70%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">PDF</text>
                                                                    </svg>
                                                                </div>

                                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                                    <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.date ? new Date(item.date).toLocaleDateString('de-CH') : '-'}</div>
                                                                </div>

                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <div style={{ color: 'var(--primary)', opacity: 0.8 }}>
                                                                        <Download size={18} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    {formData.images.filter(img => img.assignedTo === 'Schadensbericht').length === 0 && (
                                                        <div style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                                                            Keine Schadensberichte vorhanden.
                                                        </div>
                                                    )}
                                                </div>
                                            </div >
                                        </div>
                                    )}



                                    {
                                        ['Emails', 'Pläne', 'Sonstiges'].map(category => (
                                            <div key={category} className="card" style={{ border: '1px solid var(--border)' }}>
                                                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {category === 'Schadenfotos' && <Image size={18} />}
                                                    {category === 'Messprotokolle' && <FileText size={18} />}
                                                    {category === 'Emails' && <Mail size={18} />}
                                                    {category === 'Pläne' && <Map size={18} />}
                                                    {category === 'Sonstiges' && <Folder size={18} />}
                                                    {category}
                                                </h3>

                                                <div
                                                    style={{
                                                        border: '2px dashed var(--border)',
                                                        borderRadius: 'var(--radius)',
                                                        padding: '2rem 1rem',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        backgroundColor: 'rgba(255,255,255,0.02)',
                                                        transition: 'all 0.2s',
                                                        marginBottom: '1rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'var(--text-muted)'
                                                    }}
                                                    onClick={() => document.getElementById(`file-upload-${category}`).click()}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                        e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                                                        e.currentTarget.style.color = 'var(--primary)';
                                                    }}
                                                    onDragLeave={(e) => {
                                                        e.preventDefault();
                                                        e.currentTarget.style.borderColor = 'var(--border)';
                                                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                                        e.currentTarget.style.color = 'var(--text-muted)';
                                                    }}
                                                    onDrop={(e) => handleCategoryDrop(e, category)}
                                                >
                                                    <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                                    <span style={{ fontSize: '0.85rem' }}>Upload / Drop</span>

                                                    <input
                                                        id={`file-upload-${category}`}
                                                        type="file"
                                                        multiple
                                                        accept="image/*,application/pdf"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => handleCategorySelect(e, category)}
                                                    />
                                                </div>

                                                {/* Preview for this category */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {formData.images.filter(img => img.assignedTo === category).map((item, idx) => (
                                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                                            {/* Icon/Preview */}
                                                            {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                                // PDF / Document Layout
                                                                <div
                                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', minWidth: 0 }}
                                                                    onClick={() => {
                                                                        if (item.file) {
                                                                            const pdfUrl = URL.createObjectURL(item.file);
                                                                            window.open(pdfUrl, '_blank');
                                                                        } else if (item.preview) {
                                                                            window.open(item.preview, '_blank');
                                                                        } else {
                                                                            // Fallback for PDF without preview URL (e.g. just generated but lost blob)
                                                                            alert("PDF Vorschau nicht verfügbar (wurde gespeichert).");
                                                                        }
                                                                    }}
                                                                >
                                                                    <div style={{ padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        {/* PDF Icon */}
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
                                                                            <path fill="#EF4444" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                                                            <path fill="rgba(255,255,255,0.5)" d="M14 2v6h6" />
                                                                            <text x="50%" y="70%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">PDF</text>
                                                                        </svg>
                                                                    </div>
                                                                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {item.name}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                // Image Layout
                                                                <>
                                                                    <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                                                        <img
                                                                            src={item.preview}
                                                                            alt=""
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                            onClick={() => setActiveImageMeta(item)} // Allow re-opening modal by clicking image
                                                                        />
                                                                    </div>
                                                                    <div style={{ flex: 1, padding: '0 0.5rem', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                        <div
                                                                            style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                                            title={item.name}
                                                                        >
                                                                            {item.name}
                                                                        </div>
                                                                        {item.description && (
                                                                            <div style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'flex', alignItems: 'flex-start', gap: '0.25rem' }}>
                                                                                <span style={{ marginTop: '2px', flexShrink: 0 }}>📝</span>
                                                                                <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                                                    {item.description}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* Edit - Hide for PDFs */}
                                                            {!((item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf'))) && (
                                                                <button
                                                                    type="button"
                                                                    title="Bearbeiten"
                                                                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', padding: '4px' }}
                                                                    onClick={() => setEditingImage(item)}
                                                                >
                                                                    <Edit3 size={16} />
                                                                </button>
                                                            )}

                                                            {/* Delete */}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (window.confirm('Möchten Sie diese Datei wirklich löschen?')) {
                                                                        setFormData(prev => ({ ...prev, images: prev.images.filter(img => img !== item) }));
                                                                    }
                                                                }}
                                                                style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    }
                                </>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Summary Table (Moved to bottom) */}

                    {
                        (mode === 'desktop' || !['Schadenaufnahme', 'Leckortung'].includes(formData.status)) &&
                        formData.equipment.some(d => d.endDate && d.counterEnd) && (
                            <div style={{ marginTop: '3rem', borderTop: '2px solid var(--border)', paddingTop: '2rem' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>Zusammenfassung Trocknung</h2>
                                <div className="table-container">
                                    <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Wohnung</th>
                                                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Raum</th>
                                                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Geräte-Nr.</th>
                                                <th style={{ textAlign: 'right', padding: '0.75rem' }}>Dauer</th>
                                                <th style={{ textAlign: 'right', padding: '0.75rem' }}>Betriebsstd.</th>
                                                <th style={{ textAlign: 'right', padding: '0.75rem' }}>Verbrauch</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {formData.equipment
                                                .filter(d => d.endDate && d.counterEnd)
                                                .map(item => {
                                                    const days = getDaysDiff(item.startDate, item.endDate);
                                                    const consumption = (parseFloat(item.counterEnd) - parseFloat(item.counterStart)).toFixed(2);
                                                    return (
                                                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '0.75rem' }}>{item.apartment || '-'}</td>
                                                            <td style={{ padding: '0.75rem' }}>{item.room}</td>
                                                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>#{item.deviceNumber}</td>
                                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{days} Tage</td>
                                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.hours} h</td>
                                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{consumption} kWh</td>
                                                        </tr>
                                                    );
                                                })}
                                            <tr style={{ backgroundColor: 'var(--bg-muted)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                                                <td style={{ padding: '0.75rem' }} colSpan={4}>Gesamt</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalDryingHours} h</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalDryingKwh.toFixed(2)} kWh</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                        onClick={generateEnergyReport}
                                    >
                                        <FileText size={16} />
                                        Energieprotokoll (PDF)
                                    </button>
                                </div>

                            </div>
                        )
                    }

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                        {formData.status !== 'Abgeschlossen' ? (
                            <button
                                type="button"
                                className="btn"
                                style={{ backgroundColor: '#EF4444', color: 'white', display: 'flex', gap: '0.5rem' }}
                                onClick={() => {
                                    if (window.confirm('Möchten Sie dieses Projekt wirklich abschließen und ins Archiv verschieben?')) {
                                        onSave({ ...formData, status: 'Abgeschlossen' });
                                    }
                                }}
                            >
                                <CheckCircle size={18} />
                                Projekt beenden
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn"
                                style={{ backgroundColor: '#F59E0B', color: 'white', display: 'flex', gap: '0.5rem' }}
                                onClick={() => {
                                    if (window.confirm('Möchten Sie dieses Projekt wieder aktivieren? (Status wird auf "Instandsetzung" gesetzt)')) {
                                        onSave({ ...formData, status: 'Instandsetzung' });
                                    }
                                }}
                            >
                                <RotateCcw size={18} />
                                Projekt reaktivieren
                            </button>
                        )}

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handlePDFClick}
                                style={{ color: '#365E7D', borderColor: '#365E7D' }}
                            >
                                <FileText size={18} />
                                Bericht konfigurieren
                            </button>
                            <button type="button" className="btn btn-outline" onClick={onCancel}>Abbrechen</button>
                            {mode === 'desktop' && (
                                <button type="submit" className="btn btn-primary">
                                    <Save size={18} />
                                    Speichern
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Spacer for Fixed Footer */}
                    {mode !== 'desktop' && <div style={{ height: '80px' }} />}

                    {/* Mobile / Technician Fixed Footer */}
                    {mode !== 'desktop' && (
                        <div style={{
                            position: 'fixed',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: '1rem',
                            backgroundColor: '#0F172A',
                            borderTop: '1px solid #334155',
                            display: 'flex',
                            gap: '0.75rem',
                            zIndex: 100,
                            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.5)'
                        }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={onCancel}
                                style={{ flex: 1, padding: '0.75rem', fontSize: '0.95rem', justifyContent: 'center' }}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{
                                    flex: 2,
                                    padding: '0.75rem',
                                    fontSize: '0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    backgroundColor: '#0EA5E9'
                                }}
                            >
                                <Save size={18} />
                                Speichern
                            </button>
                        </div>
                    )}
                </form >

                {editingImage && (
                    <ImageEditor
                        image={editingImage}
                        onSave={(newPreview) => {
                            if (editingImage.isDamageType) {
                                setFormData(prev => ({
                                    ...prev,
                                    damageTypeImage: newPreview
                                }));
                            } else {
                                setFormData(prev => ({
                                    ...prev,
                                    images: prev.images.map(img => img === editingImage ? { ...img, preview: newPreview } : img)
                                }));
                            }
                            setEditingImage(null);
                        }}
                        onCancel={() => setEditingImage(null)}
                    />
                )
                }

                {/* Image Selector Modal */}
                {
                    showImageSelector && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '2rem'
                        }} onClick={() => setShowImageSelector(false)}>
                            <div style={{
                                backgroundColor: '#1E293B',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                width: '900px',
                                maxWidth: '95%',
                                height: '80vh',
                                maxHeight: '800px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                border: '1px solid #334155'
                            }} onClick={e => e.stopPropagation()}>

                                {/* Header */}
                                <div style={{
                                    padding: '1.5rem',
                                    borderBottom: '1px solid #334155',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: '#0F172A',
                                    borderTopLeftRadius: '12px',
                                    borderTopRightRadius: '12px'
                                }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'white' }}>Bild aus Projekt wählen</h3>
                                        <p style={{ margin: '0.25rem 0 0 0', color: '#94A3B8', fontSize: '0.875rem' }}>
                                            Wählen Sie ein Bild aus den vorhandenen Raumbildern.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowImageSelector(false)}
                                        className="btn btn-ghost"
                                        style={{ color: '#94A3B8', padding: '0.5rem' }}
                                    >
                                        <X size={24} />
                                    </button>
                                </div>

                                {/* Grid */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '1.5rem',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                    gap: '1rem',
                                    alignContent: 'start'
                                }}>
                                    {formData.images.length === 0 ? (
                                        <div style={{
                                            gridColumn: '1/-1',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            height: '300px',
                                            color: '#64748B',
                                            gap: '1rem'
                                        }}>
                                            <Image size={48} strokeWidth={1.5} />
                                            <p>Keine Bilder im Projekt vorhanden.</p>
                                        </div>
                                    ) : (
                                        formData.images.map((img, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, damageTypeImage: img.preview }));
                                                    setShowImageSelector(false);
                                                }}
                                                style={{
                                                    aspectRatio: '4/3',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    cursor: 'pointer',
                                                    border: '2px solid transparent',
                                                    transition: 'all 0.2s',
                                                    position: 'relative',
                                                    backgroundColor: '#0F172A',
                                                    group: 'item'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#0EA5E9';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = 'transparent';
                                                    e.currentTarget.style.transform = 'none';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                <img
                                                    src={img.preview}
                                                    alt={`Bild ${idx + 1}`}
                                                    loading="lazy"
                                                    decoding="async"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                                                    padding: '2rem 0.75rem 0.5rem',
                                                    pointerEvents: 'none'
                                                }}>
                                                    <div style={{ color: 'white', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {img.assignedTo || 'Unzugewiesen'}
                                                    </div>
                                                    {img.description && (
                                                        <div style={{ color: '#94A3B8', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {img.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* New Image Metadata Modal */}
                {
                    activeImageMeta && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <div style={{
                                backgroundColor: '#1E293B',
                                padding: '2rem',
                                borderRadius: '16px',
                                width: '800px',
                                maxWidth: '95%',
                                color: 'white',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: '2rem' }}>
                                    {/* Left Column: Fields */}
                                    <div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#94A3B8', marginBottom: '0.5rem' }}>Zuständig</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                style={{ backgroundColor: '#0F172A', borderColor: '#334155', color: 'white', width: '100%' }}
                                                value={activeImageMeta.technician || formData.assignedTo || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setActiveImageMeta(prev => ({ ...prev, technician: val }));
                                                }}
                                                placeholder="Name des Techniker"
                                            />
                                        </div>



                                        <div style={{ marginTop: '2rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={activeImageMeta.includeInReport !== false}
                                                    onChange={(e) => setActiveImageMeta(prev => ({ ...prev, includeInReport: e.target.checked }))}
                                                    style={{ width: '1.25rem', height: '1.25rem', accentColor: '#0EA5E9' }}
                                                />
                                                <span style={{ fontSize: '1rem', fontWeight: 500 }}>Bericht</span>
                                            </label>
                                        </div>

                                        <div style={{ marginTop: '2rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Save current meta first? No range, just open editor.
                                                    // We need to close this modal or keep it open? 
                                                    // Better: Close this, open editor. When editor saves, it updates formData. 
                                                    // But we have unsaved changes in `activeImageMeta`! 
                                                    // So we must save activeImageMeta to formData first.
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        images: prev.images.map(img => img.id === activeImageMeta.id ? activeImageMeta : img) // Assuming id or ref equality
                                                        // Warning: 'img' comparison by reference might fail if we cloned it.
                                                        // We are using `activeImageMeta` which is a CLONE or REF? 
                                                        // `setActiveImageMeta(item)` sets it to the item reference. 
                                                        // React state updates create new refs usually.
                                                        // Safe way: Map by matching properties or reference if unchanged.
                                                    }));
                                                    // Actually, let's just pass `activeImageMeta` reference to `setEditingImage`
                                                    // But `editingImage` expects the image object from formData. 
                                                    setEditingImage(activeImageMeta);
                                                    // We can keep this modal open? Or close it?
                                                    // Let's close it to avoid Z-index hell.
                                                    // But we need to reopen it after save?
                                                    // Simplify: Just open editor.
                                                    setActiveImageMeta(null);
                                                }}
                                                style={{ color: '#0EA5E9', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}
                                            >
                                                <Edit3 size={20} />
                                                Bild bearbeiten (Zeichnen)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right Column: Description & Preview */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Beschreibung</span>
                                                <button
                                                    type="button"
                                                    onClick={isRecording === 'modal' ? stopRecording : () => startRecording('modal')}
                                                    className={`btn ${isRecording === 'modal' ? 'btn-danger' : 'btn-outline'}`}
                                                    style={{
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        padding: '0.25rem 0.75rem',
                                                        fontSize: '0.8rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        borderColor: isRecording ? '#EF4444' : isTranscribing ? '#F59E0B' : '#475569',
                                                        color: isRecording ? 'white' : isTranscribing ? '#F59E0B' : '#94A3B8',
                                                        backgroundColor: isRecording ? '#EF4444' : 'transparent',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Mic size={14} className={isRecording === 'modal' ? 'animate-pulse' : ''} />
                                                    {isRecording === 'modal' ? 'Aufnahme stoppen...' : isTranscribing ? 'Transkribiere...' : 'Spracheingabe (KI)'}
                                                    {/* Volume Meter Overlay */}
                                                    {isRecording === 'modal' && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            bottom: 0,
                                                            left: 0,
                                                            height: '100%',
                                                            width: `${audioLevel}%`,
                                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                                            transition: 'width 0.1s linear',
                                                            pointerEvents: 'none'
                                                        }} />
                                                    )}
                                                </button>
                                            </div>
                                            <textarea
                                                placeholder="Beschreibung hinzufügen..."
                                                style={{
                                                    flex: 1,
                                                    backgroundColor: '#0F172A',
                                                    borderColor: isRecording ? '#EF4444' : '#334155',
                                                    color: 'white',
                                                    padding: '1rem',
                                                    borderRadius: '8px',
                                                    resize: 'none',
                                                    minHeight: '150px',
                                                    transition: 'border-color 0.3s'
                                                }}
                                                value={activeImageMeta.description || ''}
                                                onChange={(e) => setActiveImageMeta(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>

                                        <div style={{ height: '200px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <img src={activeImageMeta.preview} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button
                                        onClick={() => setActiveImageMeta(null)}
                                        className="btn"
                                        style={{ backgroundColor: 'transparent', color: 'white', border: '1px solid #475569' }}
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Save back to formData with robust matching
                                            setFormData(prev => ({
                                                ...prev,
                                                images: prev.images.map(img => {
                                                    // Start matching
                                                    if (img.id && activeImageMeta.id && img.id === activeImageMeta.id) return activeImageMeta;
                                                    if (img.preview && activeImageMeta.preview && img.preview === activeImageMeta.preview) return activeImageMeta;
                                                    if (img.name && activeImageMeta.name && img.name === activeImageMeta.name) return activeImageMeta;

                                                    return img;
                                                })
                                            }));
                                            setActiveImageMeta(null);
                                        }}
                                        className="btn btn-primary"
                                        style={{ backgroundColor: '#0EA5E9', border: 'none' }}
                                    >
                                        <Save size={18} style={{ marginRight: '0.5rem' }} />
                                        Speichern
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }



                {
                    showEmailImport && (
                        <EmailImportModal
                            onClose={() => {
                                setShowEmailImport(false);
                                setOpenSettingsDirectly(false);
                            }}
                            onImport={handleEmailImport}
                            audioDevices={audioDevices}
                            selectedDeviceId={selectedDeviceId}
                            onSelectDeviceId={setSelectedDeviceId}
                            initialShowSettings={openSettingsDirectly}
                        />
                    )
                }

                <MeasurementModal
                    isOpen={showMeasurementModal}
                    onClose={() => {
                        setShowMeasurementModal(false);
                        setActiveRoomForMeasurement(null);
                        setIsNewMeasurement(false);
                    }}
                    rooms={activeRoomForMeasurement ? [activeRoomForMeasurement] : []} // Only pass the active room
                    projectTitle={formData.projectTitle}
                    readOnly={isMeasurementReadOnly}
                    initialData={formData.rooms.reduce((acc, r) => {
                        let mData = r.measurementData;
                        // If this is the active room AND we are starting a NEW measurement based on old one
                        if (activeRoomForMeasurement && r.id === activeRoomForMeasurement.id && isNewMeasurement && mData) {
                            mData = {
                                canvasImage: mData.canvasImage, // Keep Sketch
                                globalSettings: {
                                    ...mData.globalSettings,
                                    date: new Date().toISOString().split('T')[0], // Reset Date to Today
                                    temp: '',
                                    humidity: ''
                                },
                                measurements: mData.measurements.map(m => ({
                                    id: m.id,
                                    pointName: m.pointName,
                                    w_value: '', // Clear values
                                    b_value: '',
                                    notes: ''
                                }))
                            };
                        }
                        return { ...acc, [r.id]: mData };
                    }, {})}
                    onSave={(data) => {
                        const { file, measurements, globalSettings, canvasImage } = data;

                        // 1. Always upload the file to the active room (if any) or 'Messprotokolle' context
                        if (activeRoomForMeasurement) {
                            // SKIP uploading snapshot files to 'Messprotokolle' list to avoid clutter.
                            // The data is saved in measurementData below.

                            // 2. Update the room's internal measurement data state
                            setFormData(prev => ({
                                ...prev,
                                rooms: prev.rooms.map(r => r.id === activeRoomForMeasurement.id ? {
                                    ...r,
                                    measurementData: {
                                        globalSettings,
                                        canvasImage,
                                        measurements
                                    }
                                } : r)
                            }));
                        } else {
                            // Fallback if no room active (should not happen for room-based measurements)
                            // handleImageUpload([file], {
                            //    assignedTo: 'Messprotokolle'
                            // });
                        }

                        setIsNewMeasurement(false); // Close modal state
                    }}
                />
            </div >

            {/* Report Configuration Modal (Enhanced with Image Selection) */}
            {
                showReportModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                    }}>
                        <div style={{ background: 'white', padding: '30px', borderRadius: '8px', zIndex: 10000 }}>
                            <h2 style={{ color: 'black' }}>DEBUG: MODAL IS RENDERING</h2>
                            <button className="btn btn-primary" onClick={() => setShowReportModal(false)}>Close</button>
                        </div>
                        {false &&
                            <div className="card" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Bericht erstellen</h3>
                                    <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                                        <X size={24} />
                                    </button>
                                </div>

                                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                                    {/* 1. General Info */}
                                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                                        <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block', fontSize: '1.1rem', color: '#0EA5E9' }}>
                                            Schadenursache
                                        </label>
                                        <textarea
                                            className="form-input"
                                            rows={3}
                                            value={formData.cause || ''}
                                            onChange={(e) => setFormData(prev => ({ ...prev, cause: e.target.value }))}
                                            placeholder="Beschreiben Sie hier die Ursache des Schadens..."
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '1rem' }}
                                        />
                                    </div>


                                </div>

                                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: '#1E293B' }}>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => setShowReportModal(false)}
                                        style={{ padding: '0.75rem 1.5rem' }}
                                    >
                                        Abbrechen
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            // Trigger PDF logic (Unified Vector Report)
                                            await generatePDFExport(formData);
                                            setShowReportModal(false);
                                        }}
                                        style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <FileText size={20} />
                                        PDF Erstellen
                                    </button>
                                </div>
                            </div>
                        }
                    </div>
                )
            }

            {/* Print Report Template - Only render when generating to save performance */}
            {
                isGeneratingPDF && (
                    <div
                        id="print-report"
                        className="print-only"
                        style={{
                            display: 'block',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '210mm', // A4 width
                            minHeight: '297mm', // A4 height
                            backgroundColor: 'white',
                            zIndex: -1000, // Hide behind everything
                            padding: '20mm', // Print margins
                            color: 'black',
                            fontFamily: 'Arial, sans-serif'
                        }}
                    >
                        <div className="pdf-section" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '2rem',
                            borderBottom: '4px solid #0EA5E9',
                            paddingBottom: '1.5rem'
                        }}>
                            <div>
                                <h1 style={{ fontSize: '28pt', fontWeight: '800', margin: 0, color: '#0F172A', letterSpacing: '-0.5px' }}>Schadensbericht</h1>
                                <div style={{ fontSize: '11pt', marginTop: '0.5rem', color: '#64748B' }}>Erstellt am: {new Date().toLocaleDateString('de-DE')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', marginBottom: '0.5rem' }}>
                                    <img src="/logo.png" style={{ height: '50px', objectFit: 'contain' }} alt="Logo" />
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '16pt', color: '#0F172A' }}>Q-Service AG</div>

                                    </div>
                                </div>
                                <div style={{ fontSize: '9pt', color: '#475569', lineHeight: 1.4 }}>
                                    Kriesbachstrasse 30, 8600 Dübendorf<br />
                                    Tel: 043 819 14 18 | www.q-service.ch
                                </div>
                            </div>
                        </div>

                        <div className="pdf-section" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
                            <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <h3 style={{ color: '#0EA5E9', marginBottom: '1rem', fontSize: '12pt', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Projektdaten</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.75rem', fontSize: '10pt', color: '#334155' }}>
                                    {formData.projectTitle && (
                                        <>
                                            <strong style={{ color: '#64748B' }}>Projekt:</strong> <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.projectTitle}</span>
                                        </>
                                    )}
                                    <strong style={{ color: '#64748B' }}>Auftraggeber:</strong> <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.client}</span>
                                    <strong style={{ color: '#64748B' }}>Zuständig:</strong> <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.assignedTo}</span>
                                    <strong style={{ color: '#64748B' }}>Ort:</strong> <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.street}, {formData.zip} {formData.city}</span>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <h3 style={{ color: '#0EA5E9', marginBottom: '1rem', fontSize: '12pt', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Schaden</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.75rem', fontSize: '10pt', color: '#334155' }}>
                                    <strong style={{ color: '#64748B' }}>Art:</strong> <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.damageType}</span>
                                </div>
                            </div>
                        </div>

                        {formData.description && (
                            <div className="pdf-section" style={{ marginBottom: '2.5rem' }}>
                                <h3 style={{ borderLeft: '4px solid #0EA5E9', paddingLeft: '1rem', marginBottom: '1rem', fontSize: '14pt', color: '#0F172A', fontWeight: 'bold' }}>Beschreibung / Feststellungen</h3>
                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '11pt', lineHeight: 1.6, color: '#334155', backgroundColor: 'white', padding: '0 0.5rem' }}>
                                    {formData.description}
                                </div>
                            </div>
                        )}

                        {/* Cause Section */}
                        {reportCause && (
                            <div className="pdf-section" style={{ marginBottom: '2.5rem', breakInside: 'avoid' }}>
                                <h3 style={{ borderLeft: '4px solid #0EA5E9', paddingLeft: '1rem', marginBottom: '1rem', fontSize: '14pt', color: '#0F172A', fontWeight: 'bold' }}>Schadenursache</h3>
                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '11pt', lineHeight: 1.6, color: '#334155', backgroundColor: '#F1F5F9', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #CBD5E1' }}>
                                    {reportCause}
                                </div>
                            </div>
                        )}

                        {/* Equipment Section for Print/PDF */}
                        {formData.equipment && formData.equipment.length > 0 && (
                            <div className="pdf-section" style={{ marginBottom: '2.5rem', breakInside: 'avoid' }}>
                                <h3 style={{ borderLeft: '4px solid #0EA5E9', paddingLeft: '1rem', marginBottom: '1rem', fontSize: '14pt', color: '#0F172A', fontWeight: 'bold' }}>Trocknungsgeräte</h3>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', color: '#64748B', textAlign: 'left' }}>
                                                <th style={{ padding: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>Gerät</th>
                                                <th style={{ padding: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>Raum / Bereich</th>
                                                <th style={{ padding: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>Nr.</th>
                                                <th style={{ padding: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>Start</th>
                                                <th style={{ padding: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>Ende</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {formData.equipment.map((item, idx) => (
                                                <tr key={idx} style={{ borderBottom: idx < formData.equipment.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                                                    <td style={{ padding: '0.75rem', color: '#0F172A', fontWeight: 500 }}>{item.type || 'Trockner'}</td>
                                                    <td style={{ padding: '0.75rem', color: '#334155' }}>
                                                        {item.room}
                                                        {item.apartment && <span style={{ color: '#94A3B8', fontSize: '0.9em', marginLeft: '4px' }}>({item.apartment})</span>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', color: '#64748B' }}>#{item.deviceNumber}</td>
                                                    <td style={{ padding: '0.75rem', color: '#334155' }}>{item.startDate ? new Date(item.startDate).toLocaleDateString('de-DE') : '-'}</td>
                                                    <td style={{ padding: '0.75rem', color: '#334155' }}>
                                                        {item.endDate ? new Date(item.endDate).toLocaleDateString('de-DE') : <span style={{ color: '#10B981', fontWeight: 500 }}>Laufend</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {showEmailImportModal && (
                            <EmailImportModal
                                onClose={() => setShowEmailImportModal(false)}
                                onImport={handleEmailImport}
                            />
                        )}

                        <div className="print-break-inside-avoid">
                            <h3 className="pdf-section" style={{
                                backgroundColor: '#0F172A',
                                color: 'white',
                                padding: '0.75rem 1.5rem',
                                fontSize: '14pt',
                                fontWeight: 'bold',
                                marginBottom: '2rem',
                                borderRadius: '8px'
                            }}>
                                Dokumentation & Bilder
                            </h3>

                            {/* Loop through rooms */}
                            {formData.rooms
                                .filter(room => formData.images.some(img => img.roomId === room.id && img.includeInReport !== false))
                                .map(room => (
                                    <div key={room.id} style={{ marginBottom: '2rem' }}>
                                        <h4 className="pdf-section" style={{
                                            fontSize: '13pt',
                                            color: '#0EA5E9',
                                            fontWeight: 'bold',
                                            marginBottom: '1rem',
                                            paddingBottom: '0.5rem',
                                            borderBottom: '1px solid #E2E8F0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}>
                                            <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#0EA5E9', borderRadius: '50%' }}></span>
                                            {room.apartment ? `${room.apartment} - ` : ''}{room.name}
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                            {formData.images
                                                .filter(img => img.roomId === room.id && img.includeInReport !== false && img.assignedTo !== 'Messprotokolle')
                                                .map((img, idx) => (
                                                    <div key={idx} className="pdf-section" style={{
                                                        breakInside: 'avoid',
                                                        backgroundColor: '#fff',
                                                        borderRadius: '8px',
                                                        overflow: 'hidden',
                                                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                                        border: '1px solid #E2E8F0'
                                                    }}>
                                                        <div style={{
                                                            height: '350px',
                                                            overflow: 'hidden',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            backgroundColor: '#F8FAFC',
                                                            borderBottom: '1px solid #E2E8F0'
                                                        }}>
                                                            <img src={img.preview} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                        </div>
                                                        {img.description && (
                                                            <div style={{ fontSize: '10pt', padding: '0.25rem', fontStyle: 'italic', color: '#555' }}>
                                                                {img.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                ))}


                        </div>
                    </div>
                )
            }
        </>
    )
}
