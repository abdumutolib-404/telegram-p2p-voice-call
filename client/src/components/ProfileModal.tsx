import { useModalDialog } from '../hooks/useModalDialog';
import { Brand } from './Brand';
import React, { useState, useEffect } from 'react';
import { X, Lock, Copy, Check, Bell, BellOff, Award, Sparkles, Phone, Clock, Mic, HardDrive, Zap } from 'lucide-react';
import type { UserMatchData, IELTSCriterion } from '../types';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: UserMatchData;
  onOpenPlans: () => void;
  onToggleDnd?: (nextDnd: boolean) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  userData,
  onOpenPlans,
  onToggleDnd,
}) => {
  const [copied, setCopied] = useState(false);
  const [dndActive, setDndActive] = useState(userData.dnd ?? false);

  useEffect(() => {
    setDndActive(userData.dnd ?? false);
  }, [userData.dnd]);

  const dialogRef = useModalDialog(isOpen, onClose);
  if (!isOpen) return null;

  const alias = userData.alias || (userData.telegramId ? `P2P-${String(userData.telegramId).slice(-8).toUpperCase()}` : 'P2P-CANDIDATE');
  const plan = (userData.plan || 'FREE').toUpperCase();
  const isPaid = ['PLUS', 'PRO', 'BOSS'].includes(plan);

  const handleCopyAlias = () => {
    navigator.clipboard?.writeText?.(alias);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleDndState = () => {
    const next = !dndActive;
    setDndActive(next);
    onToggleDnd?.(next);
  };

  // Whole band criteria values
  const criteria: { id: IELTSCriterion; label: string; score: number }[] = [
    { id: 'FC', label: 'Fluency & Coherence', score: userData.subFC ?? Math.round(userData.band || 7) },
    { id: 'LR', label: 'Lexical Resource', score: userData.subLR ?? Math.round(userData.band || 7) },
    { id: 'GRA', label: 'Grammar & Accuracy', score: userData.subGRA ?? Math.round(userData.band || 7) },
    { id: 'P', label: 'Pronunciation', score: userData.subP ?? Math.round(userData.band || 7) },
  ];

  // Expiration or monthly reset calculation
  const getPlanResetOrExpiry = (): string => {
    if (isPaid && userData.planExpiresAt) {
      try {
        const date = new Date(userData.planExpiresAt);
        return `Expires: ${date.toISOString().slice(0, 10)}`;
      } catch {
        return 'Active 30-Day Cycle';
      }
    }
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `Resets: ${nextMonth.toISOString().slice(0, 10)}`;
  };

  return (
    <div className="client-modal-overlay">
      <div ref={dialogRef} className="client-modal max-w-md" role="dialog" aria-modal="true" aria-label="Learner profile">
        <header className="modal-header"><Brand />
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close profile modal"
        >
          <X className="w-5 h-5" />
        </button>
        </header>

        {/* Header */}
        <div className="text-center mb-5 pr-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-sans font-bold tracking-wide uppercase border border-mint-500/40 text-mint-400 bg-mint-950/40 mb-2">
            <Award className="w-3 h-3" />
            <span>Your account</span>
          </div>
          <h2 className="text-xl font-sans font-semibold tracking-tight text-white uppercase">
            Learner profile
          </h2>
        </div>

        {/* Locked Alias Card */}
        <div className="alias-card mb-4 p-3.5 rounded-2xl bg-[#10161d] border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-mint-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold flex items-center gap-1">
                <span>Permanent Locked Alias</span>
              </div>
              <div className="text-sm font-sans font-bold text-white tracking-wider">
                {alias}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyAlias}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-mint-300 hover:border-mint-500/40 transition-colors"
            title="Copy Alias"
            aria-label="Copy practice alias"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Overall Band & Whole-Band Criteria Breakdown */}
        <div className="mb-4 p-4 rounded-2xl bg-[#10161d] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold">Overall Band</div>
              <div className="text-2xl font-sans font-semibold text-mint-400">
                {(userData.band || 7).toFixed(1)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold">Skill Focus</div>
              <div className="text-xs font-sans text-slate-300">
                Strong: <span className="text-emerald-400 font-bold">{userData.strongSkill}</span> • Focus: <span className="text-amber-400 font-bold">{userData.weakSkill}</span>
              </div>
            </div>
          </div>

          <div className="criteria-grid grid grid-cols-2 gap-2 text-[11px] font-sans">
            {criteria.map((crit) => (
              <div
                key={crit.id}
                className="p-2.5 min-w-0 gap-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">{crit.id}</span>
                  <div className="text-[9px] text-slate-500 leading-normal">{crit.label}</div>
                </div>
                <div className="shrink-0 text-base font-semibold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                  {crit.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plan & Entitlements */}
        <div className="mb-4 p-4 rounded-2xl bg-[#10161d] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold">Active Tier</div>
              <div className="text-base font-sans font-semibold text-mint-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>{plan} PLAN</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold">Billing Cycle</div>
              <div className="text-xs font-sans text-slate-400">{getPlanResetOrExpiry()}</div>
            </div>
          </div>

          {/* Usage Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-sans mb-3">
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-mint-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Calls Left</div>
                <div className="font-bold text-white">
                  {userData.callsRemaining ?? '—'} / {userData.totalCallsLimit ?? '—'}
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-mint-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Max Call Time</div>
                <div className="font-bold text-white">
                  {userData.maxCallDuration ?? '—'} min
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Recordings</div>
                <div className="font-bold text-white">
                  {userData.recordingsRemaining ?? '—'} / {userData.recordingsLimit ?? '—'}
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Retention</div>
                <div className="font-bold text-white">
                  {userData.recordingRetentionDays ?? '—'} days
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPlans();
            }}
            className="w-full py-2.5 px-4 bg-mint-600 hover:bg-mint-500 text-slate-950 font-sans text-xs font-bold uppercase tracking-wider rounded-xl transition-transform active:scale-98 shadow-md shadow-mint-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Upgrade Plan / Get Credits</span>
          </button>
        </div>

        {/* DND Toggle Button */}
        <div className="p-3.5 rounded-2xl bg-[#10161d] border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${dndActive ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {dndActive ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[10px] font-sans uppercase text-slate-500 font-bold">Matching Status</div>
              <div className="text-xs font-sans font-bold text-slate-200">
                {dndActive ? 'Do Not Disturb (Idle)' : 'Ready for Matchmaking'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleDndState}
            className={`px-3 py-1.5 rounded-xl font-sans text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
              dndActive
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {dndActive ? 'Enable Queue' : 'Set DND'}
          </button>
        </div>
      </div>
    </div>
  );
};
