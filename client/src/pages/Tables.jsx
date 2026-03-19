import { useState, useEffect } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';
import { Grid3X3, User, UserCheck, Crown, ChevronDown, ChevronUp } from 'lucide-react';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);
  const [assigning, setAssigning] = useState(null); // { tableId, seatId }

  const loadData = async () => {
    const evRes = await api.get('/events');
    if (evRes.data.length > 0) {
      const eid = evRes.data[0].id;
      setEventId(eid);
      const [tablesRes, partRes] = await Promise.all([
        api.get(`/tables?event_id=${eid}`),
        api.get(`/participants?event_id=${eid}`)
      ]);
      setTables(tablesRes.data);
      setParticipants(partRes.data);
    }
  };

  useEffect(() => {
    loadData();
    socket.connect();
    socket.emit('join-dashboard');
    socket.on('seating-updated', loadData);
    socket.on('check-in', loadData);
    socket.on('check-out', loadData);
    return () => {
      socket.off('seating-updated', loadData);
      socket.off('check-in', loadData);
      socket.off('check-out', loadData);
    };
  }, []);

  const assignSeat = async (tableId, seatId, participantId) => {
    await api.post(`/tables/${tableId}/seats/${seatId}/assign`, { participant_id: participantId });
    setAssigning(null);
    loadData();
  };

  const unassignSeat = async (tableId, seatId) => {
    await api.post(`/tables/${tableId}/seats/${seatId}/unassign`);
    loadData();
  };

  const unassignedParticipants = (seatType) =>
    participants.filter(p => !p.seat_id && p.role === seatType);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Tischplan</h1>
        <p className="text-sm text-[#64748b]">12 Tische · 9 Plätze pro Tisch (6 Studenten + 3 Executives)</p>
      </div>

      {/* Visual overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        {tables.map(table => {
          const occupied = table.seats.filter(s => s.participant_id).length;
          const checkedIn = table.seats.filter(s => s.checked_in).length;
          return (
            <button
              key={table.id}
              onClick={() => setExpandedTable(expandedTable === table.id ? null : table.id)}
              className={`gfd-card p-4 text-center transition-all hover:border-[#00379e] cursor-pointer ${expandedTable === table.id ? 'border-[#00379e]' : ''}`}
            >
              <div className="text-lg font-bold text-white mb-1">Tisch {table.table_number}</div>
              <div className="flex justify-center gap-1 mb-2">
                {table.seats.map(seat => (
                  <div
                    key={seat.id}
                    className={`w-2.5 h-2.5 rounded-full ${
                      seat.checked_in ? 'bg-green-500' :
                      seat.participant_id ? (seat.seat_type === 'executive' ? 'bg-amber-500' : 'bg-[#00379e]') :
                      'bg-[#1a1a2e]'
                    }`}
                    title={seat.first_name ? `${seat.first_name} ${seat.last_name}` : `Platz ${seat.seat_number} (${seat.seat_type})`}
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
              <h2 className="text-lg font-bold text-white">Tisch {table.table_number}</h2>
              <button className="text-[#64748b] hover:text-white" onClick={() => setExpandedTable(null)}>
                <ChevronUp size={20} />
              </button>
            </div>

            {/* Circular table visualization */}
            <div className="relative w-full max-w-lg mx-auto aspect-square mb-6">
              {/* Table circle */}
              <div className="absolute inset-[25%] rounded-full border-2 border-[#1a1a2e] bg-[#0c0c0f] flex items-center justify-center">
                <span className="text-sm text-[#52525b]">Tisch {table.table_number}</span>
              </div>

              {/* Seats around the table */}
              {table.seats.map((seat, idx) => {
                const angle = (idx / 9) * 2 * Math.PI - Math.PI / 2;
                const radius = 42;
                const x = 50 + radius * Math.cos(angle);
                const y = 50 + radius * Math.sin(angle);
                const isExecutive = seat.seat_type === 'executive';
                const isOccupied = !!seat.participant_id;
                const isCheckedIn = !!seat.checked_in;

                return (
                  <div
                    key={seat.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <button
                      onClick={() => {
                        if (isOccupied && !assigning) {
                          if (confirm(`${seat.first_name} ${seat.last_name} von Platz entfernen?`)) {
                            unassignSeat(table.id, seat.id);
                          }
                        } else if (!isOccupied) {
                          setAssigning({ tableId: table.id, seatId: seat.id, seatType: seat.seat_type });
                        }
                      }}
                      className={`
                        w-14 h-14 md:w-16 md:h-16 rounded-full border-2 flex flex-col items-center justify-center
                        transition-all text-xs cursor-pointer
                        ${isCheckedIn ? 'border-green-500 bg-green-500/10' :
                          isOccupied ? (isExecutive ? 'border-amber-500 bg-amber-500/10' : 'border-[#00379e] bg-[#00379e]/10') :
                          'border-[#1a1a2e] bg-[#0c0c0f] hover:border-[#00379e]'}
                      `}
                      title={seat.first_name ? `${seat.first_name} ${seat.last_name}` : `Platz ${seat.seat_number}`}
                    >
                      {isOccupied ? (
                        <>
                          {isCheckedIn ? <UserCheck size={14} className="text-green-400" /> :
                           isExecutive ? <Crown size={14} className="text-amber-400" /> :
                           <User size={14} className="text-[#4a8af4]" />}
                          <span className={`mt-0.5 truncate max-w-[50px] ${isCheckedIn ? 'text-green-400' : isExecutive ? 'text-amber-400' : 'text-[#4a8af4]'}`}>
                            {seat.first_name?.[0]}{seat.last_name?.[0]}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[#52525b]">{seat.seat_number}</span>
                          <span className={`text-[10px] ${isExecutive ? 'text-amber-500/50' : 'text-[#00379e]/50'}`}>
                            {isExecutive ? 'Exec' : 'Stud'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Seat assignment dropdown */}
            {assigning && assigning.tableId === table.id && (
              <div className="gfd-card p-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Teilnehmer zuweisen (Platz {table.seats.find(s => s.id === assigning.seatId)?.seat_number} – {assigning.seatType === 'executive' ? 'Executive' : 'Student'})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {unassignedParticipants(assigning.seatType).map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left p-2 rounded hover:bg-[#1a1a2e] text-sm text-[#a1a1aa] hover:text-white transition-colors"
                      onClick={() => assignSeat(assigning.tableId, assigning.seatId, p.id)}
                    >
                      {p.first_name} {p.last_name} <span className="text-[#52525b]">({p.email})</span>
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
            <div className="space-y-1">
              {table.seats.map(seat => (
                <div key={seat.id} className="flex items-center justify-between p-2 rounded hover:bg-[#0c0c0f]">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      seat.seat_type === 'executive' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#00379e]/20 text-[#4a8af4]'
                    }`}>{seat.seat_number}</span>
                    <div>
                      {seat.first_name ? (
                        <span className="text-sm text-white">{seat.first_name} {seat.last_name}</span>
                      ) : (
                        <span className="text-sm text-[#52525b] italic">Leer ({seat.seat_type})</span>
                      )}
                    </div>
                  </div>
                  {seat.checked_in && <span className="gfd-badge gfd-badge-green">Eingecheckt</span>}
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
