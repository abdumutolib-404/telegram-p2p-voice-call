import { useState, useEffect, useCallback } from 'react';
import type { AdminStats } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Users, TrendingUp, PhoneCall, Star, RefreshCw, DollarSign, Activity } from 'lucide-react';

export function AnalyticsOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AdminStats>('/api/admin/stats');
      setStats(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch analytics statistics');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }} />
        Loading analytics overview...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div style={{ padding: '1.5rem', backgroundColor: '#451a1a', border: '1px solid #991b1b', borderRadius: '12px', color: '#fca5a5' }}>
        <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>Error loading statistics: {error}</p>
        <button
          onClick={fetchStats}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const defaultStats: AdminStats = stats || {
    totalUsers: 0,
    mau: 0,
    dau: 0,
    activeCalls: 0,
    starsRevenue: {
      totalStars: 0,
      totalUsd: 0,
      monthlyHistory: []
    }
  };

  const monthlyHistory = defaultStats.starsRevenue?.monthlyHistory || [];
  const maxMonthlyStars = monthlyHistory.length > 0
    ? Math.max(...monthlyHistory.map(m => m.stars), 1)
    : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header with refresh button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Analytics Overview
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Real-time platform activity and Telegram Stars revenue metrics
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#cbd5e1',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          <RefreshCw size={16} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Card 1: Total Users */}
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>Total Users</span>
            <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#0284c720', color: '#38bdf8' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#f8fafc' }}>
            {defaultStats.totalUsers.toLocaleString()}
          </div>
        </div>

        {/* Card 2: Active Users (MAU / DAU) */}
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>MAU / DAU</span>
            <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#10b98120', color: '#34d399' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#f8fafc' }}>
              {defaultStats.mau.toLocaleString()} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 400 }}>MAU</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#34d399', marginTop: '0.25rem' }}>
              {defaultStats.dau.toLocaleString()} DAU
            </div>
          </div>
        </div>

        {/* Card 3: Calls Statistics */}
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>Total Calls Completed</span>
            <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#8b5cf620', color: '#a78bfa' }}>
              <PhoneCall size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#f8fafc' }}>
              {(defaultStats.totalCalls ?? 0).toLocaleString()} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 400 }}>calls</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#a78bfa', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{defaultStats.totalMinutesSpoken ?? 0} mins spoken</span>
              <span>•</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#34d399' }}>
                <Activity size={13} /> {defaultStats.activeCalls} active live
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Total Revenue */}
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500 }}>Telegram Stars Revenue</span>
            <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#f59e0b20', color: '#fbbf24' }}>
              <Star size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Star size={22} fill="#fbbf24" />
              {defaultStats.starsRevenue.totalStars.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem', display: 'flex', alignItems: 'center' }}>
              <DollarSign size={14} />
              Approx. ${defaultStats.starsRevenue.totalUsd.toLocaleString()} USD
            </div>
          </div>
        </div>
      </div>

      {/* Revenue History Section */}
      <div style={{
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1.25rem 0', color: '#f8fafc' }}>
          Monthly Telegram Stars Revenue Breakdown
        </h3>

        {monthlyHistory.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>
            No monthly revenue history available yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {monthlyHistory.map((item, idx) => {
              const barPercentage = Math.min(100, Math.max(5, (item.stars / maxMonthlyStars) * 100));
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#cbd5e1' }}>
                    <span style={{ fontWeight: 500 }}>{item.month}</span>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                      ⭐ {item.stars.toLocaleString()} Stars (${item.usd.toLocaleString()} USD)
                    </span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: '#0f172a', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPercentage}%`,
                      backgroundColor: '#f59e0b',
                      height: '100%',
                      borderRadius: '5px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
