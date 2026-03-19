import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Mail, Send, Settings, CheckCircle, AlertCircle } from 'lucide-react';

export default function Email() {
  const [config, setConfig] = useState({
    smtpHost: '', smtpPort: 587, smtpSecure: false,
    smtpUser: '', smtpPass: '',
    fromName: 'German Finance Dinner', fromEmail: 'noreply@finance-network.co',
    replyTo: 'participants@finance-network.co'
  });
  const [testStatus, setTestStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [eventId, setEventId] = useState(null);
  const [sendProgress, setSendProgress] = useState(null);

  useEffect(() => {
    loadConfig();
    loadEvent();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.get('/email/config');
      if (res.data) setConfig(res.data);
    } catch {}
  };

  const loadEvent = async () => {
    const res = await api.get('/events');
    if (res.data.length > 0) setEventId(res.data[0].id);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.put('/email/config', config);
      setTestStatus({ success: true, message: 'Konfiguration gespeichert' });
    } catch (err) {
      setTestStatus({ success: false, message: err.response?.data?.error || 'Fehler' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTestStatus(null);
    try {
      const res = await api.post('/email/test');
      setTestStatus({ success: true, message: res.data.message });
    } catch (err) {
      setTestStatus({ success: false, message: err.response?.data?.error || 'Verbindung fehlgeschlagen' });
    }
  };

  const sendAll = async () => {
    if (!confirm('Tickets an alle Studenten senden, die noch kein Ticket erhalten haben?')) return;
    setSendProgress({ sending: true });
    try {
      const res = await api.post('/email/send-all', { event_id: eventId });
      setSendProgress({ sent: res.data.sent, failed: res.data.failed, total: res.data.total, sending: false });
    } catch (err) {
      setSendProgress({ error: err.response?.data?.error || 'Fehler', sending: false });
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">E-Mail Konfiguration</h1>
        <p className="text-sm text-[#64748b]">SMTP-Einstellungen für den Ticketversand</p>
      </div>

      <div className="gfd-card p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Settings size={16} className="text-[#4a8af4]" /> SMTP-Server
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">SMTP Host</label>
            <input className="gfd-input" placeholder="smtp.gmail.com" value={config.smtpHost || ''} onChange={e => setConfig({ ...config, smtpHost: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Port</label>
            <input className="gfd-input" type="number" value={config.smtpPort || 587} onChange={e => setConfig({ ...config, smtpPort: parseInt(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Benutzername</label>
            <input className="gfd-input" value={config.smtpUser || ''} onChange={e => setConfig({ ...config, smtpUser: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Passwort</label>
            <input className="gfd-input" type="password" value={config.smtpPass || ''} onChange={e => setConfig({ ...config, smtpPass: e.target.value })} />
          </div>
        </div>

        <div className="gfd-gradient-line-thin mb-4"></div>

        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Mail size={16} className="text-[#4a8af4]" /> Absender
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Absender Name</label>
            <input className="gfd-input" value={config.fromName || ''} onChange={e => setConfig({ ...config, fromName: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Absender E-Mail</label>
            <input className="gfd-input" value={config.fromEmail || ''} onChange={e => setConfig({ ...config, fromEmail: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-1">Antwort an</label>
            <input className="gfd-input" value={config.replyTo || ''} onChange={e => setConfig({ ...config, replyTo: e.target.value })} />
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={config.smtpSecure || false} onChange={e => setConfig({ ...config, smtpSecure: e.target.checked })} className="w-4 h-4" />
          <span className="text-sm text-[#a1a1aa]">SSL/TLS verwenden</span>
        </label>

        {testStatus && (
          <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 text-sm ${
            testStatus.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {testStatus.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {testStatus.message}
          </div>
        )}

        <div className="flex gap-2">
          <button className="gfd-btn" onClick={saveConfig} disabled={saving}>{saving ? 'Speichern...' : 'Speichern'}</button>
          <button className="gfd-btn gfd-btn-outline" onClick={testConnection}>Verbindung testen</button>
        </div>
      </div>

      <div className="gfd-card p-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Send size={16} className="text-[#4a8af4]" /> Tickets versenden
        </h2>
        <p className="text-sm text-[#a1a1aa] mb-4">Sendet Ticket-E-Mails mit PDF + QR-Code an alle Studenten, die noch kein Ticket erhalten haben.</p>

        {sendProgress && (
          <div className={`p-3 rounded-lg mb-4 text-sm ${
            sendProgress.error ? 'bg-red-500/10 text-red-400' :
            sendProgress.sending ? 'bg-blue-500/10 text-[#4a8af4]' : 'bg-green-500/10 text-green-400'
          }`}>
            {sendProgress.error ? sendProgress.error :
             sendProgress.sending ? 'Sende Tickets...' :
             `${sendProgress.sent} gesendet, ${sendProgress.failed} fehlgeschlagen (von ${sendProgress.total})`}
          </div>
        )}

        <button className="gfd-btn" onClick={sendAll}><Send size={16} /> Alle ausstehenden Tickets senden</button>
      </div>
    </div>
  );
}
