import React, { useState, useEffect, useRef } from 'react';
import { Camera, Image, Trash, X, Plus, Edit3, Save, Upload, FileText, CheckCircle, AlertTriangle, Play, HelpCircle, ArrowLeft, Mail, Map, Folder, Mic, Paperclip, Table, Download, Check } from 'lucide-react'
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
    "Abstellkammer",
    "Gäste-WC",
    "Kinderzimmer",
    "Esszimmer",
    "Arbeitszimmer / Büro",
    "Hauswirtschaftsraum (HWR)",
    "Dachboden"
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

    const [formData, setFormData] = useState(initialData ? {
        id: initialData.id, // Keep ID if editing
        projectTitle: initialData.projectTitle || initialData.id || '', // Include projectTitle
        client: initialData.client || '',
        locationDetails: initialData.locationDetails || '', // New field for Schadenort (e.g. "Wohnung ...")
        clientSource: initialData.clientSource || '',
        propertyType: initialData.propertyType || '',
        assignedTo: initialData.assignedTo || '',
        address: initialData.address || '', // Store full address as fallback
        street: initialAddressParts.street,
        zip: initialAddressParts.zip,
        city: initialAddressParts.city,

        contacts: (initialData?.contacts && initialData.contacts.filter(c => c.name || c.phone).length > 0)
            ? initialData.contacts.filter(c => c.name || c.phone)
            : [{ apartment: '', name: '', phone: '', role: 'Mieter' }],
        notes: initialData?.notes || '',
        documents: initialData?.documents || [],

        damageType: initialData.type || '',
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
        assignedTo: '',
        street: '',
        zip: '',
        city: '',
        // address: '',
        contacts: [
            { apartment: '', name: '', phone: '', role: 'Mieter' }
        ],
        damageType: '',
        status: 'Schadenaufnahme',
        description: '',
        dryingStarted: null,
        dryingEnded: null,
        equipment: [],
        images: [],
        rooms: []
    })

    // --- Device Selection Logic ---
    const [availableDevices, setAvailableDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null); // The object from DB

    // Fetch available devices on mount (and when status changes)
    useEffect(() => {
        if (!supabase) return;
        const fetchAvail = async () => {
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .in('status', ['Aktiv', 'Verfügbar'])
                .is('current_report_id', null)
                .order('number', { ascending: true });

            if (data) setAvailableDevices(data);
        };
        fetchAvail();
    }, []);

    const [newRoom, setNewRoom] = useState({
        name: '',
        apartment: ''
    })

    const [editingImage, setEditingImage] = useState(null);
    const [activeImageMeta, setActiveImageMeta] = useState(null); // For the new Metadata Modal
    const [showEmailImport, setShowEmailImport] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);


    const [showMeasurementModal, setShowMeasurementModal] = useState(false);
    const [isNewMeasurement, setIsNewMeasurement] = useState(false);
    const [activeRoomForMeasurement, setActiveRoomForMeasurement] = useState(null); // Track which room we are editing

    // Audio Recording State
    const [isRecording, setIsRecording] = useState(false); // false | 'modal' | image.preview
    const mediaRecorderRef = useRef(null);

    const startRecording = async (targetId = 'modal') => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            const audioChunks = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await transcribeAudio(audioBlob, targetId);

                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(targetId);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Mikrofon konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const transcribeAudio = async (audioBlob, targetId) => {
        const apiKey = localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            alert("Kein OpenAI API Key gefunden. Bitte in den Einstellungen (Email Import) hinterlegen.");
            return;
        }

        const formDataReq = new FormData();
        formDataReq.append("file", audioBlob, "recording.webm");
        formDataReq.append("model", "whisper-1");

        try {
            const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                body: formDataReq
            });

            const data = await response.json();
            if (data.text) {
                if (targetId === 'modal') {
                    setActiveImageMeta(prev => ({
                        ...prev,
                        description: (prev.description ? prev.description + " " : "") + data.text
                    }));
                } else {
                    // Update specific image in formData
                    setFormData(prev => ({
                        ...prev,
                        images: prev.images.map(img => img.preview === targetId ? {
                            ...img,
                            description: (img.description ? img.description + " " : "") + data.text
                        } : img)
                    }));
                }
            } else {
                console.error("Transcription error:", data);
                alert("Fehler bei der Transkription: " + (data.error?.message || "Unbekannter Fehler"));
            }
        } catch (error) {
            console.error("Transcription network error:", error);
            alert("Netzwerkfehler bei der Transkription.");
        }
    };




    const [showReportModal, setShowReportModal] = useState(false);
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

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (onSave) {
                // DIRTY CHECK: Only save if data has actually changed
                if (JSON.stringify(formData) !== JSON.stringify(lastSavedData.current)) {
                    console.log("Auto-Save triggered (Data Changed). Equipment:", formData.equipment.length);
                    // Pass true as second argument to indicate "silent" save
                    onSave(formData, true);
                    lastSavedData.current = formData;
                } else {
                    console.log("Auto-Save skipped (No structural changes)");
                }
            }
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [formData, onSave]);

    // Save on Unmount
    useEffect(() => {
        return () => {
            console.log("Component Unmounting - Saving final state...");
            if (onSave && JSON.stringify(latestFormData.current) !== JSON.stringify(lastSavedData.current)) {
                onSave(latestFormData.current, true);
            }
        };
    }, [onSave]);

    const [newDevice, setNewDevice] = useState({
        deviceNumber: '', // Will be populated from selection
        apartment: '',
        room: '',
        startDate: new Date().toISOString().split('T')[0],
        counterStart: ''
    })

    const handleAddDevice = async () => {
        // Validation
        if (!newDevice.room) {
            alert("Bitte wählen Sie einen Raum aus.");
            return;
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
                return; // Stop adding if DB update fails
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

        // Reset inputs
        setNewDevice({
            deviceNumber: '',
            apartment: '',
            room: '',
            startDate: new Date().toISOString().split('T')[0],
            counterStart: ''
        });
        setSelectedDevice(null);
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
        if (!newRoom.name) return;

        const roomEntry = {
            id: Date.now(),
            name: newRoom.name,
            apartment: newRoom.apartment
        };

        setFormData(prev => ({
            ...prev,
            rooms: [...prev.rooms, roomEntry]
        }));

        setNewRoom({ name: '', apartment: '' });
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

    // --- PDF Export ---
    const generatePDFExport = async () => {
        const doc = new jsPDF({ orientation: 'landscape' });

        // Load Logo if available
        let logoData = null;
        try {
            const logoResponse = await fetch('/logo.png');
            if (logoResponse.ok) {
                const blob = await logoResponse.blob();
                logoData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch (e) { console.error(e); }

        const roomsWithMeasurements = formData.rooms.filter(room => room.measurementData && room.measurementData.measurements && room.measurementData.measurements.length > 0);

        if (roomsWithMeasurements.length === 0) {
            alert("Keine Messdaten gefunden.");
            return;
        }

        for (let i = 0; i < roomsWithMeasurements.length; i++) {
            const room = roomsWithMeasurements[i];
            if (i > 0) doc.addPage();

            const pageWidth = doc.internal.pageSize.getWidth();

            // Header: Logo & Title
            if (logoData) {
                doc.addImage(logoData, 'PNG', 14, 10, 40, 15);
            }

            doc.setFontSize(16);
            doc.text("Messprotokoll", pageWidth - 14, 20, { align: 'right' });

            // Metadata
            doc.setFontSize(10);
            const metaY = 35;
            doc.text(`Projekt: ${formData.projectTitle || ''}`, 14, metaY);
            doc.text(`Raum: ${room.name}`, 14, metaY + 6);
            doc.text(`Datum: ${new Date().toLocaleDateString('de-CH')}`, pageWidth - 14, metaY, { align: 'right' });

            // Table Header Construction
            const measurements = room.measurementData.measurements || [];

            // Defines headers for autoTable
            // Row 1: Datum, Luft, RH, [1..N]
            // Row 2: [W, B] per measurement

            const headerDef = [
                { content: 'Datum', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'Luft °C', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'RH %', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
            ];
            const subHeaderDef = []; // Will be used for W/B labels

            measurements.forEach((_, idx) => {
                headerDef.push({ content: `${idx + 1}`, colSpan: 2, styles: { halign: 'center' } });
                subHeaderDef.push({ content: 'W', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 50 } });
                subHeaderDef.push({ content: 'B', styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 50 } });
            });

            // Body: Empty rows for manual entry (Template style)
            const body = [];
            for (let r = 0; r < 15; r++) {
                // 3 base cols + 2 per measurement
                const row = new Array(3 + measurements.length * 2).fill('');
                body.push(row);
            }

            autoTable(doc, {
                startY: 50,
                head: [headerDef, subHeaderDef],
                body: body,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1, lineColor: 200 },
                headStyles: { fillColor: [15, 23, 42], textColor: 255 },
                margin: { top: 50 }
            });

            // Add Sketch/Images if available for this room
            const finalY = (doc.lastAutoTable?.finalY || 50) + 10;
            const roomImages = formData.images.filter(img => img.roomId === room.id || img.assignedTo === room.name);

            if (roomImages.length > 0) {
                const imgItem = roomImages[0]; // Take first image
                try {
                    let imgData = imgItem.preview;
                    // Convert blob URL to base64 if needed
                    if (imgData && imgData.startsWith('blob:')) {
                        const resp = await fetch(imgData);
                        const blob = await resp.blob();
                        imgData = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                    } else if (imgData && !imgData.startsWith('data:')) {
                        // Proxy/Fetch remote if needed, but keeping simple for now
                        // If it's a supabase URL, might work if CORS allows, otherwise blank
                    }

                    if (imgData && imgData.startsWith('data:')) {
                        doc.setFontSize(10);
                        doc.text("Skizze / Grundriss:", 14, finalY);
                        // Fit image
                        doc.addImage(imgData, 'JPEG', 14, finalY + 5, 100, 60);
                    }
                } catch (err) {
                    console.error("Error adding PDF image", err);
                }
            }
        }

        const fileName = `Messprotokoll_${formData.projectTitle || 'Projekt'}.pdf`;
        doc.save(fileName);

        // 27.05.2024: Keep history. Do not clear previous protocols.
        /*
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter(img => img.assignedTo !== 'Messprotokolle')
        }));
        */

        // Add the new file
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        handleImageUpload([file], { assignedTo: 'Messprotokolle' });
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

    const handleEmailImport = (data) => {
        const importedContacts = data.contacts || [];

        // Dynamic Contacts: Use imported or default to 1 empty
        let finalContacts = importedContacts.length > 0
            ? importedContacts
            : [{ name: '', phone: '', apartment: '', role: 'Mieter' }];

        // Ensure fields exist and role is set
        finalContacts = finalContacts.map(c => ({
            name: c.name || '',
            phone: c.phone || '',
            apartment: c.apartment || '',
            role: c.role || 'Mieter'
        }));

        // Debug Alert
        alert(`Formular hat Daten erhalten:\nKunde: ${data.client || 'Unbekannt'}\nKontakte: ${finalContacts.length} imported.`);

        console.log("Setting State Contacts:", finalContacts);

        setFormData(prev => ({
            ...prev,
            projectTitle: data.projectTitle || prev.projectTitle,
            client: data.client || prev.client,
            street: data.street || prev.street,
            zip: data.zip || prev.zip,
            city: data.city || prev.city,
            description: data.description || prev.description,
            damageType: data.damageType || prev.damageType,
            contacts: finalContacts
        }));
        setShowEmailImport(false);
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

    const handlePDFClick = () => {
        console.log("PDF Button Clicked - Opening Modal");
        setShowReportModal(true);
    }



    if (mode === 'technician') {
        return (
            <div className="card" style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid var(--primary)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                        {formData.projectTitle || 'Projekt'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                        <button onClick={onCancel} className="btn btn-ghost" style={{ padding: '0.5rem' }}>✕</button>
                    </div>
                </div>

                {/* 1. Address (Schadenort) */}
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', color: 'var(--text-main)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                        <MapPin size={18} /> Schadenort
                    </h3>
                    <div style={{ fontSize: '1rem', lineHeight: '1.4' }}>
                        {formData.street ? (
                            <>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{formData.client}</div>
                                {formData.locationDetails && <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{formData.locationDetails}</div>}
                                {formData.street}<br />
                                {formData.zip} {formData.city}
                            </>
                        ) : (
                            formData.address || 'Keine Adresse'
                        )}
                    </div>
                </div>

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
                                <button
                                    type="button"
                                    onClick={() => handleRemoveContact(idx)}
                                    style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'white', border: '1px solid #EF4444', borderRadius: '50%', color: '#EF4444', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    title="Kontakt entfernen"
                                >
                                    <X size={12} />
                                </button>
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

                {/* 3. Rooms & Photos */}
                <div style={{ marginBottom: '2rem' }}>
                    {formData.status !== 'Trocknung' && (
                        <div style={{ marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Räume / Fotos
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                                    <option value="Sonstiges">Sonstiges</option>
                                </select>
                                <input
                                    type="text"
                                    placeholder="Wohnung (Optional)"
                                    value={newRoom.apartment}
                                    onChange={(e) => setNewRoom(prev => ({ ...prev, apartment: e.target.value }))}
                                    className="form-input"
                                    style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                />
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleAddRoom}
                                disabled={!newRoom.name}
                                style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem' }}
                            >
                                <Plus size={16} /> Raum hinzufügen
                            </button>
                        </div>
                    )}

                    {formData.status !== 'Trocknung' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {formData.rooms.map(room => (
                                <div key={room.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-main)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 600 }}>{room.name}</span>
                                            {room.apartment && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{room.apartment}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRoomForMeasurement(room);
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
                                                <Edit3 size={14} />
                                                Messung
                                            </button>
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
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.75rem' }}>
                                        <>
                                            {/* Image List with Descriptions */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                                {formData.images.filter(img => img.roomId === room.id).map((img, idx) => (
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
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost"
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
                                                                onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter(i => i !== img) }))}
                                                            >
                                                                <Trash size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {formData.images.filter(img => img.roomId === room.id).length === 0 && (
                                                    <div style={{ fontSize: '0.85rem', color: '#9CA3AF', fontStyle: 'italic', marginBottom: '0.5rem' }}>Keine Bilder</div>
                                                )}
                                            </div>

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
                                                        // Robust Mobile/Tablet Detection
                                                        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
                                                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                                                            (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));

                                                        // Only force Modal on Desktop (Non-Mobile/Tablet)
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
                    )}
                </div>

                {/* 4. Drying Equipment (Only in Trocknung) */}
                {
                    formData.status === 'Trocknung' && (
                        <div style={{ marginBottom: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'white' }}>Trocknungsgeräte</h3>

                            {/* Add Device Form */}
                            <div style={{ backgroundColor: '#1E293B', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Geräte-Nr."
                                        className="form-input"
                                        value={newDevice.deviceNumber}
                                        onChange={(e) => setNewDevice(prev => ({ ...prev, deviceNumber: e.target.value }))}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Wohnung (Optional)"
                                        className="form-input"
                                        value={newDevice.apartment || ''}
                                        onChange={(e) => setNewDevice(prev => ({ ...prev, apartment: e.target.value }))}
                                    />
                                </div>
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <select
                                        className="form-input"
                                        value={ROOM_OPTIONS.includes(newDevice.room) ? newDevice.room : (newDevice.room ? 'Sonstiges' : '')}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'Sonstiges') {
                                                setNewDevice(prev => ({ ...prev, room: 'Sonstiges' }));
                                            } else {
                                                setNewDevice(prev => ({ ...prev, room: val }));
                                            }
                                        }}
                                    >
                                        <option value="">Raum wählen...</option>
                                        {ROOM_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                        <option value="Sonstiges">Sonstiges</option>
                                    </select>

                                    {/* Custom Room Input if 'Sonstiges' or custom value */}
                                    {(!ROOM_OPTIONS.includes(newDevice.room) && newDevice.room !== '' || newDevice.room === 'Sonstiges') && (
                                        <input
                                            type="text"
                                            className="form-input"
                                            style={{ marginTop: '0.5rem' }}
                                            placeholder="Raum eingeben..."
                                            value={newDevice.room === 'Sonstiges' ? '' : newDevice.room}
                                            onChange={(e) => setNewDevice(prev => ({ ...prev, room: e.target.value }))}
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
                                        placeholder="Zählerstand Start"
                                        className="form-input"
                                        value={newDevice.counterStart}
                                        onChange={(e) => setNewDevice(prev => ({ ...prev, counterStart: e.target.value }))}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleAddDevice}
                                    disabled={!newDevice.deviceNumber || !newDevice.room}
                                    style={{ width: '100%' }}
                                >
                                    <Plus size={16} /> Gerät hinzufügen
                                </button>
                            </div>

                            {/* Device List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {formData.equipment.map((device, idx) => (
                                    <div key={idx} style={{ backgroundColor: '#1E293B', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', color: 'white' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>#{device.deviceNumber}</span>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                                    {device.room}
                                                    {device.apartment && <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 400, marginLeft: '4px' }}>({device.apartment})</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                                            <span>Start: {device.startDate}</span>
                                            <span>Zähler: {device.counterStart} kWh</span>
                                        </div>
                                    </div>
                                ))}
                                {formData.equipment.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.9rem' }}>Keine Geräte installiert.</div>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* Spacer to prevent overlap */}
                <div style={{ height: '100px' }} />

                {/* Save Button for Mobile */}
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    marginTop: '0',
                    zIndex: 50,
                    padding: '1rem',
                    backgroundColor: '#0F172A', // Match page background
                    borderTop: '1px solid var(--border)',
                    boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <button
                        type="submit"
                        onClick={handleSubmit}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    >
                        Speichern
                    </button>
                </div>
                {editingImage && (
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
                )}

                {/* New Image Metadata Modal */}
                {activeImageMeta && (
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
                )}
                {showCameraModal && (
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
                )}

                <MeasurementModal
                    isOpen={showMeasurementModal}
                    onClose={() => {
                        setShowMeasurementModal(false);
                        setActiveRoomForMeasurement(null);
                    }}
                    rooms={activeRoomForMeasurement ? [activeRoomForMeasurement] : []}
                    projectTitle={formData.projectTitle}
                    initialData={formData.rooms.reduce((acc, r) => ({ ...acc, [r.id]: r.measurementData }), {})}
                    onSave={(data) => {
                        const { file, measurements, globalSettings, canvasImage } = data;

                        // 1. Always upload the file to the active room (if any) or 'Messprotokolle' context
                        if (activeRoomForMeasurement) {
                            handleImageUpload([file], {
                                assignedTo: activeRoomForMeasurement.name,
                                roomId: activeRoomForMeasurement.id
                            });

                            // Update room data
                            setFormData(prev => ({
                                ...prev,
                                rooms: prev.rooms.map(r => r.id === activeRoomForMeasurement.id ? {
                                    ...r,
                                    measurementData: { measurements, globalSettings, canvasImage }
                                } : r)
                            }));
                        } else {
                            handleImageUpload([file], {
                                assignedTo: 'Messprotokolle'
                            });
                        }

                        // 2. ADDITIONAL COPY: Saving to "Sonstiges" if PDF
                        // We create a new File object to ensure distinct processing ID and storage path
                        if (file.type === 'application/pdf') {
                            const fileCopy = new File([file], file.name, { type: file.type });
                            handleImageUpload([fileCopy], {
                                assignedTo: 'Sonstiges'
                            });
                        }
                    }}
                />
            </div >
        )
    }

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
                            <label className="form-label" htmlFor="assignedTo">Zuständig</label>
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

                    {/* Map Integration */}
                    {(formData.street || formData.city || formData.zip) && (
                        <div className="form-group" style={{ marginTop: '0rem', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '100%',
                                height: '300px',
                                borderRadius: 'var(--radius)',
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
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
                            </div>
                        </div>
                    )}

                    {/* Kontakte */}
                    <div className="form-group">
                        <label className="form-label">Kontakte (Name / Wohnung / Tel.Nr)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {formData.contacts && formData.contacts.map((contact, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                        {/* Art des Schadens */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="damageType">Art des Schadens</label>
                            <input
                                type="text"
                                id="damageType"
                                name="damageType"
                                className="form-input"
                                placeholder="z.B. Rohrbruch, Leckage..."
                                value={formData.damageType}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                    </div>

                    {/* Trocknung Protokoll - Nur sichtbar wenn Status = Trocknung */}
                    {formData.status === 'Trocknung' && (
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
                                                                    <button type="button" onClick={() => handleRemoveDevice(item.id)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
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

                                                                    {/* Row 3: Hours & Consumption */}
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
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>

                                                                    <button
                                                                        type="button"
                                                                        className={item.endDate ? "btn btn-ghost" : "btn btn-outline"}
                                                                        style={{
                                                                            fontSize: '0.75rem',
                                                                            padding: '0.25rem 0.5rem',
                                                                            color: item.endDate ? '#10B981' : 'var(--warning)',
                                                                            borderColor: item.endDate ? 'transparent' : 'var(--warning)',
                                                                            backgroundColor: item.endDate ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem'
                                                                        }}
                                                                        onClick={() => {
                                                                            const newEquipment = [...formData.equipment];
                                                                            // Set End Date to today
                                                                            newEquipment[originalIndex].endDate = new Date().toISOString().split('T')[0];
                                                                            setFormData(prev => ({ ...prev, equipment: newEquipment }));

                                                                            // Focus Zähler Ende input
                                                                            setTimeout(() => {
                                                                                const input = document.getElementById(`counter-end-${item.id}`);
                                                                                if (input) {
                                                                                    input.focus();
                                                                                    input.select(); // Select content if any
                                                                                    // Visual feedback
                                                                                    const originalBorder = input.style.borderColor;
                                                                                    input.style.borderColor = 'var(--primary)';
                                                                                    input.style.boxShadow = '0 0 0 2px rgba(14, 165, 233, 0.2)';
                                                                                    setTimeout(() => {
                                                                                        input.style.borderColor = originalBorder;
                                                                                        input.style.boxShadow = 'none';
                                                                                    }, 2000);
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

                                {/* Add new device form */}
                                <div id="add-device-form" style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', marginTop: 0 }}>Neues Gerät hinzufügen</h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {/* Device Selection */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Gerät wählen</label>
                                            <select
                                                className="form-input"
                                                value={selectedDevice ? selectedDevice.id : ''}
                                                onChange={(e) => {
                                                    const devId = e.target.value;
                                                    if (!devId) {
                                                        setSelectedDevice(null);
                                                        setNewDevice(prev => ({ ...prev, deviceNumber: '' }));
                                                        return;
                                                    }
                                                    const dev = availableDevices.find(d => d.id.toString() === devId);
                                                    setSelectedDevice(dev);
                                                    setNewDevice(prev => ({
                                                        ...prev,
                                                        deviceNumber: dev.number // Auto-fill number
                                                    }));
                                                }}
                                            >
                                                <option value="">-- Gerät wählen --</option>
                                                {availableDevices.map(device => (
                                                    <option key={device.id} value={device.id}>
                                                        #{device.number} - {device.type} {device.model ? `(${device.model})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            {/* Fallback / Manual Entry Toggle could go here if needed, but let's stick to list for now */}
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

                                    {/* Optional Second Row for Counters/Apartment */}
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


                            {/* Device List Export Button (Only if all devices have endDate) */}
                            {formData.equipment.length > 0 && formData.equipment.every(d => d.endDate) && (
                                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        className="btn btn-success"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10B981', borderColor: '#10B981', color: '#fff' }}
                                        onClick={() => {
                                            const doc = new jsPDF();
                                            doc.setFontSize(16);
                                            doc.text(`Geräteliste / Stromnachweis`, 14, 20);
                                            doc.setFontSize(10);
                                            doc.text(`Projekt: ${formData.projectTitle || ''}`, 14, 30);
                                            doc.text(`Kunde: ${formData.client || ''}`, 14, 35);
                                            doc.text(`Datum: ${new Date().toLocaleDateString('de-CH')}`, 14, 40);

                                            const tableBody = formData.equipment.map(item => {
                                                const start = new Date(item.startDate);
                                                const end = new Date(item.endDate);
                                                const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                                                const consumption = (item.counterEnd && item.counterStart) ? (item.counterEnd - item.counterStart) : 0;
                                                return [
                                                    item.deviceNumber || '-',
                                                    item.type || '-',
                                                    item.room || '-',
                                                    `${days} Tage`,
                                                    `${consumption} kWh`,
                                                    item.hours ? `${item.hours} h` : '-'
                                                ];
                                            });

                                            autoTable(doc, {
                                                startY: 50,
                                                head: [['Gerät Nr.', 'Typ', 'Raum', 'Laufzeit', 'Verbrauch', 'Betrieb Std.']],
                                                body: tableBody,
                                                theme: 'grid',
                                                headStyles: { fillColor: [16, 185, 129] }
                                            });

                                            doc.save(`Geräteliste_${formData.projectTitle || 'Export'}.pdf`);
                                        }}
                                    >
                                        <FileText size={16} />
                                        Geräteliste Exportieren (PDF)
                                    </button>
                                </div>
                            )}

                        </div>
                    )}

                    {/* Interne Notizen */}
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

                    {/* Arbeitsrapporte Section */}
                    <div style={{ marginTop: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                            Arbeitsrapporte
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

                    {/* Document Categories */}
                    <div style={{ marginTop: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                            Bilder & Dokumente
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>


                            {/* Dynamic Room Categories for Erste Begehung & Leckortung & Trocknung */}
                            {(formData.status === 'Schadenaufnahme' || formData.status === 'Leckortung' || formData.status === 'Trocknung') && (
                                <div style={{ gridColumn: '1 / -1', marginBottom: '1rem' }}>
                                    {/* Room Management UI */}
                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '2rem' }}>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>Räume verwalten</h4>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
                                            <div style={{ flex: 1 }}>
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
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Wohnung (Optional)</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="z.B. EG Links"
                                                    value={newRoom.apartment}
                                                    onChange={(e) => setNewRoom(prev => ({ ...prev, apartment: e.target.value }))}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={handleAddRoom}
                                                disabled={!newRoom.name}
                                                style={{ height: '38px' }}
                                            >
                                                <Plus size={18} />
                                                Raum hinzufügen
                                            </button>
                                        </div>

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
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveRoom(room.id)}
                                                            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex' }}
                                                        >
                                                            <X size={14} />
                                                        </button>
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
                                                        {!room.measurementData && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveRoomForMeasurement(room);
                                                                    setIsNewMeasurement(false);
                                                                    setShowMeasurementModal(true);
                                                                }}
                                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', gap: '0.25rem', color: 'var(--success)', borderColor: 'var(--success)' }}
                                                                title="Messprotokoll"
                                                            >
                                                                <Edit3 size={14} /> Messung
                                                            </button>
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

                                                    {/* Previews */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                                                        {formData.images.filter(img => img.roomId === room.id).map((item, idx) => (
                                                            <div key={idx} style={{
                                                                position: 'relative',
                                                                aspectRatio: '1',
                                                                borderRadius: 'var(--radius)',
                                                                overflow: 'hidden',
                                                                border: '1px solid var(--border)',
                                                                group: 'group'
                                                            }}
                                                                className="group"
                                                            >
                                                                <img
                                                                    src={item.preview}
                                                                    alt=""
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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

                                                                {/* Status Indicators */}
                                                                <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                                                                    {item.includeInReport !== false && (
                                                                        <div style={{ backgroundColor: '#22C55E', borderRadius: '50%', padding: '2px' }} title="Im Bericht">
                                                                            <CheckCircle size={12} color="white" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Messprotokolle Special Section (Goodnotes / Measurement) */}
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
                                </div>

                                {/* Divider */}
                                <div style={{ borderTop: '1px solid var(--border)', margin: '0 -1.5rem 1.5rem -1.5rem' }}></div>

                                {/* Section 2: Protokolle */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                                        <div>
                                            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--primary)' }}>Protokolle</h4>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                Exportierte Protokolle (PDF/Excel)
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                onClick={generateExcelExport}
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', gap: '0.4rem', borderColor: '#10B981', color: '#10B981', display: 'flex', alignItems: 'center' }}
                                                title="Excel Export aller Messräume"
                                            >
                                                <Table size={14} />
                                                Excel Export
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                onClick={generatePDFExport}
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', gap: '0.4rem', borderColor: '#EF4444', color: '#EF4444', display: 'flex', alignItems: 'center' }}
                                                title="PDF Export (Pro Raum eine Seite)"
                                            >
                                                <FileText size={14} />
                                                PDF Export
                                            </button>
                                        </div>
                                    </div>

                                    {/* Calculated / Generated Files List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {formData.images
                                            .filter(img => img.assignedTo === 'Messprotokolle')
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
                                                    {(item.file && item.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') || (item.name && item.name.endsWith('.xlsx')) ? (
                                                        <div style={{ padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {/* Excel Icon */}
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
                                                                <path fill="#10B981" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                                                <path fill="rgba(255,255,255,0.5)" d="M14 2v6h6" />
                                                                <path fill="#fff" d="M8.5 17L11 13 8.5 9h2l1.3 2.5L13.1 9h2l-2.5 4 2.5 4h-2l-1.3-2.5-1.3 2.5h-2z" />
                                                            </svg>
                                                        </div>
                                                    ) : (item.file && item.file.type === 'application/pdf') || (item.name && item.name.toLowerCase().endsWith('.pdf')) ? (
                                                        <div style={{ padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {/* PDF Icon */}
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
                                                                <path fill="#EF4444" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                                                                <path fill="rgba(255,255,255,0.5)" d="M14 2v6h6" />
                                                                <text x="50%" y="70%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">PDF</text>
                                                            </svg>
                                                        </div>
                                                    ) : (
                                                        <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <FileText size={18} color="var(--text-muted)" />
                                                        </div>
                                                    )}

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
                                        {formData.images.filter(img => img.assignedTo === 'Messprotokolle').length === 0 && (
                                            <div style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                                                Keine Protokolle vorhanden.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

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
                                                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
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
                                                            <div style={{ padding: '0.5rem', backgroundColor: '#F1F5F9', borderRadius: '4px' }}>
                                                                <FileText size={24} color="#64748B" />
                                                            </div>
                                                            <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, textDecoration: 'underline' }}>
                                                                {item.name}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        // Image Layout
                                                        <>
                                                            <div style={{ width: '200px', height: '200px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: '4px' }}>
                                                                <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                            </div>
                                                            <div style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 0.5rem' }} title={item.name}>
                                                                {item.name}
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
                        </div>
                    </div>


                    {/* Summary Table (Moved to bottom) */}
                    {formData.equipment.some(d => d.endDate && d.counterEnd) && (
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
                                        {(() => {
                                            const finished = formData.equipment.filter(d => d.endDate && d.counterEnd);
                                            const totalHours = finished.reduce((acc, curr) => acc + (parseFloat(curr.hours) || 0), 0);
                                            const totalKwh = finished.reduce((acc, curr) => acc + ((parseFloat(curr.counterEnd) || 0) - (parseFloat(curr.counterStart) || 0)), 0);

                                            return (
                                                <tr style={{ backgroundColor: 'var(--bg-muted)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                                                    <td style={{ padding: '0.75rem' }} colSpan={4}>Gesamt</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalHours} h</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{totalKwh.toFixed(2)} kWh</td>
                                                </tr>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

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
                            <button type="submit" className="btn btn-primary">
                                <Save size={18} />
                                Speichern
                            </button>
                        </div>
                    </div>
                </form >

                {editingImage && (
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
                                            // Save back to formData
                                            setFormData(prev => ({
                                                ...prev,
                                                images: prev.images.map(img => {
                                                    // Use reference check or some ID if available. 
                                                    // Since we set activeImageMeta = item (ref) originally, and assuming we modified it... 
                                                    // Wait, we modified `activeImageMeta` state, which is valid.
                                                    // We need to find the original image in the array.
                                                    // We can rely on `preview` url existing or similar. 
                                                    // PROPER WAY: Use index or ID. We don't have IDs on all images maybe?
                                                    // let's assign IDs on upload next time. For now, reference match might fail if we created a new object.
                                                    // Actually, `activeImageMeta` IS a new object because of `setActiveImageMeta(prev => ({...prev}))`.
                                                    // So we need to match by something unique. `preview` URL is usually unique enough (blob/base64).
                                                    return img.preview === activeImageMeta.preview ? activeImageMeta : img;
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
                            onClose={() => setShowEmailImport(false)}
                            onImport={handleEmailImport}
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
                            handleImageUpload([file], {
                                assignedTo: activeRoomForMeasurement.name,
                                roomId: activeRoomForMeasurement.id
                            });

                            // Update room data
                            setFormData(prev => ({
                                ...prev,
                                rooms: prev.rooms.map(r => r.id === activeRoomForMeasurement.id ? {
                                    ...r,
                                    measurementData: { measurements, globalSettings, canvasImage }
                                } : r)
                            }));
                        } else {
                            handleImageUpload([file], {
                                assignedTo: 'Messprotokolle'
                            });
                        }

                        // 2. ADDITIONAL COPY: Saving to "Sonstiges" if PDF
                        if (file.type === 'application/pdf') {
                            const fileCopy = new File([file], file.name, { type: file.type });
                            handleImageUpload([fileCopy], {
                                assignedTo: 'Sonstiges'
                            });
                        }

                        setIsNewMeasurement(false);
                    }}
                />
            </div >

            {/* Report Configuration Modal */}
            {
                showReportModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                    }}>
                        <div className="card" style={{ width: '500px', padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Bericht erstellen</h3>

                            <div className="form-group">
                                <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>
                                    Schadenursache (wird im Bericht angezeigt)
                                </label>
                                <textarea
                                    className="form-input"
                                    rows={4}
                                    value={reportCause}
                                    onChange={(e) => setReportCause(e.target.value)}
                                    placeholder="Beschreiben Sie hier die Ursache des Schadens..."
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => setShowReportModal(false)}
                                >
                                    Abbrechen
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setShowReportModal(false);
                                        // Save cause to form data state implicitly via closure? 
                                        // No, update form data state so it persists
                                        setFormData(prev => ({ ...prev, cause: reportCause }));
                                        // Trigger PDF logic
                                        generatePDFContent();
                                    }}
                                >
                                    PDF erstellen
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Print Report Template - Hidden on Screen unless generating */}
            <div
                id="print-report"
                className="print-only"
                style={{
                    display: isGeneratingPDF ? 'block' : 'none',
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
                                <div style={{ fontSize: '9pt', color: '#64748B' }}>Bau- & Wasserschadensanierung</div>
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
                                        .filter(img => img.roomId === room.id && img.includeInReport !== false)
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
            </div >
        </>
    )
}
