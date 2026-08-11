import React from 'react';
import { ShieldAlert, Lock, AlertOctagon } from 'lucide-react';

export const LockdownScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-white text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
        <ShieldAlert className="w-10 h-10 text-red-500" />
      </div>

      <div className="inline-flex items-center gap-2 bg-red-500/15 border border-red-500/30 px-3.5 py-1.5 rounded-full text-xs font-semibold text-red-400 mb-4 uppercase tracking-widest">
        <Lock className="w-3.5 h-3.5" />
        <span>HTTP 403 Forbidden</span>
      </div>

      <h1 className="text-3xl font-extrabold text-slate-100 mb-3 tracking-tight">
        Access Restricted
      </h1>

      <p className="text-slate-400 text-sm max-w-sm mb-8 leading-relaxed">
        This application can only be launched inside the official Telegram Mobile or Desktop app. Direct web browser access is blocked for security and HMAC authentication verification.
      </p>

      <div className="w-full max-w-xs p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <p className="font-semibold text-slate-200 mb-1">How to access:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Open Telegram messenger.</li>
            <li>Search for the IELTS Partner Bot.</li>
            <li>Launch Mini App using the menu button.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
