import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AudioLines, Eye, EyeOff, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';

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
      setSuccessMsg('A six-digit verification code was sent to your administrator Telegram account.');
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

  return <div className="login-layout"><a className="admin-skip-link" href="#sign-in">Skip to sign in</a><main id="sign-in" className="login-card">
    <div className="admin-brand"><span className="admin-logo-mark"><AudioLines size={20} aria-hidden="true" /></span><span>pairtalk<span className="admin-logo-dot">.</span></span></div>
    <h1>{step==='password'?'Sign in to administration':'Verify your sign-in'}</h1><p>{step==='password'?'Use your administrator password, then verify the code sent through Telegram.':'Enter the six-digit code sent to your administrator Telegram account.'}</p>
    {error&&<p className="inline-error" role="alert"><ShieldAlert size={16} aria-hidden="true" /> {error}</p>}
    {successMsg&&<p className="login-status" role="status"><ShieldCheck size={16} aria-hidden="true" /> {successMsg}</p>}
    {step==='password'?<form className="login-form" onSubmit={handlePasswordSubmit}><div><label className="field-label" htmlFor="admin-password">Master password</label><div className="password-field"><input id="admin-password" type={showPassword?'text':'password'} autoComplete="current-password" value={masterPassword} onChange={e=>setMasterPassword(e.target.value)} required autoFocus disabled={isSubmitting} className="input-modern" /><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div><button className="btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting?<><RefreshCw size={16} className="loading-spin"/>Verifying…</>:'Send verification code'}</button></form>:<form className="login-form" onSubmit={handleOtpSubmit}><div><label className="field-label" htmlFor="admin-otp">Six-digit verification code</label><input id="admin-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={otpInput} onChange={e=>setOtpInput(e.target.value.replace(/\D/g,''))} required autoFocus disabled={isSubmitting} className="input-modern num-tabular"/></div><button className="btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting?'Authenticating…':'Sign in'}</button><button className="btn-secondary" type="button" disabled={isSubmitting} onClick={()=>{setStep('password');setOtpInput('');setError(null);setSuccessMsg(null);}}>Back to password</button></form>}
  </main></div>;
}
