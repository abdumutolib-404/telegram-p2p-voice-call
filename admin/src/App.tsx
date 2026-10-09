import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { adminFetch } from './api/client';
import { useVisiblePolling } from './hooks/useAdminTools';
import type { ManualPaymentRequestItem, AppealItem } from './types';
import { LogOut, LayoutDashboard, UsersRound, BookOpen, Trophy, SlidersHorizontal, CreditCard, ShieldCheck, ChartNoAxesCombined, History } from 'lucide-react';
import './App.css';
const Overview = lazy(() => import('./components/dashboard/OverviewDashboard').then(m => ({ default: m.OverviewDashboard })));
const Users = lazy(() => import('./components/dashboard/UserManagement').then(m => ({ default: m.UserManagement })));
const Questions = lazy(() => import('./components/dashboard/QuestionManagement').then(m => ({ default: m.QuestionManagement })));
const Plans = lazy(() => import('./components/dashboard/PlanEditor').then(m => ({ default: m.PlanEditor })));
const Payments = lazy(() => import('./components/dashboard/ManualPaymentsQueue').then(m => ({ default: m.ManualPaymentsQueue })));
const Appeals = lazy(() => import('./components/dashboard/AppealsQueue').then(m => ({ default: m.AppealsQueue })));
const Analytics = lazy(() => import('./components/dashboard/AnalyticsOverview').then(m => ({ default: m.AnalyticsOverview })));
const Contest = lazy(() => import('./components/dashboard/ContestManagement').then(m => ({ default: m.ContestManagement })));
const Audit = lazy(() => import('./components/dashboard/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));
export type NavigationTab = 'overview' | 'users' | 'questions' | 'plans' | 'payments' | 'appeals' | 'analytics' | 'contest' | 'audit';
const items: { id: NavigationTab; label: string; group: string }[] = [
  { id: 'overview', label: 'Overview', group: 'Operations' }, { id: 'users', label: 'Candidates', group: 'Operations' },
  { id: 'questions', label: 'IELTS questions', group: 'Operations' }, { id: 'contest', label: 'Contests', group: 'Operations' },
  { id: 'plans', label: 'Plans and limits', group: 'Finance' }, { id: 'payments', label: 'Payments', group: 'Finance' },
  { id: 'appeals', label: 'Appeals', group: 'Review' }, { id: 'analytics', label: 'Analytics', group: 'Review' }, { id: 'audit', label: 'Audit history', group: 'Review' },
];
const icons = { overview: LayoutDashboard, users: UsersRound, questions: BookOpen, contest: Trophy, plans: SlidersHorizontal, payments: CreditCard, appeals: ShieldCheck, analytics: ChartNoAxesCombined, audit: History };
function MainDashboard() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    const saved = localStorage.getItem('admin:tab'); return items.some(i => i.id === saved) ? saved as NavigationTab : 'overview';
  });
  const [counts, setCounts] = useState<{ payments: number | null; appeals: number | null }>({ payments: null, appeals: null });
  const busy = useRef(false);
  const badgesDirty = useRef(false);
  const badges = useCallback(async () => {
    if (!isAuthenticated) return;
    if (busy.current) { badgesDirty.current = true; return; }
    busy.current = true;
    try {
      do {
      badgesDirty.current = false;
      const [payments, refunds, appeals] = await Promise.allSettled([
        adminFetch<ManualPaymentRequestItem[]>('/api/admin/payments/manual?tab=queue'),
        adminFetch<ManualPaymentRequestItem[]>('/api/admin/payments/manual?tab=refunds'), adminFetch<AppealItem[]>('/api/admin/appeals'),
      ]);
      setCounts(previous => ({
        payments: payments.status === 'fulfilled' && refunds.status === 'fulfilled' ? payments.value.filter(p => p.status === 'PENDING').length + refunds.value.filter(p => p.status === 'REFUND_PENDING').length : previous.payments,
        appeals: appeals.status === 'fulfilled' ? appeals.value.filter(p => !p.status || p.status.toUpperCase() === 'PENDING').length : previous.appeals,
      }));
      } while (badgesDirty.current);
    } finally { busy.current = false; }
  }, [isAuthenticated]);
  useEffect(() => { void badges(); window.addEventListener('admin:queues-changed', badges); return () => window.removeEventListener('admin:queues-changed', badges); }, [badges]);
  useVisiblePolling(badges, 30000);
  const navigate = (tab: NavigationTab) => {
    if (tab !== activeTab && !window.dispatchEvent(new Event('admin:before-navigate', { cancelable: true }))) return;
    setActiveTab(tab); localStorage.setItem('admin:tab', tab);
  };
  if (isLoading) return <p role="status" className="shell-loading">Loading administration…</p>;
  if (!isAuthenticated) return <LoginModal />;
  const navigation = <nav aria-label="Administration">{items.map((item, index) => <div key={item.id}>
    {(index === 0 || item.group !== items[index - 1].group) && <div className="nav-group-header">{item.group}</div>}
    <button className={'nav-tab-btn ' + (activeTab === item.id ? 'active' : '')} title={item.label} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
      {(() => { const Icon = icons[item.id]; return <Icon size={17} aria-hidden="true"/>; })()}<span className="nav-label">{item.label}</span>{(item.id === 'payments' || item.id === 'appeals') && <span className="nav-badge-pill warning">{counts[item.id] ?? '—'}</span>}
    </button></div>)}</nav>;
  return <div className="admin-shell">
    <a className="admin-skip-link" href="#main">Skip to workspace</a>
    <aside aria-label="Administration sidebar" className="admin-sidebar"><a className="admin-brand" href="#main">pairtalk<span>.</span> <small>Operations console</small></a>{navigation}
      <div className="sidebar-footer"><ShieldCheck size={16} aria-hidden="true"/><span>Administrator workspace</span></div>
    </aside>
    <div className="admin-workspace"><header className="admin-topbar"><div className="workspace-breadcrumb"><span>{items.find(i => i.id === activeTab)?.group}</span><span aria-hidden="true">/</span><strong>{items.find(i => i.id === activeTab)?.label}</strong></div><button className="btn-secondary" onClick={() => { if (window.dispatchEvent(new Event('admin:before-navigate', { cancelable: true }))) logout(); }}><LogOut size={16}/> Sign out</button>
    </header><main id="main" className="admin-main" tabIndex={-1}><ErrorBoundary key={activeTab}><Suspense fallback={<p role="status">Loading screen…</p>}>
      {activeTab === 'overview' && <Overview onNavigateTab={navigate}/>}{activeTab === 'users' && <Users/>}{activeTab === 'questions' && <Questions/>}{activeTab === 'plans' && <Plans/>}{activeTab === 'payments' && <Payments/>}{activeTab === 'appeals' && <Appeals/>}{activeTab === 'analytics' && <Analytics/>}{activeTab === 'contest' && <Contest/>}{activeTab === 'audit' && <Audit/>}
    </Suspense></ErrorBoundary></main></div>
  </div>;
}
export default function App() { return <AuthProvider><MainDashboard/></AuthProvider>; }
