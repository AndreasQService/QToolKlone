import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Trash, Shield, User, Wrench } from 'lucide-react';

const UserManagementModal = ({ onClose, users, setUsers }) => {
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('technician');

    const handleAddUser = (e) => {
        e.preventDefault();
        if (!newName.trim() || !newPassword.trim()) return;

        const newUser = {
            id: Date.now(),
            name: newName.trim(),
            password: newPassword.trim(),
            role: newRole
        };

        setUsers([...users, newUser]);
        setNewName('');
        setNewPassword('');
        setNewRole('technician');
    };

    const handleDeleteUser = (id) => {
        if (confirm('Benutzer wirklich löschen?')) {
            setUsers(users.filter(u => u.id !== id));
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: '8px',
                width: '600px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--border)',
                color: 'var(--text-main)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserPlus size={24} />
                        Benutzerverwaltung
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Add User Form */}
                <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="form-input"
                            placeholder="Name eingeben..."
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ flex: 2 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Passwort</label>
                        <input
                            type="text"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="form-input"
                            placeholder="Passwort..."
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Rolle / Rechte</label>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="form-input"
                            style={{ width: '100%' }}
                        >
                            <option value="technician">Techniker</option>
                            <option value="admin">Admin</option>
                            <option value="user">Benutzer</option>
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ height: '38px', whiteSpace: 'nowrap' }}>
                        <UserPlus size={18} style={{ marginRight: '0.5rem' }} /> Hinzufügen
                    </button>
                </form>

                {/* User List */}
                <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', opacity: 0.7, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vorhandene Benutzer</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {users.map(user => (
                            <div key={user.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '1rem', backgroundColor: 'var(--background)',
                                borderRadius: '6px', border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        backgroundColor: user.role === 'admin' ? 'rgba(239, 68, 68, 0.1)' : (user.role === 'technician' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(16, 185, 129, 0.1)'),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: user.role === 'admin' ? '#EF4444' : (user.role === 'technician' ? '#38BDF8' : '#10B981')
                                    }}>
                                        {user.role === 'admin' ? <Shield size={20} /> : (user.role === 'technician' ? <Wrench size={20} /> : <User size={20} />)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{user.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                            {user.role === 'technician' ? 'Techniker (Eingeschränkt)' : (user.role === 'admin' ? 'Administrator (Vollzugriff)' : 'Benutzer')}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="btn btn-ghost"
                                    style={{ color: '#EF4444' }}
                                    title="Löschen"
                                >
                                    <Trash size={18} />
                                </button>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                Keine Benutzer vorhanden.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default UserManagementModal;
