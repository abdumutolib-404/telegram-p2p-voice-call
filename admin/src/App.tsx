import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginModal } from './components/auth/LoginModal.tsx';
import { AnalyticsOverview } from './components/dashboard/AnalyticsOverview.tsx';
import { PlanEditor } from './components/dashboard/PlanEditor.tsx';
import { ManualPaymentsQueue } from './components/dashboard/ManualPaymentsQueue.tsx';
import { AppealsQueue } from './components/dashboard/AppealsQueue.tsx';
import { UserManagement } from './components/dashboard/UserManagement.tsx';
import { ContestManagement } from './components/dashboard/ContestManagement.tsx';
import {
  BarChart3,
  Settings,
  ShieldAlert,
  Users,
  LogOut,
  ShieldCheck,
  CreditCard,
  Menu,
  X,
  Trophy,
} from 'lucide-react';

type NavigationTab = 'analytics' | 'users' | 'contest' | 'plans' | 'payments' | 'appeals';

const NAV_ITEMS: Array<{
  id: NavigationTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: 'analytics',
    label: 'Analytics & Revenue',
    description: 'Real-time metrics, active calls, Stars & UZS income',
    icon: BarChart3,
  },
  {
    id: 'users',
    label: 'User Management',
    description: 'Inspect learners, band scores, plan limits & moderation',
    icon: Users,
  },
  {
    id: 'contest',
    label: 'Hall of Fame & Contests',
    description: 'Toggle championships, track referral leaders & award winners',
    icon: Trophy,
  },
  {
    id: 'plans',
    label: 'Plan Editor',
    description: 'Authoritative FREE, PLUS, PRO, BOSS limits & pricing',
    icon: Settings,
  },
  {
    id: 'payments',
    label: 'Manual Payments',
    description: 'Review offline UZS card transfers and verify receipts',
    icon: CreditCard,
  },
  {
    id: 'appeals',
    label: 'Appeals Queue',
    description: 'Review permanent ban unblock requests from students',
    icon: ShieldAlert,
  },
];

function MainDashboard() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('analytics');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Close mobile navigation drawer on resize to desktop (>= 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle ESC key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid #0284c7',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Initializing Admin Console...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal />;
  }

  const currentTabMeta = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Desktop Fixed + Mobile Slide-Over Drawer) */}
      <aside
        style={{
          width: '280px',
          minWidth: '280px',
          maxWidth: '280px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderRight: '1px solid var(--border-card)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
          transform: isMobileNavOpen ? 'translateX(0)' : window.innerWidth < 1024 ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Sidebar Header */}
        <div>
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  PairTalk <span style={{ color: 'var(--primary-light)', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', background: 'rgba(99,102,241,0.15)', borderRadius: '4px' }}>OPS</span>
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} className="dot-pulse" />
                  <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600, letterSpacing: '0.03em' }}>
                    SYSTEM ONLINE
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileNavOpen(false)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.35rem',
                borderRadius: '6px',
              }}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileNavOpen(false);
                  }}
                  className={`nav-tab-btn ${isActive ? 'active' : ''}`}
                >
                  <Icon size={18} className="nav-icon" />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Session Info & Logout */}
        <div style={{ padding: '1.25rem 1rem', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'rgba(9, 13, 22, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e2e8f0' }}>Admin Console</div>
              <div style={{ fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem' }}>
                <span>●</span> 2FA Verified Session
              </div>
            </div>
            <div className="badge badge-info" style={{ fontSize: '0.65rem' }}>v2.4</div>
          </div>
          <button
            onClick={logout}
            className="btn-danger"
            style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
          >
            <LogOut size={15} /> Logout Session
          </button>
        </div>
      </aside>

      {/* Main Layout Container (Offset by Sidebar on Desktop) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          marginLeft: window.innerWidth >= 1024 ? '280px' : 0,
          width: window.innerWidth >= 1024 ? 'calc(100% - 280px)' : '100%',
          overflowX: 'hidden',
        }}
      >
        {/* Top Header */}
        <header
          style={{
            height: '68px',
            backgroundColor: 'rgba(9, 13, 22, 0.8)',
            borderBottom: '1px solid var(--border-card)',
            backdropFilter: 'blur(16px)',
            padding: '0 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            gap: '1rem',
          }}
        >
          {/* Header Left: Hamburger Toggle (Mobile) + Current View Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <button
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.5rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-card)',
                borderRadius: '8px',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
              aria-label="Toggle navigation menu"
            >
              <Menu size={18} />
            </button>

            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
                {currentTabMeta.label}
              </h2>
              <p style={{ fontSize: '0.775rem', color: '#94a3b8', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentTabMeta.description}
              </p>
            </div>
          </div>

          {/* Header Right: Quick Status & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <div className="badge badge-success" style={{ padding: '0.35rem 0.75rem' }}>
              <ShieldCheck size={14} /> Stealth 2FA Guarded
            </div>
          </div>
        </header>

        {/* Dynamic View Canvas */}
        <main
          style={{
            flex: 1,
            padding: '2rem',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            minWidth: 0,
            overflowX: 'hidden',
          }}
        >
          {activeTab === 'analytics' && <AnalyticsOverview />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'contest' && <ContestManagement />}
          {activeTab === 'plans' && <PlanEditor />}
          {activeTab === 'payments' && <ManualPaymentsQueue />}
          {activeTab === 'appeals' && <AppealsQueue />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}
