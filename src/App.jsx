import { useState, useEffect, useCallback } from 'react'
import { Plus, LayoutDashboard, Settings, User } from 'lucide-react'
import { supabase } from './supabaseClient'
import Dashboard from './components/Dashboard'
import DamageForm from './components/DamageForm'
import DeviceManager from './components/DeviceManager'
import i18n from './i18n'

function App() {
  const [view, setView] = useState('dashboard') // 'dashboard', 'new-report', 'details'
  const [selectedReport, setSelectedReport] = useState(null)



  // Initialize reports from LocalStorage
  const [reports, setReports] = useState(() => {
    const saved = localStorage.getItem('qservice_reports_prod'); // Changed key to reset data
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse reports from local storage", e);
      }
    }
    return []; // Return empty array instead of mock data
  });

  // Fetch reports from Supabase on mount
  useEffect(() => {
    if (!supabase) return;

    const fetchReports = async () => {
      const { data, error } = await supabase
        .from('damage_reports')
        .select('report_data')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reports from Supabase:', error);
      } else if (data) {
        // Unwrap the JSONB content
        const loadedReports = data.map(row => row.report_data);
        if (loadedReports.length > 0) {
          setReports(loadedReports);
          localStorage.setItem('qservice_reports_prod', JSON.stringify(loadedReports));
        }
      }
    };

    fetchReports();
  }, []);

  /* ---------------------------------------------------------------------------
   * User Role Management (Mock Implementation)
   * --------------------------------------------------------------------------- */
  const [userRole, setUserRole] = useState('admin'); // 'admin' | 'user'

  const toggleUserRole = () => {
    const newRole = userRole === 'admin' ? 'user' : 'admin';
    setUserRole(newRole);
    if (newRole === 'user') {
      setIsTechnicianMode(true);
    } else {
      setIsTechnicianMode(false);
    }
    showToast(`Rolle gewechselt zu: ${newRole.toUpperCase()}`, 'success');
  };

  const [isTechnicianMode, setIsTechnicianMode] = useState(false); // New state for Technician View

  const handleSelectReport = (report) => {
    setSelectedReport(report)
    setView('details')
  }

  const handleCancelEntry = () => {
    setView('dashboard')
    setSelectedReport(null)
  }

  const handleSaveReport = useCallback(async (updatedReport, silent = false) => {
    // Generate ID eagerly if missing (crucial for auto-saves of new reports)
    let finalReport = { ...updatedReport };
    if (!finalReport.id) {
      finalReport.id = finalReport.projectTitle || `TMP-${Date.now()}`;
    }
    // Ensure created date
    if (!finalReport.date) finalReport.date = new Date().toISOString();

    // Use functional update to access latest reports without adding it to dependency array
    setReports(currentReports => {
      let newReports;
      const exists = currentReports.find(r => r.id === finalReport.id);

      if (exists) {
        newReports = currentReports.map(r => r.id === finalReport.id ? finalReport : r);
      } else {
        newReports = [finalReport, ...currentReports];
      }

      // Persist to LocalStorage (Sanitized)
      try {
        const sanitizedReports = newReports.map(r => ({
          ...r,
          images: r.images ? r.images.map(img => ({
            ...img,
            // Don't save blob URLs to LS (they expire). Keep keys if they are real URLs or base64 (though base64 is heavy)
            preview: (img.preview && img.preview.startsWith('blob:')) ? null : img.preview
          })) : []
        }));
        localStorage.setItem('qservice_reports_prod', JSON.stringify(sanitizedReports));
      } catch (e) {
        console.error("LocalStorage Save Failed (Quota/Size?):", e);
      }
      return newReports;
    });

    // Update selection if not silent (UI feedback), OR if the ID was just generated (to keep UI in sync)
    // IMPORTANT: This ensures that DamageForm gets the new ID via initialData on subsequent re-renders/key updates
    if (!silent || (!updatedReport.id && finalReport.id)) {
      setSelectedReport(prev => {
        // Only update if ID matches or it's a new one, to avoid heavy re-renders if unrelated
        if (!prev || prev.id === finalReport.id || !updatedReport.id) return finalReport;
        return prev;
      });
      // Ensure view is set correctly if not silent, IF silent ignore view change
      if (!silent) setView('details');
    }

    // Persist to Supabase (Background)
    if (supabase) {
      // ... Supabase logic (can run safely with captured updatedReport) ...
      const rowData = {
        id: finalReport.id,
        project_title: finalReport.projectTitle,
        client: finalReport.client,
        address: finalReport.address,
        status: finalReport.status,
        assigned_to: finalReport.assignedTo,
        date: finalReport.date,
        drying_started: finalReport.dryingStarted,
        report_data: finalReport, // Use finalReport with ID
        updated_at: new Date().toISOString()
      };

      supabase.from('damage_reports').upsert(rowData).then(({ error }) => {
        if (error) {
          const errMsg = error.message || JSON.stringify(error);
          if (errMsg.toLowerCase().includes('abort') || errMsg.toLowerCase().includes('signal is aborted')) {
            console.warn('Save aborted (likely harmless):', error);
          } else {
            console.error('Error saving to Supabase:', error);
            showToast('Fehler beim Speichern: ' + errMsg, 'error');
          }
        } else {
          console.log('Successfully saved to Supabase');
          if (!silent) showToast('Erfolgreich gespeichert!', 'success');
        }
      });
    }

    // Return the final report object so the caller can update their local state (e.g. ID)
    return finalReport;
  }, [supabase]);

  const handleNavigateToReport = (identifier) => {
    if (!identifier) return;

    // Try to find by ID first, then by Project Title
    const report = reports.find(r => r.id === identifier || r.projectTitle === identifier);

    if (report) {
      handleSelectReport(report);
      showToast(`Auftrag "${report.projectTitle || report.id}" geöffnet`, 'success');
    } else {
      showToast(`Auftrag "${identifier}" nicht gefunden`, 'error');
    }
  };

  const handleDeleteReport = async (reportId) => {
    // 1. Optimistic UI Update
    const reportToDelete = reports.find(r => r.id === reportId);
    if (!reportToDelete) return;

    setReports(prev => {
      const newReports = prev.filter(r => r.id !== reportId);
      // Sync to LocalStorage
      try {
        const sanitizedReports = newReports.map(r => ({
          ...r,
          images: r.images ? r.images.map(img => ({
            ...img,
            preview: (img.preview && img.preview.startsWith('blob:')) ? null : img.preview
          })) : []
        }));
        localStorage.setItem('qservice_reports_prod', JSON.stringify(sanitizedReports));
      } catch (e) {
        console.error("LocalStorage Update Failed after Delete:", e);
      }
      return newReports;
    });

    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport(null);
      setView('dashboard');
    }

    // 2. Supabase Deletion
    if (supabase) {
      const { error } = await supabase
        .from('damage_reports')
        .delete()
        .eq('id', reportId);

      if (error) {
        console.error('Error deleting from Supabase:', error);
        showToast('Fehler beim Löschen aus der Datenbank (Lokal gelöscht)', 'warning');
        // Optionally revert state here if strict consistency is needed, 
        // but for now we prioritize UI responsiveness and assume success/eventual consistency
      } else {
        showToast('Bericht erfolgreich gelöscht', 'success');
      }
    } else {
      showToast('Bericht lokal gelöscht', 'success');
    }
  };

  // Toast Notification System
  const [toast, setToast] = useState(null); // { message, type }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="app">
      {/* Toast Notification Component */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '500',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {toast.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          )}
          {toast.message}
        </div>
      )}

      <header className="app-header">
        <div className="container header-content">
          <div className="logo-area">
            {/* Placeholder for Logo - Replace with actual logo path */}
            {/* Logo */}
            <div className="logo-img-container">
              <img src="/logo.png" alt="QService" style={{ height: '40px', width: 'auto' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
              <div style={{ display: 'none', width: 40, height: 40, backgroundColor: 'var(--primary)', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>Q</div>
            </div>
            <span>Q-Service AG</span>
          </div>
          <nav>
            {view !== 'dashboard' && (
              <button className="btn btn-outline" onClick={handleCancelEntry}>
                <LayoutDashboard size={18} />
                {i18n.t('dashboard')}
              </button>
            )}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>

                {/* Admin Only: Device Manager - Hidden in Technician Mode */}
                {userRole === 'admin' && !isTechnicianMode && (
                  <button
                    className="btn btn-outline"
                    onClick={() => setView('devices')}
                    title={i18n.t('devices')}
                  >
                    <Settings size={18} style={{ marginRight: '0.5rem' }} />
                    <span className="hide-mobile">{i18n.t('devices')}</span>
                  </button>
                )}

                {userRole === 'admin' && (
                  <button
                    className={`btn ${isTechnicianMode ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setIsTechnicianMode(!isTechnicianMode)}
                    title={i18n.t('toggleTechnicianView')}
                  >
                    {isTechnicianMode ? i18n.t('technicianView') : i18n.t('desktopView')}
                  </button>
                )}
                {!isTechnicianMode && (
                  <button className="btn btn-primary" onClick={() => { setSelectedReport(null); setView('new-report'); }}>
                    <Plus size={18} />
                    {i18n.t('newOrder')}
                  </button>
                )}

                {/* User Role Switcher (Demo) */}
                <div
                  style={{
                    marginLeft: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: userRole === 'admin' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                    border: `1px solid ${userRole === 'admin' ? 'var(--danger)' : 'var(--primary)'}`
                  }}
                  onClick={toggleUserRole}
                  title={`Aktuelle Rolle: ${userRole}. Klicken zum Wechseln.`}
                >
                  <User size={18} color={userRole === 'admin' ? 'var(--danger)' : 'var(--primary)'} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: userRole === 'admin' ? 'var(--danger)' : 'var(--primary)' }}>
                    {userRole === 'admin' ? 'ADMIN' : 'USER'}
                  </span>
                </div>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="container" style={{ marginTop: '2rem' }}>
        {view === 'dashboard' && <Dashboard reports={reports} onSelectReport={handleSelectReport} onDeleteReport={handleDeleteReport} mode={isTechnicianMode ? 'technician' : 'desktop'} />}
        {view === 'devices' && <DeviceManager reports={reports} onBack={() => setView('dashboard')} onNavigateToReport={handleNavigateToReport} />}
        {(view === 'new-report' || view === 'details') && (
          <DamageForm
            key={selectedReport ? selectedReport.id : 'new'}
            onCancel={handleCancelEntry}
            onSave={handleSaveReport}
            initialData={selectedReport}
            mode={isTechnicianMode ? 'technician' : 'desktop'}
          />
        )}
      </main>
    </div>
  )
}

export default App
