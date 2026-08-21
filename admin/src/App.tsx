import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginModal } from './components/auth/LoginModal.tsx';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard.tsx';
import { AnalyticsOverview } from './components/dashboard/AnalyticsOverview.tsx';
import { PlanEditor } from './components/dashboard/PlanEditor.tsx';
import { ManualPaymentsQueue } from './components/dashboard/ManualPaymentsQueue.tsx';
import { AppealsQueue } from './components/dashboard/AppealsQueue.tsx';
import { UserManagement } from './components/dashboard/UserManagement.tsx';
import { ContestManagement } from './components/dashboard/ContestManagement.tsx';
import {
  LayoutDashboard,
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

export type NavigationTab = 'overview' | 'users' | 'plans' | 'payments' | 'appeals' | 'analytics' | 'contest';

interface NavItemMeta {
  id: NavigationTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItemMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'System vitals, active traffic & pending operational tasks',
    icon: LayoutDashboard,
  },
  {
    id: 'users',
    label: 'Candidates',
    description: 'Learners roster, speaking limits & moderation controls',
    icon: Users,
  },
  {
    id: 'plans',
    label: 'Plans & Limits',
    description: 'Authoritative FREE, PLUS, PRO, BOSS limits & pricing',
    icon: Settings,
  },
  {
    id: 'payments',
    label: 'Payments (UZS)',
    description: 'Offline card transfer verification & payment history',
    icon: CreditCard,
  },
  {
    id: 'appeals',
    label: 'Appeals Queue',
    description: 'Review permanent ban unblock requests from candidates',
    icon: ShieldAlert,
  },
  {
    id: 'analytics',
    label: 'Analytics & Revenue',
    description: 'Stars & UZS revenue, WebRTC telemetry & quality metrics',
    icon: BarChart3,
  },
  {
    id: 'contest',
    label: 'Hall of Fame',
    description: 'Championship rules, prize allocation & live leaderboard',
    icon: Trophy,
  },
];

function MainDashboard() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Close mobile drawer on desktop resize (>= 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle ESC key
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
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--sans)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid var(--primary)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Initializing PairTalk Console...</span>
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
      {/* Mobile Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(7, 10, 18, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar */}
      <aside
        style={{
          width: '260px',
          minWidth: '260px',
          maxWidth: '260px',
          backgroundColor: '#090D17',
          borderRight: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 50,
          boxShadow: 'var(--shadow-md)',
          transform: isMobileNavOpen ? 'translateX(0)' : window.innerWidth < 1024 ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Sidebar Brand Header */}
        <div>
          <div
            style={{
              padding: '1.25rem 1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(124, 92, 252, 0.35)',
                }}
              >
                <ShieldCheck size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>PairTalk</span>
                  <span style={{ color: 'var(--primary-light)', fontSize: '0.7rem', fontWeight: 600, padding: '1px 5px', background: 'var(--primary-bg)', borderRadius: '4px', border: '1px solid var(--primary-border)' }}>OPS</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.15rem' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} className="dot-pulse" />
                  <span style={{ fontSize: '0.7rem', color: 'var(--success-text)', fontWeight: 600 }}>
                    Operational
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileNavOpen(false)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                background: 'transparent',
                border: '1px solid var(--border-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.35rem',
                borderRadius: '6px',
              }}
              aria-label="Close navigation drawer"
            >
              <X size={16} />
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
                  <Icon size={17} className="nav-icon" />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: '1.125rem 1.125rem', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Admin Session</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--success-text)', marginTop: '0.1rem' }}>
                ● 2FA Verified
              </div>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>v2.4</span>
          </div>
          <button
            onClick={logout}
            className="btn-danger"
            style={{ width: '100%', fontSize: '0.8rem' }}
          >
            <LogOut size={14} /> Logout Session
          </button>
        </div>
      </aside>

      {/* Main Layout Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          marginLeft: window.innerWidth >= 1024 ? '260px' : 0,
          width: window.innerWidth >= 1024 ? 'calc(100% - 260px)' : '100%',
          overflowX: 'hidden',
        }}
      >
        {/* Top Header */}
        <header
          style={{
            height: '64px',
            backgroundColor: '#090D17',
            borderBottom: '1px solid var(--border-card)',
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
          {/* Header Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
            <button
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.45rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-card)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              aria-label="Toggle navigation menu"
            >
              <Menu size={16} />
            </button>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {currentTabMeta.label}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentTabMeta.description}
              </div>
            </div>
          </div>

          {/* Header Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
            <span className="badge badge-success" style={{ padding: '0.25rem 0.65rem' }}>
              <ShieldCheck size={13} /> 2FA Active
            </span>
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
          {activeTab === 'overview' && <OverviewDashboard onNavigateTab={setActiveTab} />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'plans' && <PlanEditor />}
          {activeTab === 'payments' && <ManualPaymentsQueue />}
          {activeTab === 'appeals' && <AppealsQueue />}
          {activeTab === 'analytics' && <AnalyticsOverview />}
          {activeTab === 'contest' && <ContestManagement />}
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
