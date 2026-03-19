import { useState, useEffect } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';
import { Users, UserCheck, Ticket, Grid3X3, Clock, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [eventId, setEventId] = useState(null);

  const loadData = async () => {
    const evRes = await api.get('/events');
    if (evRes.data.length > 0) {
      const eid = evRes.data[0].id;
      setEventId(eid);
      const [statsRes, checkinsRes] = await Promise.all([
        api.get(`/dashboard/stats?event_id=${eid}`),
        api.get('/dashboard/recent-checkins?limit=15')
      ]);
      setStats(statsRes.data);
      setRecentCheckins(checkinsRes.data);
    }
  };

  useEffect(() => {
    loadData();
    socket.connect();
    socket.emit('join-dashboard');

    const refresh = () => loadData();
    socket.on('check-in', refresh);
    socket.on('check-out', refresh);
    socket.on('participant-added', refresh);
    socket.on('participant-removed', refresh);
    socket.on('participants-imported', refresh);
    socket.on('ticket-sent', refresh);

    return () => {
      socket.off('check-in', refresh);
      socket.off('check-out', refresh);
      socket.off('participant-added', refresh);
      socket.off('participant-removed', refresh);
      socket.off('participants-imported', refresh);
      socket.off('ticket-sent', refresh);
    };
  }, []);

  if (!stats) return <div className="text-[#64748b]">Laden...</div>;

  const statCards = [
    { label: 'Teilnehmer', value: stats.totalParticipants, icon: Users, sub: `${stats.totalStudents} Studenten · ${stats.totalExecutives} Executives` },
    { label: 'Eingecheckt', value: stats.checkedIn, icon: UserCheck, sub: `${stats.notCheckedIn} ausstehend`, highlight: true },
    { label: 'Tickets gesendet', value: stats.ticketsSent, icon: Ticket, sub: `${stats.ticketsNotSent} ausstehend` },
    { label: 'Tische', value: stats.tablesCount, icon: Grid3X3, sub: `${stats.seatedParticipants} Plätze belegt` },
  ];

  const checkinPercent = stats.totalParticipants > 0
    ? Math.round((stats.checkedIn / stats.totalParticipants) * 100)
    : 0;

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

      {/* Stats grid */}
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

      {/* Check-in progress */}
      <div className="gfd-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp size={16} className="text-[#4a8af4]" />
            Check-in Fortschritt
          </span>
          <span className="text-sm font-bold text-[#4a8af4]">{checkinPercent}%</span>
        </div>
        <div className="w-full h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00379e] to-[#2563eb] rounded-full transition-all duration-500"
            style={{ width: `${checkinPercent}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#52525b]">
          <span>{stats.checkedIn} eingecheckt</span>
          <span>{stats.totalParticipants} gesamt</span>
        </div>
      </div>

      {/* Recent check-ins */}
      <div className="gfd-card p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Clock size={16} className="text-[#4a8af4]" />
          Letzte Check-ins
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
                    <span className="text-sm text-white font-medium">{ci.first_name} {ci.last_name}</span>
                    {ci.table_number && (
                      <span className="text-xs text-[#52525b] ml-2">Tisch {ci.table_number}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#52525b]">
                    {new Date(ci.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {ci.scanned_by_name && (
                    <div className="text-xs text-[#3f3f46]">von {ci.scanned_by_name}</div>
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
