import { useState, useEffect } from 'react';
import api from '../lib/api';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { User, UserCheck, Crown, ChevronUp } from 'lucide-react';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);
  const [assigning, setAssigning] = useState(null);

  const loadTables = async (eid) => {
    const res = await api.get(`/tables?event_id=${eid}`);
    setTables(res.data);
  };

  useEffect(() => {
    let unsubParticipants = null;
    let unsubSeats = null;

    const init = async () => {
      const evRes = await api.get('/events');
      if (evRes.data.length > 0) {
        const eid = evRes.data[0].id;
        setEventId(eid);
        await loadTables(eid);

        // Realtime listener for participants
        const pQuery = query(collection(db, 'participants'), where('eventId', '==', eid));
        unsubParticipants = onSnapshot(pQuery, (snapshot) => {
          setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Realtime listener for seats
        const sQuery = query(collection(db, 'seats'), where('eventId', '==', eid));
        unsubSeats = onSnapshot(sQuery, () => {
          loadTables(eid);
        });
      }
    };

    init();
    return () => {
      if (unsubParticipants) unsubParticipants();
      if (unsubSeats) unsubSeats();
    };
  }, []);

  const assignSeat = async (tableId, seatId, participantId) => {
    await api.post(`/tables/${tableId}/seats/${seatId}/assign`, { participant_id: participantId });
    setAssigning(null);
  };

  const unassignSeat = async (tableId, seatId) => {
    await api.post(`/tables/${tableId}/seats/${seatId}/unassign`);
  };

  // Get unassigned participants filtered by seat type
  const unassignedParticipants = (seatType) =>
    participants.filter(p => !p.seatId && p.role === seatType);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Tischplan</h1>
        <p className="text-sm text-[#64748b]">12 Tische · 9 Plätze pro Tisch (6 Studenten + 3 Executives)</p>
      </div>

      {/* Visual overview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        {tables.map(table => {
          const occupied = table.seats.filter(s => s.participantId).length;
          const checkedIn = table.seats.filter(s => s.checkedIn).length;
          return (
            <button
              key={table.id}
              onClick={() => setExpandedTable(expandedTable === table.id ? null : table.id)}
              className={`gfd-card p-4 text-center transition-all hover:border-[#00379e] cursor-pointer ${expandedTable === table.id ? 'border-[#00379e]' : ''}`}
            >
              <div className="text-lg font-bold text-white mb-1">Tisch {table.tableNumber}</div>
              <div className="flex justify-center gap-1 mb-2">
                {table.seats.map(seat => (
                  <div
                    key={seat.id}
                    className={`w-2.5 h-2.5 rounded-full ${
                      seat.checkedIn ? 'bg-green-500' :
                      seat.participantId ? (seat.seatType === 'executive' ? 'bg-amber-500' : 'bg-[#00379e]') :
                      'bg-[#1a1a2e]'
                    }`}
                    title={seat.firstName ? `${seat.firstName} ${seat.lastName}` : `Platz ${seat.seatNumber} (${seat.seatType})`}
                  />
                ))}
              </div>
              <div className="text-xs text-[#52525b]">{occupied}/9 belegt · {checkedIn} da</div>
            </button>
          );
        })}
      </div>

      {/* Expanded table detail */}
      {expandedTable && (() => {
        const table = tables.find(t => t.id === expandedTable);
        if (!table) return null;
        return (
          <div className="gfd-card p-6 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Tisch {table.tableNumber}</h2>
              <button className="text-[#64748b] hover:text-white" onClick={() => setExpandedTable(null)}>
                <ChevronUp size={20} />
              </button>
            </div>

            {/* Circular table */}
            <div className="relative w-full max-w-lg mx-auto aspect-square mb-6">
              <div className="absolute inset-[25%] rounded-full border-2 border-[#1a1a2e] bg-[#0c0c0f] flex items-center justify-center">
                <span className="text-sm text-[#52525b]">Tisch {table.tableNumber}</span>
              </div>

              {table.seats.map((seat, idx) => {
                const angle = (idx / 9) * 2 * Math.PI - Math.PI / 2;
                const radius = 42;
                const x = 50 + radius * Math.cos(angle);
                const y = 50 + radius * Math.sin(angle);
                const isExec = seat.seatType === 'executive';
                const isOccupied = !!seat.participantId;
                const isCheckedIn = !!seat.checkedIn;

                return (
                  <div key={seat.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                    <button
                      onClick={() => {
                        if (isOccupied && !assigning) {
                          if (confirm(`${seat.firstName} ${seat.lastName} von Platz entfernen?`)) {
                            unassignSeat(table.id, seat.id);
                          }
                        } else if (!isOccupied) {
                          setAssigning({ tableId: table.id, seatId: seat.id, seatType: seat.seatType });
                        }
                      }}
                      className={`w-14 h-14 md:w-16 md:h-16 rounded-full border-2 flex flex-col items-center justify-center transition-all text-xs cursor-pointer ${
                        isCheckedIn ? 'border-green-500 bg-green-500/10' :
                        isOccupied ? (isExec ? 'border-amber-500 bg-amber-500/10' : 'border-[#00379e] bg-[#00379e]/10') :
                        'border-[#1a1a2e] bg-[#0c0c0f] hover:border-[#00379e]'
                      }`}
                      title={seat.firstName ? `${seat.firstName} ${seat.lastName}` : `Platz ${seat.seatNumber}`}
                    >
                      {isOccupied ? (
                        <>
                          {isCheckedIn ? <UserCheck size={14} className="text-green-400" /> :
                           isExec ? <Crown size={14} className="text-amber-400" /> :
                           <User size={14} className="text-[#4a8af4]" />}
                          <span className={`mt-0.5 truncate max-w-[50px] ${isCheckedIn ? 'text-green-400' : isExec ? 'text-amber-400' : 'text-[#4a8af4]'}`}>
                            {seat.firstName?.[0]}{seat.lastName?.[0]}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[#52525b]">{seat.seatNumber}</span>
                          <span className={`text-[10px] ${isExec ? 'text-amber-500/50' : 'text-[#00379e]/50'}`}>
                            {isExec ? 'Exec' : 'Stud'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Assignment panel */}
            {assigning && assigning.tableId === table.id && (
              <div className="gfd-card p-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-white mb-3">
                  {assigning.seatType === 'executive' ? 'Executive' : 'Student'} zuweisen – Platz {table.seats.find(s => s.id === assigning.seatId)?.seatNumber}
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {unassignedParticipants(assigning.seatType).map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left p-2 rounded hover:bg-[#1a1a2e] text-sm text-[#a1a1aa] hover:text-white transition-colors"
                      onClick={() => assignSeat(assigning.tableId, assigning.seatId, p.id)}
                    >
                      {p.firstName} {p.lastName} <span className="text-[#52525b]">({p.email})</span>
                    </button>
                  ))}
                  {unassignedParticipants(assigning.seatType).length === 0 && (
                    <p className="text-sm text-[#52525b]">Keine unzugewiesenen {assigning.seatType === 'executive' ? 'Executives' : 'Studenten'}</p>
                  )}
                </div>
                <button className="gfd-btn gfd-btn-outline mt-3 text-xs" onClick={() => setAssigning(null)}>Abbrechen</button>
              </div>
            )}

            {/* Seat list */}
            <div className="space-y-1 mt-4">
              {table.seats.map(seat => (
                <div key={seat.id} className="flex items-center justify-between p-2 rounded hover:bg-[#0c0c0f]">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      seat.seatType === 'executive' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#00379e]/20 text-[#4a8af4]'
                    }`}>{seat.seatNumber}</span>
                    <div>
                      {seat.firstName ? (
                        <span className="text-sm text-white">{seat.firstName} {seat.lastName}</span>
                      ) : (
                        <span className="text-sm text-[#52525b] italic">Leer ({seat.seatType === 'executive' ? 'Executive' : 'Student'})</span>
                      )}
                    </div>
                  </div>
                  {seat.checkedIn && <span className="gfd-badge gfd-badge-green">Eingecheckt</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-[#64748b]">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1a1a2e]"></span> Leer</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#00379e]"></span> Student</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500"></span> Executive</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span> Eingecheckt</div>
      </div>
    </div>
  );
}
