import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Grid3X3, ScanLine, Settings, LogOut, Menu, X
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/participants', label: 'Teilnehmer', icon: Users },
  { path: '/tables', label: 'Tische', icon: Grid3X3 },
  { path: '/scanner', label: 'Scanner', icon: ScanLine },
  { path: '/settings', label: 'Einstellungen', icon: Settings, adminOnly: true },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const filteredNav = NAV_ITEMS.filter(item =>
    !item.adminOnly || user?.role === 'admin'
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[#1a1a2e]">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="GFD Logo" className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold tracking-wider text-[#4a8af4]">GFD TICKET SYSTEM</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        ${mobileMenuOpen ? 'block' : 'hidden'} md:block
        w-full md:w-60 md:min-h-screen
        border-r border-[#1a1a2e] bg-black
        md:sticky md:top-0 md:h-screen
        z-50
      `}>
        <div className="hidden md:block p-6 pb-4">
          <img src="/logo.png" alt="GFD Logo" className="h-12 w-12 object-contain mb-3" />
          <div className="text-xs font-bold tracking-[3px] text-[#4a8af4] mb-1">GERMAN FINANCE</div>
          <div className="text-xs font-bold tracking-[3px] text-[#4a8af4]">DINNER TICKET SYSTEM</div>
          <div className="gfd-gradient-line mt-4"></div>
        </div>

        <nav className="p-2">
          {filteredNav.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-sm font-medium
                  transition-colors no-underline
                  ${active
                    ? 'bg-[#00379e]/20 text-[#4a8af4]'
                    : 'text-[#a1a1aa] hover:text-white hover:bg-[#0c0c0f]'
                  }
                `}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-[#1a1a2e] md:absolute md:bottom-0 md:left-0 md:right-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white font-medium">{user?.displayName}</div>
              <div className="text-xs text-[#64748b]">{user?.role}</div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="text-[#64748b] hover:text-white transition-colors"
              title="Abmelden"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen p-4 md:p-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
