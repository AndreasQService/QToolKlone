import React, { useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Upload, FileText, X, Image as ImageIcon } from "lucide-react";
import { createPortal } from 'react-dom';
import OpenAI from "openai";

function safeName(filename) {
  return filename.replace(/[^\w.\-]+/g, "_");
}

/*
 * UploadPanel - "Smart Universal Dropzone"
 * - Akzeptiert: PDF, MSG, TXT (Analyse) UND Bilder (JPG, PNG) (Direkt-Upload)
 * - Verarbeitet alles automatisch (Client-Side AI Analysis)
 */
export default function UploadPanel({ caseId, onCaseCreated, onExtractionComplete, onImagesUploaded }) {
  const [files, setFiles] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // --- Helper: Ensure Case ID ---
  async function ensureCaseId() {
    if (caseId) return caseId;
    const newId = "TMP-" + Date.now();
    const { error } = await supabase
      .from("damage_reports")
      .insert({ id: newId, report_data: {} });
    if (error) throw error;
    onCaseCreated?.(newId);
    return newId;
  }

  // --- CLIENT SIDE AI ANALYSIS HELPER ---
  const analyzeWithAI = async (textContext) => {
    const apiKey = localStorage.getItem('openai_api_key') || import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert("Kein OpenAI API Key gefunden. Bitte setzen Sie diesen im 'Email-Import' Modal einmalig.");
      return null;
    }

    try {
      if (typeof window.fetch === 'undefined') {
        throw new Error("Browser support missing for Fetch API.");
      }

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
            content: `Du extrahierst strukturierte Daten für eine Gebäude-Sanierungsfirma (Q-Service).

Regeln:
- Erfinde keine Informationen.
- Wenn ein Wert nicht eindeutig vorhanden ist, setze null.
- projectTitle Format: "[Schadenstyp] - [Strasse]"
- client ist die Firma oder Person, die den Auftrag erteilt oder erstellt hat.
  In Verwaltungsaufträgen ist dies in der Regel die Verwaltung.
  Eigentümer oder Rechnungsadresse sind nicht automatisch Auftraggeber.
- street enthält nur Strasse und Hausnummer.
- zip enthält nur die 4-stellige PLZ.
- city enthält nur den Ortsnamen.
- description ist eine sachliche, kurze Zusammenfassung (max. 3 Sätze).

Rollen-Zuordnung für contacts:
- Mieter: betroffene Person oder Zutrittsperson.
- Verwaltung: Person oder Firma, die den Auftrag erstellt oder versendet hat.
- Eigentümer: im Abschnitt Eigentümer genannte Partei.
- Hauswart: wenn explizit so bezeichnet.
- Sonstiges: nur wenn keine der oben genannten Rollen zutrifft.

 Format (JSON):
 {
     "projectTitle": "...",
     "client": "...",
     "street": "...",
     "zip": "...",
     "city": "...",
     "description": "...",
     "contacts": [
         { "name": "...", "phone": "...", "role": "...", "email": "..." }
     ]
 }`
          },
          { role: "user", content: textContext }
        ],
        temperature: 0.0,
        response_format: { type: "json_object" }
      });

      let aiContent = response.choices[0].message.content.trim();
      aiContent = aiContent.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');

      const parsedData = JSON.parse(aiContent);
      if (!parsedData.contacts) parsedData.contacts = [];
      return parsedData;

    } catch (e) {
      console.error("AI Analysis Failed", e);
      // Don't throw to prevent crashing the whole loop, just return null
      // But maybe we want to alert?
      return null;
    }
  };

  // --- PDF PARSER HELPER ---
  const processPdfFile = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjs = await import('pdfjs-dist/build/pdf');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `--- Seite ${i} ---\n${pageText}\n\n`;
      }
      return fullText;
    } catch (e) {
      console.error("PDF Parse Error", e);
      throw new Error("PDF konnte nicht gelesen werden.");
    }
  };

  // --- File Handling ---
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };


  // --- Action: Upload & Analyze Files (Smart Handling) ---
  const handleUploadFiles = async () => {
    if (!files.length) return;
    setLoading(true);
    setStatus("⏳ Verarbeite Dateien...");

    try {
      const id = await ensureCaseId();
      let newImages = [];
      let lastExtractionData = null;

      for (const file of files) {
        const lowerName = file.name.toLowerCase();

        // --- TYPE 1: BILDER (JPG, PNG, GIF, WEBP) ---
        if (lowerName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filePath = `cases/${id}/images/${timestamp}_${safeName(file.name)}`;

            const { error: uploadError } = await supabase.storage
              .from("case-files")
              .upload(filePath, file);

            if (uploadError) throw new Error("Image Upload Error: " + uploadError.message);

            const { data: { publicUrl } } = supabase.storage
              .from("case-files")
              .getPublicUrl(filePath);

            newImages.push({
              preview: publicUrl,
              name: file.name,
              description: 'E-Mail Anhang',
              date: new Date().toISOString(),
              roomId: null
            });
          } catch (e) {
            console.error("Image error", e);
            setStatus(prev => prev + ` ❌ Bild ${file.name} fehlgeschlagen.`);
          }
        }

        // --- TYPE 2: DOKUMENTE (PDF, MSG, TXT) ---
        else if (lowerName.match(/\.(pdf|msg|txt)$/)) {
          try {
            const fileType = lowerName.endsWith(".pdf") ? "pdf" : (lowerName.endsWith(".txt") ? "txt" : "msg");

            // 1. Upload Original
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filePath = `cases/${id}/original/${timestamp}_${safeName(file.name)}`;
            await supabase.storage.from("case-files").upload(filePath, file, { upsert: true });

            // 2. DB Entry
            await supabase.from("case_documents").insert({
              case_id: id, file_path: filePath, file_type: fileType, original_filename: file.name, extraction_status: "pending"
            });

            // 3. Client-Side Analysis (Bypass Edge Function)
            setStatus(`⏳ Analysiere ${file.name}...`);

            let textToAnalyze = "";
            if (fileType === 'pdf') {
              textToAnalyze = await processPdfFile(file);
            } else if (fileType === 'txt') {
              textToAnalyze = await file.text();
            } else {
              textToAnalyze = "MSG Analyse client-seitig noch nicht unterstützt.";
            }

            if (textToAnalyze && textToAnalyze.length > 20) {
              const aiResult = await analyzeWithAI(textToAnalyze);
              if (aiResult) lastExtractionData = aiResult;
            }

            // Add to Gallery List
            const { data: { publicUrl } } = supabase.storage
              .from("case-files")
              .getPublicUrl(filePath);

            newImages.push({
              preview: publicUrl, // URL to file
              name: file.name,
              description: 'Dokument',
              date: new Date().toISOString(),
              roomId: null,
              type: 'document', // Marker
              fileType: fileType // pdf, msg, txt
            });

          } catch (e) {
            console.error("Doc error", e);
            setStatus(prev => prev + ` ❌ Dok ${file.name} fehlgeschlagen.`);
          }
        } else {
          setStatus(prev => prev + ` ⚠️ Unbekannter Typ: ${file.name}`);
        }
      }

      // --- FINISH ---
      if (newImages.length > 0 && onImagesUploaded) {
        onImagesUploaded(newImages);
      }

      if (files.length > 0) {
        setStatus("✅ Verarbeitung abgeschlossen.");
        setFiles([]);
      }

      if (lastExtractionData) {
        setPreviewData(lastExtractionData);
      }

    } catch (err) {
      console.error(err);
      setStatus(`❌ Globaler Fehler: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };


  // --- Action: Analyze Text Input ---
  const handleAnalyzeText = async () => {
    if (!textInput.trim()) return;
    setLoading(true);
    setStatus("⏳ Analysiere Text...");

    try {
      const id = await ensureCaseId();

      // Upload as .txt for record keeping
      const blob = new Blob([textInput], { type: "text/plain" });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `manual_input_${timestamp}.txt`;
      const filePath = `cases/${id}/original/${filename}`;
      await supabase.storage.from("case-files").upload(filePath, blob, { upsert: true });

      // Client Side Analysis
      const aiResult = await analyzeWithAI(textInput);

      if (aiResult) {
        setStatus("✅ Text-Analyse bereit zur Voransicht.");
        setPreviewData(aiResult);
        setTextInput("");
      }

    } catch (err) {
      console.error(err);
      setStatus(`❌ Fehler beim Text: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- PREVIEW RENDERER (Overlay) ---
  const renderPreview = () => {
    if (!previewData) return null;
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
            {previewData.contacts && previewData.contacts.map((c, idx) => (
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
            <button onClick={() => setPreviewData({ ...previewData, contacts: [...(previewData.contacts || []), { role: '', name: '', phone: '', email: '' }] })} className="btn btn-ghost" style={{ alignSelf: 'start' }}>+ Kontakt hinzufügen</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button onClick={() => setPreviewData(null)} className="btn btn-outline">Abbrechen</button>
            <button onClick={() => {
              if (onExtractionComplete) onExtractionComplete(previewData);
              setPreviewData(null);
            }} className="btn btn-primary">Übernehmen</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };


  return (
    <>
      {renderPreview()}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: 16 }}>

        {/* --- Drag & Drop Zone (Smart) --- */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? '#2563eb' : '#4b5563'}`,
            borderRadius: "8px",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: dragActive ? "rgba(37, 99, 235, 0.1)" : "transparent",
            transition: "all 0.2s ease",
            cursor: "pointer",
            position: "relative"
          }}
          onClick={() => document.getElementById('file-upload-input').click()}
        >
          <input
            id="file-upload-input"
            type="file"
            multiple
            accept=".pdf,.msg,.txt,.jpg,.jpeg,.png,.gif,application/pdf,image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            <Upload size={32} style={{ color: "var(--text-muted)" }} />
            <ImageIcon size={32} style={{ color: "var(--text-muted)" }} />
          </div>
          <p style={{ margin: 0, fontWeight: 500, color: "var(--text-main)" }}>
            Alles hier ablegen: Dokumente & Bilder
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            PDF, MSG, TXT (Analyse) + JPG, PNG (Galerie)
          </p>

          {files.length > 0 && (
            <div style={{ marginTop: "1rem", width: "100%", maxWidth: "300px" }} onClick={(e) => e.stopPropagation()}>
              {files.map((f, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--surface)", padding: "0.5rem", borderRadius: "4px", marginBottom: "0.25rem",
                  border: "1px solid var(--border)"
                }}>
                  <span style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleUploadFiles}
                disabled={loading}
                style={{
                  width: "100%", marginTop: "0.5rem", padding: "0.5rem",
                  backgroundColor: "var(--primary)", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? "Verarbeite ..." : "Starten (Alles autom.)"}
              </button>
            </div>
          )}
        </div>

        {/* --- Text Input Area --- */}
        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px", backgroundColor: "var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FileText size={18} style={{ color: "var(--text-muted)" }} />
            <strong style={{ fontSize: "0.9rem", color: "var(--text-main)" }}>Text direkt einfügen</strong>
          </div>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Kopieren Sie hier E-Mail Text oder Notizen hinein..."
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--text-main)",
              resize: "vertical",
              fontFamily: "inherit",
              fontSize: "0.9rem"
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: status.startsWith('❌') ? '#ef4444' : '#10b981' }}>{status}</span>
            <button
              onClick={handleAnalyzeText}
              disabled={loading || !textInput.trim()}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: !textInput.trim() ? "var(--muted)" : "var(--primary)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: !textInput.trim() ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "..." : "Text analysieren"}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
