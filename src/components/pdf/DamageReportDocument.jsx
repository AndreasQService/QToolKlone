/* eslint-disable react/prop-types */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Create styles
const styles = StyleSheet.create({
    page: {
        padding: 30,
        paddingBottom: 80, // Space for footer
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: '#000000',
        lineHeight: 1.5,
    },

    header: {
        marginBottom: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    logo: {
        width: 100,
        height: 40,
        objectFit: 'contain',
    },
    companyInfo: {
        textAlign: 'right',
        fontSize: 9,
        color: '#64748B',
        lineHeight: 1.2,
        marginLeft: 'auto',
    },
    titleSection: {
        marginBottom: 20,
    },
    mainTitle: {
        fontSize: 22,
        color: '#0F6EA3',
        fontWeight: 'bold',
        marginBottom: 12,
    },
    subTitle: {
        fontSize: 14,
        color: '#000000',
        marginBottom: 2,
    },
    projectTitle: {
        fontSize: 10,
        color: '#64748B',
    },
    metaSection: {
        marginBottom: 15,
        paddingBottom: 10,
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    metaLabel: {
        width: 110,
        fontWeight: 'bold', // Helvetica-Bold
        color: '#475569',
        fontSize: 10,
    },
    metaValue: {
        flex: 1,
        color: '#000000',
        fontSize: 10,
    },
    divider: {
        height: 0.7,
        backgroundColor: '#0F6EA3',
        marginVertical: 10,
    },
    sectionTitle: {
        fontSize: 16,
        color: '#0F6EA3',
        fontWeight: 'bold',
        marginTop: 10,
        marginBottom: 8,
    },
    textBlock: {
        marginBottom: 10,
        fontSize: 10,
        textAlign: 'justify',
    },

    // Apartment / Room Grouping
    apartmentHeader: {
        fontSize: 16,
        color: '#0F6EA3',
        fontWeight: 'bold',
        marginTop: 10,
        marginBottom: 2,
        paddingBottom: 2,
    },
    floorHeader: {
        fontSize: 13,
        color: '#475569', // Slate-600
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 5,
    },
    roomContainer: {
        marginBottom: 15,
    },
    roomHeader: {
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
        marginBottom: 4,
        color: '#000000',
    },

    // Images
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    imageContainer: {
        width: '48%', // 2 per row approx
        marginBottom: 10,
    },
    image: {
        width: '100%',
        height: 150,
        objectFit: 'contain',
        // backgroundColor: '#f1f5f9',
        borderRadius: 2,
    },
    imageDescription: {
        fontSize: 9,
        color: '#475569',
        marginTop: 4,
    },
    // Table
    table: {
        width: '100%',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 4,
        overflow: 'hidden',
        marginTop: 10,
        marginBottom: 15,
    },
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    tableHeader: {
        padding: 5,
        fontSize: 8,
        fontWeight: 'bold',
        color: '#64748B',
    },
    tableCell: {
        padding: 5,
        fontSize: 8,
        color: '#334155',
    },

    footer: {
        position: 'absolute',
        bottom: 30,
        left: 30,
        right: 30,
        height: 30,
        // backgroundColor: '#eeeeee', // Debug color removed
        borderTopWidth: 0.5,
        borderTopColor: '#0F6EA3',
        paddingTop: 10,

    },
    footerText: {
        fontSize: 8,
        color: '#000000', // Changed to black for visibility
    },
});

// Helper to sort rooms
const sortRooms = (rooms) => {
    if (!rooms) return [];
    return [...rooms].sort((a, b) => {
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
};

const DamageReportDocument = ({ data }) => {
    // Filter rooms that have content (images or existing logic)
    // The previous logic filtered logic based on filtering dataToUse.images.
    // We should pre-process this OR do it here. 
    // Let's assume passed 'data.rooms' contains ALL rooms, so we filter here.

    const validRooms = React.useMemo(() => {
        if (!data.rooms || !data.images) return [];
        const roomsWithContent = data.rooms.filter(room => {
            // Check if room has images assigned and included in report
            const hasImages = data.images.some(img =>
                (img.roomId === room.id || img.assignedTo === room.name) &&
                img.includeInReport !== false
            );
            // Also check for measurements? Previous logic focused on images mostly for this filtering
            // But if room has only measurements, it should likely appear too?
            // Line 1489 in DamageForm.jsx only checked IMAGES. 
            // "dataToUse.images.some(img => ...)"
            // I will match that logic strictly for now.
            return hasImages;
        });
        return sortRooms(roomsWithContent);
    }, [data.rooms, data.images]);

    let currentApartment = null;
    let currentFloor = null;

    return (
        <Document>
            <Page size="A4" style={styles.page} wrap>



                {/* Header */}
                <View style={styles.header} fixed>
                    {data.logo && <Image src={data.logo} style={styles.logo} />}
                    <View style={styles.companyInfo}>
                        <Text>Q-Service AG</Text>
                        <Text>Kriesbachstrasse 30</Text>
                        <Text>8600 Dübendorf</Text>
                        <Text>www.q-service.ch</Text>
                    </View>
                </View>

                {/* Title */}
                <View style={styles.titleSection}>
                    <Text style={styles.mainTitle}>Schadensbericht</Text>
                    <Text style={styles.subTitle}>
                        {`${data.street || ''} ${data.city || ''} ${data.damageType ? '- ' + data.damageType : ''}`}
                    </Text>
                    {data.projectTitle && (
                        <Text style={styles.projectTitle}>{data.projectTitle}</Text>
                    )}
                </View>

                {/* Meta Data */}
                <View style={styles.divider} />
                <View style={styles.metaSection}>
                    <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View style={{ flex: 1 }}>
                            {data.projectNumber && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Projektnummer:</Text>
                                    <Text style={styles.metaValue}>{data.projectNumber}</Text>
                                </View>
                            )}
                            {data.orderNumber && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Auftragsnummer:</Text>
                                    <Text style={styles.metaValue}>{data.orderNumber}</Text>
                                </View>
                            )}
                            {data.damageNumber && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Schaden-Nr:</Text>
                                    <Text style={styles.metaValue}>{data.damageNumber}</Text>
                                </View>
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>Datum:</Text>
                                <Text style={styles.metaValue}>{new Date().toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr</Text>
                            </View>
                            {data.damageDate && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>Schadendatum:</Text>
                                    <Text style={styles.metaValue}>{new Date(data.damageDate).toLocaleDateString('de-CH')}</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={{ height: 10 }} />

                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Strasse:</Text>
                        <Text style={styles.metaValue}>{data.street}</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Ort:</Text>
                        <Text style={styles.metaValue}>{`${data.zip} ${data.city}`}</Text>
                    </View>
                    {/* Lage / Details combined with First Contact Name */}
                    {(data.locationDetails || (data.contacts && data.contacts.length > 0)) && (
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Lage / Details:</Text>
                            <Text style={styles.metaValue}>
                                {[
                                    data.locationDetails,
                                    data.contacts?.[0]?.floor,
                                    data.contacts?.[0]?.stockwerk,
                                    data.contacts?.[0]?.apartment,
                                    data.contacts?.[0]?.name
                                ].filter(p => p !== null && p !== undefined && String(p).trim() !== '').map(p => String(p).trim()).join(' ')}
                            </Text>
                        </View>
                    )}
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Sachbearbeiter:</Text>
                        <Text style={styles.metaValue}>{data.clientSource || 'Unbekannt'}</Text>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Auftraggeber:</Text>
                        <Text style={styles.metaValue}>{data.client || ''}</Text>
                    </View>
                    {data.insurance && (
                        <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Versicherung:</Text>
                            <Text style={styles.metaValue}>{data.insurance}</Text>
                        </View>
                    )}
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Schadenart:</Text>
                        <Text style={styles.metaValue}>{data.damageType || '-'}</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                {/* Description */}
                {data.description && (
                    <View style={{ marginBottom: 15 }} wrap={false}>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>BESCHREIBUNG</Text>
                        <Text style={styles.textBlock}>{data.description}</Text>
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Damage Cause Section & Hero Photos */}
                {(data.cause || (data.images && data.images.some(img => img.assignedTo === 'Schadenfotos' && img.includeInReport !== false))) && (
                    <View style={{ marginBottom: 20 }} wrap={false}>
                        <View style={styles.divider} />
                        <View style={{ marginBottom: 10 }}>
                            <Text style={styles.sectionTitle}>SCHADENURSACHE</Text>
                            <Text style={styles.textBlock}>{data.cause || 'Keine Beschreibung der Ursache angegeben.'}</Text>
                        </View>

                        {/* Schadenfotos Grid (The "Selected Pics") */}
                        {data.images && data.images.some(img => img.assignedTo === 'Schadenfotos' && img.includeInReport !== false) && (
                            <View style={{ marginTop: 10 }}>
                                <Text style={[styles.imageDescription, { fontWeight: 'bold', marginBottom: 8, color: '#0F6EA3' }]}>FOTOS ZUR URSACHE</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    {data.images.filter(img => img.assignedTo === 'Schadenfotos' && img.includeInReport !== false).map((img, i) => (
                                        <View key={i} style={{ width: '48%', marginBottom: 10 }}>
                                            <Image src={img.preview} style={{ width: '100%', height: 160, objectFit: 'contain' }} />
                                            {img.description && <Text style={[styles.imageDescription, { marginTop: 4 }]}>{img.description}</Text>}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Equipment Section */}
                {data.equipment && data.equipment.length > 0 && (
                    <View style={{ marginBottom: 20 }} wrap={false}>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>TROCKNUNGSGERÄTE</Text>
                        <View style={styles.table}>
                            <View style={styles.tableHeaderRow}>
                                <View style={{ width: '25%' }}><Text style={styles.tableHeader}>Gerät</Text></View>
                                <View style={{ width: '35%' }}><Text style={styles.tableHeader}>Raum / Bereich</Text></View>
                                <View style={{ width: '15%' }}><Text style={styles.tableHeader}>Nr.</Text></View>
                                <View style={{ width: '12.5%' }}><Text style={styles.tableHeader}>Start</Text></View>
                                <View style={{ width: '12.5%' }}><Text style={styles.tableHeader}>Ende</Text></View>
                            </View>
                            {data.equipment.map((item, idx) => (
                                <View key={idx} style={[styles.tableRow, { borderBottomWidth: idx === data.equipment.length - 1 ? 0 : 1 }]}>
                                    <View style={{ width: '25%' }}>
                                        <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{item.type || 'Trockner'}</Text>
                                    </View>
                                    <View style={{ width: '35%' }}>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                            <Text style={styles.tableCell}>{item.room || ''}</Text>
                                            {item.apartment && <Text style={[styles.tableCell, { color: '#94A3B8', fontSize: 7 }]}>({item.apartment})</Text>}
                                        </View>
                                    </View>
                                    <View style={{ width: '15%' }}>
                                        <Text style={styles.tableCell}>#{item.deviceNumber || (idx + 1)}</Text>
                                    </View>
                                    <View style={{ width: '12.5%' }}>
                                        <Text style={styles.tableCell}>{item.startDate ? new Date(item.startDate).toLocaleDateString('de-DE') : '-'}</Text>
                                    </View>
                                    <View style={{ width: '12.5%' }}>
                                        <Text style={[styles.tableCell, { color: item.endDate ? '#334155' : '#10B981' }]}>
                                            {item.endDate ? new Date(item.endDate).toLocaleDateString('de-DE') : 'Laufend'}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Raumdokumentation Section */}
                {validRooms.map((room, index) => {
                    const isNewApt = room.apartment !== currentApartment || room.stockwerk !== currentFloor;
                    const isFirstRoom = index === 0;

                    if (isNewApt) {
                        currentApartment = room.apartment;
                        currentFloor = room.stockwerk;
                    }

                    const roomImages = data.images.filter(img =>
                        (img.roomId === room.id || img.assignedTo === room.name) &&
                        img.includeInReport !== false
                    );

                    const firstImage = roomImages[0];
                    const restImages = roomImages.slice(1);

                    return (
                        <View key={room.id || index} style={styles.roomContainer}>
                            {/* Header Block - Keeps Section Title + Room Header + 1st Image together */}
                            <View wrap={false}>
                                {isFirstRoom && (
                                    <View>
                                        <View style={styles.divider} />
                                        <Text style={styles.sectionTitle}>RAUMDOKUMENTATION</Text>
                                    </View>
                                )}

                                {isNewApt && (room.apartment || room.stockwerk) && (
                                    <View style={{ marginTop: 0 }}>
                                        <Text style={styles.apartmentHeader}>
                                            {room.stockwerk ? `${room.stockwerk}${room.apartment ? ', ' : ''}` : ''}
                                            {room.apartment ? `Wohnung: ${room.apartment}` : ''}
                                        </Text>
                                    </View>
                                )}
                                <Text style={styles.roomHeader}>{room.name}</Text>

                                {/* Measurements Summary if exists */}
                                {room.measurementData && room.measurementData.measurements && (
                                    <View style={[styles.table, { marginTop: 5, marginBottom: 10 }]}>
                                        <View style={styles.tableHeaderRow}>
                                            <View style={{ width: '40%' }}><Text style={styles.tableHeader}>Position</Text></View>
                                            <View style={{ width: '30%' }}><Text style={styles.tableHeader}>W-Wert</Text></View>
                                            <View style={{ width: '30%' }}><Text style={styles.tableHeader}>B-Wert</Text></View>
                                        </View>
                                        {room.measurementData.measurements.map((m, mi) => (
                                            <View key={mi} style={styles.tableRow}>
                                                <View style={{ width: '40%' }}><Text style={styles.tableCell}>{m.location || '-'}</Text></View>
                                                <View style={{ width: '30%' }}><Text style={styles.tableCell}>{m.wValue || '-'}</Text></View>
                                                <View style={{ width: '30%' }}><Text style={styles.tableCell}>{m.bValue || '-'}</Text></View>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {firstImage && (
                                    <View style={[styles.imageGrid, { marginBottom: 10 }]}>
                                        <View style={styles.imageContainer}>
                                            <Image src={firstImage.preview} style={styles.image} />
                                            {firstImage.description && (
                                                <Text style={styles.imageDescription}>{firstImage.description}</Text>
                                            )}
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Remaining Images */}
                            {restImages.length > 0 && (
                                <View style={styles.imageGrid}>
                                    {restImages.map((img, i) => (
                                        <View key={i} style={styles.imageContainer} wrap={false}>
                                            <Image src={img.preview} style={styles.image} />
                                            {img.description && (
                                                <Text style={styles.imageDescription}>{img.description}</Text>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    );
                })}
                {validRooms.length > 0 && <View style={styles.divider} />}

                {/* Pläne & Grundrisse */}
                {data.images && data.images.some(img => img.assignedTo === 'Pläne' && img.includeInReport !== false) && (
                    <View style={{ marginBottom: 20 }} wrap={false}>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>PLÄNE & GRUNDRISSE</Text>
                        <View style={styles.imageGrid}>
                            {data.images.filter(img => img.assignedTo === 'Pläne' && img.includeInReport !== false).map((img, i) => (
                                <View key={i} style={styles.imageContainer}>
                                    <Image src={img.preview} style={styles.image} />
                                    {img.name && <Text style={styles.imageDescription}>{img.name}</Text>}
                                </View>
                            ))}
                        </View>
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Findings */}
                {data.findings && (
                    <View style={{ marginBottom: 15, marginTop: 20 }} wrap={false}>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>FESTSTELLUNGEN</Text>
                        <Text style={styles.textBlock}>{data.findings}</Text>
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Measures */}
                {data.measures && (
                    <View style={{ marginBottom: 15 }} wrap={false}>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>MASSNAHMEN</Text>
                        <Text style={styles.textBlock}>{data.measures}</Text>
                        <View style={styles.divider} />
                    </View>
                )}

                {/* Footer - Moved to top to ensure 'fixed' behavior works reliably */}
                <View style={styles.footer} fixed>
                    <View style={{ width: '100%', alignItems: 'center' }}>
                        <Text style={styles.footerText}>Q-Service AG, Kriesbachstrasse 30, 8600 Dübendorf, www.q-service.ch, info@q-service.ch Tel. 043 819 14 18</Text>
                    </View>
                    <View style={{ position: 'absolute', right: 0, top: 10 }}>
                        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
                            `Seite ${pageNumber} von ${totalPages}`
                        )} />
                    </View>
                </View>

                {/* Header */}



            </Page>
        </Document>
    );
};

export default DamageReportDocument;
