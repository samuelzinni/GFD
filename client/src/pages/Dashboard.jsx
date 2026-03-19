import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import { Users, UserCheck, Grid3X3, Clock, TrendingUp, Armchair } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [eventId, setEventId] = useState(null);

  useEffect(() => {
    let unsubParticipants = null;
    let unsubCheckins = null;

    const init = async () => {
      // Get first event directly from Firestore
      const evSnapshot = await getDocs(collection(db, 'events'));
      if (evSnapshot.empty) {
        setStats({ totalParticipants: 0, totalStudents: 0, totalExecutives: 0, checkedIn: 0, notCheckedIn: 0, seatedParticipants: 0, tablesCount: 0 });
        return;
      }
      const eid = evSnapshot.docs[0].id;
      setEventId(eid);

      // Realtime listener on participants for live stats
      const pQuery = query(collection(db, 'participants'), where('eventId', '==', eid));
      unsubParticipants = onSnapshot(pQuery, (snapshot) => {
        const parts = snapshot.docs.map(d => d.data());
        const totalParticipants = parts.length;
        const totalStudents = parts.filter(p => p.role === 'student').length;
        const totalExecutives = parts.filter(p => p.role === 'executive').length;
        const checkedIn = parts.filter(p => p.checkedIn).length;
        const seatedParticipants = parts.filter(p => p.seatId).length;

        // Get tables count
        getDocs(query(collection(db, 'tables'), where('eventId', '==', eid))).then(tablesSnap => {
          setStats({
            totalParticipants,
            totalStudents,
            totalExecutives,
            checkedIn,
            notCheckedIn: totalParticipants - checkedIn,
            seatedParticipants,
            tablesCount: tablesSnap.size
          });
        });
      });

      // Realtime listener on check-in log
      const cQuery = query(collection(db, 'checkInLog'), orderBy('timestamp', 'desc'), limit(15));
      unsubCheckins = onSnapshot(cQuery, (snapshot) => {
        const checkins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRecentCheckins(checkins);
      });
    };

    init();
    return () => {
      if (unsubParticipants) unsubParticipants();
      if (unsubCheckins) unsubCheckins();
    };
  }, []);

  if (!stats) return <div className="text-[#64748b]">Laden...</div>;

  const statCards = [
    { label: 'Teilnehmer', value: stats.totalParticipants, icon: Users, sub: `${stats.totalStudents} Studenten · ${stats.totalExecutives} Executives` },
    { label: 'Eingecheckt', value: stats.checkedIn, icon: UserCheck, sub: `${stats.notCheckedIn} ausstehend` },
    { label: 'Platziert', value: stats.seatedParticipants, icon: Armchair, sub: `${stats.totalParticipants - stats.seatedParticipants} ohne Platz` },
    { label: 'Tische', value: stats.tablesCount, icon: Grid3X3, sub: `${stats.seatedParticipants} / ${stats.tablesCount * 9} Plätze belegt` },
  ];

  const checkinPercent = stats.totalParticipants > 0
    ? Math.round((stats.checkedIn / stats.totalParticipants) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-sm text-[#64748b]">German Finance Dinner 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full pulse-green"></span>
          <span className="text-xs text-[#64748b]">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="gfd-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#64748b]">{card.label}</span>
                <Icon size={16} className="text-[#4a8af4]" />
              </div>
              <div className="text-3xl font-bold text-white mb-1">{card.value}</div>
              <div className="text-xs text-[#52525b]">{card.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="gfd-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp size={16} className="text-[#4a8af4]" /> Check-in Fortschritt
          </span>
          <span className="text-sm font-bold text-[#4a8af4]">{checkinPercent}%</span>
        </div>
        <div className="w-full h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#00379e] to-[#2563eb] rounded-full transition-all duration-500" style={{ width: `${checkinPercent}%` }}></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#52525b]">
          <span>{stats.checkedIn} eingecheckt</span>
          <span>{stats.totalParticipants} gesamt</span>
        </div>
      </div>

      <div className="gfd-card p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Clock size={16} className="text-[#4a8af4]" /> Letzte Check-ins
        </h2>
        {recentCheckins.length === 0 ? (
          <p className="text-sm text-[#52525b]">Noch keine Check-ins</p>
        ) : (
          <div className="space-y-2">
            {recentCheckins.map(ci => (
              <div key={ci.id} className="flex items-center justify-between py-2 border-b border-[#1a1a2e] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`gfd-badge ${ci.action === 'check_in' ? 'gfd-badge-green' : 'gfd-badge-red'}`}>
                    {ci.action === 'check_in' ? 'IN' : 'OUT'}
                  </span>
                  <div>
                    <span className="text-sm text-white font-medium">{ci.firstName} {ci.lastName}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#52525b]">
                    {ci.timestamp?.toDate ? ci.timestamp.toDate().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                  {ci.scannedByName && (
                    <div className="text-xs text-[#3f3f46]">von {ci.scannedByName}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
