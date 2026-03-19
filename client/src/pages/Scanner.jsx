import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../lib/api';
import { Camera, CameraOff, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function Scanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState(null);
  const html5QrRef = useRef(null);
  const processingRef = useRef(false);

  useEffect(() => {
    return () => { stopScanning(); };
  }, []);

  const startScanning = async () => {
    setError(null);
    setResult(null);
    try {
      const html5Qr = new Html5Qrcode('qr-reader');
      html5QrRef.current = html5Qr;
      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setError('Kamera konnte nicht geöffnet werden: ' + err.message);
    }
  };

  const stopScanning = async () => {
    if (html5QrRef.current?.isScanning) {
      await html5QrRef.current.stop();
    }
    setScanning(false);
  };

  const onScanSuccess = async (decodedText) => {
    if (processingRef.current) return;
    processingRef.current = true;

    if (html5QrRef.current?.isScanning) {
      await html5QrRef.current.pause();
    }

    await processCode(decodedText);

    setTimeout(() => {
      if (html5QrRef.current?.getState() === 3) {
        html5QrRef.current.resume();
      }
      processingRef.current = false;
    }, 3000);
  };

  const processCode = async (code) => {
    try {
      const res = await api.post('/scan/checkin', { ticket_code: code.trim() });
      setResult(res.data);
      setRecentScans(prev => [{ ...res.data, timestamp: new Date() }, ...prev.slice(0, 19)]);
    } catch (err) {
      const msg = err.response?.status === 404 ? 'Ungültiger QR-Code / Ticket nicht gefunden' : 'Fehler bei der Verarbeitung';
      setResult({ valid: false, message: msg });
    }
  };

  const handleManualCheckin = async () => {
    if (!manualCode.trim()) return;
    await processCode(manualCode.trim());
    setManualCode('');
  };

  return (
    <div className="animate-fade-in max-w-xl mx-auto">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-1">QR-Scanner</h1>
        <p className="text-sm text-[#64748b]">Scanne Tickets zum Einchecken</p>
      </div>

      <div className="gfd-card p-4 mb-4">
        <div id="qr-reader" className="w-full rounded-lg overflow-hidden bg-[#0c0c0f] mb-4" style={{ minHeight: scanning ? '300px' : '0' }}></div>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          {!scanning ? (
            <button className="gfd-btn w-full" onClick={startScanning}><Camera size={18} /> Kamera starten</button>
          ) : (
            <button className="gfd-btn gfd-btn-outline w-full" onClick={stopScanning}><CameraOff size={18} /> Kamera stoppen</button>
          )}
        </div>
      </div>

      <div className="gfd-card p-4 mb-4">
        <h3 className="text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-2">Manuelle Eingabe</h3>
        <div className="flex gap-2">
          <input
            className="gfd-input flex-1"
            placeholder="Ticket-Code (z.B. GFD-XXXXXXXX)"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualCheckin()}
          />
          <button className="gfd-btn" onClick={handleManualCheckin}>Check-in</button>
        </div>
      </div>

      {result && (
        <div className={`gfd-card p-5 mb-4 animate-fade-in border-l-4 ${
          result.valid && !result.already_checked_in ? 'border-l-green-500' :
          result.already_checked_in ? 'border-l-amber-500' : 'border-l-red-500'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {result.valid && !result.already_checked_in ? (
              <CheckCircle size={28} className="text-green-500" />
            ) : result.already_checked_in ? (
              <AlertTriangle size={28} className="text-amber-500" />
            ) : (
              <XCircle size={28} className="text-red-500" />
            )}
            <div>
              <div className={`text-lg font-bold ${
                result.valid && !result.already_checked_in ? 'text-green-400' :
                result.already_checked_in ? 'text-amber-400' : 'text-red-400'
              }`}>
                {result.valid && !result.already_checked_in ? 'Erfolgreich eingecheckt!' :
                 result.already_checked_in ? 'Bereits eingecheckt' : 'Ungültig'}
              </div>
              <div className="text-sm text-[#a1a1aa]">{result.message}</div>
            </div>
          </div>
          {result.participant && (
            <div className="bg-[#000] rounded-lg p-3 mt-2">
              <div className="text-white font-medium">{result.participant.firstName} {result.participant.lastName}</div>
              <div className="text-xs text-[#52525b] mt-1 font-mono">{result.participant.ticketCode}</div>
            </div>
          )}
        </div>
      )}

      {recentScans.length > 0 && (
        <div className="gfd-card p-4">
          <h3 className="text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-3">Letzte Scans</h3>
          <div className="space-y-2">
            {recentScans.map((scan, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-[#1a1a2e] last:border-0">
                <div className="flex items-center gap-2">
                  {scan.valid ? (
                    <CheckCircle size={14} className={scan.already_checked_in ? 'text-amber-400' : 'text-green-400'} />
                  ) : (
                    <XCircle size={14} className="text-red-400" />
                  )}
                  <span className="text-sm text-white">
                    {scan.participant ? `${scan.participant.firstName} ${scan.participant.lastName}` : 'Ungültig'}
                  </span>
                </div>
                <span className="text-xs text-[#52525b]">
                  {scan.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
