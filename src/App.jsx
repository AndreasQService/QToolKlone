import { useState, useEffect } from 'react'
import { Plus, LayoutDashboard, Settings } from 'lucide-react'
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

  const [isTechnicianMode, setIsTechnicianMode] = useState(false); // New state for Technician View

  const handleSelectReport = (report) => {
    setSelectedReport(report)
    setView('details')
  }

  const handleCancelEntry = () => {
    setView('dashboard')
    setSelectedReport(null)
  }

  const handleSaveReport = async (updatedReport, silent = false) => {
    let newReports;

    // Check if it's an existing report
    const exists = reports.find(r => r.id === updatedReport.id);

    if (exists) {
      newReports = reports.map(r => r.id === updatedReport.id ? updatedReport : r);
    } else {
      // New report
      // Ensure we have an ID. If not provided, generate one or use Project Title
      const newId = updatedReport.id || updatedReport.projectTitle || `TMP-${Date.now()}`;
      const newReport = { ...updatedReport, id: newId };

      // If we didn't have ID before, update it
      updatedReport = newReport;

      newReports = [newReport, ...reports];
    }

    // Update State
    setReports(newReports);
    if (!silent) {
      setSelectedReport(updatedReport);
    }

    // Persist to LocalStorage
    localStorage.setItem('qservice_reports_prod', JSON.stringify(newReports));

    // Persist to Supabase
    if (supabase) {
      const reportToSave = updatedReport;

      // Map fields to columns for easier filtering
      const rowData = {
        id: reportToSave.id, // Primary Key
        project_title: reportToSave.projectTitle,
        client: reportToSave.client,
        address: reportToSave.address,
        status: reportToSave.status,
        assigned_to: reportToSave.assignedTo,
        date: reportToSave.date,
        drying_started: reportToSave.dryingStarted,
        report_data: reportToSave, // Full JSON
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('damage_reports')
        .upsert(rowData);

      if (error) {
        console.error('Error saving to Supabase:', error);
        alert('Fehler beim Speichern in die Cloud: ' + error.message);
      } else {
        console.log('Successfully saved to Supabase');
        if (!silent) showToast('Erfolgreich gespeichert!', 'success');
      }
    }

    if (!silent) {
      setView('details');
    }
  }

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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => setView('devices')}
                >
                  <Settings size={18} style={{ marginRight: '0.5rem' }} />
                  {i18n.t('devices')}
                </button>

                <button
                  className={`btn ${isTechnicianMode ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setIsTechnicianMode(!isTechnicianMode)}
                  title={i18n.t('toggleTechnicianView')}
                >
                  {isTechnicianMode ? i18n.t('technicianView') : i18n.t('desktopView')}
                </button>
                <button className="btn btn-primary" onClick={() => { setSelectedReport(null); setView('new-report'); }}>
                  <Plus size={18} />
                  {i18n.t('newOrder')}
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="container" style={{ marginTop: '2rem' }}>
        {view === 'dashboard' && <Dashboard reports={reports} onSelectReport={handleSelectReport} mode={isTechnicianMode ? 'technician' : 'desktop'} />}
        {view === 'devices' && <DeviceManager onBack={() => setView('dashboard')} />}
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
