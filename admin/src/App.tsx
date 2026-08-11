import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginModal } from './components/auth/LoginModal.tsx';
import { AnalyticsOverview } from './components/dashboard/AnalyticsOverview.tsx';
import { PlanEditor } from './components/dashboard/PlanEditor.tsx';
import { AppealsQueue } from './components/dashboard/AppealsQueue.tsx';
import { UserManagement } from './components/dashboard/UserManagement.tsx';
import { BarChart3, Settings, ShieldAlert, Users, LogOut, ShieldCheck } from 'lucide-react';

type NavigationTab = 'analytics' | 'plans' | 'appeals' | 'users';

function MainDashboard() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('analytics');

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        Initializing Admin Panel...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header */}
      <header style={{
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            padding: '0.5rem',
            borderRadius: '10px',
            backgroundColor: '#0284c720',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              IELTS P2P Admin Portal
            </h1>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Stealth 2FA Session Active
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#0f172a', padding: '0.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
          <button
            onClick={() => setActiveTab('analytics')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeTab === 'analytics' ? '#0284c7' : 'transparent',
              color: activeTab === 'analytics' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <BarChart3 size={16} /> Analytics
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeTab === 'plans' ? '#0284c7' : 'transparent',
              color: activeTab === 'plans' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Settings size={16} /> Plan Editor
          </button>

          <button
            onClick={() => setActiveTab('appeals')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeTab === 'appeals' ? '#0284c7' : 'transparent',
              color: activeTab === 'appeals' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <ShieldAlert size={16} /> Appeals Queue
          </button>

          <button
            onClick={() => setActiveTab('users')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeTab === 'users' ? '#0284c7' : 'transparent',
              color: activeTab === 'users' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Users size={16} /> User Management
          </button>
        </nav>

        {/* Logout Action */}
        <button
          onClick={logout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#1e293b',
            border: '1px solid #dc262640',
            borderRadius: '8px',
            color: '#f87171',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      {/* Main Tab Content */}
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1280px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {activeTab === 'analytics' && <AnalyticsOverview />}
        {activeTab === 'plans' && <PlanEditor />}
        {activeTab === 'appeals' && <AppealsQueue />}
        {activeTab === 'users' && <UserManagement />}
      </main>
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
