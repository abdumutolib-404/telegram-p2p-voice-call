import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { PlansResponse, PlanTierConfig } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Settings, Save, CheckCircle2, AlertCircle, Sparkles, Clock, Calendar, Star, Shield, CreditCard, Crown, Zap } from 'lucide-react';

export function PlanEditor() {
  const [plans, setPlans] = useState<PlansResponse>({
    FREE: { maxDuration: 15, dailyLimit: 3, recordingLimit: 1, retentionDays: 1, starsPrice: 0, uzsPrice: 0 },
    PLUS: { maxDuration: 30, dailyLimit: 10, recordingLimit: 3, retentionDays: 7, starsPrice: 99, uzsPrice: 15000 },
    PRO: { maxDuration: 60, dailyLimit: 25, recordingLimit: 7, retentionDays: 30, starsPrice: 349, uzsPrice: 55000 },
    BOSS: { maxDuration: 90, dailyLimit: 50, recordingLimit: 15, retentionDays: 90, starsPrice: 899, uzsPrice: 149000 },
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminFetch<PlansResponse>('/api/admin/plans');
      setPlans(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch plan configurations');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleTierChange = (tier: keyof PlansResponse, field: keyof PlanTierConfig, value: number) => {
    setPlans((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validation
    for (const tierName of ['FREE', 'PLUS', 'PRO', 'BOSS'] as const) {
      const tier = plans[tierName];
      if (!tier || tier.maxDuration <= 0) {
        setError(`${tierName} tier duration limit must be greater than 0 minutes.`);
        return;
      }
      if (tier.dailyLimit <= 0) {
        setError(`${tierName} tier call limit must be at least 1 call.`);
        return;
      }
      if (tier.recordingLimit !== undefined && tier.recordingLimit <= 0) {
        setError(`${tierName} tier recording limit must be at least 1 recording.`);
        return;
      }
      if (tier.retentionDays <= 0) {
        setError(`${tierName} tier retention must be at least 1 day.`);
        return;
      }
      if (tierName !== 'FREE') {
        if (tier.starsPrice === undefined || tier.starsPrice < 0) {
          setError(`${tierName} tier price must be a valid positive Telegram Stars amount.`);
          return;
        }
        if (tier.uzsPrice !== undefined && tier.uzsPrice < 0) {
          setError(`${tierName} tier UZS card price must be non-negative.`);
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const response = await adminFetch<PlansResponse | { success: boolean; plans: PlansResponse }>('/api/admin/plans', {
        method: 'PUT',
        body: JSON.stringify(plans),
      });
      const resolvedPlans = (response && 'plans' in response && response.plans) ? response.plans : (response as PlansResponse);
      if (resolvedPlans && resolvedPlans.FREE) {
        setPlans(resolvedPlans);
      }
      setSuccessMessage('Authoritative plan configurations updated and broadcasted across platform!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update plan configurations.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !plans) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '350px', color: 'var(--text-secondary)' }}>
        <Settings size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem', color: 'var(--primary-light)' }} />
        <span>Loading plan configurations...</span>
      </div>
    );
  }

  const renderTierCard = (
    tierKey: keyof PlansResponse,
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    badgeClass: string,
    isFree = false
  ) => {
    const config = plans[tierKey];
    if (!config) return null;

    return (
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
              {icon}
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</span>
            </div>
          </div>
          <span className={`badge ${badgeClass}`}>{tierKey}</span>
        </div>

        {/* Max Duration */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <Clock size={15} color="#38bdf8" /> Duration (Min / Call)
          </label>
          <input
            type="number"
            min="1"
            max="180"
            value={config.maxDuration}
            onChange={(e) => handleTierChange(tierKey, 'maxDuration', parseInt(e.target.value) || 0)}
            className="input-modern num-tabular"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Monthly Call Limit */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <Calendar size={15} color="#34d399" /> Calls Limit (Calls / Mo)
          </label>
          <input
            type="number"
            min="1"
            max="9999"
            value={config.dailyLimit}
            onChange={(e) => handleTierChange(tierKey, 'dailyLimit', parseInt(e.target.value) || 0)}
            className="input-modern num-tabular"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Recording Limit */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <Sparkles size={15} color="#f472b6" /> Recordings (Rec / Mo)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={config.recordingLimit ?? (tierKey === 'FREE' ? 1 : tierKey === 'PLUS' ? 3 : tierKey === 'PRO' ? 7 : 15)}
            onChange={(e) => handleTierChange(tierKey, 'recordingLimit', parseInt(e.target.value) || 1)}
            className="input-modern num-tabular"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Audio Retention */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <Shield size={15} color="#a78bfa" /> Audio Retention
          </label>
          <select
            value={config.retentionDays}
            onChange={(e) => handleTierChange(tierKey, 'retentionDays', parseInt(e.target.value) || 1)}
            className="input-modern"
            style={{ width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
          >
            <option value={1}>1 Day (Ephemeral)</option>
            <option value={7}>7 Days (1 Week)</option>
            <option value={14}>14 Days (2 Weeks)</option>
            <option value={30}>30 Days (1 Month)</option>
            <option value={60}>60 Days (2 Months)</option>
            <option value={90}>90 Days (3 Months)</option>
            <option value={180}>180 Days (6 Months)</option>
            <option value={365}>365 Days (1 Year)</option>
          </select>
        </div>

        {/* Price Section */}
        {!isFree ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <Star size={15} color="#fbbf24" fill="#fbbf24" /> Stars Price (XTR)
              </label>
              <input
                type="number"
                min="1"
                value={config.starsPrice ?? 0}
                onChange={(e) => handleTierChange(tierKey, 'starsPrice', parseInt(e.target.value) || 0)}
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box', color: '#fde047', fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <CreditCard size={15} color="#34d399" /> Card Price (UZS)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={config.uzsPrice ?? 0}
                onChange={(e) => handleTierChange(tierKey, 'uzsPrice', parseInt(e.target.value) || 0)}
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box', color: '#34d399', fontWeight: 700 }}
              />
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            Free Default Tier ($0.00 / 0 Stars)
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Authoritative Plan Configurations
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Configure default duration limits, call allowances, recording retention, and official Stars & UZS pricing
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="btn-primary"
          style={{ padding: '0.625rem 1.25rem' }}
        >
          <Save size={16} />
          {isSaving ? 'Saving Configurations...' : 'Save All Plan Settings'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '10px',
            backgroundColor: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '10px',
            backgroundColor: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 4-Column Grid for Plan Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {renderTierCard('FREE', 'FREE Plan', 'Default student starter tier', <Shield size={22} color="#94a3b8" />, 'badge-neutral', true)}
        {renderTierCard('PLUS', 'PLUS Plan', 'Essential speaking practice', <Zap size={22} color="#38bdf8" />, 'badge-info')}
        {renderTierCard('PRO', 'PRO Plan', 'Intensive candidate preparation', <Sparkles size={22} color="#c084fc" />, 'badge-warning')}
        {renderTierCard('BOSS', 'BOSS Plan', 'Unlimited candidate coaching', <Crown size={22} color="#fde047" />, 'badge-gold')}
      </div>
    </form>
  );
}
