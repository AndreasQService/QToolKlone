import UploadPanel from "./UploadPanel";
import AiSuggestionsPanel from "./AiSuggestionsPanel";
import { Buffer } from 'buffer';

// Unified Polyfill for @react-pdf and other Node-dependencies in Browser/Vite
if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
    if (typeof window.global === 'undefined') {
        window.global = window;
    }
}

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image, Trash, X, Plus, Edit3, Save, Upload, FileText, CheckCircle, Circle, AlertTriangle, Play, HelpCircle, ArrowLeft, Mail, Map, MapPin, Folder, Mic, Paperclip, Table, Download, Check, Settings, RotateCcw, ChevronDown, ChevronUp, Briefcase, Hammer, ClipboardList, MicOff, Eye, Database, Phone, UserPlus } from 'lucide-react'
import { supabase } from '../supabaseClient';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { swissPLZ } from '../data/swiss_plz';
import { DEVICE_INVENTORY } from '../data/device_inventory';
import { pdf } from '@react-pdf/renderer';
import DamageReportDocument from './pdf/DamageReportDocument';
import html2canvas from 'html2canvas';
import ImageEditor from './ImageEditor';
import EmailImportModal from './EmailImportModalV2';
import OpenAI from "openai";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import CameraCaptureModal from './CameraCaptureModal';
import MeasurementModal from './MeasurementModal';
import { generateMeasurementExcel } from '../utils/MeasurementExcelExporter';

/* Custom PDF Icon */
const PdfIcon = ({ size = 24, style = {} }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="white" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="11" width="18" height="7" rx="1.5" fill="#ef4444" />
        <text x="12" y="15.5" fill="white" fontSize="5.5" fontWeight="900" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>PDF</text>
    </svg>
);

/* Custom VCF Icon */
const VcfIcon = ({ size = 24, style = {} }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="white" stroke="#0F6EA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="#0F6EA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="11" width="18" height="7" rx="1.5" fill="#0F6EA3" />
        <text x="12" y="15.5" fill="white" fontSize="5.5" fontWeight="900" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'Arial, sans-serif', userSelect: 'none' }}>VCF</text>
    </svg>
);

const STEPS = ['Schadenaufnahme', 'Leckortung', 'Trocknung', 'Instandsetzung', 'Abgeschlossen']

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
        const img = new window.Image();
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
    const [caseId, setCaseId] = useState(null);

    const initialAddressParts = parseAddress(initialData?.address);

    const [formData, setFormData] = useState(() => (initialData ? {
        id: initialData.id, // Keep ID if editing
        projectTitle: (initialData.projectTitle && !initialData.projectTitle.startsWith('TMP-')) ? initialData.projectTitle : (initialData.id && !initialData.id.startsWith('TMP-') ? initialData.id : ''),
        client: initialData.client || '',
        locationDetails: initialData.locationDetails || '', // New field for Schadenort (e.g. "Wohnung ...")
        extractedData: initialData?.extractedData || null, // Keep track of AI data if re-editing (unlikely but safe)
        exteriorPhoto: initialData.exteriorPhoto || null, // New field for Exterior Photo
        clientSource: initialData.clientSource || '',
        propertyType: initialData.propertyType || '',
        damageCategory: initialData.damageCategory || 'Wasserschaden',
        assignedTo: initialData.assignedTo || '',
        address: initialData.address || '', // Store full address as fallback
        street: initialData.street || initialAddressParts.street,
        zip: initialData.zip || initialAddressParts.zip,
        city: initialData.city || initialAddressParts.city,
        clientStreet: initialData.clientStreet || '',
        clientZip: initialData.clientZip || '',
        clientCity: initialData.clientCity || '',

        contacts: (initialData?.contacts && initialData.contacts.filter(c => c.name || c.phone).length > 0)
            ? initialData.contacts.filter(c => c.name || c.phone)
            : [
                { apartment: '', name: '', phone: '', role: 'Mieter' },
                { apartment: '', name: '', phone: '', role: 'Mieter' },
                { apartment: '', name: '', phone: '', role: 'Mieter' }
            ],
        notes: initialData?.notes || '',
        documents: initialData?.documents || [],

        damageType: initialData.type || '',
        damageTypeImage: initialData.damageTypeImage || null,
        status: initialData.status || 'Schadenaufnahme',
        cause: initialData.cause || '',
        description: initialData.description || '',
        findings: initialData.findings || '',
        dryingStarted: initialData.dryingStarted || null,
        dryingEnded: initialData.dryingEnded || null,
        equipment: Array.isArray(initialData.equipment) ? initialData.equipment : [],
        images: Array.isArray(initialData.images)
            ? initialData.images.map(img => typeof img === 'string' ? { preview: img, name: 'Existing Image', date: new Date().toISOString() } : img)
            : [],
        projectNumber: initialData.projectNumber || '',
        orderNumber: initialData.orderNumber || '',
        damageNumber: initialData.damageNumber || '',
        insurance: initialData.insurance || '',
        damageReportDate: initialData.damageReportDate || '',
        measures: initialData.measures || '',
        selectedMeasures: Array.isArray(initialData.selectedMeasures) ? initialData.selectedMeasures : [],
        rooms: Array.isArray(initialData.rooms) ? initialData.rooms : []
    } : {
        id: null,
        projectTitle: '',
        projectNumber: '',
        orderNumber: '',
        damageNumber: '',
        insurance: '',
        damageReportDate: '',
        client: '',
        locationDetails: '',
        clientSource: '',
        propertyType: '',
        damageCategory: 'Wasserschaden',
        assignedTo: '',
        street: '',
        zip: '',
        city: '',
        clientStreet: '',
        clientZip: '',
        clientCity: '',
        // address: '',
        contacts: [
            { apartment: '', name: '', phone: '', role: 'Mieter' },
            { apartment: '', name: '', phone: '', role: 'Mieter' },
            { apartment: '', name: '', phone: '', role: 'Mieter' }
        ],
        notes: '',
        documents: [],
        damageType: '',
        damageTypeImage: null,
        status: 'Schadenaufnahme',
        cause: '',
        description: '',
        findings: '',
        dryingStarted: null,
        dryingEnded: null,
        equipment: [],
        images: [],
        exteriorPhoto: null,
        measures: '',
        selectedMeasures: [],
        rooms: []
    }));

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [visibleRoomImages, setVisibleRoomImages] = useState({}); // Stores roomId -> boolean for toggle


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

    // Measures State
    const [showMeasuresDropdown, setShowMeasuresDropdown] = useState(false);
    const [isListeningMeasures, setIsListeningMeasures] = useState(false);
    const recognitionRefMeasures = useRef(null);

    const toggleMeasuresListening = () => {
        if (isListeningMeasures) {
            recognitionRefMeasures.current?.stop();
            setIsListeningMeasures(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Ihr Browser unterstützt keine Spracherkennung.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onstart = () => setIsListeningMeasures(true);
        recognition.onend = () => setIsListeningMeasures(false);
        recognition.onerror = (event) => {
            console.error("Speech error", event.error);
            setIsListeningMeasures(false);
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
                const current = formData.measures ? formData.measures + ' ' : '';
                setFormData(prev => ({ ...prev, measures: current + transcript }));
            }
        };

        recognitionRefMeasures.current = recognition;
        recognition.start();
    };

    const addMeasure = (text) => {
        const current = formData.measures ? formData.measures + '\n' : '';
        setFormData(prev => ({ ...prev, measures: current + text }));
        setShowMeasuresDropdown(false);
    };

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

    // Ensure at least 3 contacts exist (User request: always show 3 tiles)
    // IMPORTANT: Only do this in desktop mode. Technician/mobile mode should be clean.
    useEffect(() => {
        if (mode === 'desktop' && formData.contacts && formData.contacts.length < 3) {
            setFormData(prev => {
                const current = prev.contacts || [];
                if (current.length >= 3) return prev;
                const needed = 3 - current.length;
                const extras = Array(needed).fill(null).map(() => ({
                    name: '', role: 'Mieter', apartment: '', floor: '', phone: ''
                }));
                return { ...prev, contacts: [...current, ...extras] };
            });
        }
    }, [formData.contacts, mode]);

    const [newRoom, setNewRoom] = useState({
        name: '',
        apartment: '',
        stockwerk: '',
        customName: ''
    })

    const [showImageSelector, setShowImageSelector] = useState(false);
    const [globalPreviewImage, setGlobalPreviewImage] = useState(null);
    // const dialogRef = useRef(null); // Unused

    useEffect(() => {
        // Vanilla JS implementation to guarantee overlay visibility
        const currentOverlay = document.getElementById('manual-lightbox');
        if (currentOverlay) currentOverlay.remove();

        if (globalPreviewImage) {
            const div = document.createElement('div');
            div.id = 'manual-lightbox';
            Object.assign(div.style, {
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                zIndex: '2147483647',
                backgroundColor: 'rgba(0,0,0,0.95)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
            });

            const img = document.createElement('img');
            img.src = globalPreviewImage;
            img.alt = "Große Ansicht";
            Object.assign(img.style, {
                maxWidth: '98vw', maxHeight: '98vh',
                objectFit: 'contain',
                boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                cursor: 'default',
                borderRadius: '4px'
            });
            img.onclick = (e) => e.stopPropagation();

            const closeBtn = document.createElement('div');
            closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
            Object.assign(closeBtn.style, {
                position: 'absolute', top: '20px', right: '20px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '50%', width: '50px', height: '50px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: '2147483648'
            });
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                setGlobalPreviewImage(null);
            };

            div.onclick = () => setGlobalPreviewImage(null);

            div.appendChild(img);
            div.appendChild(closeBtn);
            document.body.appendChild(div);
        }

        return () => {
            const existing = document.getElementById('manual-lightbox');
            if (existing) existing.remove();
        };
    }, [globalPreviewImage]);

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

    // AI Extraction State
    const [extractedData, setExtractedData] = useState(null);

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

    // useEffect(() => {
    //     if (showEmailImportModal) {
    //         refreshAudioDevices();
    //     }
    // }, [showEmailImportModal]);

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

    // AUTO-SAVE: Save formData 1 second after last change
    // AND save on unmount/unfocus to prevent data loss

    // Ref to hold latest formData for unmount cleanup
    const latestFormData = useRef(formData);
    // Ref to hold last successfully saved data to prevent loops
    const lastSavedData = useRef(formData);

    useEffect(() => {
        latestFormData.current = formData;
    }, [formData]);

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

    const downloadVCard = (contact) => {
        const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:${contact.name || 'Unbekannt'}
TEL;TYPE=CELL:${contact.phone || ''}
NOTE:Wohnung: ${contact.apartment || ''}, Rolle: ${contact.role || ''}
END:VCARD`;
        const blob = new Blob([vCardData], { type: 'text/vcard' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${contact.name || 'kontakt'}.vcf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
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
            const fileExt = file.name.split('.').pop().toLowerCase();
            const isDoc = ['pdf', 'msg', 'txt'].includes(fileExt);

            // Basic metadata
            const imageEntry = {
                id: tempId,
                file, // Keep file for potential retry or local usage
                preview: previewUrl,
                name: file.name,
                date: new Date().toISOString(),
                ...contextData,
                includeInReport: true, // Default to true
                uploading: true, // Mark as uploading
                type: isDoc ? 'document' : 'image',
                fileType: fileExt
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
        e.stopPropagation();

        // Reset styles
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.backgroundColor = 'transparent';

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
            addMetaRow(2, 'Auftraggeber:', `${formData.client || ''} ${formData.clientStreet ? ', ' + formData.clientStreet : ''} ${formData.clientZip ? ', ' + formData.clientZip : ''} ${formData.clientCity ? ' ' + formData.clientCity : ''}`.trim());
            addMetaRow(3, 'Objekt:', formData.projectTitle || '');
            addMetaRow(4, 'Schadenort:', formData.locationDetails || '');
            addMetaRow(5, 'Strasse:', formData.street || '');
            addMetaRow(6, 'Ort:', `${formData.zip || ''} ${formData.city || ''}`);
            addMetaRow(7, 'Raum:', room.name);
            addMetaRow(8, 'Messmittel:', settings.device || 'Checkatrade');

            // --- Table Header (Row 9 & 10) ---
            const hRowIdx = 9;
            const subHRowIdx = 10;
            const dataRowIdx = 11;

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
    // --- PDF Export (Unified Vector Report - @react-pdf) ---
    const generatePDFExport = async (customFormData = null) => {
        const dataToUse = customFormData || formData;
        setIsGeneratingPDF(true);

        const urlToDataUrl = async (url, imgObj = null) => {
            if (!url) return null;

            const resizeImage = async (dataUrl) => {
                if (!dataUrl) return null;
                return new Promise((resolve) => {
                    const img = new window.Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        const MAX_SIZE = 800; // Even more conservative
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                        } else {
                            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.6));
                    };
                    img.onerror = () => resolve(dataUrl.startsWith('data:') ? dataUrl : null);
                    img.src = dataUrl;
                });
            };

            // Force resize even for data URLs to prevent memory issues
            if (url.startsWith('data:')) return await resizeImage(url);

            // Method A: Supabase
            if (supabase && (url.includes('supabase.co') || imgObj?.storagePath)) {
                try {
                    let path = imgObj?.storagePath || (url.includes('damage-images/') ? url.split('damage-images/')[1]?.split('?')[0] : null);
                    if (path) {
                        const { data, error } = await supabase.storage.from('damage-images').download(path);
                        if (data && !error) {
                            const raw = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(data);
                            });
                            return await resizeImage(raw);
                        }
                    }
                } catch (e) { console.warn("PDF GEN: Supabase error", e); }
            }

            // Method B: Fetch (Standard)
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (response.ok) {
                    const blob = await response.blob();
                    const raw = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    return await resizeImage(raw);
                }
            } catch (err) { /* silent fail, try next */ }

            // Method C: Canvas Backup (CORS fallback)
            try {
                const raw = await new Promise((resolve) => {
                    const img = new window.Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg', 0.9));
                        } catch (e) { resolve(null); }
                    };
                    img.onerror = () => resolve(null);
                    img.src = url;
                });
                if (raw) return await resizeImage(raw);
            } catch (err) { }
            return await resizeImage(url);
        };

        try {
            // Load Logo - High Quality Original
            let logoData = null;
            try {
                const logoResp = await fetch(window.location.origin + '/logo.png');
                if (logoResp.ok) {
                    const blob = await logoResp.blob();
                    logoData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
            } catch (e) { console.error("Logo load error", e); }

            // Pre-process images - Filter out PDFs and non-renderable documents
            console.log("PDF GEN: Starting image processing...");
            const tempProcessedImages = await Promise.all(
                (dataToUse.images || []).map(async (img) => {
                    const category = String(img.assignedTo || '').trim().toLowerCase();
                    const isDocCategory = ['schadensbericht', 'arbeitsrapporte', 'messprotokolle'].includes(category);
                    const isProbablyPDF = img.preview?.toLowerCase().includes('.pdf') || img.type?.includes('pdf');

                    if (img.includeInReport === false || isDocCategory || isProbablyPDF) {
                        return { ...img, isRenderable: false };
                    }

                    try {
                        const base64 = await urlToDataUrl(img.preview, img);
                        if (base64) {
                            return { ...img, preview: base64, isRenderable: true };
                        } else {
                            return { ...img, isRenderable: false };
                        }
                    } catch (e) {
                        return { ...img, isRenderable: false };
                    }
                })
            );

            // Final list for the PDF Document (only images)
            const processedImages = tempProcessedImages.filter(img => img.isRenderable);

            console.log("PDF GEN: Image processing phase complete.");
            console.table(processedImages.map(img => ({
                id: img.id,
                category: img.assignedTo,
                dataLength: img.preview?.startsWith('data:') ? img.preview.length : 'URL'
            })));

            // Process Hero Images (Cause Photos marked for report)
            const causePhotos = processedImages.filter(img => img.assignedTo === 'Schadenfotos' && img.includeInReport !== false);
            const processedHeroImages = causePhotos.map(img => img.preview);

            // Process Exterior Photo
            let processedExteriorPhoto = dataToUse.exteriorPhoto;
            if (processedExteriorPhoto) {
                try {
                    const base64Exterior = await urlToDataUrl(processedExteriorPhoto);
                    if (base64Exterior) processedExteriorPhoto = base64Exterior;
                } catch (e) { console.warn("Failed to convert exterior photo:", e); }
            }

            // Prepare Data for Document Component
            const docData = {
                ...dataToUse,
                damageType: dataToUse.damageCategory || '-',
                images: processedImages,
                damageTypeImages: processedHeroImages, // All selected cause photos
                damageTypeImage: processedHeroImages[0] || null, // Primary one for fallback
                exteriorPhoto: processedExteriorPhoto,
                logo: logoData,
            };

            // Generate Blob using @react-pdf
            const blob = await pdf(<DamageReportDocument key={Math.random()} data={docData} />).toBlob();
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
            const dateStr = now.toLocaleDateString('de-CH').replace(/\./g, '-');
            const projNum = dataToUse.projectNumber || dataToUse.projectTitle || 'Project';
            const location = dataToUse.locationDetails || dataToUse.city || 'Schadenort';
            const fileName = `${projNum}_${location}_${dateStr}_${timeStr}.pdf`;

            // 1. Download File
            saveAs(blob, fileName);

            // 2. Upload to Supabase / App State
            const file = new File([blob], fileName, { type: 'application/pdf' });
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
                const projNum = formData.projectNumber || formData.projectTitle || 'Project';
                const location = formData.locationDetails || formData.city || 'Schadenort';
                const now = new Date();
                const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
                const dateStr = now.toLocaleDateString('de-CH').replace(/\./g, '-');
                const fileName = `${projNum}_${location}_${dateStr}_${timeStr}.pdf`;
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
        console.log("handleEmailImport called with:", data);
        if (!data) return;

        // Enhanced Logic: Filter out "Verwaltung" from contacts if mapped to assignedTo
        let importContacts = [...(data.contacts || [])];
        let importManager = data.manager;

        // Find "Verwaltung" contact to merge/remove
        const adminIndex = importContacts.findIndex(c =>
            c.role === 'Verwaltung' || (importManager && c.name && c.name.toLowerCase().includes(importManager.toLowerCase()))
        );

        if (adminIndex !== -1) {
            const adminC = importContacts[adminIndex];
            // Construct detailed string: Name, Tel, Email
            // Only add if not already present in the string
            if (!importManager) importManager = adminC.name;

            if (adminC.phone && (!importManager || !importManager.includes(adminC.phone))) {
                importManager = (importManager ? importManager + ", " : "") + adminC.phone;
            }
            if (adminC.email && (!importManager || !importManager.includes(adminC.email))) {
                importManager = (importManager ? importManager + ", " : "") + adminC.email;
            }

            // Remove from list to avoid duplication
            importContacts.splice(adminIndex, 1);
        }

        setFormData(prev => {
            const newContacts = [
                ...(prev.contacts || []),
                ...importContacts
            ];

            return {
                ...prev,
                projectTitle: data.projectTitle || prev.projectTitle,
                client: data.client || prev.client,
                assignedTo: importManager || prev.assignedTo,
                description: data.description ? (prev.description ? prev.description + '\n\n' + data.description : data.description) : prev.description,
                street: data.street || prev.street,
                zip: data.zip || prev.zip,
                city: data.city || prev.city,
                clientStreet: data.clientStreet || prev.clientStreet,
                clientZip: data.clientZip || prev.clientZip,
                clientCity: data.clientCity || prev.clientCity,
                contacts: newContacts
            };
        });
        setShowEmailImport(false);
    };

    const handlePDFClick = () => {

        setShowReportModal(true);
    }




    // Calculate drying summary
    const finishedDrying = formData.equipment.filter(d => d.endDate && d.counterEnd);
    const totalDryingHours = finishedDrying.reduce((acc, curr) => acc + (parseFloat(curr.hours) || 0), 0);
    const totalDryingKwh = finishedDrying.reduce((acc, curr) => acc + ((parseFloat(curr.counterEnd) || 0) - (parseFloat(curr.counterStart) || 0)), 0);

    return (
        <>
            <div className="card" style={{ maxWidth: mode === 'desktop' ? '1000px' : '600px', margin: '0 auto', padding: '1.5rem' }}>
                {/* REMOVED DUPLICATE EmailImportModal FROM HERE */}

                {/* Project & Order Numbers Row */}
                {/* Top Meta info (Desktop only) */}
                {mode === 'desktop' && (
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '0.75rem 1.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>PROJEKT-NR:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.02)', fontWeight: 700, width: '100%', minWidth: 0 }}
                                    value={formData.projectNumber || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData(prev => {
                                            const updates = { projectNumber: val };
                                            if (!prev.projectTitle || prev.projectTitle.startsWith('TMP-')) {
                                                updates.projectTitle = val;
                                            }
                                            return { ...prev, ...updates };
                                        });
                                    }}
                                    placeholder="W-25..."
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>AUFTRAGSNUMMER:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.02)', width: '100%', minWidth: 0 }}
                                    value={formData.orderNumber || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                                    placeholder="Nr."
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>SCHADEN-NR:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.02)', width: '100%', minWidth: 0 }}
                                    value={formData.damageNumber || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, damageNumber: e.target.value }))}
                                    placeholder="Versicherung Nr."
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>VERSICHERUNG:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.02)', width: '100%', minWidth: 0 }}
                                    value={formData.insurance || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, insurance: e.target.value }))}
                                    placeholder="Gesellschaft"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>SCHADENSMELDUNG:</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.02)', width: '100%', minWidth: 0 }}
                                    value={formData.damageReportDate || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, damageReportDate: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                        <button
                            onClick={onCancel}
                            className="btn-glass"
                            style={{
                                width: '42px',
                                height: '42px',
                                padding: 0,
                                borderRadius: '12px',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <ArrowLeft size={22} />
                        </button>
                        <input
                            type="text"
                            value={(formData.projectTitle && !formData.projectTitle.startsWith('TMP-')) ? formData.projectTitle : (formData.projectNumber || '')}
                            onChange={(e) => setFormData(prev => ({ ...prev, projectTitle: e.target.value }))}
                            placeholder={formData.projectNumber || "Projekttitel eingeben..."}
                            className="text-gradient"
                            style={{
                                fontSize: '1.5rem',
                                fontWeight: 800,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-main)',
                                width: '100%',
                                padding: '0.25rem 0',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {mode === 'desktop' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Sachbearbeiter</label>
                                <select
                                    className="form-input"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem', width: 'auto', fontWeight: 600 }}
                                    value={formData.clientSource || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientSource: e.target.value }))}
                                >
                                    <option value="">Wählen...</option>
                                    <option value="Xhemil Ademi">Xhemil Ademi</option>
                                    <option value="Adi Shala">Adi Shala</option>
                                    <option value="Andreas Strehler">Andreas Strehler</option>
                                    <option value="André Rothfuchs">André Rothfuchs</option>
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Projektstatus</label>
                            <select
                                className="form-input"
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.85rem',
                                    width: 'auto',
                                    fontWeight: 700,
                                    border: `1.5px solid ${statusColors[formData.status || 'Pendent'] || '#94A3B8'}`,
                                    color: statusColors[formData.status || 'Pendent'] || '#94A3B8',
                                    backgroundColor: 'rgba(255,255,255,0.02)'
                                }}
                                value={formData.status}
                                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                            >
                                {Object.keys(statusColors).map(status => (
                                    <option key={status} value={status} style={{ color: '#000' }}>{status}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>










                {/* File Upload Panel & AI Suggestions - ONLY DESKTOP */}
                {mode === 'desktop' && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <UploadPanel
                            caseId={formData.id}
                            onCaseCreated={(newId) => setFormData(prev => ({ ...prev, id: newId }))}
                            onExtractionComplete={(data) => {
                                console.log("Extraction complete, applying data direct:", data);
                                handleEmailImport(data);
                            }}
                            onImagesUploaded={(newImages) => {
                                setFormData(prev => ({
                                    ...prev,
                                    images: [...(prev.images || []), ...newImages]
                                }));
                            }}
                        />

                        {/* AI Suggestions Confirmation Panel */}
                        {extractedData && (
                            <AiSuggestionsPanel
                                extractedData={extractedData}
                                currentFormData={formData}
                                onDismiss={() => setExtractedData(null)}
                                onApplyField={(field, value) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        [field]: value
                                    }));
                                    // Remove field from suggestions after applying? Or keep until dismissed?
                                    // Usually better to keep it visible so user knows what came from AI
                                }}
                                onApplyAll={(allData) => {
                                    console.log("Applying all AI data:", allData);
                                    handleEmailImport(allData); // Reuse existing import logic
                                    setExtractedData(null); // Close panel
                                }}
                            />
                        )}
                    </div>
                )}

                {/* 1a. Project Details (Client / Manager) - ONLY DESKTOP */}
                {mode === 'desktop' && (
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <h3 className="section-header">
                            <Briefcase size={18} /> Auftrag & Verwaltung
                        </h3>

                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Auftraggeber (Name/Firma)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.client || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, client: e.target.value }))}
                                    placeholder="Name oder Firma des Auftraggebers"
                                    style={{ width: '100%', fontWeight: 600 }}
                                />
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Strasse & Nr. (AG)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.clientStreet || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientStreet: e.target.value }))}
                                    placeholder="Strasse / Nr."
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ width: '90px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>PLZ (AG)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.clientZip || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientZip: e.target.value }))}
                                    placeholder="PLZ"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ flex: '1 1 150px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Ort (AG)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.clientCity || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientCity: e.target.value }))}
                                    placeholder="Ort"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Bewirtschaftung</label>
                                <select
                                    className="form-input"
                                    value={formData.assignedTo || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Bitte wählen...</option>
                                    <option value="Valdrin Shala">Valdrin Shala</option>
                                    <option value="Wincasa">Wincasa</option>
                                    <option value="Livit">Livit</option>
                                    <option value="Privera">Privera</option>
                                </select>
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Sachbearbeiter</label>
                                <select
                                    className="form-input"
                                    value={formData.clientSource || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientSource: e.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Bitte wählen...</option>
                                    <option value="Xhemil Ademi">Xhemil Ademi</option>
                                    <option value="Adi Shala">Adi Shala</option>
                                    <option value="Andreas Strehler">Andreas Strehler</option>
                                    <option value="André Rothfuchs">André Rothfuchs</option>
                                </select>
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Leistungsart</label>
                                <select
                                    className="form-input"
                                    value={formData.damageCategory || 'Wasserschaden'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, damageCategory: e.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="Wasserschaden">Wasserschaden</option>
                                    <option value="Schimmel">Schimmel</option>
                                    <option value="Leckortung">Leckortung</option>
                                    <option value="Trocknung">Trocknung</option>
                                </select>
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Art der Liegenschaft</label>
                                <select
                                    className="form-input"
                                    value={formData.propertyType || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, propertyType: e.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Bitte wählen...</option>
                                    <option value="Einfamilienhaus">Einfamilienhaus</option>
                                    <option value="Mehrfamilienhaus">Mehrfamilienhaus</option>
                                    <option value="Eigentumswohnung">Eigentumswohnung</option>
                                    <option value="Gewerbe / Büro">Gewerbe / Büro</option>
                                    <option value="Sonstiges">Sonstiges</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Address Text Details */}
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <h3 className="section-header">
                        <MapPin size={18} /> Schadenort (Adresse)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Project Number Reference */}
                        <div style={{ marginBottom: '0.25rem' }}>
                            <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>PROJEKT-NR</label>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--q-primary)', letterSpacing: '0.02em' }}>
                                {formData.projectNumber || '---'}
                            </div>
                        </div>

                        {/* Location Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Objekt / Wohnung</label>
                            <input
                                className="form-input"
                                placeholder="Zusatz (z.B. 2. OG links)"
                                value={formData.locationDetails || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, locationDetails: e.target.value }))}
                                style={{ width: '100%', fontSize: '0.95rem', fontWeight: 600 }}
                            />
                        </div>

                        {/* Street */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Strasse & Nr.</label>
                            <input
                                className="form-input"
                                placeholder="Strasse & Nr."
                                value={formData.street || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                                style={{ width: '100%', fontSize: '0.95rem' }}
                            />
                        </div>

                        {/* Zip and City */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <div style={{ width: '100px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>PLZ</label>
                                <input
                                    list="plz-list-mobile"
                                    className="form-input"
                                    placeholder="PLZ"
                                    value={formData.zip || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const match = swissPLZ.find(entry => entry.plz === val.trim());
                                        if (match) {
                                            setFormData(prev => ({ ...prev, zip: val, city: match.city }));
                                        } else {
                                            setFormData(prev => ({ ...prev, zip: val }));
                                        }
                                    }}
                                    style={{ width: '100%', fontSize: '0.95rem' }}
                                />
                            </div>
                            <datalist id="plz-list-mobile">
                                {swissPLZ.map((entry, idx) => (
                                    <option key={idx} value={entry.plz}>{entry.city}</option>
                                ))}
                            </datalist>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Ort</label>
                                <input
                                    className="form-input"
                                    placeholder="Ort"
                                    value={formData.city || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                                    style={{ width: '100%', fontSize: '0.95rem' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Technician: Schadenbeschreibung & Bilder (KI / Meldung) */}
                {mode === 'technician' && (
                    <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={18} /> Schadenbeschreibung (KI / Meldung)
                        </h3>
                        <div style={{ backgroundColor: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                            <textarea
                                className="form-input"
                                value={formData.description || ''}
                                readOnly={true}
                                placeholder="Beschrieb aus der Meldung..."
                                style={{
                                    width: '100%', minHeight: '100px',
                                    backgroundColor: 'transparent', border: 'none',
                                    resize: 'none',
                                    fontFamily: 'inherit', color: 'var(--text-main)',
                                    cursor: 'default'
                                }}
                            />
                        </div>

                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Image size={18} /> Schadensbilder (Meldung)
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', backgroundColor: 'var(--surface)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            {formData.images && formData.images.filter(img => {
                                const isDoc = img.type === 'document' ||
                                    img.name?.toLowerCase().endsWith('.msg') ||
                                    img.name?.toLowerCase().endsWith('.pdf') ||
                                    img.name?.toLowerCase().endsWith('.txt');
                                return img && !img.roomId && !isDoc;
                            }).map((img, idx) => (
                                <div key={idx}
                                    style={{
                                        width: '80px', height: '80px', borderRadius: '4px', overflow: 'hidden',
                                        border: '1px solid var(--border)', cursor: 'pointer'
                                    }}
                                    onClick={() => setGlobalPreviewImage(img.preview)}
                                >
                                    <img src={img.preview} alt="Schadensbild" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                            {(!formData.images || formData.images.filter(img => !img.roomId && !(img.type === 'document' || img.name?.toLowerCase().endsWith('.msg') || img.name?.toLowerCase().endsWith('.pdf') || img.name?.toLowerCase().endsWith('.txt'))).length === 0) && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', width: '100%', textAlign: 'center', padding: '1rem' }}>Keine Bilder vorhanden.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Desktop-Only: Schadenbeschreibung (AI Extracted) */}
                {mode === 'desktop' && (
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                                <FileText size={18} /> Schadenbeschreibung (KI / Meldung)
                            </h3>
                        </div>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Beschrieb aus der Meldung..."
                            style={{
                                width: '100%',
                                minHeight: '150px',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                color: 'var(--text-main)',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                fontSize: '1rem',
                                lineHeight: 1.6,
                                marginBottom: '1.5rem',
                                boxSizing: 'border-box'
                            }}
                        />

                        {/* Schadensbilder Upload */}
                        <div>
                            <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <Image size={16} /> Zugehörige Schadensbilder
                            </label>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                {formData.images && Array.isArray(formData.images) && formData.images.filter(img => {
                                    const isDoc = img.type === 'document' ||
                                        img.name?.toLowerCase().endsWith('.msg') ||
                                        img.name?.toLowerCase().endsWith('.pdf') ||
                                        img.name?.toLowerCase().endsWith('.txt');
                                    return img && !img.roomId && !isDoc;
                                }).map((img, idx) => (
                                    <div key={idx}
                                        className="btn-glass"
                                        style={{
                                            position: 'relative', width: '100px', height: '100px', borderRadius: '12px', overflow: 'hidden',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                        onClick={() => setGlobalPreviewImage(img.preview)}
                                    >
                                        <img
                                            src={img.preview}
                                            alt="Schadensbild"
                                            className="hover-zoom"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute', inset: 0,
                                                zIndex: 5, cursor: 'zoom-in'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setGlobalPreviewImage(img.preview);
                                            }}
                                            title="Vergrößern"
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFormData(prev => ({
                                                    ...prev,
                                                    images: prev.images.filter(i => i !== img)
                                                }));
                                            }}
                                            style={{
                                                position: 'absolute', top: 6, right: 6,
                                                background: 'rgba(239, 68, 68, 0.9)', color: 'white',
                                                border: 'none', borderRadius: '50%',
                                                width: 24, height: 24,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', padding: 0,
                                                zIndex: 10,
                                                backdropFilter: 'blur(4px)'
                                            }}
                                            title="Löschen"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}

                                <label style={{
                                    width: '90px', height: '90px',
                                    border: '1px dashed var(--border)', borderRadius: '8px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', backgroundColor: 'var(--surface-hover)',
                                    fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center',
                                    transition: 'all 0.2s'
                                }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(14, 165, 233, 0.1)'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                                >
                                    <Plus size={20} />
                                    <span>Bild add.</span>
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            if (!e.target.files?.length) return;
                                            const files = Array.from(e.target.files);

                                            // Ensure ID exists
                                            let currentId = formData.id;
                                            if (!currentId) {
                                                currentId = "TMP-" + Date.now();
                                                setFormData(prev => ({ ...prev, id: currentId }));
                                            }

                                            for (const file of files) {
                                                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                                                const filePath = `cases/${currentId}/images/${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

                                                try {
                                                    // Upload
                                                    const { error: uploadError } = await supabase.storage
                                                        .from("case-files")
                                                        .upload(filePath, file);

                                                    if (uploadError) throw uploadError;

                                                    // Get Public URL
                                                    const { data: { publicUrl } } = supabase.storage
                                                        .from("case-files")
                                                        .getPublicUrl(filePath);

                                                    // Add to formData
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        images: [...(prev.images || []), {
                                                            preview: publicUrl,
                                                            name: file.name,
                                                            description: 'Initialbild (Mail)',
                                                            date: new Date().toISOString(),
                                                            roomId: null // Global / Initial
                                                        }]
                                                    }));
                                                } catch (err) {
                                                    console.error("Image upload failed", err);
                                                    alert("Fehler beim Bilder-Upload: " + err.message);
                                                }
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Dokumente & Anhänge Section */}
                        {formData.images && formData.images.some(img => img && !img.roomId && (img.type === 'document' || img.name?.toLowerCase().endsWith('.pdf') || img.name?.toLowerCase().endsWith('.msg') || img.name?.toLowerCase().endsWith('.txt'))) && (
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                <label style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                                    <FileText size={18} /> Dokumente & Anhänge (PDF, MSG)
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    {formData.images.filter(img => {
                                        const isDoc = img.type === 'document' ||
                                            img.name?.toLowerCase().endsWith('.msg') ||
                                            img.name?.toLowerCase().endsWith('.pdf') ||
                                            img.name?.toLowerCase().endsWith('.txt');
                                        return img && !img.roomId && isDoc;
                                    }).map((img, idx) => (
                                        <div key={idx}
                                            style={{
                                                position: 'relative', width: '140px', height: '90px', borderRadius: '8px', overflow: 'hidden',
                                                border: '1px solid var(--border)', cursor: 'pointer',
                                                backgroundColor: 'rgba(255,255,255,0.03)',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                padding: '0.5rem', transition: 'all 0.2s'
                                            }}
                                            onClick={() => window.open(img.preview, '_blank')}
                                            title={img.name}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                                        >
                                            {(img.name?.toLowerCase().endsWith('.pdf') || img.fileType === 'pdf') ?
                                                <PdfIcon size={28} /> :
                                                (img.name?.toLowerCase().endsWith('.msg') ? <Mail size={28} color="var(--primary)" /> : <FileText size={28} color="var(--primary)" />)
                                            }
                                            <div style={{ fontSize: '0.7rem', marginTop: 6, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', color: 'var(--text-main)', fontWeight: 500 }}>
                                                {img.name}
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        images: prev.images.filter(i => i !== img)
                                                    }));
                                                }}
                                                style={{
                                                    position: 'absolute', top: 4, right: 4,
                                                    background: 'rgba(0,0,0,0.4)', color: '#ef4444',
                                                    border: 'none', borderRadius: '50%',
                                                    width: 22, height: 22,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', padding: 0
                                                }}
                                                title="Löschen"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Container for Map & Exterior Photo (Side-by-Side) */}
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '1.5rem' }}>
                    {/* Map Card */}
                    <div className="card" style={{ flex: '1 1 350px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                            <MapPin size={18} /> Standort Karte
                        </h3>

                        {(formData.street || formData.address) ? (
                            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', flex: 1 }}>
                                <iframe
                                    width="100%"
                                    height="300"
                                    style={{ border: 0, display: 'block', filter: 'grayscale(0.2) contrast(1.1)' }}
                                    loading="lazy"
                                    allowFullScreen
                                    src={`https://maps.google.com/maps?q=${encodeURIComponent(formData.street ? `${formData.street}, ${formData.zip} ${formData.city}` : formData.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                    title="Standort Karte"
                                ></iframe>

                                {!formData.exteriorPhoto && (
                                    <label
                                        style={{
                                            position: 'absolute',
                                            bottom: '15px',
                                            right: '15px',
                                            backgroundColor: 'var(--primary)',
                                            color: 'white',
                                            padding: '0.6rem 1.2rem',
                                            borderRadius: '99px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem',
                                            cursor: 'pointer',
                                            boxShadow: '0 10px 15px -3px rgba(14, 165, 233, 0.4)',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            zIndex: 10,
                                            transition: 'all 0.2s'
                                        }}
                                        className="btn-primary"
                                        title="Aussenaufnahme hinzufügen"
                                    >
                                        <Camera size={18} />
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
                        ) : (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                                <Map size={32} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                                Keine Koordinaten verfügbar
                            </div>
                        )}
                    </div>

                    {/* 1b. Exterior Photo (Aussenaufnahme) - Show only if exists */}
                    {formData.exteriorPhoto && (
                        <div className="card" style={{ flex: '1 1 350px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                                <Camera size={18} /> Aussenaufnahme
                            </h3>

                            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <img
                                    src={formData.exteriorPhoto}
                                    alt="Aussenaufnahme"
                                    style={{ width: '100%', height: '300px', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                                    className="hover-zoom"
                                />
                                <button
                                    type="button"
                                    onClick={removeExteriorPhoto}
                                    style={{
                                        position: 'absolute',
                                        top: '15px',
                                        right: '15px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '36px',
                                        height: '36px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
                                        backdropFilter: 'blur(4px)',
                                        zIndex: 10
                                    }}
                                    title="Foto entfernen"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Contacts */}
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                            <Folder size={18} /> Kontakte
                        </h3>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: mode === 'desktop' ? 'repeat(3, 1fr)' : '1fr',
                        gap: '1.25rem'
                    }}>
                        {formData.contacts.map((contact, idx) => (
                            <div key={idx} className="glass-card" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem',
                                padding: '1.5rem',
                                position: 'relative',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                minWidth: 0
                            }}>
                                {/* Row 1: Name & vCard (Blue Button) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 750 }}>Name</label>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
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
                                            style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1, padding: '0.55rem 0.7rem', minWidth: 0 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => downloadVCard(contact)}
                                            className="btn-glass"
                                            style={{
                                                padding: '0 0.5rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: 'rgba(15, 110, 163, 0.15)',
                                                border: '1px solid rgba(15, 110, 163, 0.25)',
                                                color: '#0F6EA3',
                                                flexShrink: 0
                                            }}
                                            title="vCard downloaden"
                                        >
                                            <VcfIcon size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* Row 2: Etage / Rolle (STRICTLY ON ONE ROW) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 750 }}>Etage / Rolle</label>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
                                        gap: '0.4rem',
                                        alignItems: 'center',
                                        width: '100%'
                                    }}>
                                        <input
                                            type="text"
                                            placeholder="Etage"
                                            className="form-input"
                                            value={contact.floor || ''}
                                            onChange={(e) => {
                                                const newContacts = [...formData.contacts];
                                                newContacts[idx].floor = e.target.value;
                                                setFormData({ ...formData, contacts: newContacts });
                                            }}
                                            style={{
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                padding: '0.55rem 0.6rem',
                                                width: '100%',
                                                minWidth: 0
                                            }}
                                        />
                                        <select
                                            className="form-input"
                                            value={contact.role || 'Mieter'}
                                            onChange={(e) => {
                                                const newContacts = [...formData.contacts];
                                                newContacts[idx].role = e.target.value;
                                                setFormData({ ...formData, contacts: newContacts });
                                            }}
                                            style={{
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                padding: '0.55rem 0.3rem',
                                                width: '100%',
                                                minWidth: 0,
                                                textAlign: 'center'
                                            }}
                                        >
                                            <option value="Mieter">Mieter</option>
                                            <option value="Eigentümer">Eig.</option>
                                            <option value="Hauswart">HW</option>
                                            <option value="Verwaltung">Verw.</option>
                                            <option value="Handwerker">Handw.</option>
                                            <option value="Sonstiges">Sonst.</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Row 3: Telefon */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <label style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 750 }}>Telefon</label>
                                    <input
                                        type="text"
                                        placeholder="+41 79 123 45 67"
                                        className="form-input"
                                        value={contact.phone}
                                        onChange={(e) => {
                                            const newContacts = [...formData.contacts];
                                            newContacts[idx].phone = e.target.value;
                                            setFormData({ ...formData, contacts: newContacts });
                                        }}
                                        onBlur={(e) => {
                                            let val = e.target.value.replace(/\s+/g, '');
                                            if (val.match(/^0\d{9}$/)) {
                                                val = '+41' + val.substring(1);
                                            }
                                            if (val.match(/^\+41\d{9}$/)) {
                                                val = val.replace(/(\+41)(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
                                            }
                                            else if (val.match(/^\+41\d{8}$/)) {
                                                val = val.replace(/(\+41)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
                                            }
                                            if (val !== e.target.value) {
                                                const newContacts = [...formData.contacts];
                                                newContacts[idx].phone = val;
                                                setFormData({ ...formData, contacts: newContacts });
                                            }
                                        }}
                                        style={{ width: '100%', fontSize: '0.95rem', fontWeight: 600, padding: '0.55rem 0.7rem' }}
                                    />
                                </div>

                                {/* Action Buttons Row (Bottom Right) */}
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
                                    {/* Call Button */}
                                    <a
                                        href={contact.phone ? `tel:${contact.phone}` : '#'}
                                        className="btn-glass"
                                        style={{
                                            padding: '0.45rem',
                                            borderRadius: '8px',
                                            color: '#10B981',
                                            cursor: contact.phone ? 'pointer' : 'default',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: contact.phone ? 1 : 0.3,
                                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                            border: '1px solid rgba(16, 185, 129, 0.15)'
                                        }}
                                        title="Anrufen"
                                    >
                                        <Phone size={16} />
                                    </a>

                                    {/* Delete Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('Kontakt wirklich löschen?')) {
                                                handleRemoveContact(idx);
                                            }
                                        }}
                                        className="btn-glass"
                                        style={{
                                            padding: '0.45rem',
                                            borderRadius: '8px',
                                            color: '#EF4444',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                            border: '1px solid rgba(239, 68, 68, 0.15)'
                                        }}
                                        title="Löschen"
                                    >
                                        <Trash size={16} />
                                    </button>
                                </div>

                                {/* Delete Button (Absolute top-right or separate) */}

                            </div>
                        ))}
                    </div>

                    {/* Add Contact Button - Moved below the tiles */}
                    <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-start' }}>
                        <button
                            type="button"
                            onClick={handleAddContact}
                            className="btn btn-outline"
                            style={{
                                padding: '0.5rem 1rem',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                borderRadius: '10px'
                            }}
                        >
                            <Plus size={16} />
                            Kontakt hinzufügen
                        </button>
                    </div>
                </div>






                {/* 3. Rooms & Photos */}
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        {mode !== 'technician' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 className="section-header" style={{ marginBottom: 0, border: 'none' }}>
                                    <Image size={20} /> Räume / Fotos
                                </h3>
                            </div>
                        )}


                        {mode === 'technician' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* NEW: Schadenursache Section (Technician) */}
                                <div className="card" style={{ marginBottom: '1rem', padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <AlertTriangle size={18} /> Schadenursache
                                        </h4>
                                    </div>

                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Beschreibung der Ursache</label>
                                        <textarea
                                            className="form-input"
                                            value={formData.cause || ''}
                                            onChange={(e) => setFormData(prev => ({ ...prev, cause: e.target.value }))}
                                            placeholder="Wie ist der Schaden entstanden?"
                                            style={{ width: '100%', minHeight: '100px', fontFamily: 'inherit', lineHeight: '1.5' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Fotos zur Ursache</label>

                                        <div
                                            style={{
                                                border: '2px dashed var(--border)', borderRadius: '8px', padding: '1.5rem',
                                                textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-secondary)',
                                                marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'
                                            }}
                                            onClick={() => document.getElementById('cause-upload-input').click()}
                                        >
                                            <Plus size={24} color="var(--text-muted)" />
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Schadenfoto hochladen / Drop</div>
                                        </div>
                                        <input
                                            id="cause-upload-input"
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => handleCategorySelect(e, 'Schadenfotos')}
                                        />

                                        {formData.images.filter(img => img.assignedTo === 'Schadenfotos').length === 0 ? (
                                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                                Keine Schadenfotos vorhanden.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', minHeight: '80px' }}>
                                                {formData.images.filter(img => img.assignedTo === 'Schadenfotos').map((img, idx) => (
                                                    <div key={idx} style={{
                                                        position: 'relative',
                                                        width: '80px',
                                                        height: '80px',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden',
                                                        flexShrink: 0,
                                                        border: img.includeInReport !== false ? '2px solid #0F6EA3' : '1px solid var(--border)'
                                                    }}>
                                                        <img src={img.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => setActiveImageMeta(img)} />

                                                        {/* Include in Report Toggle (Centered/Unified) */}
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: '2px',
                                                                left: '2px',
                                                                backgroundColor: 'rgba(0,0,0,0.5)',
                                                                borderRadius: '2px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '2px',
                                                                zIndex: 10
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    images: prev.images.map(i => i.preview === img.preview ? { ...i, includeInReport: i.includeInReport === false } : i)
                                                                }));
                                                            }}
                                                            title="Im Bericht anzeigen"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={img.includeInReport !== false}
                                                                onChange={() => { }}
                                                                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#0F6EA3' }}
                                                            />
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm('Bild wirklich löschen?')) {
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        images: prev.images.filter(i => i !== img),
                                                                        damageTypeImage: prev.damageTypeImage === img.preview ? null : prev.damageTypeImage
                                                                    }));
                                                                }
                                                            }}
                                                            style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: 'rgba(239, 68, 68, 0.8)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, zIndex: 5 }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                                {formData.images.filter(img => img.assignedTo === 'Schadenfotos').length === 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '80px', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                                        Keine Ursachenfotos
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
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


                                                value={newRoom.apartment && ![...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().includes(newRoom.apartment) ? 'Sonstiges' : newRoom.apartment}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'Sonstiges') {
                                                        setNewRoom(prev => ({ ...prev, apartment: '' }));
                                                    } else {
                                                        let relatedStockwerk = '';
                                                        const matchingContact = (formData.contacts || []).find(c => c.name && c.name.trim().split(/\s+/).pop() === val);
                                                        if (matchingContact) {
                                                            relatedStockwerk = matchingContact.floor || matchingContact.apartment || '';
                                                        } else {
                                                            const existingRoom = formData.rooms.find(r => r.apartment === val);
                                                            if (existingRoom) {
                                                                relatedStockwerk = existingRoom.stockwerk || '';
                                                            }
                                                        }
                                                        setNewRoom(prev => ({ ...prev, apartment: val, stockwerk: relatedStockwerk || prev.stockwerk }));
                                                    }
                                                }}
                                                style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                            >
                                                <option value="">Wohnung wählen... (Optional)</option>
                                                {[...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().map(apt => (
                                                    <option key={apt} value={apt}>{apt}</option>
                                                ))}
                                                <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                            </select>

                                            {/* Custom Apartment Input */}
                                            {(!newRoom.apartment || (newRoom.apartment && ![...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().includes(newRoom.apartment))) && (
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
                                            disabled={!newRoom.name || newRoom.name === 'Sonstiges'}
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
                </div>


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
                                        <div style={{ width: '80px', height: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: item.includeInReport !== false ? '2px solid #0F6EA3' : 'none' }}>
                                            <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                        </div>

                                        {/* Unified Toggle */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0 0.5rem', cursor: 'pointer' }}
                                            title="In PDF Bericht anzeigen"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                images: prev.images.map(i => i.preview === item.preview ? { ...i, includeInReport: i.includeInReport === false } : i)
                                            }))}>
                                            <input
                                                type="checkbox"
                                                checked={item.includeInReport !== false}
                                                readOnly
                                                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer', accentColor: '#0F6EA3' }}
                                            />
                                        </div>

                                        <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>
                                            {item.name}
                                            {item.includeInReport !== false && (
                                                <div style={{ fontSize: '0.8rem', color: '#0F6EA3', fontWeight: 600 }}>In Bericht</div>
                                            )}
                                        </div>

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


                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {formData.rooms.map(room => (
                        <div key={room.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                padding: '1rem 1.25rem',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                                    <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</span>
                                    {room.apartment && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Objekt:</span>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }}>{room.apartment}</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: mode === 'technician' ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(130px, 1fr))',
                                    gap: '0.6rem',
                                    alignItems: 'stretch',
                                    minWidth: mode === 'technician' ? '240px' : 'auto',
                                    flexShrink: 0
                                }}>
                                    {room.measurementData ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRoomForMeasurement(room);
                                                    setIsNewMeasurement(true);
                                                    setIsMeasurementReadOnly(false);
                                                    setShowMeasurementModal(true);
                                                }}
                                                className="btn-glass"
                                                style={{
                                                    padding: mode === 'technician' ? '0.75rem 0.5rem' : '0.4rem 0.6rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid rgba(217, 119, 6, 0.3)',
                                                    color: '#F59E0B',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    fontSize: mode === 'technician' ? '0.85rem' : '0.75rem',
                                                    cursor: 'pointer',
                                                    fontWeight: 700
                                                }}
                                            >
                                                <Plus size={16} /> Neue Messung
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRoomForMeasurement(room);
                                                    setIsNewMeasurement(false);
                                                    setIsMeasurementReadOnly(false);
                                                    setShowMeasurementModal(true);
                                                }}
                                                style={{
                                                    padding: mode === 'technician' ? '0.75rem 0.5rem' : '0.4rem 0.6rem',
                                                    borderRadius: '8px',
                                                    border: '1.5px solid #059669',
                                                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                                                    color: '#10B981',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.4rem',
                                                    fontSize: mode === 'technician' ? '0.9rem' : '0.75rem',
                                                    cursor: 'pointer',
                                                    flex: 1,
                                                    minHeight: mode === 'technician' ? '44px' : 'auto',
                                                    fontWeight: 800,
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                <Edit3 size={16} /> Fortsetzen
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveRoomForMeasurement(room);
                                                setIsNewMeasurement(false);
                                                setIsMeasurementReadOnly(false);
                                                setShowMeasurementModal(true);
                                            }}
                                            style={{
                                                padding: mode === 'technician' ? '0.8rem 0.5rem' : '0.4rem 0.6rem',
                                                borderRadius: '6px',
                                                border: '1px solid #059669',
                                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                                color: '#34d399',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.4rem',
                                                fontSize: mode === 'technician' ? '1rem' : '0.75rem',
                                                cursor: 'pointer',
                                                flex: 1,
                                                minHeight: mode === 'technician' ? '50px' : 'auto',
                                                fontWeight: 700,
                                                gridColumn: mode === 'technician' ? 'span 2' : 'auto'
                                            }}
                                        >
                                            <Plus size={18} /> Messung starten
                                        </button>
                                    )}

                                    {/* History Button */}
                                    {room.measurementHistory && room.measurementHistory.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveRoomForMeasurement(room);
                                                setIsNewMeasurement(false);
                                                setIsMeasurementReadOnly(true); // View Only
                                                setShowMeasurementModal(true);
                                            }}
                                            style={{
                                                padding: mode === 'technician' ? '0.6rem 0.5rem' : '0.4rem 0.6rem',
                                                borderRadius: '6px',
                                                border: '1px solid #1d4ed8',
                                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                color: '#60a5fa',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.3rem',
                                                fontSize: mode === 'technician' ? '0.8rem' : '0.75rem',
                                                cursor: 'pointer',
                                                flex: 1,
                                                minHeight: mode === 'technician' ? '44px' : 'auto',
                                                fontWeight: 700,
                                                gridColumn: mode === 'technician' && !room.measurementData ? 'span 1' : 'auto'
                                            }}
                                        >
                                            <RotateCcw size={14} /> Messverlauf
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Sind Sie sicher, dass Sie den Raum "${room.name}" löschen möchten? Alle zugehörigen Bilder und Messdaten gehen verloren.`)) {
                                                handleRemoveRoom(room.id);
                                            }
                                        }}
                                        title="Raum löschen"
                                        style={{
                                            padding: mode === 'technician' ? '0.6rem' : '0.4rem',
                                            borderRadius: '6px',
                                            border: '1px solid #b91c1c',
                                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                            color: '#f87171',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            minHeight: mode === 'technician' ? '44px' : 'auto',
                                            gridColumn: mode === 'technician' && !(room.measurementHistory && room.measurementHistory.length > 0) ? 'span 1' : 'auto'
                                        }}
                                    >
                                        <Trash size={14} />
                                    </button>

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
                                                                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-main)' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', marginBottom: '2rem' }}>
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
                                    value={newRoom.apartment && ![...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().includes(newRoom.apartment) ? 'Sonstiges' : newRoom.apartment}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'Sonstiges') {
                                            setNewRoom(prev => ({ ...prev, apartment: '' }));
                                        } else {
                                            let relatedStockwerk = '';
                                            const matchingContact = (formData.contacts || []).find(c => {
                                                if (!c.name) return false;
                                                const lastName = c.name.trim().split(/\s+/).pop();
                                                const withWhg = `Whg. ${lastName}`;
                                                return lastName === val || withWhg === val;
                                            });
                                            if (matchingContact) {
                                                relatedStockwerk = matchingContact.floor || matchingContact.apartment || '';
                                            } else {
                                                const existingRoom = formData.rooms.find(r => r.apartment === val);
                                                if (existingRoom) {
                                                    relatedStockwerk = existingRoom.stockwerk || '';
                                                }
                                            }
                                            setNewRoom(prev => ({ ...prev, apartment: val, stockwerk: relatedStockwerk || prev.stockwerk }));
                                        }
                                    }}
                                    style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                >
                                    <option value="">Wohnung wählen... (Optional)</option>
                                    {[...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().map(apt => (
                                        <option key={apt} value={apt}>{apt}</option>
                                    ))}
                                    <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                </select>

                                {/* Custom Apartment Input */}
                                {(!newRoom.apartment || (newRoom.apartment && ![...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? (c.name.toLowerCase().includes('whg') || c.name.toLowerCase().includes('wohnung') ? c.name.trim().split(/\s+/).pop() : 'Whg. ' + c.name.trim().split(/\s+/).pop()) : '').filter(Boolean)])].sort().includes(newRoom.apartment))) && (
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
                                disabled={!newRoom.name || newRoom.name === 'Sonstiges'}
                                style={{ marginTop: '0.5rem' }}
                            >
                                <Check size={16} /> Speichern
                            </button>
                        </div>
                    )}
                </div>

                {/* Massnahmen & Feststellungen */}
                {(formData.status === 'Schadenaufnahme' || formData.status === 'Leckortung' || true) && (
                    <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary)' }}>
                            <Eye size={18} /> Feststellungen & Massnahmen
                        </h3>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block', fontWeight: 600 }}>Feststellungen</label>
                            <textarea
                                className="form-input"
                                style={{ minHeight: '120px', resize: 'vertical' }}
                                placeholder="Feststellungen eingeben"
                                value={formData.findings || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, findings: e.target.value }))}
                            />
                        </div>

                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'block', fontWeight: 600 }}>Massnahmen (Schnellauswahl)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {[
                                "Trocknung",
                                "Schimmelbehandlung",
                                "Organisation externer Handwerker",
                                "Instandstellung"
                            ].map(measure => {
                                const isActive = (formData.measures || '').includes(measure);
                                return (
                                    <button
                                        key={measure}
                                        type="button"
                                        onClick={() => {
                                            let current = formData.measures || '';
                                            let newValue = '';
                                            if (current.includes(measure)) {
                                                // Remove
                                                newValue = current.replace(measure, '').replace(/\n\n/g, '\n').trim();
                                            } else {
                                                // Add
                                                newValue = current ? (current + '\n' + measure) : measure;
                                            }
                                            setFormData(prev => ({ ...prev, measures: newValue }));
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            backgroundColor: isActive ? 'rgba(15, 110, 163, 0.1)' : 'rgba(255,255,255,0.03)',
                                            border: isActive ? '1px solid #0F6EA3' : '1px solid var(--border)',
                                            borderRadius: '8px',
                                            color: isActive ? '#0F6EA3' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.95rem',
                                            fontWeight: 600,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '4px',
                                            border: isActive ? 'none' : '2px solid var(--text-muted)',
                                            backgroundColor: isActive ? '#0F6EA3' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {isActive && <Check size={14} color="white" strokeWidth={3} />}
                                        </div>
                                        {measure}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Eigener Text / Ergänzungen</label>
                            <button
                                type="button"
                                className={`btn btn-ghost ${isListeningMeasures ? 'listening' : ''}`}
                                style={{
                                    color: isListeningMeasures ? '#ef4444' : 'var(--text-muted)',
                                    padding: '2px 8px',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid var(--border)',
                                    borderRadius: '4px'
                                }}
                                onClick={toggleMeasuresListening}
                                title="Diktieren"
                            >
                                {isListeningMeasures ? <MicOff size={14} /> : <Mic size={14} />}
                                <span>Diktieren</span>
                            </button>
                        </div>

                        <textarea
                            id="measures"
                            name="measures"
                            className="form-input"
                            style={{ minHeight: '120px', resize: 'vertical' }}
                            placeholder="Details zu den Massnahmen..."
                            value={formData.measures || ''}
                            onChange={(e) => {
                                setFormData(prev => ({ ...prev, measures: e.target.value }));
                            }}
                        />

                        {/* Centered Schadensbericht Button with PDF Logo */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2.5rem', marginBottom: '1rem' }}>
                            <button
                                type="button"
                                onClick={handleGeneratePDF}
                                disabled={isGeneratingPDF}
                                className="btn btn-primary"
                                style={{
                                    padding: '1.2rem 4rem',
                                    fontSize: '1.5rem',
                                    fontWeight: 900,
                                    borderRadius: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.25rem',
                                    backgroundColor: '#0F6EA3', // Solid blue
                                    color: 'white', // White text for maximum contrast
                                    border: '3px solid rgba(255,255,255,0.2)',
                                    boxShadow: '0 15px 35px -5px rgba(15, 110, 163, 0.6)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}
                            >
                                <PdfIcon size={32} />
                                <span>Schadensbericht</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* EMAILS & PLANS (Final for User) */}
                {mode === 'desktop' && (
                    <div style={{ marginBottom: '2.5rem', backgroundColor: 'var(--surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                                <Mail size={24} /> Emails & Kommunikation
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowEmailImport(true)}
                                className="btn btn-primary"
                                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Plus size={18} /> Email importieren
                            </button>
                        </div>

                        <div
                            style={{
                                border: '2px dashed var(--border)',
                                borderRadius: '8px',
                                padding: '1.5rem',
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
                            onClick={() => document.getElementById('file-upload-emails').click()}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.backgroundColor = 'rgba(15, 110, 163, 0.05)';
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                                handleCategoryDrop(e, 'Emails');
                            }}
                        >
                            <Plus size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                            <span style={{ fontSize: '0.85rem' }}>Emails / PDF hierher ziehen oder klicken</span>

                            <input
                                id="file-upload-emails"
                                type="file"
                                multiple
                                accept="image/*,application/pdf,.msg,.txt"
                                style={{ display: 'none' }}
                                onChange={(e) => handleCategorySelect(e, 'Emails')}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {formData.images.filter(img => img.assignedTo === 'Emails').map((item, idx) => {
                                const isDoc = (item.file && item.file.type === 'application/pdf') ||
                                    (item.name && item.name.toLowerCase().endsWith('.pdf')) ||
                                    (item.name && item.name.toLowerCase().endsWith('.msg')) ||
                                    (item.name && item.name.toLowerCase().endsWith('.txt')) ||
                                    item.type === 'document';

                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                        {isDoc ? (
                                            <div style={{ color: item.name?.toLowerCase().endsWith('.pdf') ? '#ef4444' : '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                                {(item.name?.toLowerCase().endsWith('.msg')) ? <Mail size={18} /> : <FileText size={18} />}
                                                <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost"
                                                    style={{ marginLeft: 'auto', padding: '0.25rem', fontSize: '0.8rem' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const url = item.file ? URL.createObjectURL(item.file) : item.preview;
                                                        if (url) window.open(url, '_blank');
                                                    }}
                                                >
                                                    Öffnen
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <img
                                                    src={item.preview}
                                                    alt="Vorschau"
                                                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item.assignedTo}</div>
                                                    {item.description && (
                                                        <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>{item.description.substring(0, 30)}...</div>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        <button type="button" onClick={() => { if (window.confirm('Löschen?')) setFormData(prev => ({ ...prev, images: prev.images.filter(img => img !== item) })); }} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
                                    </div>
                                )
                            })}
                            {formData.images.filter(img => img.assignedTo === 'Emails').length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem' }}>Keine Emails vorhanden.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* 2b. Massnahmen (Measures) - Technician Only (Schadenaufnahme/Leckortung) */}
                {mode === 'technician' && (formData.status === 'Schadenaufnahme' || formData.status === 'Leckortung') && (
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                        <h3 className="section-header">
                            <ClipboardList size={18} /> Massnahmen
                        </h3>

                        {/* Checkbox Liste */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {[
                                "Trocknung",
                                "Schimmelbehandlung",
                                "Organisation externer Handwerker",
                                "Instandstellung"
                            ].map((item) => (
                                <label key={item} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    padding: '1rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: (formData.selectedMeasures?.includes(item)) ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.02)',
                                    borderColor: (formData.selectedMeasures?.includes(item)) ? 'var(--primary)' : 'var(--border)',
                                    transition: 'all 0.2s ease'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.selectedMeasures?.includes(item) || false}
                                        onChange={() => {
                                            setFormData(prev => {
                                                const current = prev.selectedMeasures || [];
                                                if (current.includes(item)) {
                                                    return { ...prev, selectedMeasures: current.filter(i => i !== item) };
                                                } else {
                                                    return { ...prev, selectedMeasures: [...current, item] };
                                                }
                                            });
                                        }}
                                        style={{ width: '22px', height: '22px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: (formData.selectedMeasures?.includes(item)) ? 'var(--text-main)' : 'var(--text-muted)' }}>{item}</span>
                                </label>
                            ))}
                        </div>

                        {/* Freitext & Mikrofon */}
                        <div style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Eigener Text / Ergänzungen</label>
                                <button
                                    type="button"
                                    className="btn-glass"
                                    onClick={toggleMeasuresListening}
                                    style={{
                                        padding: '0.4rem 0.75rem',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: isListeningMeasures ? '#EF4444' : 'var(--primary)',
                                        borderRadius: '10px',
                                        fontWeight: 700
                                    }}
                                >
                                    {isListeningMeasures ? <MicOff size={16} /> : <Mic size={16} />}
                                    {isListeningMeasures ? 'Stop' : 'Diktieren'}
                                </button>
                            </div>
                            <textarea
                                className="form-input"
                                value={formData.measures || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, measures: e.target.value }))}
                                placeholder="Zusätzliche Massnahmen beschreiben..."
                                style={{ width: '100%', minHeight: '100px', fontFamily: 'inherit', lineHeight: '1.5' }}
                            />
                        </div>

                        {/* Centered Schadensbericht Button for Technician Mode (Tablet) */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
                            <button
                                type="button"
                                onClick={handleGeneratePDF}
                                disabled={isGeneratingPDF}
                                className="btn btn-primary"
                                style={{
                                    padding: '1.2rem 4rem',
                                    fontSize: '1.5rem',
                                    fontWeight: 900,
                                    borderRadius: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.25rem',
                                    backgroundColor: '#0F6EA3',
                                    color: 'white',
                                    border: '3px solid rgba(255,255,255,0.2)',
                                    boxShadow: '0 15px 35px -5px rgba(15, 110, 163, 0.6)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    width: '100%', // Full width on tablet for better touch target
                                    maxWidth: '500px'
                                }}
                            >
                                <PdfIcon size={32} />
                                <span>Schadensbericht</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Pläne & Grundrisse Section */}
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <h3 className="section-header">
                        <FileText size={18} /> Pläne & Grundrisse
                    </h3>

                    <div
                        className="btn-glass"
                        style={{
                            border: '2px dashed var(--border)',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            marginBottom: '1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)'
                        }}
                        onClick={() => document.getElementById('file-upload-pläne').click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.08)';
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'none';
                        }}
                        onDrop={(e) => handleCategoryDrop(e, 'Pläne')}
                    >
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem'
                        }}>
                            <Plus size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Plan / Grundriss hochladen (PDF / Bild)</span>
                        <input id="file-upload-pläne" type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleCategorySelect(e, 'Pläne')} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {formData.images.filter(img => img.assignedTo === 'Pläne').map((item, idx) => (
                            <div key={idx} style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                                backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                                borderRadius: '12px'
                            }}>
                                {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                    <div style={{ color: '#F87171', display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                                        <FileText size={18} />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                        <button
                                            type="button"
                                            className="btn-glass"
                                            style={{ marginLeft: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '8px' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const url = item.file ? URL.createObjectURL(item.file) : item.preview; if (url) window.open(url, '_blank');
                                            }}
                                        >
                                            Öffnen
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <img src={item.preview} alt="Vorschau" className="hover-zoom" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px' }} />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{item.name || item.assignedTo}</div>
                                            {item.description && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.description.substring(0, 40)}...</div>
                                            )}
                                        </div>
                                    </>
                                )}

                                <button type="button" onClick={() => { if (window.confirm('Löschen?')) setFormData(prev => ({ ...prev, images: prev.images.filter(img => img !== item) })); }} style={{ border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex' }}><X size={14} /></button>
                            </div>
                        ))}
                        {formData.images.filter(img => img.assignedTo === 'Pläne').length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: '1rem' }}>Keine Pläne vorhanden.</div>
                        )}
                    </div>
                </div>

                {mode === 'desktop' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 className="section-header">
                                <Plus size={18} /> Arbeitsrapporte
                            </h3>
                            <div
                                className="btn-glass"
                                style={{
                                    border: '2px dashed var(--border)',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    marginBottom: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)'
                                }}
                                onClick={() => document.getElementById('file-upload-Arbeitsrappporte-desktop').click()}
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(14, 165, 233, 0.08)'; }}
                                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'none'; }}
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
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 className="section-header">
                                <FileText size={18} /> Sonstiges
                            </h3>
                            <div
                                className="btn-glass"
                                style={{
                                    border: '2px dashed var(--border)',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    marginBottom: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)'
                                }}
                                onClick={() => document.getElementById('file-upload-Sonstiges-desktop').click()}
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(14, 165, 233, 0.08)'; }}
                                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'none'; }}
                                onDrop={(e) => handleCategoryDrop(e, 'Sonstiges')}
                            >
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem'
                                }}>
                                    <Plus size={20} />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sonstiges Dokument hochladen / Drop</span>
                                <input id="file-upload-Sonstiges-desktop" type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleCategorySelect(e, 'Sonstiges')} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {formData.images.filter(img => img.assignedTo === 'Sonstiges').map((item, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                                        backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                                        borderRadius: '12px'
                                    }}>
                                        {(item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => { if (item.file) { const pdfUrl = URL.createObjectURL(item.file); window.open(pdfUrl, '_blank'); } else if (item.preview) { window.open(item.preview, '_blank'); } }}>
                                                <FileText size={18} color="var(--primary)" />
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }}>{item.name}</div>
                                            </div>
                                        ) : (
                                            <>
                                                <img src={item.preview} alt="" className="hover-zoom" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px' }} />
                                                <div style={{ flex: 1, fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{item.name}</div>
                                            </>
                                        )}
                                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== item) }))} style={{ border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex' }}><X size={14} /></button>
                                    </div>
                                ))}
                                {formData.images.filter(img => img.assignedTo === 'Sonstiges').length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Keine sonstigen Dokumente.</div>}
                            </div>
                        </div>

                        {/* Messprotokolle */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 className="section-header">
                                <ClipboardList size={18} /> Messprotokolle
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {formData.rooms.map(room => {
                                    const hasMeasurement = !!room.measurementData;
                                    const date = hasMeasurement ? (room.measurementData.globalSettings?.date ? new Date(room.measurementData.globalSettings.date).toLocaleDateString('de-CH') : 'Kein Datum') : '-';
                                    return (
                                        <div key={room.id} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px solid var(--border)', borderRadius: '12px', gap: '1rem'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{room.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{hasMeasurement ? `Letzte Messung: ${date}` : 'Keine Messdaten'}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                {room.measurementData ? (
                                                    <>
                                                        <button type="button" className="btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '8px' }} onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(true); setShowMeasurementModal(true); }}>Neue Messreihe</button>
                                                        <button type="button" className="btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '8px', color: 'var(--primary)' }} onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(false); setShowMeasurementModal(true); }}>Fortsetzen</button>
                                                    </>
                                                ) : (
                                                    <button type="button" className="btn-glass" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '8px', color: 'var(--success)' }} onClick={() => { setActiveRoomForMeasurement(room); setIsNewMeasurement(false); setShowMeasurementModal(true); }}>Messung starten</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn-glass"
                                    onClick={async () => {
                                        try {
                                            await generateMeasurementExcel(formData);
                                        } catch (error) {
                                            console.error("Excel Export failed:", error);
                                            alert("Fehler beim Erstellen des Excel-Protokolls.");
                                        }
                                    }}
                                    style={{ fontSize: '0.85rem', padding: '0.6rem 1.25rem', color: '#10B981', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.2)' }}
                                >
                                    <Table size={16} /> Excel Export
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* 4. Drying Equipment - Visible ONLY in 'Trocknung' status */}
                {formData.status === 'Trocknung' && (
                    <div style={{ marginBottom: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', ...(mode === 'desktop' ? { display: 'flex', flexDirection: 'column' } : {}) }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>
                            <Settings size={24} />
                            Trocknungsgeräte
                        </h2>





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
                                            {[...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? c.name.trim().split(/\s+/).pop() : '').filter(Boolean)])].sort().map(apt => (
                                                <option key={apt} value={apt}>{apt}</option>
                                            ))}
                                            <option value="Sonstiges">Neue Wohnung eingeben...</option>
                                        </select>

                                        {/* Custom Apartment Input if 'Sonstiges' or not in list (implicit logic: if value not in list and not empty, it's custom. But simplified: if user picks Sonstiges, we clear and show input below? Or render input if value not in list? Let's keep it simple: Select or Input logic similar to Room) */}
                                        {/* Actually, user might want to just type it if it's new. Use a datalist or similar? React doesn't do datalist easily with state. 
                                                Let's stick to the pattern used for Rooms: Select + Conditional Input if "Sonstiges" or custom.
                                                However, here we want to SUGGEST from existing rooms.
                                            */}
                                        {((newDevice.apartment && ![...new Set([...formData.rooms.map(r => r.apartment).filter(Boolean), ...(formData.contacts || []).map(c => c.name ? c.name.trim().split(/\s+/).pop() : '').filter(Boolean)])].sort().includes(newDevice.apartment)) || !formData.rooms.some(r => r.apartment)) && (
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

                {/* Zusammenfassung Trocknung */}
                {(mode === 'desktop' || !['Schadenaufnahme', 'Leckortung'].includes(formData.status)) && formData.equipment?.length > 0 && (
                    <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary)' }}>
                            <Database size={18} /> Zusammenfassung Trocknung
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>Gerät</th>
                                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Dauer (Tage)</th>
                                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Betriebsstunden</th>
                                        <th style={{ textAlign: 'right', padding: '0.75rem' }}>Verbrauch (kWh)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.equipment.filter(d => d.endDate && d.counterEnd).map((device, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.75rem' }}>#{device.deviceNumber} ({device.room})</td>
                                            <td style={{ textAlign: 'center', padding: '0.75rem' }}>{getDaysDiff(device.startDate, device.endDate)}</td>
                                            <td style={{ textAlign: 'center', padding: '0.75rem' }}>{device.hours} h</td>
                                            <td style={{ textAlign: 'right', padding: '0.75rem' }}>{(parseFloat(device.counterEnd) - parseFloat(device.counterStart)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {formData.equipment.filter(d => d.endDate && d.counterEnd).length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Keine abgeschlossenen Trocknungen vorhanden.</td>
                                        </tr>
                                    )}
                                    <tr style={{ fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '0.75rem' }}>Gesamt</td>
                                        <td style={{ textAlign: 'center', padding: '0.75rem' }}>-</td>
                                        <td style={{ textAlign: 'center', padding: '0.75rem' }}>{totalDryingHours.toFixed(1)} h</td>
                                        <td style={{ textAlign: 'right', padding: '0.75rem' }}>{totalDryingKwh.toFixed(2)} kWh</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                <div style={{ height: '80px', ...(mode === 'desktop' ? { order: 3 } : {}) }} />

                {/* Mobile / Technician Fixed Footer - AutoSave Version */}
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    maxWidth: '600px',
                    padding: '0.4rem 0.75rem',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: isSaving ? '#fbbf24' : '#10B981', transition: 'color 0.3s' }}>
                        {isSaving ? (
                            <>
                                <RotateCcw size={12} className="spin" /> Speichert...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={12} /> Gespeichert
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onCancel}
                        style={{ padding: '0.35rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '20px' }}
                    >
                        <CheckCircle size={14} />
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
                                                    style={{ width: '1.25rem', height: '1.25rem', accentColor: '#0F6EA3' }}
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
                                                style={{ color: '#0F6EA3', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}
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
                    key={activeRoomForMeasurement?.id || 'none'}
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
                        if (activeRoomForMeasurement && r.id === activeRoomForMeasurement.id && isNewMeasurement && mData && Array.isArray(mData.measurements)) {
                            mData = {
                                canvasImage: mData.canvasImage, // Keep Sketch
                                globalSettings: {
                                    ...(mData.globalSettings || {}),
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

                        // 1. Silent Upload to Supabase (if available) and store URL in history
                        let protocolUrl = null;
                        if (supabase && file) {
                            try {
                                const fileExt = file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'png');
                                const fileName = `protocols/${formData.id || 'temp'}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

                                const { error: uploadError } = await supabase.storage
                                    .from('damage-images')
                                    .upload(fileName, file);

                                if (!uploadError) {
                                    const { data: { publicUrl } } = supabase.storage
                                        .from('damage-images')
                                        .getPublicUrl(fileName);
                                    protocolUrl = publicUrl;
                                }
                            } catch (err) {
                                console.error("Silent protocol upload failed:", err);
                            }
                        }

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
                                            canvasImage: canvasImage,
                                            protocolUrl: protocolUrl // Store the uploaded file link
                                        };
                                        const history = r.measurementHistory ? [...r.measurementHistory] : [];

                                        return {
                                            ...r,
                                            measurementData: { measurements, globalSettings, canvasImage, protocolUrl },
                                            measurementHistory: [...history, newHistoryEntry]
                                        };
                                    }
                                    return r;
                                })
                            }));
                        }
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
                            onRefreshDevices={refreshAudioDevices}
                            deviceError={deviceError}
                        />
                    )
                }

                {/* Report Modal */}
                {showReportModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }}>
                        <div style={{
                            backgroundColor: 'var(--surface)',
                            borderRadius: '16px',
                            width: '100%',
                            maxWidth: '600px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '2rem',
                            border: '1px solid var(--border)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--primary)' }}>Bericht konfigurieren</h3>
                                <button onClick={() => setShowReportModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ overflowY: 'auto', flex: 1, marginBottom: '2rem' }}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block', fontSize: '0.9rem' }}>Schadenursache / Zusammenfassung</label>
                                    <textarea
                                        className="form-input"
                                        rows={4}
                                        value={formData.cause || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, cause: e.target.value }))}
                                        placeholder="Beschreiben Sie hier die Ursache des Schadens..."
                                        style={{ width: '100%', fontFamily: 'inherit' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button className="btn btn-outline" onClick={() => setShowReportModal(false)}>Abbrechen</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        setShowReportModal(false);
                                        await generatePDFContent();
                                    }}
                                    disabled={isGeneratingPDF}
                                >
                                    {isGeneratingPDF ? <RotateCcw className="spin" size={18} /> : <FileText size={18} />}
                                    Bericht erstellen & Speichern
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Print Report Template */}
                {isGeneratingPDF && (
                    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                        <div id="print-report" className="print-only" style={{
                            width: '210mm',
                            padding: '20mm',
                            backgroundColor: 'white',
                            color: 'black',
                            fontFamily: 'Arial, sans-serif'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '4px solid #0F6EA3', paddingBottom: '1.5rem' }}>
                                <div>
                                    <h1 style={{ fontSize: '28pt', fontWeight: '800', margin: 0, color: '#0F172A' }}>Schadensbericht</h1>
                                    <div style={{ fontSize: '11pt', marginTop: '0.5rem', color: '#64748B' }}>Erstellt am: {new Date().toLocaleDateString('de-CH')}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '16pt', color: '#0F172A' }}>Q-Service AG</div>
                                    <div style={{ fontSize: '9pt', color: '#475569' }}>Kriesbachstrasse 30, 8600 Dübendorf</div>
                                </div>
                            </div>

                            <div className="pdf-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <h3 style={{ color: '#0F6EA3', fontSize: '12pt', fontWeight: 'bold', marginBottom: '0.5rem' }}>PROJEKTDATEN</h3>
                                    <div style={{ fontSize: '10pt', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem' }}>
                                        <strong>Projekt:</strong> <span>{formData.projectTitle}</span>
                                        <strong>Strasse:</strong> <span>{formData.street}</span>
                                        <strong>Ort:</strong> <span>{formData.zip} {formData.city}</span>
                                    </div>
                                </div>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <h3 style={{ color: '#0F6EA3', fontSize: '12pt', fontWeight: 'bold', marginBottom: '0.5rem' }}>DETAILS</h3>
                                    <div style={{ fontSize: '10pt', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem' }}>
                                        <strong>Status:</strong> <span>{formData.status}</span>
                                        <strong>Kategorie:</strong> <span>{formData.damageCategory}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pdf-section" style={{ marginBottom: '2rem' }}>
                                <h3 style={{ borderLeft: '4px solid #0F6EA3', paddingLeft: '1rem', fontSize: '14pt', fontWeight: 'bold', marginBottom: '1rem' }}>Beschreibung</h3>
                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '11pt', lineHeight: 1.5 }}>{formData.description}</div>
                            </div>

                            {formData.cause && (
                                <div className="pdf-section" style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ borderLeft: '4px solid #0F6EA3', paddingLeft: '1rem', fontSize: '14pt', fontWeight: 'bold', marginBottom: '1rem' }}>Schadenursache</h3>
                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '11pt', lineHeight: 1.5, backgroundColor: '#F1F5F9', padding: '1rem', borderRadius: '8px' }}>{formData.cause}</div>
                                </div>
                            )}

                            <div className="pdf-section">
                                <h3 style={{ backgroundColor: '#0F172A', color: 'white', padding: '0.5rem 1rem', fontSize: '14pt', borderRadius: '4px', marginBottom: '1.5rem' }}>Bilder & Dokumentation</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {formData.images.filter(img => img.includeInReport !== false && img.assignedTo !== 'Emails' && img.assignedTo !== 'Pläne').map((img, idx) => (
                                        <div key={idx} style={{ breakInside: 'avoid', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                                            <img src={img.preview} alt="" style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                                            {img.description && <div style={{ padding: '0.5rem', fontSize: '9pt', fontStyle: 'italic' }}>{img.description}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div >
        </>
    );
}
