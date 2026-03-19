import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, Trash2, Shield, ScanLine, Calendar } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'scanner' });
  const [event, setEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ name: '', date: '', location: '', description: '' });

  useEffect(() => {
    loadUsers();
    loadEvent();
  }, []);

  const loadUsers = async () => {
    const res = await api.get('/auth/users');
    setUsers(res.data);
  };

  const loadEvent = async () => {
    const res = await api.get('/events');
    if (res.data.length > 0) {
      setEvent(res.data[0]);
      setEventForm(res.data[0]);
    }
  };

  const addUser = async () => {
    try {
      await api.post('/auth/users', form);
      setForm({ username: '', password: '', display_name: '', role: 'scanner' });
      setShowAdd(false);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Fehler beim Erstellen');
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Benutzer wirklich löschen?')) return;
    await api.delete(`/auth/users/${id}`);
    loadUsers();
  };

  const updateEvent = async () => {
    await api.put(`/events/${event.id}`, eventForm);
    alert('Event aktualisiert');
  };

  if (user?.role !== 'admin') {
    return <div className="text-center text-[#52525b] mt-20">Nur Admins können die Einstellungen bearbeiten.</div>;
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Einstellungen</h1>
        <p className="text-sm text-[#64748b]">Event- und Benutzerverwaltung</p>
      </div>

      {/* Event settings */}
      <div className="gfd-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-[#4a8af4]" /> Event-Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Name</label>
            <input className="gfd-input" value={eventForm.name || ''} onChange={e => setEventForm({ ...eventForm, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Datum</label>
            <input className="gfd-input" type="date" value={eventForm.date || ''} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Ort</label>
            <input className="gfd-input" value={eventForm.location || ''} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Beschreibung</label>
            <input className="gfd-input" value={eventForm.description || ''} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} />
          </div>
        </div>
        <button className="gfd-btn" onClick={updateEvent}>Speichern</button>
      </div>

      {/* User management */}
      <div className="gfd-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users size={16} className="text-[#4a8af4]" /> Benutzer
          </h2>
          <button className="gfd-btn text-xs" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={14} /> Neuer Benutzer
          </button>
        </div>

        {showAdd && (
          <div className="p-4 bg-[#000] rounded-lg mb-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input className="gfd-input" placeholder="Benutzername" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              <input className="gfd-input" placeholder="Passwort" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              <input className="gfd-input" placeholder="Anzeigename" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
              <select className="gfd-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="scanner">Scanner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="gfd-btn text-xs" onClick={addUser}>Erstellen</button>
              <button className="gfd-btn gfd-btn-outline text-xs" onClick={() => setShowAdd(false)}>Abbrechen</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#000] transition-colors">
              <div className="flex items-center gap-3">
                {u.role === 'admin' ? <Shield size={16} className="text-[#4a8af4]" /> : <ScanLine size={16} className="text-[#64748b]" />}
                <div>
                  <div className="text-sm text-white font-medium">{u.display_name}</div>
                  <div className="text-xs text-[#52525b]">@{u.username} · {u.role}</div>
                </div>
              </div>
              {u.username !== 'admin' && (
                <button className="text-[#64748b] hover:text-red-400 transition-colors" onClick={() => deleteUser(u.id)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
