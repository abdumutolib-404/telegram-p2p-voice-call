import React from 'react';
import { Loader2, X, Radio, User } from 'lucide-react';

interface RadarScreenProps {
  userAvatarUrl?: string;
  userAlias?: string;
  targetBand?: number;
  onCancel: () => void;
}

export const RadarScreen: React.FC<RadarScreenProps> = ({
  userAvatarUrl,
  userAlias = 'You',
  targetBand,
  onCancel,
}) => {
  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 bg-slate-950 text-white relative overflow-hidden">
      <div className="z-10 text-center mt-6">
        <div className="flex items-center justify-center gap-2 mb-2 text-indigo-400">
          <Radio className="w-5 h-5 animate-pulse" />
          <span className="text-xs font-bold tracking-widest uppercase">P2P Partner Match</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Finding IELTS Practice Partner</h1>
        {targetBand !== undefined && (
          <p className="text-sm text-slate-400 mt-1">
            Target Band <span className="font-semibold text-indigo-300">{targetBand.toFixed(1)}</span> • Skill-based pairing
          </p>
        )}
      </div>

      <div className="relative flex items-center justify-center my-12 w-72 h-72">
        <div className="absolute w-72 h-72 rounded-full border border-indigo-500/20 animate-ping duration-1000 opacity-25" />
        <div className="absolute w-56 h-56 rounded-full border border-indigo-400/30 animate-pulse duration-700" />
        <div className="absolute w-40 h-40 rounded-full border border-indigo-300/40" />

        <svg className="absolute w-72 h-72 animate-spin pointer-events-none opacity-40" viewBox="0 0 100 100" style={{ animationDuration: '6s' }}>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#radarGradient)"
            strokeWidth="1.5"
            strokeDasharray="70 200"
          />
          <defs>
            <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 w-24 h-24 rounded-full bg-slate-900 border-4 border-indigo-500 shadow-xl shadow-indigo-500/30 flex items-center justify-center overflow-hidden">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt={userAlias} className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-indigo-300" />
          )}
        </div>
      </div>

      <div className="z-10 w-full max-w-xs flex flex-col items-center gap-4 mb-8">
        <div className="flex items-center gap-2 text-slate-300 text-sm bg-slate-900/90 px-4 py-2 rounded-full border border-slate-800 shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Searching for practice partner...</span>
        </div>

        <button
          onClick={handleCancel}
          className="w-full py-3.5 px-6 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <X className="w-5 h-5" />
          <span>Cancel Matchmaking</span>
        </button>
      </div>
    </div>
  );
};
