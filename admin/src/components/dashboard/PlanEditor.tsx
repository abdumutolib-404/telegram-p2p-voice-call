import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { PlansResponse, PlanTierConfig } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clock,
  Calendar,
  Star,
  Shield,
  CreditCard,
  Crown,
  Zap,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

export function PlanEditor() {
  const [initialPlans, setInitialPlans] = useState<PlansResponse | null>(null);
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
      setInitialPlans(JSON.parse(JSON.stringify(data)));
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

  const hasUnsavedChanges = initialPlans && JSON.stringify(initialPlans) !== JSON.stringify(plans);

  const handleTierChange = (tier: keyof PlansResponse, field: keyof PlanTierConfig, value: number) => {
    setPlans((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }));
  };

  const handleReset = () => {
    if (initialPlans) {
      setPlans(JSON.parse(JSON.stringify(initialPlans)));
      setError(null);
    }
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
        setError(`${tierName} tier monthly call limit must be at least 1 call.`);
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
        setInitialPlans(JSON.parse(JSON.stringify(resolvedPlans)));
      }
      setSuccessMessage('Authoritative plan limits & prices updated and broadcasted across platform!');
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
    return <LoadingSkeleton message="Loading authoritative plan tiers..." rows={4} />;
  }

  const renderTierCard = (
    tierKey: keyof PlansResponse,
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    badgeVariant: 'neutral' | 'info' | 'warning' | 'gold',
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
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>{subtitle}</span>
            </div>
          </div>
          <StatusBadge variant={badgeVariant} label={tierKey} size="sm" />
        </div>

        {/* Section 1: Usage & Limits */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Clock size={14} color="#38bdf8" /> Max Duration (Min / Call)
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

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Calendar size={14} color="#34d399" /> Monthly Calls Allowance (Calls / Month)
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

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Sparkles size={14} color="#f472b6" /> Recording Credits (Recordings / Month)
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

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <Shield size={14} color="#a78bfa" /> Audio Retention Period
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
        </div>

        {/* Section 2: Pricing */}
        {!isFree ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" /> Stars Price (XTR)
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
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <CreditCard size={14} color="#34d399" /> Card Price (UZS)
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
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            Free Default Tier ($0.00 / 0 Stars)
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <PageHeader
        title="Authoritative Plan Matrix"
        description="Configure baseline duration allowances, monthly call volume, recording retention, and official Stars (XTR) & UZS card pricing"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="btn-secondary"
                style={{ padding: '0.55rem 1rem', fontSize: '0.825rem' }}
              >
                <RotateCcw size={14} /> Discard Changes
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving || !hasUnsavedChanges}
              className="btn-primary"
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem' }}
            >
              <Save size={15} />
              {isSaving ? 'Saving Configurations...' : 'Save Plan Matrix'}
            </button>
          </div>
        }
      />

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '10px',
            backgroundColor: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            <span>You have unsaved changes in the plan configuration matrix.</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Click 'Save Plan Matrix' to apply</span>
        </div>
      )}

      {error && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--success-border)', backgroundColor: 'var(--success-bg)', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 4-Column Grid for Plan Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {renderTierCard('FREE', 'FREE Plan', 'Default candidate starter tier', <Shield size={20} color="#94a3b8" />, 'neutral', true)}
        {renderTierCard('PLUS', 'PLUS Plan', 'Essential speaking practice', <Zap size={20} color="#38bdf8" />, 'info')}
        {renderTierCard('PRO', 'PRO Plan', 'Intensive candidate preparation', <Sparkles size={20} color="#c084fc" />, 'warning')}
        {renderTierCard('BOSS', 'BOSS Plan', 'Unlimited candidate coaching', <Crown size={20} color="#fde047" />, 'gold')}
      </div>
    </form>
  );
}
