import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Ungültige Anmeldedaten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-[3px] text-[#4a8af4] mb-2">GERMAN FINANCE DINNER</div>
          <div className="gfd-gradient-line mb-6"></div>
          <h1 className="text-2xl font-bold text-white mb-2">Ticketing Login</h1>
          <p className="text-sm text-[#a1a1aa]">Melde dich an, um fortzufahren</p>
        </div>

        <form onSubmit={handleSubmit} className="gfd-card p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-2">Benutzername</label>
            <input
              type="text"
              className="gfd-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-[#64748b] tracking-wider uppercase mb-2">Passwort</label>
            <input
              type="password"
              className="gfd-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="gfd-btn w-full" disabled={loading}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-xs text-[#3f3f46] mt-6">Finance Network e.V.</p>
      </div>
    </div>
  );
}
