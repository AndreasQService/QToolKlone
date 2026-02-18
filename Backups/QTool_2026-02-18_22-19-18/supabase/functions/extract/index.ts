import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { document_id } = await req.json()
        if (!document_id) throw new Error("Missing document_id")

        // 1. Setup Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''

        if (!openaiApiKey) {
            throw new Error("OPENAI_API_KEY is not set in Secrets")
        }

        const supabase = createClient(supabaseUrl, supabaseKey)

        // 2. Fetch Document Info
        const { data: doc, error: docError } = await supabase
            .from("case_documents")
            .select("*")
            .eq("id", document_id)
            .single()

        if (docError || !doc) throw new Error("Document not found")

        // 3. Download File from Storage
        const { data: fileData, error: downloadError } = await supabase
            .storage
            .from("case-files")
            .download(doc.file_path)

        if (downloadError) throw downloadError

        // 4. Extract Text content
        let textContent = "";

        // Einfache Text-Extraktion für .txt, .pdf und .msg
        if (doc.file_type === 'txt' || doc.file_path.endsWith('.txt')) {
            textContent = await fileData.text();

        } else if (doc.file_type === 'pdf' || doc.file_path.toLowerCase().endsWith('.pdf')) {
            try {
                console.log("Parsing PDF...");
                const arrayBuffer = await fileData.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const pdfData = await pdfParse(buffer);
                textContent = pdfData.text;
                console.log("PDF Parsed successfully.");
            } catch (e) {
                console.error("PDF Parse Error:", e);
                textContent = "[[Error parsing PDF file. Only metadata available.]]";
            }

        } else if (doc.file_type === 'msg' || doc.file_path.toLowerCase().endsWith('.msg')) {
            // MSG fallback extraction (Extract readable strings)
            try {
                console.log("Parsing MSG (Fallback)...");
                const arrayBuffer = await fileData.arrayBuffer();
                // Simple regex to extract printable chars > 4 length
                const decoder = new TextDecoder('utf-8'); // Try utf-8 first
                const rawText = decoder.decode(arrayBuffer);

                // Filter for printable sequences to avoid binary garbage
                // This is a naive heuristic but works well for extracting body text from MSGs
                textContent = rawText.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (textContent.length < 50) {
                    // If UTF-8 failed (binary MSG), try pure ASCII regex on the buffer directly
                    const buffer = Buffer.from(arrayBuffer);
                    const ascii = buffer.toString('binary').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
                    textContent = ascii.replace(/\s+/g, ' ').trim();
                }
                console.log("MSG Parsed (Fallback).");
            } catch (e) {
                console.error("MSG Parse Error:", e);
                textContent = "[[Error parsing MSG file.]]";
            }
        } else {
            textContent = "[[Unsupported File Type]]";
        }

        console.log("Extracted text length:", textContent.length);
        console.log("Text preview:", textContent.slice(0, 100));

        // 5. Call OpenAI
        const systemPrompt = `
Du extrahierst strukturierte Daten für eine Gebäude-Sanierungsfirma (Q-Service).

WICHTIG:
- Erfinde keine Informationen.
- Wenn ein Wert nicht eindeutig vorhanden ist, setze null.
- projectTitle Format: "[Schadenstyp] - [Strasse]"
- client ist die Firma oder Person, die den Auftrag erteilt.
- street enthält nur Strasse und Hausnummer.
- zip enthält nur die 4-stellige PLZ.
- city enthält nur den Ortsnamen.
- description ist eine sachliche Zusammenfassung des Schadens (max. 3 Sätze).
- Rolle muss eine der vorgegebenen Rollen sein.
    `;

        const completion = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "extraction_result",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                projectTitle: { type: ["string", "null"] },
                                client: { type: ["string", "null"] },
                                street: { type: ["string", "null"] },
                                zip: {
                                    type: ["string", "null"],
                                    pattern: "^[0-9]{4}$"
                                },
                                city: { type: ["string", "null"] },
                                description: { type: ["string", "null"] },
                                contacts: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            role: {
                                                type: ["string", "null"],
                                                enum: ["Mieter", "Eigentümer", "Verwaltung", "Hauswart", "Sonstiges", null]
                                            },
                                            name: { type: ["string", "null"] },
                                            phone: { type: ["string", "null"] },
                                            email: { type: ["string", "null"] }
                                        },
                                        required: ["role", "name", "phone", "email"],
                                        additionalProperties: false
                                    }
                                }
                            },
                            required: ["projectTitle", "client", "street", "zip", "city", "description", "contacts"],
                            additionalProperties: false
                        }
                    }
                },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Hier ist der Text des Dokuments/der Nachricht:\n\n${textContent}` }
                ],
                temperature: 0
            })
        });

        const aiRes = await completion.json();
        console.log("OpenAI Response Status:", completion.status);

        if (aiRes.error) {
            throw new Error("OpenAI Error: " + aiRes.error.message);
        }

        let rawContent = aiRes.choices[0].message.content;
        // Cleanup JSON markdown if present
        rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

        let aiResult;
        try {
            aiResult = JSON.parse(rawContent);
        } catch (e) {
            console.error("JSON Parse Error:", rawContent);
            throw new Error("Failed to parse AI response as JSON");
        }

        // 6. Save Extraction to DB
        const { error: insertError } = await supabase
            .from("case_extractions")
            .insert({
                case_id: doc.case_id,
                json_result: aiResult,
                confidence: { score: 1.0 }, // Dummy Score
                evidence: { document_id: document_id }
            });

        if (insertError) throw insertError;

        // 7. Update Document Status
        await supabase
            .from("case_documents")
            .update({ extraction_status: "completed" })
            .eq("id", document_id);

        // 8. Optional: Merge into report_data (Behalten wir bei, damit 'Magic' direkt sichtbar ist,
        //    aber Frontend steuert ja jetzt via Vorschau)
        //    Wir machen es trotzdem, falls der User refresht.
        const { data: report } = await supabase.from("damage_reports").select("report_data").eq("id", doc.case_id).single();
        const currentData = report?.report_data || {};
        // Nur leere Felder auffüllen? Oder überschreiben? 
        // Strategie: AI Ergebnis ist "Vorschlag". Wir speichern es hier NICHT direkt hart in den Report, 
        // sondern verlassen uns darauf, dass das Frontend es via "case_extractions" oder Rückgabewert holt.
        // ABER: Dein Frontend-Code erwartet im Moment die Daten zurück vom Function Call.

        // Return result to client
        return new Response(
            JSON.stringify({ success: true, data: aiResult }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )

    } catch (error) {
        console.error(error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        )
    }
})
