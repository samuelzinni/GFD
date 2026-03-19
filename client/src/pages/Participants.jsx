import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp } from 'firebase/firestore';
import { Plus, Upload, Search, Download, Trash2, Edit2, Check, X } from 'lucide-react';

export default function Participants() {
  const [participants, setParticipants] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'student', notes: '' });
  const [filter, setFilter] = useState('all');
  const [tables, setTables] = useState([]);

  useEffect(() => {
    let unsubParticipants = null;
    let unsubTables = null;

    const init = async () => {
      const evSnapshot = await getDocs(collection(db, 'events'));
      if (!evSnapshot.empty) {
        const eid = evSnapshot.docs[0].id;
        setEventId(eid);

        const q = query(collection(db, 'participants'), where('eventId', '==', eid), orderBy('lastName'), orderBy('firstName'));
        unsubParticipants = onSnapshot(q, (snapshot) => {
          setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const tQuery = query(collection(db, 'tables'), where('eventId', '==', eid), orderBy('tableNumber'));
        unsubTables = onSnapshot(tQuery, (snap) => {
          setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      }
    };

    init();
    return () => {
      if (unsubParticipants) unsubParticipants();
      if (unsubTables) unsubTables();
    };
  }, []);

  const filtered = participants.filter(p => {
    const matchesSearch = `${p.firstName} ${p.lastName} ${p.email} ${p.ticketCode}`.toLowerCase().includes(search.toLowerCase());
    if (filter === 'checked-in') return matchesSearch && p.checkedIn;
    if (filter === 'not-checked-in') return matchesSearch && !p.checkedIn;
    if (filter === 'student') return matchesSearch && p.role === 'student';
    if (filter === 'executive') return matchesSearch && p.role === 'executive';
    return matchesSearch;
  });

  const handleAdd = async () => {
    if (!form.firstName || !form.lastName) return;
    const ticketCode = 'GFD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await addDoc(collection(db, 'participants'), {
      ...form,
      eventId,
      ticketCode,
      checkedIn: false,
      seatId: null,
      tableId: form.tableId || null,
      createdAt: serverTimestamp()
    });
    setForm({ firstName: '', lastName: '', email: '', role: 'student', notes: '' });
    setShowAdd(false);
  };

  const handleUpdate = async (id) => {
    await updateDoc(doc(db, 'participants', id), {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      role: form.role,
      notes: form.notes
    });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Teilnehmer wirklich löschen?')) return;
    await deleteDoc(doc(db, 'participants', id));
  };

  const handleImport = () => {
    alert('Import ist momentan nicht verfügbar');
  };

  const downloadTicket = () => {
    alert('PDF-Download ist momentan nicht verfügbar');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Teilnehmer</h1>
          <p className="text-sm text-[#64748b]">{participants.length} Teilnehmer registriert</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="gfd-btn" onClick={() => { setShowAdd(true); setForm({ firstName: '', lastName: '', email: '', role: 'student', notes: '' }); }}>
            <Plus size={16} /> Hinzufügen
          </button>
          <button className="gfd-btn gfd-btn-outline" onClick={handleImport}>
            <Upload size={16} /> Importieren
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]" />
          <input className="gfd-input pl-10" placeholder="Suche nach Name, E-Mail oder Ticket-Code..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="gfd-select w-auto" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Alle</option>
          <option value="student">Studenten</option>
          <option value="executive">Executives</option>
          <option value="checked-in">Eingecheckt</option>
          <option value="not-checked-in">Nicht eingecheckt</option>
        </select>
      </div>

      {showAdd && (
        <div className="gfd-card p-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-white mb-3">Neuen Teilnehmer hinzufügen</h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input className="gfd-input" placeholder="Vorname" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <input className="gfd-input" placeholder="Nachname" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            <input className="gfd-input" placeholder="E-Mail" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <select className="gfd-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="student">Student</option>
              <option value="executive">Executive</option>
            </select>
            <select className="gfd-select" value={form.tableId || ''} onChange={e => setForm({ ...form, tableId: e.target.value || null })}>
              <option value="">Kein Tisch</option>
              {tables.map(t => (
                <option key={t.id} value={t.id}>Tisch {t.tableNumber}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button className="gfd-btn flex-1" onClick={handleAdd}>Speichern</button>
              <button className="gfd-btn gfd-btn-outline" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      <div className="gfd-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a2e]">
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Name</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase hidden md:table-cell">E-Mail</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Rolle</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase hidden lg:table-cell">Tisch</th>
              <th className="text-left p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Status</th>
              <th className="text-right p-3 text-xs font-semibold text-[#64748b] tracking-wider uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-[#1a1a2e]/50 hover:bg-[#0c0c0f] transition-colors">
                {editingId === p.id ? (
                  <>
                    <td className="p-3"><input className="gfd-input text-sm" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} /><input className="gfd-input text-sm mt-1" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} /></td>
                    <td className="p-3 hidden md:table-cell"><input className="gfd-input text-sm" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></td>
                    <td className="p-3"><select className="gfd-select text-sm" value={form.role} onChange={e => setForm({...form, role: e.target.value})}><option value="student">Student</option><option value="executive">Executive</option></select></td>
                    <td className="p-3 hidden lg:table-cell"></td><td className="p-3"></td>
                    <td className="p-3 text-right">
                      <button className="gfd-btn text-xs py-1 px-3 mr-1" onClick={() => handleUpdate(p.id)}><Check size={14} /></button>
                      <button className="gfd-btn gfd-btn-outline text-xs py-1 px-3" onClick={() => setEditingId(null)}><X size={14} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">
                      <div className="font-medium text-white">{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-[#52525b] font-mono">{p.ticketCode}</div>
                    </td>
                    <td className="p-3 text-[#a1a1aa] hidden md:table-cell">{p.email}</td>
                    <td className="p-3">
                      <span className={`gfd-badge ${p.role === 'student' ? 'gfd-badge-blue' : 'gfd-badge-amber'}`}>
                        {p.role === 'student' ? 'Student' : 'Executive'}
                      </span>
                    </td>
                    <td className="p-3 text-[#a1a1aa] hidden lg:table-cell">{p.tableId ? 'Zugewiesen' : '—'}</td>
                    <td className="p-3">
                      {p.checkedIn ? (
                        <div>
                          <span className="gfd-badge gfd-badge-green">Eingecheckt</span>
                          {p.checkedInByName && <div className="text-xs text-[#52525b] mt-1">von {p.checkedInByName}</div>}
                        </div>
                      ) : (
                        <span className="gfd-badge gfd-badge-gray">Ausstehend</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Bearbeiten" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-white transition-colors" onClick={() => { setEditingId(p.id); setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email, role: p.role, notes: p.notes || '' }); }}>
                          <Edit2 size={14} />
                        </button>
                        <button title="Ticket PDF" className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-white transition-colors" onClick={() => downloadTicket(p.id)}>
                          <Download size={14} />
                        </button>
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
        {filtered.length === 0 && <div className="p-8 text-center text-[#52525b]">Keine Teilnehmer gefunden</div>}
      </div>
    </div>
  );
}
