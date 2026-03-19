import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import app from '../lib/firebase';
import { collection, onSnapshot, query, getDocs, addDoc, updateDoc, doc, writeBatch, serverTimestamp, limit } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { Users, Plus, Trash2, Shield, ScanLine, Calendar, Rocket } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'scanner' });
  const [event, setEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ name: '', date: '', location: '', description: '' });
  const [initStatus, setInitStatus] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    loadEvent();
    return () => unsub();
  }, []);

  const loadEvent = async () => {
    const snapshot = await getDocs(collection(db, 'events'));
    if (!snapshot.empty) {
      const eventData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      setEvent(eventData);
      setEventForm(eventData);
    }
  };

  const initializeEvent = async () => {
    setInitStatus('Initialisiere...');
    try {
      // Check if already initialized
      const existing = await getDocs(query(collection(db, 'events'), limit(1)));
      if (!existing.empty) {
        setInitStatus('Event existiert bereits');
        loadEvent();
        return;
      }

      const batch = writeBatch(db);

      // Create event
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        name: 'German Finance Dinner 2026',
        date: '2026-06-15',
        location: 'TBD',
        description: '',
        createdAt: serverTimestamp()
      });

      const seatPattern = ['student', 'student', 'executive', 'student', 'student', 'executive', 'student', 'student', 'executive'];

      for (let t = 1; t <= 12; t++) {
        const tableRef = doc(collection(db, 'tables'));
        batch.set(tableRef, {
          eventId: eventRef.id,
          tableNumber: t,
          tableName: `Tisch ${t}`,
          createdAt: serverTimestamp()
        });

        for (let s = 1; s <= 9; s++) {
          const seatRef = doc(collection(db, 'seats'));
          batch.set(seatRef, {
            tableId: tableRef.id,
            eventId: eventRef.id,
            seatNumber: s,
            seatType: seatPattern[s - 1],
            participantId: null,
            createdAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      setInitStatus('Event mit 12 Tischen erstellt!');
      loadEvent();
    } catch (err) {
      setInitStatus('Fehler: ' + err.message);
    }
  };

  const addUser = async () => {
    if (!form.username || !form.password) return alert('Username und Passwort erforderlich');
    if (form.password.length < 6) return alert('Passwort muss mindestens 6 Zeichen haben');
    try {
      const email = `${form.username.toLowerCase().trim()}@gfd.local`;

      // Create secondary app to avoid signing out current user
      const secondaryApp = initializeApp(app.options, 'secondary');
      const secondaryAuth = getAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, form.password);

      // Create user doc in Firestore
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', cred.user.uid), {
        username: form.username.toLowerCase().trim(),
        displayName: form.displayName || form.username,
        role: form.role || 'scanner',
        createdAt: serverTimestamp()
      });

      await deleteApp(secondaryApp);

      setForm({ username: '', password: '', displayName: '', role: 'scanner' });
      setShowAdd(false);
    } catch (err) {
      alert(err.message || 'Fehler beim Erstellen');
    }
  };

  const deleteUser = async (uid, username) => {
    if (!confirm(`User "${username}" wirklich löschen?`)) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      alert(err.message || 'Fehler beim Löschen');
    }
  };

  const updateEvent = async () => {
    if (!event) return;
    await updateDoc(doc(db, 'events', event.id), {
      name: eventForm.name,
      date: eventForm.date,
      location: eventForm.location,
      description: eventForm.description
    });
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

      {/* Initialize Event */}
      {!event && (
        <div className="gfd-card p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Rocket size={16} className="text-[#4a8af4]" /> Event initialisieren
          </h2>
          <p className="text-sm text-[#a1a1aa] mb-4">Erstellt das Event mit 12 Tischen und der Sitzordnung (S-S-E-S-S-E-S-S-E).</p>
          {initStatus && <p className="text-sm text-[#4a8af4] mb-3">{initStatus}</p>}
          <button className="gfd-btn" onClick={initializeEvent}>Event + Tische anlegen</button>
        </div>
      )}

      {/* Event settings */}
      {event && (
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
      )}

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
              <div>
                <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Benutzername</label>
                <input className="gfd-input" placeholder="z.B. maxmustermann" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Passwort</label>
                <input className="gfd-input" type="password" placeholder="Min. 6 Zeichen" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Anzeigename (optional)</label>
                <input className="gfd-input" placeholder="Max Mustermann" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Rolle</label>
                <select className="gfd-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="scanner">Scanner</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
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
                  <div className="text-sm text-white font-medium">{u.displayName || u.username}</div>
                  <div className="text-xs text-[#52525b]">@{u.username} · {u.role}</div>
                </div>
              </div>
              {u.id !== user.id && (
                <button
                  className="p-1.5 rounded hover:bg-[#1a1a2e] text-[#64748b] hover:text-red-400 transition-colors"
                  title="Löschen"
                  onClick={() => deleteUser(u.id, u.username)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
