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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto motion-reduce:backdrop-blur-none animate-fadeIn">
      <div className="relative w-full max-w-md my-8 p-5 md:p-6 bg-[#090D18] border border-slate-800 rounded-3xl shadow-2xl text-slate-100 font-sans">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close profile modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-5 pr-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase border border-cyan-500/40 text-cyan-400 bg-cyan-950/40 mb-2">
            <Award className="w-3 h-3" />
            <span>CANDIDATE TELEMETRY</span>
          </div>
          <h2 className="text-xl font-mono font-black tracking-tight text-white uppercase">
            LEARNER PROFILE
          </h2>
        </div>

        {/* Locked Alias Card */}
        <div className="mb-4 p-3.5 rounded-2xl bg-[#0C1222] border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-cyan-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold flex items-center gap-1">
                <span>Permanent Locked Alias</span>
              </div>
              <div className="text-sm font-mono font-bold text-white tracking-wider">
                {alias}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyAlias}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
            title="Copy Alias"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Overall Band & Whole-Band Criteria Breakdown */}
        <div className="mb-4 p-4 rounded-2xl bg-[#0C1222] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Overall Band</div>
              <div className="text-2xl font-mono font-black text-cyan-400">
                {(userData.band || 7).toFixed(1)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Skill Focus</div>
              <div className="text-xs font-mono text-slate-300">
                Strong: <span className="text-emerald-400 font-bold">{userData.strongSkill}</span> • Focus: <span className="text-amber-400 font-bold">{userData.weakSkill}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {criteria.map((crit) => (
              <div
                key={crit.id}
                className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">{crit.id}</span>
                  <div className="text-[9px] text-slate-500 leading-tight truncate max-w-[90px]">{crit.label}</div>
                </div>
                <div className="text-base font-black text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                  {crit.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plan & Entitlements */}
        <div className="mb-4 p-4 rounded-2xl bg-[#0C1222] border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Active Tier</div>
              <div className="text-base font-mono font-black text-purple-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>{plan} PLAN</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Billing Cycle</div>
              <div className="text-xs font-mono text-slate-400">{getPlanResetOrExpiry()}</div>
            </div>
          </div>

          {/* Usage Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-3">
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Calls Left</div>
                <div className="font-bold text-white">
                  {userData.callsRemaining ?? 3} / {userData.totalCallsLimit ?? (plan === 'BOSS' ? 50 : plan === 'PRO' ? 25 : plan === 'PLUS' ? 10 : 3)}
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Max Call Time</div>
                <div className="font-bold text-white">
                  {userData.maxCallDuration ?? (plan === 'BOSS' ? 90 : plan === 'PRO' ? 60 : plan === 'PLUS' ? 30 : 15)} min
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Recordings</div>
                <div className="font-bold text-white">
                  {userData.recordingsRemaining ?? 1} / {userData.recordingsLimit ?? (plan === 'BOSS' ? 15 : plan === 'PRO' ? 7 : plan === 'PLUS' ? 3 : 1)}
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Retention</div>
                <div className="font-bold text-white">
                  {userData.recordingRetentionDays ?? (plan === 'BOSS' ? 90 : plan === 'PRO' ? 30 : plan === 'PLUS' ? 7 : 1)} days
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
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-transform active:scale-98 shadow-md shadow-purple-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Upgrade Plan / Get Credits</span>
          </button>
        </div>

        {/* DND Toggle Button */}
        <div className="p-3.5 rounded-2xl bg-[#0C1222] border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${dndActive ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              {dndActive ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Matching Status</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {dndActive ? 'Do Not Disturb (Idle)' : 'Ready for Matchmaking'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleDndState}
            className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
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
