import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginModal } from './components/auth/LoginModal.tsx';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard.tsx';
import { AnalyticsOverview } from './components/dashboard/AnalyticsOverview.tsx';
import { PlanEditor } from './components/dashboard/PlanEditor.tsx';
import { ManualPaymentsQueue } from './components/dashboard/ManualPaymentsQueue.tsx';
import { AppealsQueue } from './components/dashboard/AppealsQueue.tsx';
import { UserManagement } from './components/dashboard/UserManagement.tsx';
import { ContestManagement } from './components/dashboard/ContestManagement.tsx';
import { adminFetch } from './api/client.ts';
import type { ManualPaymentRequestItem, AppealItem } from './types/index.ts';
import {
  LogOut,
  ShieldCheck,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

export type NavigationTab = 'overview' | 'users' | 'plans' | 'payments' | 'appeals' | 'analytics' | 'contest';

interface NavItemMeta {
  id: NavigationTab;
  label: string;
  shortLabel: string;
  description: string;
  badgeKey?: 'payments' | 'appeals';
}

interface NavGroup {
  groupName: string;
  items: NavItemMeta[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupName: 'Operations',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        shortLabel: 'OV',
        description: 'System telemetry, active traffic & operational vitals',
      },
      {
        id: 'users',
        label: 'Candidates',
        shortLabel: 'CD',
        description: 'Learners roster, speaking limits & moderation controls',
      },
      {
        id: 'contest',
        label: 'Hall of Fame',
        shortLabel: 'HF',
        description: 'Championship rules, prize allocation & live leaderboard',
      },
    ],
  },
  {
    groupName: 'Finance',
    items: [
      {
        id: 'plans',
        label: 'Plans & Limits',
        shortLabel: 'PL',
        description: 'Authoritative FREE, PLUS, PRO, BOSS limits & pricing',
      },
      {
        id: 'payments',
        label: 'Payments (UZS)',
        shortLabel: 'PM',
        description: 'Offline card transfer verification & payment history',
        badgeKey: 'payments',
      },
    ],
  },
  {
    groupName: 'Governance & Telemetry',
    items: [
      {
        id: 'appeals',
        label: 'Appeals Queue',
        shortLabel: 'AP',
        description: 'Review permanent ban unblock requests from candidates',
        badgeKey: 'appeals',
      },
      {
        id: 'analytics',
        label: 'Analytics & Revenue',
        shortLabel: 'AN',
        description: 'Stars & UZS revenue, WebRTC telemetry & quality metrics',
      },
    ],
  },
];

const ALL_NAV_ITEMS: NavItemMeta[] = NAV_GROUPS.flatMap((g) => g.items);

function formatBadgeCount(count: number): string | null {
  if (!count || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

function MainDashboard() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Dynamic Pending Badge Counts
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState<number>(0);
  const [pendingAppealsCount, setPendingAppealsCount] = useState<number>(0);

  const fetchBadgeCounts = useCallback(async () => {
    try {
      const [payments, refunds, appeals] = await Promise.all([
        adminFetch<ManualPaymentRequestItem[]>('/api/admin/payments/manual?tab=queue').catch(() => []),
        adminFetch<ManualPaymentRequestItem[]>('/api/admin/payments/manual?tab=refunds').catch(() => []),
        adminFetch<AppealItem[]>('/api/admin/appeals').catch(() => []),
      ]);

      const pendingPay = Array.isArray(payments) ? payments.filter((p) => p.status === 'PENDING').length : 0;
      const pendingRefunds = Array.isArray(refunds) ? refunds.filter((p) => p.status === 'REFUND_PENDING').length : 0;
      setPendingPaymentsCount(pendingPay + pendingRefunds);

      if (Array.isArray(appeals)) {
        const pending = appeals.filter((a) => !a.status || a.status === 'PENDING' || a.status === 'pending').length;
        setPendingAppealsCount(pending);
      }
    } catch {
      // Non-blocking telemetry
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBadgeCounts();
      const interval = setInterval(fetchBadgeCounts, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchBadgeCounts]);

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
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Initializing PairTalk Console...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal />;
  }

  const currentTabMeta = ALL_NAV_ITEMS.find((item) => item.id === activeTab) || ALL_NAV_ITEMS[0];

  const getBadgeForTab = (badgeKey?: 'payments' | 'appeals') => {
    if (!badgeKey) return null;
    if (badgeKey === 'payments') {
      return {
        formatted: formatBadgeCount(pendingPaymentsCount),
        variant: 'warning' as const,
      };
    }
    if (badgeKey === 'appeals') {
      return {
        formatted: formatBadgeCount(pendingAppealsCount),
        variant: 'danger' as const,
      };
    }
    return null;
  };

  const sidebarWidth = isCollapsed ? 64 : 240;

  return (
    <div className="app-container">
      {/* Mobile Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(7, 10, 18, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Collapsible Rail ~64px vs Expanded ~240px) */}
      <aside
        style={{
          width: `${sidebarWidth}px`,
          minWidth: `${sidebarWidth}px`,
          maxWidth: `${sidebarWidth}px`,
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
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Sidebar Header */}
        <div>
          <div
            style={{
              padding: isCollapsed ? '1rem 0.5rem' : '1.15rem 1.15rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
            }}
          >
            {!isCollapsed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 10px rgba(124, 92, 252, 0.35)',
                    flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>PairTalk</span>
                    <span style={{ color: 'var(--primary-light)', fontSize: '0.65rem', fontWeight: 700, padding: '1px 4px', background: 'var(--primary-bg)', borderRadius: '4px', border: '1px solid var(--primary-border)' }}>OPS</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '0.1rem' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--success)', display: 'inline-block' }} className="dot-pulse" />
                    <span style={{ fontSize: '0.675rem', color: 'var(--success-text)', fontWeight: 600 }}>
                      Live
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                title="PairTalk OPS Console"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  boxShadow: '0 0 10px rgba(124, 92, 252, 0.35)',
                }}
              >
                PT
              </div>
            )}

            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              style={{
                display: window.innerWidth >= 1024 ? 'flex' : 'none',
                background: 'transparent',
                border: '1px solid var(--border-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.3rem',
                borderRadius: '6px',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: isCollapsed ? '0' : '0.5rem',
              }}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileNavOpen(false)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                background: 'transparent',
                border: '1px solid var(--border-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.3rem',
                borderRadius: '6px',
              }}
              aria-label="Close navigation drawer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Navigation Links — Logical Groups separated by Hairline Dividers */}
          <nav style={{ padding: isCollapsed ? '0.75rem 0.35rem' : '0.85rem 0.65rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {NAV_GROUPS.map((group, groupIdx) => (
              <div key={group.groupName}>
                {groupIdx > 0 && <div className="nav-group-divider" />}
                {!isCollapsed && (
                  <div className="nav-group-header">
                    {group.groupName}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {group.items.map((item) => {
                    const isActive = activeTab === item.id;
                    const badgeInfo = getBadgeForTab(item.badgeKey);

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileNavOpen(false);
                        }}
                        title={item.label}
                        className={`nav-tab-btn ${isActive ? 'active' : ''} ${isCollapsed ? 'rail' : ''}`}
                        style={{
                          position: 'relative',
                        }}
                      >
                        {/* Pure text-only labels (zero icons or emojis) */}
                        <span style={{ fontWeight: isActive ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isCollapsed ? item.shortLabel : item.label}
                        </span>

                        {/* Dynamic 99+ Pending Badge */}
                        {badgeInfo?.formatted && (
                          <span
                            className={`nav-badge-pill ${badgeInfo.variant}`}
                            style={{
                              marginLeft: isCollapsed ? 0 : 'auto',
                              ...(isCollapsed
                                ? {
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    minWidth: '14px',
                                    height: '14px',
                                    fontSize: '0.55rem',
                                    padding: '0 2px',
                                  }
                                : {}),
                            }}
                          >
                            {badgeInfo.formatted}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: isCollapsed ? '0.75rem 0.4rem' : '1rem 1rem', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-primary)' }}>Admin Session</div>
                <div style={{ fontSize: '0.675rem', color: 'var(--success-text)', marginTop: '0.1rem', fontWeight: 600 }}>
                  2FA Active
                </div>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: '0.625rem', padding: '0.15rem 0.45rem' }}>v2.5</span>
            </div>
          )}
          <button
            onClick={logout}
            title="Logout Session"
            className="btn-danger"
            style={{
              width: '100%',
              fontSize: '0.75rem',
              height: '32px',
              padding: isCollapsed ? '0' : '0 0.75rem',
              justifyContent: 'center',
            }}
          >
            <LogOut size={13} />
            {!isCollapsed && <span>Logout</span>}
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
          marginLeft: window.innerWidth >= 1024 ? `${sidebarWidth}px` : 0,
          width: window.innerWidth >= 1024 ? `calc(100% - ${sidebarWidth}px)` : '100%',
          overflowX: 'hidden',
          transition: 'margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Top Header */}
        <header
          style={{
            height: '60px',
            backgroundColor: '#090D17',
            borderBottom: '1px solid var(--border-card)',
            padding: '0 1.75rem',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <button
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              style={{
                display: window.innerWidth < 1024 ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4rem',
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
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {currentTabMeta.label}
              </div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentTabMeta.description}
              </div>
            </div>
          </div>

          {/* Header Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
            <span className="badge badge-success" style={{ padding: '0.2rem 0.55rem', fontSize: '0.725rem', fontWeight: 600 }}>
              <ShieldCheck size={12} /> 2FA Guard Active
            </span>
          </div>
        </header>

        {/* Dynamic View Canvas */}
        <main
          style={{
            flex: 1,
            padding: '1.75rem',
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

