import { useState, useEffect } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';
import { Plus, Upload, Search, Download, Mail, Trash2, Edit2, Check, X, UserCheck } from 'lucide-react';

export default function Participants() {
  const [participants, setParticipants] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'student', notes: '' });
  const [filter, setFilter] = useState('all');

  const loadData = async () => {
    const evRes = await api.get('/events');
    if (evRes.data.length > 0) {
      const eid = evRes.data[0].id;
      setEventId(eid);
      const res = await api.get(`/participants?event_id=${eid}`);
      setParticipants(res.data);
    }
  };

  useEffect(() => {
    loadData();
    socket.connect();
    socket.emit('join-dashboard');
    const refresh = () => loadData();
    socket.on('check-in', refresh);
    socket.on('check-out', refresh);
    socket.on('participants-imported', refresh);
    return () => { socket.off('check-in', refresh); socket.off('check-out', refresh); socket.off('participants-imported', refresh); };
  }, []);

  const filtered = participants.filter(p => {
    const matchesSearch = `${p.first_name} ${p.last_name} ${p.email} ${p.ticket_code}`.toLowerCase().includes(search.toLowerCase());
    if (filter === 'checked-in') return matchesSearch && p.checked_in;
    if (filter === 'not-checked-in') return matchesSearch && !p.checked_in;
    if (filter === 'student') return matchesSearch && p.role === 'student';
    if (filter === 'executive') return matchesSearch && p.role === 'executive';
    if (filter === 'no-ticket') return matchesSearch && !p.ticket_sent;
    return matchesSearch;
  });

  const handleAdd = async () => {
    await api.post('/participants', { ...form, event_id: eventId });
    setForm({ first_name: '', last_name: '', email: '', role: 'student', notes: '' });
    setShowAdd(false);
    loadData();
  };

  const handleUpdate = async (id) => {
    await api.put(`/participants/${id}`, form);
    setEditingId(null);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!confirm('Teilnehmer wirklich löschen?')) return;
    await api.delete(`/participants/${id}`);
    loadData();
  };

  const handleSendTicket = async (id) => {
    try {
      await api.post(`/email/send/${id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Fehler beim Senden');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', eventId);
    try {
      const res = await api.post('/import', formData);
      alert(`${res.data.imported} Teilnehmer importiert${res.data.errors > 0 ? `, ${res.data.errors} Fehler` : ''}`);
      setShowImport(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Import fehlgeschlagen');
    }
  };

  const handleSendAll = async () => {
    if (!confirm('Tickets an alle Studenten senden, die noch kein Ticket erhalten haben?')) return;
    try {
      const res = await api.post('/email/send-all', { event_id: eventId });
      alert(`${res.data.sent} Tickets gesendet, ${res.data.failed} fehlgeschlagen`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Fehler beim Massenversand');
    }
  };

  const downloadTicket = (id) => {
    const token = localStorage.getItem('gfd_token');
    window.open(`/api/tickets/${id}/pdf?token=${token}`, '_blank');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Teilnehmer</h1>
          <p className="text-sm text-[#64748b]">{participants.length} Teilnehmer registriert</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="gfd-btn" onClick={() => { setShowAdd(true); setForm({ first_name: '', last_name: '', email: '', role: 'student', notes: '' }); }}>
            <Plus size={16} /> Hinzufügen
          </button>
          <label className="gfd-btn gfd-btn-outline cursor-pointer">
            <Upload size={16} /> Importieren
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>
          <button className="gfd-btn gfd-btn-outline" onClick={handleSendAll}>
            <Mail size={16} /> Alle Tickets senden
          </button>
        </div>
      </div>

      {/* Search and filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]" />
          <input
            className="gfd-input pl-10"
            placeholder="Suche nach Name, E-Mail oder Ticket-Code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="gfd-select w-auto" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Alle</option>
          <option value="student">Studenten</option>
          <option value="executive">Executives</option>
          <option value="checked-in">Eingecheckt</option>
          <option value="not-checked-in">Nicht eingecheckt</option>
          <option value="no-ticket">Kein Ticket gesendet</option>
        </select>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="gfd-card p-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-white mb-3">Neuen Teilnehmer hinzufügen</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input className="gfd-input" placeholder="Vorname" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            <input className="gfd-input" placeholder="Nachname" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
            <input className="gfd-input" placeholder="E-Mail" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <select className="gfd-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="student">Student</option>
              <option value="executive">Executive</option>
            </select>
            <div className="flex gap-2">
              <button className="gfd-btn flex-1" onClick={handleAdd}>Speichern</button>
              <button className="gfd-btn gfd-btn-outline" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Participant table */}
      <div className="gfd-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a2e]">
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Name</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase hidden md:table-cell">E-Mail</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Rolle</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase hidden lg:table-cell">Tisch</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Status</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase hidden lg:table-cell">Ticket</th>
              <th className="text-right p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-[#1a1a2e]/50 hover:bg-[#0c0c0f] transition-colors">
                {editingId === p.id ? (
                  <>
                    <td className="p-3"><input className="gfd-input text-sm" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} /> <input className="gfd-input text-sm mt-1" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} /></td>
                    <td className="p-3 hidden md:table-cell"><input className="gfd-input text-sm" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></td>
                    <td className="p-3"><select className="gfd-select text-sm" value={form.role} onChange={e => setForm({...form, role: e.target.value})}><option value="student">Student</option><option value="executive">Executive</option></select></td>
                    <td className="p-3 hidden lg:table-cell"></td>
                    <td className="p-3"></td>
                    <td className="p-3 hidden lg:table-cell"></td>
                    <td className="p-3 text-right">
                      <button className="gfd-btn text-xs py-1 px-3 mr-1" onClick={() => handleUpdate(p.id)}><Check size={14} /></button>
                      <button className="gfd-btn gfd-btn-outline text-xs py-1 px-3" onClick={() => setEditingId(null)}><X size={14} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">
                      <div className="font-medium text-white">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-[#52525b] font-mono">{p.ticket_code}</div>
                    </td>
                    <td className="p-3 text-[#a1a1aa] hidden md:table-cell">{p.email}</td>
                    <td className="p-3">
                      <span className={`gfd-badge ${p.role === 'student' ? 'gfd-badge-blue' : 'gfd-badge-amber'}`}>
                        {p.role === 'student' ? 'Student' : 'Executive'}
                      </span>
                    </td>
                    <td className="p-3 text-[#a1a1aa] hidden lg:table-cell">
                      {p.table_number ? `Tisch ${p.table_number}, Platz ${p.seat_number}` : '—'}
                    </td>
                    <td className="p-3">
                      {p.checked_in ? (
                        <div>
                          <span className="gfd-badge gfd-badge-green">Eingecheckt</span>
                          {p.checked_in_by_name && (
                            <div className="text-xs text-[#52525b] mt-1">von {p.checked_in_by_name}</div>
                          )}
                        </div>
                      ) : (
                        <span className="gfd-badge gfd-badge-gray">Ausstehend</span>
                      )}
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      {p.ticket_sent ? (
                        <span className="gfd-badge gfd-badge-green">Gesendet</span>
                      ) : (
                        <span className="gfd-badge gfd-badge-gray">Nicht gesendet</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Bearbeiten" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-white transition-colors" onClick={() => { setEditingId(p.id); setForm({ first_name: p.first_name, last_name: p.last_name, email: p.email, role: p.role, notes: p.notes || '' }); }}>
                          <Edit2 size={14} />
                        </button>
                        <button title="Ticket PDF" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-white transition-colors" onClick={() => downloadTicket(p.id)}>
                          <Download size={14} />
                        </button>
                        {p.role === 'student' && !p.ticket_sent && (
                          <button title="Ticket senden" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-[#4a8af4] transition-colors" onClick={() => handleSendTicket(p.id)}>
                            <Mail size={14} />
                          </button>
                        )}
                        <button title="Löschen" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-red-400 transition-colors" onClick={() => handleDelete(p.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-[#52525b]">Keine Teilnehmer gefunden</div>
        )}
      </div>
    </div>
  );
}
