import { useState, useEffect, useMemo } from 'react'
import { Filter, MapPin, Calendar, ArrowRight, Search, Trash2 } from 'lucide-react'

// Helper to calculate days difference
const getDaysDiff = (startDate) => {
    if (!startDate) return 0;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffTime = now - start; // removed Math.abs to allow negative check if needed, but simplified
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

// Helper to format date as tt/mm/jj
const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

const statusColors = {
    'Schadenaufnahme': 'bg-gray-100 text-gray-800',
    'Leckortung': 'bg-blue-100 text-blue-800',
    'Trocknung': 'bg-yellow-100 text-yellow-800',
    'Instandsetzung': 'bg-green-100 text-green-800',
    'Abgeschlossen': 'bg-gray-200 text-gray-600'
}

const DryingMonitor = ({ reports, onSelectReport }) => {
    // Filter by status 'Trocknung' OR if there are active devices
    const dryingReports = reports.filter(r => r.status === 'Trocknung' || (r.equipment && r.equipment.length > 0));

    // Helper to get start date (from first device or report date)
    const getStartDate = (report) => {
        if (report.dryingStarted) return report.dryingStarted;
        if (report.equipment && report.equipment.length > 0) {
            // Find earliest device start date
            const dates = report.equipment.map(e => e.startDate).filter(d => d).sort();
            if (dates.length > 0) return dates[0];
        }
        return report.date; // Fallback to report creation date
    };

    // Sort by duration desc (using new helper)
    dryingReports.sort((a, b) => getDaysDiff(getStartDate(b)) - getDaysDiff(getStartDate(a)));

    return (
        <div className="card" style={{ marginBottom: '2rem', borderTop: '4px solid #F59E0B' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent)' }}></div>
                Aktive Trocknungen
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {dryingReports.length > 0 ? (
                    dryingReports.map(report => {
                        const startDate = getStartDate(report);
                        const days = getDaysDiff(startDate);
                        let color = 'var(--success)';
                        let colorClass = '#10B981';

                        if (days > 30) {
                            color = 'var(--danger)';
                            colorClass = '#EF4444';
                        } else if (days > 15) {
                            color = 'var(--accent)';
                            colorClass = '#F59E0B';
                        } else {
                            color = 'var(--success)';
                            colorClass = '#10B981';
                        }

                        // Calculate equipment summary
                        const equipSummary = report.equipment && report.equipment.length > 0
                            ? report.equipment.reduce((acc, curr) => {
                                acc[curr.type] = (acc[curr.type] || 0) + 1;
                                return acc;
                            }, {})
                            : null;

                        return (
                            <div
                                key={report.id}
                                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', cursor: 'pointer', transition: 'transform 0.2s', backgroundColor: 'var(--surface)' }}
                                onClick={() => onSelectReport(report)}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{report.locationDetails || report.client}</span>
                                    <span style={{ fontWeight: 700, color: colorClass }}>{days} Tage</span>
                                </div>

                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <MapPin size={12} />
                                    {report.address ? report.address.split(',')[0] : 'Keine Adresse'}
                                </div>

                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {report.type}
                                </div>
                                {report.clientSource && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', marginBottom: '0.75rem' }}>
                                        von: {report.clientSource}
                                    </div>
                                )}

                                {/* Equipment display */}
                                <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {report.equipment && report.equipment.length > 0 ? (
                                        report.equipment.map((item, idx) => {
                                            const itemStart = item.startDate ? item.startDate : report.dryingStarted;
                                            const itemEnd = item.endDate;
                                            const itemDays = getDaysDiff(itemStart);

                                            let currentDays = 0;
                                            if (item.endDate) {
                                                const start = new Date(itemStart);
                                                const end = new Date(item.endDate);
                                                const diffTime = Math.abs(end - start);
                                                currentDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                            } else {
                                                currentDays = getDaysDiff(itemStart);
                                            }

                                            let barColor = '#10B981'; // Default: Green
                                            if (!item.endDate) {
                                                if (currentDays > 30) {
                                                    barColor = '#EF4444'; // Red
                                                } else if (currentDays > 15) {
                                                    barColor = '#F59E0B'; // Orange
                                                } else {
                                                    barColor = '#10B981'; // Green
                                                }
                                            } else {
                                                barColor = '#3B82F6'; // Finished: Blue
                                            }

                                            return (
                                                <div key={idx} style={{ fontSize: '0.75rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', color: '#555' }}>
                                                        <span>{item.type} <span style={{ color: '#9CA3AF' }}>#{item.deviceNumber || (idx + 1)}</span></span>
                                                        <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>
                                                            {item.apartment ? `${item.apartment} - ` : ''}{item.room} ({currentDays} d)
                                                        </span>
                                                    </div>
                                                    <div style={{ height: '6px', width: '100%', backgroundColor: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${Math.min(currentDays / 40 * 100, 100)}%`,
                                                            backgroundColor: barColor,
                                                            borderRadius: '3px'
                                                        }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Keine Geräte erfasst</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'right' }}>
                                    Seit {formatDate(report.dryingStarted)}
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <div style={{ gridColumn: '1 / -1', padding: '1rem', color: '#64748B', fontStyle: 'italic' }}>
                        Keine aktiven Trocknungen für diesen Filter gefunden.
                    </div>
                )}
            </div>
        </div>
    )
}

export default function Dashboard({ reports, onSelectReport, onDeleteReport, mode }) {
    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;
    const [showArchive, setShowArchive] = useState(false);

    // Filter Logic
    const filteredReports = useMemo(() => reports.filter(r => {
        // Archive Filter
        if (showArchive) {
            if (r.status !== 'Abgeschlossen') return false;
        } else {
            if (r.status === 'Abgeschlossen') return false;
        }

        const lowerSearch = searchTerm.toLowerCase();

        // Basic fields
        if (r.client?.toLowerCase().includes(lowerSearch)) return true;
        if (r.projectTitle?.toLowerCase().includes(lowerSearch)) return true; // Search inside projectTitle
        if (r.id?.toLowerCase().includes(lowerSearch)) return true;
        if (r.address?.toLowerCase().includes(lowerSearch)) return true;
        if (r.type?.toLowerCase().includes(lowerSearch)) return true;
        if (r.status?.toLowerCase().includes(lowerSearch)) return true;
        if (r.assignedTo?.toLowerCase().includes(lowerSearch)) return true;

        // Equipment (deep search)
        if (r.equipment) {
            const hasMatchingEquipment = r.equipment.some(e =>
                e.type?.toLowerCase().includes(lowerSearch) ||
                e.deviceNumber?.toString().includes(lowerSearch) ||
                e.room?.toLowerCase().includes(lowerSearch) ||
                e.apartment?.toLowerCase().includes(lowerSearch)
            );
            if (hasMatchingEquipment) return true;
        }

        // Additional info (optional fields if they exist)
        if (r.clientSource?.toLowerCase().includes(lowerSearch)) return true;

        return false;
    }), [reports, showArchive, searchTerm]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
    const paginatedReports = filteredReports.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    if (!reports) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Daten...</div>
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--primary)' }}>Dashboard</h2>

                    {/* Archive Toggle */}
                    <div style={{ display: 'flex', backgroundColor: 'var(--surface)', borderRadius: '9999px', padding: '0.25rem', border: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setShowArchive(false)}
                            style={{
                                padding: '0.25rem 1rem',
                                borderRadius: '9999px',
                                border: 'none',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                backgroundColor: !showArchive ? 'var(--primary)' : 'transparent',
                                color: !showArchive ? 'white' : 'var(--text-muted)',
                                boxShadow: !showArchive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            Aktuell
                        </button>
                        <button
                            onClick={() => setShowArchive(true)}
                            style={{
                                padding: '0.25rem 1rem',
                                borderRadius: '9999px',
                                border: 'none',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                backgroundColor: showArchive ? 'var(--primary)' : 'transparent',
                                color: showArchive ? 'white' : 'var(--text-muted)',
                                boxShadow: showArchive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            Archiv
                        </button>
                    </div>
                </div>

                {/* Search Input */}
                <div style={{ position: 'relative', width: '300px' }}>
                    <input
                        type="text"
                        placeholder="Suche (Name, Adresse, Gerät...)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem 1rem 0.5rem 2.5rem',
                            border: '1px solid var(--border)',
                            borderRadius: '9999px',
                            fontSize: '0.9rem',
                            outline: 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    />
                    <Search
                        size={16}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                    />
                </div>
            </div>

            {/* Pass Filtered Reports to Monitors (only when not in Archive OR Technician Mode) */}
            {!showArchive && mode !== 'technician' && <DryingMonitor reports={filteredReports} onSelectReport={onSelectReport} />}

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Alle Fälle ({filteredReports.length})</h3>
                    <button className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={16} /> Filter
                    </button>
                </div>

                <div className="table-container" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '100px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Nr.</th>
                                <th style={{ width: '100px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Datum</th>
                                <th style={{ minWidth: '150px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Schadenort</th>
                                <th style={{ minWidth: '180px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Adresse</th>
                                <th style={{ minWidth: '140px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Auftraggeber</th>
                                <th style={{ minWidth: '110px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Bewirtschafter/in</th>
                                <th style={{ minWidth: '140px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Schaden</th>
                                <th style={{ width: '130px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Status</th>
                                <th style={{ minWidth: '120px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Kunde von</th>

                                <th style={{ width: '80px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Geräte</th>
                                <th style={{ width: '80px', position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'var(--background)' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedReports.map((report) => {
                                const activeDevices = report.equipment ? report.equipment.length : 0;
                                return (
                                    <tr key={report.id} onClick={() => onSelectReport(report)} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontWeight: 600, fontSize: '0.9rem' }}>{report.projectTitle || report.id}</td>
                                        <td style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{formatDate(report.date)}</td>
                                        <td style={{ fontWeight: 500 }}>{report.locationDetails || '-'}</td>
                                        <td>
                                            {report.street ? `${report.street}, ${report.zip} ${report.city}` : (report.address ? report.address.split(',')[0] : '')}
                                        </td>
                                        <td style={{ fontWeight: 500 }}>{report.client}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                                                <span>{report.assignedTo}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 500 }}>{report.damageCategory || 'Wasserschaden'}</span>
                                                {report.type && (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{report.type}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${statusColors[report.status] || 'bg-gray-100'}`} style={{ color: '#1F2937' }}>
                                                {report.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                                <span>{report.clientSource || '-'}</span>
                                                {report.clientSource && (
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // Logic to send WhatsApp message
                                                            const text = `Hallo ${report.clientSource || 'Partner'},\n\nhier ist ein neuer Auftrag:\nProjekt: ${report.projectTitle || report.id}\nKunde: ${report.client}\nAdresse: ${report.address}\nArt: ${report.type}\n\nBitte um Bestätigung.`;
                                                            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

                                                            if (confirm(`Auftrag an ${report.clientSource} senden via WhatsApp?`)) {
                                                                window.open(whatsappUrl, '_blank');
                                                            }
                                                        }}
                                                        title="Auftrag via WhatsApp senden"
                                                        style={{ padding: '2px', color: '#25D366', height: 'auto' }}
                                                    >
                                                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        <td style={{ textAlign: 'center' }}>
                                            {activeDevices > 0 ? (
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    {activeDevices}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--border)' }}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm(`Möchten Sie den Bericht "${report.projectTitle || report.id}" wirklich unwiderruflich löschen?`)) {
                                                            onDeleteReport(report.id);
                                                        }
                                                    }}
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ color: '#EF4444', padding: '0.25rem' }}
                                                    title="Bericht löschen"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <ArrowRight size={16} className="text-muted" />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button
                            className="btn btn-outline"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            style={{ padding: '0.25rem 0.5rem' }}
                        >
                            &lt;
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                className={`btn ${currentPage === page ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setCurrentPage(page)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                {page}
                            </button>
                        ))}

                        <button
                            className="btn btn-outline"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            style={{ padding: '0.25rem 0.5rem' }}
                        >
                            &gt;
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
