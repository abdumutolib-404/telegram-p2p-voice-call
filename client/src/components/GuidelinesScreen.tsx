import { Brand } from './Brand';
import React, { useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  HelpCircle,
  Mic,
  Clock,
  Volume2,
  Ban,
  Scale,
  Award,
} from 'lucide-react';

export interface GuidelinesScreenProps {
  onBack?: () => void;
}

export const GuidelinesScreen: React.FC<GuidelinesScreenProps> = ({ onBack }) => {
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
  }, [onBack]);

  useEffect(() => {
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    if (tg?.BackButton) {
      tg.BackButton.show();
      const clickHandler = () => handleBack();
      tg.BackButton.onClick(clickHandler);
      return () => {
        tg.BackButton?.offClick(clickHandler);
        tg.BackButton?.hide();
      };
    }
  }, [handleBack]);

  return (
    <div className="policy-screen min-h-screen bg-[#0b0f14] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-mint-500 selection:text-slate-950">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="policy-header"><Brand /><button type="button" onClick={handleBack} className="secondary-button"><ArrowLeft size={16} aria-hidden="true" />Back</button><div className="policy-heading"><span className="eyebrow">PairTalk speaking practice</span><h1>Community guidelines</h1></div></header>

        {/* Preamble */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-mint-950/30 via-slate-900/40 to-slate-900/20 border border-mint-500/20 space-y-2 font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
          <p className="font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <Award className="w-4 h-4 text-mint-400" />
            <span>Purpose &amp; Code of Practice</span>
          </p>
          <p>
            PairTalk is an autonomous peer-to-peer IELTS Speaking preparation platform connecting serious candidates worldwide. Our mission is to provide an accessible, high-repetition, criteria-matched practice space where learners can build genuine conversational fluency without fear of judgment. Every candidate must strictly uphold these community standards.
          </p>
        </div>

        {/* Article 1: Core Practice Principles */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>ARTICLE 1. CORE PRACTICE PRINCIPLES</span>
          </div>
          <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">1.1 Strict English-Only Communication:</strong> All voice interactions must be conducted entirely in English. Candidates may not switch to regional or native languages during calls, as the objective is spontaneous English reflex.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">1.2 Adherence to Official IELTS Rubric:</strong> Discussions should align with the four IELTS Speaking assessment criteria: <em>Fluency &amp; Coherence (FC)</em>, <em>Lexical Resource (LR)</em>, <em>Grammatical Range &amp; Accuracy (GRA)</em>, and <em>Pronunciation (P)</em>.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">1.3 Balanced Speaking Time:</strong> Practice sessions must maintain a 50/50 conversational balance. Candidates should alternate roles as examiner and examinee across Part 1 (Interview), Part 2 (Cue Card), and Part 3 (Discussion). Monopolizing speaking time or remaining persistently silent is prohibited.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-mint-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">1.4 Constructive Feedback:</strong> Post-call evaluations and rubric ratings must be honest, supportive, and grounded in standard IELTS descriptors. Malicious score-bombing or retaliation is strictly monitored.
              </div>
            </div>
          </div>
        </div>

        {/* Article 2: Audio & Environmental Etiquette */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <Volume2 className="w-4 h-4" />
            <span>ARTICLE 2. AUDIO &amp; CALL ENVIRONMENT ETIQUETTE</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans text-slate-300">
            <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800/80 space-y-1">
              <div className="text-mint-400 font-bold flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>Headphones Required</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Use wired or wireless earphones to prevent acoustic echo, feedback squeal, and background microphone leakage.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800/80 space-y-1">
              <div className="text-mint-400 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Punctual Completion</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Complete the full call duration whenever possible. If you must leave prematurely, courteously inform your partner before disconnecting.
              </p>
            </div>
          </div>
        </div>

        {/* Article 3: Prohibited Conduct & Violations */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-rose-500/30 space-y-4">
          <div className="flex items-center gap-2.5 text-rose-400 font-sans text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>ARTICLE 3. PROHIBITED CONDUCT (ZERO TOLERANCE)</span>
          </div>
          <p className="text-xs font-sans text-slate-400">
            Violations of the following rules result in immediate disciplinary intervention, quota forfeiture, or permanent banishment:
          </p>
          <div className="space-y-2.5 text-xs text-slate-300 font-sans leading-relaxed">
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20">
              <strong className="text-rose-300">• Harassment, Bullying &amp; Discrimination:</strong> Derogatory remarks, insults, mocking a partner&apos;s accent or grammatical mistakes, hate speech, or discriminatory language targeting nationality, ethnicity, gender, religion, or background.
            </div>
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20">
              <strong className="text-rose-300">• Inappropriate Advances &amp; Sexual Content:</strong> Any form of flirtatious, romantic, sexually suggestive, or vulgar commentary. PairTalk is an academic training platform, not a social dating service.
            </div>
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20">
              <strong className="text-rose-300">• Doxxing &amp; Soliciting Personal Contact Info:</strong> Demanding real names, personal phone numbers, physical addresses, or social media accounts. Candidate anonymity is absolute and non-negotiable.
            </div>
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20">
              <strong className="text-rose-300">• Matchmaking Sabotage &amp; Griefing:</strong> Rapid queue cycling, instant repetitive hang-ups (dodging partners based on band scores), or connecting while muted without speaking.
            </div>
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20">
              <strong className="text-rose-300">• Commercial Solicitation:</strong> Advertising external tutoring courses, paid services, crypto schemes, or sharing phishing links.
            </div>
          </div>
        </div>

        {/* Article 4: Moderation Penalty Ladder */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-amber-500/30 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-400 font-sans text-xs font-bold uppercase tracking-wider">
            <Scale className="w-4 h-4" />
            <span>ARTICLE 4. MODERATION LADDER &amp; PENALTY ESCALATION</span>
          </div>
          <p className="text-xs font-sans text-slate-400">
            PairTalk employs an automated moderation engine cross-referencing partner ratings, rapid disconnect telemetry, and reported misconduct:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-sans">
            <div className="p-4 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
              <div className="text-[11px] text-amber-400 font-bold uppercase flex items-center gap-1">
                <span>1. Formal Warning</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Delivered via @PairTalkBot after negative partner feedback or minor infractions. Account placed on monitored status.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-amber-500/40 space-y-1.5">
              <div className="text-[11px] text-amber-400 font-bold uppercase flex items-center gap-1">
                <span>2. Temporary Cooldown</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                6 to 24-hour temporary matchmaking lockout with dynamic retry countdown. Issued for repetitive queue griefing or minor harassment.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-rose-500/50 space-y-1.5">
              <div className="text-[11px] text-rose-400 font-bold uppercase flex items-center gap-1">
                <Ban className="w-3 h-3" />
                <span>3. Permanent Ban</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Irrevocable suspension of platform access for hate speech, vulgarity, doxxing, or repeated violations.
              </p>
            </div>
          </div>
        </div>

        {/* Article 5: Unban Appeals Process */}
        <div className="p-6 rounded-2xl bg-[#141b23] border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-mint-400 font-sans text-xs font-bold uppercase tracking-wider">
            <HelpCircle className="w-4 h-4" />
            <span>ARTICLE 5. OFFICIAL UNBAN APPEAL SYSTEM</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            If your account was restricted or banned and you believe the action was taken in error or due to a false report, you may submit a formal appeal directly in the Telegram Bot:
          </p>
          <div className="p-4 bg-black/60 rounded-xl border border-slate-800 text-mint-300 font-sans text-xs space-y-1.5 select-all">
            <div className="text-slate-500 text-[10px] uppercase">Telegram Bot Command:</div>
            <code>/appeal &lt;detailed explanation of incident and rationale for review&gt;</code>
          </div>
          <p className="text-[11px] text-slate-400 font-sans">
            Appeals are reviewed by human platform administrators within 24 hours. Each candidate may submit one appeal per disciplinary action. Frivolous or abusive appeals are permanently rejected.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-sans text-slate-600">
          <span>PAIRTALK IELTS SPEAKING NETWORK</span>
          <span>COMMUNITY GUIDELINES V2.0 (2026 EDITION)</span>
        </div>
      </div>
    </div>
  );
};
export default GuidelinesScreen;
