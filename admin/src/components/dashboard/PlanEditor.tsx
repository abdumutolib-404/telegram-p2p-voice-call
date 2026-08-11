import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { PlansResponse, PlanTierConfig } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Settings, Save, CheckCircle2, AlertCircle, Sparkles, Clock, Calendar, Star, Shield } from 'lucide-react';

export function PlanEditor() {
  const [plans, setPlans] = useState<PlansResponse>({
    free: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
    plus: { maxDuration: 30, dailyLimit: 10, retentionDays: 7, starsPrice: 150 },
    pro: { maxDuration: 60, dailyLimit: 99, retentionDays: 30, starsPrice: 350 },
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
    for (const tierName of ['free', 'plus', 'pro'] as const) {
      const tier = plans[tierName];
      if (tier.maxDuration <= 0) {
        setError(`${tierName.toUpperCase()} tier duration limit must be greater than 0 minutes.`);
        return;
      }
      if (tier.dailyLimit <= 0) {
        setError(`${tierName.toUpperCase()} tier daily limit must be at least 1 call.`);
        return;
      }
      if (![1, 7, 30].includes(tier.retentionDays)) {
        setError(`${tierName.toUpperCase()} tier retention must be 1, 7, or 30 days.`);
        return;
      }
      if (tierName !== 'free' && (tier.starsPrice === undefined || tier.starsPrice < 0)) {
        setError(`${tierName.toUpperCase()} tier price must be a valid positive Telegram Stars amount.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const updated = await adminFetch<PlansResponse>('/api/admin/plans', {
        method: 'PUT',
        body: JSON.stringify(plans),
      });
      setPlans(updated);
      setSuccessMessage('Plan limits and Telegram Stars pricing updated successfully!');
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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <Settings size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }} />
        Loading plan configurations...
      </div>
    );
  }

  const renderTierCard = (tierKey: keyof PlansResponse, title: string, subtitle: string, icon: React.ReactNode, isFree = false) => {
    const config = plans[tierKey];

    return (
      <div style={{
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid #334155' }}>
          {icon}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{subtitle}</span>
          </div>
        </div>

        {/* Call Duration Limit */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
            <Clock size={16} color="#38bdf8" /> Call Duration Limit (Minutes)
          </label>
          <input
            type="number"
            min="1"
            max="180"
            value={config.maxDuration}
            onChange={(e) => handleTierChange(tierKey, 'maxDuration', parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Daily Call Limit */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
            <Calendar size={16} color="#34d399" /> Daily Call Limit (Calls / Day)
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            value={config.dailyLimit}
            onChange={(e) => handleTierChange(tierKey, 'dailyLimit', parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Audio Retention Days */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
            <Shield size={16} color="#a78bfa" /> Audio Recording Retention
          </label>
          <select
            value={config.retentionDays}
            onChange={(e) => handleTierChange(tierKey, 'retentionDays', parseInt(e.target.value) || 1)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          >
            <option value={1}>1 Day (Free Purge)</option>
            <option value={7}>7 Days (Plus Purge)</option>
            <option value={30}>30 Days (Pro Extended)</option>
          </select>
        </div>

        {/* Stars Price */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#cbd5e1', marginBottom: '0.5rem' }}>
            <Star size={16} color="#fbbf24" /> Price (Telegram Stars)
          </label>
          <input
            type="number"
            min="0"
            disabled={isFree}
            value={isFree ? 0 : (config.starsPrice ?? 0)}
            onChange={(e) => handleTierChange(tierKey, 'starsPrice', parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.625rem 0.875rem',
              backgroundColor: isFree ? '#1e293b' : '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: isFree ? '#64748b' : '#f8fafc',
              fontSize: '0.9rem',
              outline: 'none',
              cursor: isFree ? 'not-allowed' : 'text'
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Dynamic Plan & Pricing Editor
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Configure tier call durations, daily call limits, audio retention, and Telegram Stars pricing
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: isSaving ? '#0284c780' : '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: isSaving ? 'not-allowed' : 'pointer'
          }}
        >
          <Save size={18} />
          {isSaving ? 'Saving Changes...' : 'Save Plan Changes'}
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#451a1a',
          border: '1px solid #991b1b',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#fca5a5',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div style={{
          backgroundColor: '#064e3b',
          border: '1px solid #047857',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#6ee7b7',
          fontSize: '0.875rem'
        }}>
          <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem'
      }}>
        {renderTierCard('free', 'Free Tier', 'Base access for standard partners', <Shield size={24} color="#94a3b8" />, true)}
        {renderTierCard('plus', 'Plus Tier', 'Enhanced duration and 7-day recordings', <Sparkles size={24} color="#38bdf8" />, false)}
        {renderTierCard('pro', 'Pro Tier', 'Unlimited access and 30-day recordings', <Star size={24} color="#fbbf24" />, false)}
      </div>
    </form>
  );
}
