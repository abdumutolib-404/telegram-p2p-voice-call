import React from 'react';
import { Loader2, X, Radio, User, ShieldCheck } from 'lucide-react';

interface RadarScreenProps {
  userAvatarUrl?: string;
  userAlias?: string;
  targetBand?: number;
  onCancel: () => void;
}

export const RadarScreen: React.FC<RadarScreenProps> = ({
  userAvatarUrl,
  userAlias = 'Candidate',
  targetBand,
  onCancel,
}) => {
  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 bg-[#05070E] text-slate-100 relative overflow-hidden select-none font-sans">
      {/* Background Cyber Grid / Scanlines */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

      {/* Top Header */}
      <div className="z-10 text-center mt-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase border border-cyan-500/40 text-cyan-400 bg-cyan-950/40 mb-3 shadow-lg shadow-cyan-500/10">
          <Radio className="w-3.5 h-3.5 animate-pulse motion-reduce:animate-none text-cyan-400" />
          <span>AUTONOMOUS P2P MATCHER</span>
        </div>

        <h1 className="text-xl md:text-2xl font-mono font-black tracking-tight text-white uppercase">
          FINDING PRACTICE PARTNER
        </h1>

        {targetBand !== undefined && (
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
            <span>Target Band:</span>
            <span className="font-black text-cyan-400 text-sm">{targetBand.toFixed(1)}</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">Skill Complementary</span>
          </div>
        )}
      </div>

      {/* Center Radar Scanner Animation */}
      <div className="relative flex items-center justify-center my-8 w-72 h-72">
        {/* Outer Radar Rings with reduced-motion fallback */}
        <div className="absolute w-72 h-72 rounded-full border border-cyan-500/20 animate-ping duration-1000 opacity-20 motion-reduce:animate-none" />
        <div className="absolute w-56 h-56 rounded-full border border-cyan-400/25 animate-pulse duration-700 motion-reduce:animate-none" />
        <div className="absolute w-40 h-40 rounded-full border border-cyan-300/30" />
        <div className="absolute w-24 h-24 rounded-full border border-cyan-200/20" />

        {/* Sweeping Radar Scanner Line with reduced motion check */}
        <svg
          className="absolute w-72 h-72 animate-cyber-sweep motion-reduce:animate-none pointer-events-none opacity-40"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#cyberRadarGradient)"
            strokeWidth="2"
            strokeDasharray="60 220"
          />
          <defs>
            <linearGradient id="cyberRadarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center Candidate Icon */}
        <div className="relative z-10 w-24 h-24 rounded-3xl bg-[#090D18] border-2 border-cyan-500 shadow-2xl shadow-cyan-500/30 flex items-center justify-center overflow-hidden">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt={userAlias} className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-cyan-400" />
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="z-10 w-full max-w-xs flex flex-col items-center gap-3.5 mb-8 font-mono">
        <div className="flex items-center gap-2 text-slate-300 text-xs bg-[#090D18]/90 px-4 py-2 rounded-xl border border-slate-800 shadow-md">
          <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-cyan-400" />
          <span>Searching Complementary Bucket...</span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3.5 px-6 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-rose-950/30 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Cancel Matchmaking</span>
        </button>
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-sm pt-2 border-t border-slate-900/80 flex items-center justify-between text-[10px] font-mono text-slate-600">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-500/70" /> ENCRYPTED SFU
        </span>
        <span>LATENCY: &lt;100MS</span>
      </div>
    </div>
  );
};
