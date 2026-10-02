import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Lock, Key, Eye, EyeOff, ShieldAlert, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';

export function LoginModal() {
  const { requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [masterPassword, setMasterPassword] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [challengeId, setChallengeId] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!masterPassword) {
      setError('Master Password is required.');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await requestOtp(masterPassword);
      setChallengeId(res.challengeId);
      setStep('otp');
      setSuccessMsg('6-digit verification code dispatched to Admin Telegram account.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Password validation failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) {
      setError('6-digit OTP code is required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await verifyOtp(challengeId, otpInput.trim());
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('OTP verification failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(7, 10, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1.5rem',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '2rem',
          boxShadow: 'var(--shadow-lg)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
          position: 'relative',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--primary-bg)',
              color: 'var(--primary-light)',
              marginBottom: '1rem',
              border: '1px solid var(--primary-border)',
            }}
          >
            {step === 'password' ? <Lock size={22} /> : <Key size={22} />}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 650, margin: '0 0 0.35rem 0', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            PairTalk Operations Console
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            {step === 'password'
              ? 'Enter Master Password to request Telegram 2FA OTP'
              : 'Enter the 6-digit code dispatched to Telegram'}
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: '8px',
              padding: '0.625rem 0.875rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--danger-text)',
              fontSize: '0.85rem',
            }}
          >
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              backgroundColor: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: '8px',
              padding: '0.625rem 0.875rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--success-text)',
              fontSize: '0.85rem',
            }}
          >
            <ShieldCheck size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {step === 'password' ? (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Master Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  aria-label="Master password"
                  type={showPassword ? 'text' : 'password'}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  placeholder="Enter master password"
                  required
                  autoFocus
                  className="input-modern"
                  style={{
                    width: '100%',
                    paddingLeft: '2.25rem',
                    paddingRight: '2.25rem',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ width: '100%', height: '40px', marginTop: '0.25rem' }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Verifying...
                </>
              ) : (
                <>
                  Request 2FA OTP <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                6-Digit Verification Code
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  aria-label="Six-digit verification code"
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="input-modern num-tabular"
                  style={{
                    width: '100%',
                    paddingLeft: '2.25rem',
                    letterSpacing: '0.35em',
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ width: '100%', height: '40px' }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Authenticating...
                </>
              ) : (
                'Unlock Console'
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('password');
                setOtpInput('');
                setError(null);
                setSuccessMsg(null);
              }}
              className="btn-secondary"
              style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
            >
              ← Back to Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
