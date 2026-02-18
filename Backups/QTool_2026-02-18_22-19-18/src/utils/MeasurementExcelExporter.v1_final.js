import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generateMeasurementExcel = async (formData) => {
    // 1. Create Workbook
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
                buffer: logoBuffer,
                extension: 'png',
            });
        }
    } catch (err) {
        console.error("Error loading logo for Excel:", err);
    }

    // 2. Filter Rooms with Data
    const roomsWithData = formData.rooms.filter(room =>
        (room.measurementData && room.measurementData.canvasImage) ||
        (room.measurementData && room.measurementData.measurements && room.measurementData.measurements.length > 0)
    );

    if (roomsWithData.length === 0) {
        alert("Keine Messdaten oder Skizzen vorhanden.");
        return;
    }

    // sort rooms logic
    roomsWithData.sort((a, b) => {
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

    // 3. Create Sheet per Room
    for (const room of roomsWithData) {
        let sheetName = `${room.name} ${room.apartment || ''}`.trim();
        sheetName = sheetName.replace(/[*?:\/\[\]]/g, '');
        if (sheetName.length > 30) sheetName = sheetName.substring(0, 30);

        let uniqueName = sheetName;
        let counter = 1;
        while (workbook.getWorksheet(uniqueName)) {
            uniqueName = `${sheetName.substring(0, 25)}_${counter}`;
            counter++;
        }

        const worksheet = workbook.addWorksheet(uniqueName);

        // --- Set Column Widths (Matches Screenshot approx) ---
        worksheet.getColumn(1).width = 2;  // SPACER
        worksheet.getColumn(2).width = 25; // Labels / Datum
        worksheet.getColumn(3).width = 30; // Values / Messpunkt
        worksheet.getColumn(4).width = 15; // Wand
        worksheet.getColumn(5).width = 15; // Boden
        worksheet.getColumn(6).width = 40; // Notizen

        // --- Insert Logo (Top Left) ---
        if (logoId !== null) {
            worksheet.addImage(logoId, {
                tl: { col: 1, row: 0.2 }, // Start at Col 2 (after spacer)
                ext: { width: 99, height: 60 }, // Aspect ratio ~1.65 (1024x622)
                editAs: 'oneCell'
            });
        }

        // --- Header Info Block (Boxed) ---
        // Starts below logo approx Row 4
        let currentRow = 5;

        // Define Project Info
        const infoData = [
            { label: 'Projekt:', value: formData.projectTitle || '' },
            { label: 'Schadenort:', value: formData.locationDetails || '' },
            { label: 'Adresse:', value: `${formData.street || ''}, ${formData.zip} ${formData.city || ''}` },
            { label: 'Raum:', value: room.name },
            { label: 'Wohnung:', value: room.apartment || '' }
        ];

        infoData.forEach((item, index) => {
            const row = worksheet.getRow(currentRow + index);
            row.height = 20;

            // Label Cell (Col 2)
            const labelCell = row.getCell(2);
            labelCell.value = item.label;
            labelCell.font = { bold: true };
            labelCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' }, // Box Left
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Value Cell (Col 3, merged across?)
            // Screenshot shows simple adjacent cells.
            const valueCell = row.getCell(3);
            valueCell.value = item.value;
            valueCell.font = { bold: true };
            valueCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' } // Box Right
            };

            // Merge value cell horizontally across Col 3-6 if needed?
            // Usually address is long. Let's merge 3-6 for the value.
            worksheet.mergeCells(currentRow + index, 3, currentRow + index, 6);
            // Apply border to merged cell
            worksheet.getCell(currentRow + index, 3).border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thick' } // Outer Right? No, standard thin.
            };
            // Fix outer borders for the block
            // Top row
            if (index === 0) {
                labelCell.border.top = { style: 'medium' };
                worksheet.getCell(currentRow + index, 3).border.top = { style: 'medium' };
            }
            // Bottom row
            if (index === infoData.length - 1) {
                labelCell.border.bottom = { style: 'medium' };
                worksheet.getCell(currentRow + index, 3).border.bottom = { style: 'medium' };
            }
            // Left edge
            labelCell.border.left = { style: 'medium' };
            // Right edge (of merged cell)
            worksheet.getCell(currentRow + index, 6).border.right = { style: 'medium' }; // Since merged, border on last col? 
            // Actually ExcelJS merges apply styling to master. But border Right needs to be on master? 
            // For merged cells, you usually style the top-left cell.
            worksheet.getCell(currentRow + index, 3).border = {
                ...worksheet.getCell(currentRow + index, 3).border,
                right: { style: 'medium' }
            };
            // Wait, standard internal borders thin, outer box thick/medium.
            // Let's stick to 'thin' everywhere for simplicity first, matching screenshot standard look.
            // Screenshot shows a BOX around the whole thing.
            // I'll use 'medium' for the box outline.

            const masterValue = worksheet.getCell(currentRow + index, 3);
            masterValue.border = {
                top: (index === 0) ? { style: 'medium' } : { style: 'thin' },
                bottom: (index === infoData.length - 1) ? { style: 'medium' } : { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'medium' }
            };

            labelCell.border = {
                top: (index === 0) ? { style: 'medium' } : { style: 'thin' },
                bottom: (index === infoData.length - 1) ? { style: 'medium' } : { style: 'thin' },
                left: { style: 'medium' },
                right: { style: 'thin' }
            };

        });

        currentRow += infoData.length + 2; // Space after info block

        // --- Sketch Image ---
        if (room.measurementData && room.measurementData.canvasImage) {
            try {
                const imageId = workbook.addImage({
                    base64: room.measurementData.canvasImage,
                    extension: 'png',
                });

                // Position Image
                worksheet.addImage(imageId, {
                    tl: { col: 1.5, row: currentRow - 1 },
                    ext: { width: 600, height: 400 }
                });

                currentRow += 22;
            } catch (e) {
                console.error("Error adding sketch image:", e);
            }
        }

        // --- Measurement History Table ---
        currentRow += 1;
        const titleCell = worksheet.getCell(`B${currentRow}`);
        titleCell.value = "Messprotokoll";
        titleCell.font = { bold: true, size: 12, color: { argb: 'FF4472C4' } }; // Light Blue
        titleCell.alignment = { horizontal: 'center' };
        worksheet.mergeCells(currentRow, 2, currentRow, 6);
        currentRow += 1;

        // Table Header
        const headerRow = worksheet.getRow(currentRow);
        headerRow.values = [null, 'Datum', 'Messpunkt', 'Wand', 'Boden', 'Notizen'];
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
        headerRow.height = 24;
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Header Styling (Col 2-6)
        for (let c = 2; c <= 6; c++) {
            const cell = headerRow.getCell(c);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' } // Blue Background (Method Blue)
            };
            cell.border = {
                top: { style: 'medium' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            };
            if (c === 2 || c === 6) cell.alignment = { vertical: 'middle', horizontal: 'left' }; // Date/Notes Left
            if (c === 2) cell.border.left = { style: 'medium' };
            if (c === 6) cell.border.right = { style: 'medium' };
        }
        currentRow++;

        const historyData = room.measurementHistory || [];
        // Fallback to active data
        let dataRows = [];
        const sortedHistory = [...historyData].sort((a, b) => new Date(b.date) - new Date(a.date));

        const processMeas = (measurements, date) => {
            measurements.forEach(m => {
                dataRows.push([
                    null,
                    date,
                    m.pointName,
                    parseFloat(m.w_value) || m.w_value,
                    parseFloat(m.b_value) || m.b_value,
                    m.notes || ''
                ]);
            });
        };

        if (sortedHistory.length > 0) {
            sortedHistory.forEach(entry => {
                processMeas(entry.measurements, new Date(entry.date).toLocaleDateString('de-CH'));
            });
        } else if (room.measurementData && room.measurementData.measurements) {
            processMeas(room.measurementData.measurements, new Date(room.measurementData.globalSettings?.date || new Date()).toLocaleDateString('de-CH'));
        }

        // Add rows with styling
        dataRows.forEach((rowVals, index) => {
            const row = worksheet.getRow(currentRow);
            row.values = rowVals;
            row.height = 20;

            // Alignment
            row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
            row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
            row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
            row.getCell(6).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

            // Borders (Boxed Table)
            // Internal thin, external medium
            for (let c = 2; c <= 6; c++) {
                const cell = row.getCell(c);
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
                if (c === 2) cell.border.left = { style: 'medium' };
                if (c === 6) cell.border.right = { style: 'medium' };
                if (index === dataRows.length - 1) cell.border.bottom = { style: 'medium' };
            }

            currentRow++;
        });

    }

    // 4. Save
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Messprotokoll_${formData.projectTitle || 'Export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
};
