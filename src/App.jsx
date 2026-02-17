import { useState, useEffect, useCallback } from 'react'
import { Plus, LayoutDashboard, Settings, User, Users, LogOut } from 'lucide-react'
import { supabase } from './supabaseClient'
import Dashboard from './components/Dashboard'
import DamageForm from './components/DamageForm'
import DeviceManager from './components/DeviceManager'
import UserManagementModal from './components/UserManagementModal'
import LoginScreen from './components/LoginScreen'
import i18n from './i18n'

function App() {
  const [view, setView] = useState('dashboard') // 'dashboard', 'new-report', 'details'
  const [selectedReport, setSelectedReport] = useState(null)

  // Authentication / User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // The logged in user
  const [userRole, setUserRole] = useState('admin'); // 'admin' | 'technician' | 'user'
  const [isTechnicianMode, setIsTechnicianMode] = useState(false); // Mode state

  // Users List (Managed here to share with LoginScreen)
  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('qtool_users_v2');
    return saved ? JSON.parse(saved) : [
      { id: 1, name: 'Admin User', role: 'admin', password: 'admin' },
      { id: 2, name: 'Techniker 1', role: 'technician', password: '123' }
    ];
  });

  // Persist users changes
  useEffect(() => {
    localStorage.setItem('qtool_users_v2', JSON.stringify(users));
  }, [users]);

  const handleLogin = (user) => {
    setCurrentUser(user);
    setUserRole(user.role);
    // Automatically set mode based on role
    setIsTechnicianMode(user.role === 'technician');
    showToast(`Angemeldet als ${user.name}`, 'success');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserRole('admin');
    setIsTechnicianMode(false);
    setView('dashboard');
    setSelectedReport(null);
  };

  // Initialize reports from LocalStorage
  const [reports, setReports] = useState(() => {
    const saved = localStorage.getItem('qservice_reports_prod');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse reports from local storage", e);
      }
    }
    return [];
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
        const loadedReports = data.map(row => row.report_data);
        if (loadedReports.length > 0) {
          setReports(loadedReports);
          localStorage.setItem('qservice_reports_prod', JSON.stringify(loadedReports));
        }
      }
    };

    fetchReports();
  }, []);

  const handleSelectReport = (report) => {
    setSelectedReport(report)
    setView('details')
  }

  const handleCancelEntry = () => {
    setView('dashboard')
    setSelectedReport(null)
  }

  const handleSaveReport = useCallback(async (updatedReport, silent = false) => {
    let finalReport = { ...updatedReport };
    if (!finalReport.id) {
      finalReport.id = finalReport.projectTitle || `TMP-${Date.now()}`;
    }
    if (!finalReport.date) finalReport.date = new Date().toISOString();

    setReports(currentReports => {
      let newReports;
      const exists = currentReports.find(r => r.id === finalReport.id);

      if (exists) {
        newReports = currentReports.map(r => r.id === finalReport.id ? finalReport : r);
      } else {
        newReports = [finalReport, ...currentReports];
      }

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
        console.error("LocalStorage Save Failed (Quota/Size?):", e);
      }
      return newReports;
    });

    if (!silent || (!updatedReport.id && finalReport.id)) {
      setSelectedReport(prev => {
        if (!prev || prev.id === finalReport.id || !updatedReport.id) return finalReport;
        return prev;
      });
      if (!silent) setView('details');
    }

    if (supabase) {
      const rowData = {
        id: finalReport.id,
        project_title: finalReport.projectTitle,
        client: finalReport.client,
        address: finalReport.address,
        status: finalReport.status,
        assigned_to: finalReport.assignedTo,
        date: finalReport.date,
        drying_started: finalReport.dryingStarted,
        report_data: finalReport,
        updated_at: new Date().toISOString()
      };

      supabase.from('damage_reports').upsert(rowData).then(({ error }) => {
        if (error) {
          // Error handling
          console.error('Error saving to Supabase:', error);
        }
      });
    }

    return finalReport;
  }, [supabase]);

  const handleNavigateToReport = (identifier) => {
    if (!identifier) return;
    const report = reports.find(r => r.id === identifier || r.projectTitle === identifier);
    if (report) {
      handleSelectReport(report);
      showToast(`Auftrag "${report.projectTitle || report.id}" geöffnet`, 'success');
    } else {
      showToast(`Auftrag "${identifier}" nicht gefunden`, 'error');
    }
  };

  const handleDeleteReport = async (reportId) => {
    const reportToDelete = reports.find(r => r.id === reportId);
    if (!reportToDelete) return;

    setReports(prev => {
      const newReports = prev.filter(r => r.id !== reportId);
      try {
        localStorage.setItem('qservice_reports_prod', JSON.stringify(newReports));
      } catch (e) {
        console.error("LocalStorage Update Failed", e);
      }
      return newReports;
    });

    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport(null);
      setView('dashboard');
    }

    if (supabase) {
      supabase.from('damage_reports').delete().eq('id', reportId);
    } else {
      showToast('Bericht lokal gelöscht', 'success');
    }
  };

  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const ToastMarkup = toast && (
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
  );

  // --- LOGIN SCREEN CHECK ---
  if (!currentUser) {
    return (
      <div className="app">
        {ToastMarkup}
        <LoginScreen users={users} onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="app">
      {ToastMarkup}

      <header className="app-header">
        <div className="container header-content">
          <div className="logo-area">
            <div className="logo-img-container">
              <img src="/logo.png" alt="QService" style={{ height: '40px', width: 'auto' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
              <div style={{ display: 'none', width: 40, height: 40, backgroundColor: 'var(--primary)', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>Q</div>
            </div>
            <span>Q-Service AG</span>
          </div>
          <nav>
            {/* User Info & Logout (Always visible when logged in) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginRight: '1rem', paddingRight: '1rem', borderRight: '1px solid var(--border)' }}>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{currentUser.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{currentUser.role.toUpperCase()}</div>
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-ghost"
                title="Abmelden"
                style={{ padding: '0.5rem', color: '#EF4444' }}
              >
                <LogOut size={18} />
              </button>
            </div>

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

                {/* User User Management Button - Restrict to Admin */}
                {userRole === 'admin' && !isTechnicianMode && (
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowUserModal(true)}
                    style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    title="Benutzer & Rechte"
                  >
                    <Users size={18} />
                    <span className="hide-mobile">Benutzer</span>
                  </button>
                )}
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

      {/* Render User Management Modal */}
      {showUserModal && <UserManagementModal onClose={() => setShowUserModal(false)} users={users} setUsers={setUsers} />}
    </div>
  )
}

export default App
