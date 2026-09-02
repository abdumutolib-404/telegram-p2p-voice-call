import React, { useState } from 'react';
import {
  Radio,
  Shield,
  Headphones,
  Award,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  MessageSquare,
  Sliders,
  Check,
  X,
  Flame,
  Gift,
  Clock,
  BookOpen,
  DollarSign,
  UserX,
  MessageCircleOff,
  Zap,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export interface LandingPageProps {
  onOpenPrivacy?: () => void;
  onOpenGuidelines?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenPrivacy,
  onOpenGuidelines,
}) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;
  const botDirectUrl = `https://t.me/${botUsername}`;

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const faqs = [
    {
      q: 'What is PairTalk and how does live IELTS Speaking matchmaking work?',
      a: "PairTalk is an autonomous peer-to-peer IELTS Speaking practice platform that operates natively inside Telegram. Candidates configure their target whole-band scores (Band 5 to 9) across the four official IELTS criteria (Fluency, Vocabulary, Grammar, Pronunciation). When you tap 'Start Practicing', PairTalk's matchmaking radar pairs you with an active, criteria-matched study buddy worldwide in under 3 seconds inside an encrypted WebRTC voice room.",
    },
    {
      q: 'Why is PairTalk better than searching for IELTS study buddies in Discord servers or Telegram group chats?',
      a: 'In public group chats and Discord channels, candidates regularly face unresponsive study partners, ghosting, misaligned English proficiency levels, background noise, and privacy risks. PairTalk eliminates waiting and ghosting by connecting active candidates on demand in <3 seconds with strict criteria matching, studio-grade WebRTC SFU audio, and 100% anonymous aliases.',
    },
    {
      q: 'How does PairTalk use the official IELTS Speaking Band Descriptors (FC, LR, GRA, P)?',
      a: 'PairTalk aligns directly with the official British Council / IDP IELTS Speaking Band Descriptors: Fluency & Coherence (FC), Lexical Resource (LR), Grammatical Range & Accuracy (GRA), and Pronunciation (P). Learners set their individual target sub-scores, allowing the algorithm to match candidates with complementary strengths (e.g. pairing a candidate seeking Pronunciation coaching with a partner proficient in Pronunciation) for maximum mutual learning synergy.',
    },
    {
      q: 'Can I practice IELTS Speaking Part 1, Part 2 (Cue Card), and Part 3 (Discussion) on PairTalk?',
      a: 'Yes. PairTalk voice sessions are structured to simulate the complete 2026 IELTS Speaking exam format. Partners can alternate roles as examiner and candidate across Part 1 introductory questions, Part 2 1-minute preparation and 2-minute cue card monologues, and Part 3 abstract two-way discussions.',
    },
    {
      q: 'How much does IELTS Speaking practice cost on PairTalk compared to private tutors?',
      a: 'Private 1-on-1 IELTS tutors on Cambly, iTalki, or Preply typically cost $20 to $50 per hour. PairTalk is 100% free to start with complimentary monthly practice calls. Paid accelerator tiers (PLUS, PRO, BOSS) range from 79 to 679 Telegram Stars ($1.58 to $13.58 / 15,000 to 149,000 UZS) for up to 50 practice calls of up to 90 minutes each, delivering over 95% cost savings compared to traditional tutoring.',
    },
    {
      q: 'How does PairTalk help candidates achieve Band 6.5, Band 7.0, or Band 8.0 in IELTS Speaking 2026?',
      a: 'Achieving IELTS Band 7+ requires spontaneous fluency without unnatural hesitation, flexible idiomatic vocabulary, complex clause structures with high accuracy, and natural rhythm with correct intonation. PairTalk provides daily high-repetition conversational exposure with criteria-matched candidates, eliminating speaking anxiety and building spontaneous English reflex.',
    },
    {
      q: 'Is PairTalk completely anonymous and how is candidate privacy protected?',
      a: 'PairTalk enforces strict privacy. Each candidate is assigned a randomized anonymous identifier (e.g. P2P-0284DB68). Your real name, phone number, and Telegram username are never shared with partners. Live voice calls are encrypted via WebRTC SFU, and optional cloud audio recordings are automatically and permanently purged once the tier retention window expires.',
    },
    {
      q: 'What is the official refund policy on PairTalk paid plans?',
      a: 'PairTalk provides a server-enforced 100% money-back guarantee. You are eligible for a full refund if requested within 48 hours of subscription purchase AND you have consumed less than 10% of your monthly call allowance. Telegram Stars refunds are processed instantly via /refund in the bot, while bank card transfers settle within 1–3 business days.',
    },
    {
      q: 'How do referral bonus calls and the Speaking Sprint work?',
      a: 'When you invite a study partner using your unique referral link, both you and your partner receive permanent bonus practice calls added to your balance. Active participants also compete on the live Community Leaderboard during Speaking Championships to win complimentary VIP, BOSS, and PRO plan upgrades.',
    },
    {
      q: 'Do I need to download or install any external application to use PairTalk?',
      a: 'No external downloads or account setups are needed. PairTalk runs directly inside Telegram as a Telegram Mini App across iOS, Android, macOS, Windows, and Web. Simply launch @PairTalkBot to start practicing immediately.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Cyberpunk Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-500/10 blur-[150px] rounded-full" />
        <div className="absolute top-[35%] right-[-10%] w-[600px] h-[600px] bg-emerald-500/5 blur-[160px] rounded-full" />
        <div className="absolute top-[65%] left-[-10%] w-[600px] h-[600px] bg-indigo-500/5 blur-[170px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-cyan-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Header */}
        <header className="flex items-center justify-between py-6 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-wider text-white">
                PAIR<span className="text-cyan-400">TALK</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] uppercase tracking-widest text-zinc-400 border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 rounded">
                IELTS P2P
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>SFU NETWORK ONLINE</span>
            </div>
            <a
              href={botAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>Launch App</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* SECTION 1: HERO HOOK                                                 */}
        {/* ==================================================================== */}
        <section className="pt-16 pb-16 text-center sm:pt-24 sm:pb-24">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SFU NETWORK ONLINE</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>2026 IELTS Speaking Rubric Ready</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
            Partner ghosted you again?{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
              No more excuses.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            Stop waiting for your study buddy to reply. Get matched with a live IELTS partner in &lt; 3 seconds. Practice Part 1, 2, and 3 with criteria-matched candidates. 100% anonymous &amp; free to start on Telegram.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={botAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-4 text-sm font-bold uppercase tracking-wider text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all flex items-center justify-center gap-2 group active:scale-95 cursor-pointer"
            >
              <span>Start Practicing on Telegram</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>

            <a
              href={botDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-4 text-sm font-semibold uppercase tracking-wider text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span>Open @{botUsername}</span>
            </a>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-14 pt-8 border-t border-zinc-800/60 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-sm">
              <div className="text-2xl sm:text-3xl font-bold text-cyan-400 font-mono">100%</div>
              <div className="text-xs font-semibold text-zinc-300 mt-1 uppercase tracking-wider">Anonymous Aliases</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">P2P-XXXXXXXX format</div>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-sm">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">5.0 – 9.0</div>
              <div className="text-xs font-semibold text-zinc-300 mt-1 uppercase tracking-wider">Whole-Band Rubric</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">FC • LR • GRA • P</div>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-sm">
              <div className="text-2xl sm:text-3xl font-bold text-cyan-400 font-mono">&lt; 3s</div>
              <div className="text-xs font-semibold text-zinc-300 mt-1 uppercase tracking-wider">Match Speed</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Autonomous Radar</div>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-sm">
              <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">WebRTC</div>
              <div className="text-xs font-semibold text-zinc-300 mt-1 uppercase tracking-wider">Encrypted SFU</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Studio-grade audio</div>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 2: THE PROBLEM                                               */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-rose-500/30 text-rose-400 bg-rose-950/30 mb-3">
              <span>THE IELTS SPEAKING STRUGGLE</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Why 90% of Self-Studying Candidates Get Stuck at Band 6.0
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              Without daily conversational feedback and structured exam discipline, scoring Band 7.0+ remains out of reach.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Problem Card 1 */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-rose-950/60 hover:border-rose-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">The $25/hr Tutor Price Crunch</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Hiring private 1-on-1 tutors on Cambly, iTalki, or Preply costs $20 to $50 per hour. Practicing every day for a month easily burns through $600+, making consistent speaking practice completely unaffordable for most serious candidates.
              </p>
            </div>

            {/* Problem Card 2 */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-amber-950/60 hover:border-amber-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
                <MessageCircleOff className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Chaotic Discord &amp; Group Chats</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Public Telegram groups and Discord voice channels are filled with unresponsive study partners, ghosting, last-minute cancellations, awkward silences, and wide proficiency gaps that waste your valuable prep time.
              </p>
            </div>

            {/* Problem Card 3 */}
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-purple-950/60 hover:border-purple-500/40 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform">
                <UserX className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Fear of Judgment &amp; Accent Anxiety</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Hesitating to speak with classmates or acquaintances because you fear making grammatical mistakes or mispronouncing words. Without anonymous practice, confidence stalls and exam day anxiety takes over.
              </p>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 3: THE SOLUTION                                              */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-cyan-500/30 text-cyan-400 bg-cyan-950/30 mb-3">
              <span>THE PAIRTALK PROTOCOL</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Autonomous, Criteria-Matched Speaking Simulations
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              PairTalk eliminates waiting and anxiety with deterministic matchmaking and complete anonymity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-cyan-500/40 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Sub-3-Second Matchmaking Radar</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Tap one button and get paired in under 3 seconds. Our autonomous dispatcher filters the live global candidate pool by target band score and criteria strengths to find your optimal speaking partner.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/40 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">100% Anonymous Candidate Aliases</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Every candidate is masked with a cryptographic alias (e.g. <span className="font-mono text-cyan-400">P2P-0284DB68</span>). Your real name, phone number, Telegram username, and avatar are never revealed. Speak freely with zero social anxiety.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-cyan-500/40 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Official 4-Criteria Calibrated Matching</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Configure your sub-scores for Fluency &amp; Coherence (FC), Lexical Resource (LR), Grammatical Range &amp; Accuracy (GRA), and Pronunciation (P). The engine pairs complementary strengths to maximize mutual learning.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/40 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <Headphones className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Zero-Install Telegram Mini App</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Runs directly inside Telegram on iOS, Android, macOS, Windows, and Linux. No apps to install, no passwords to create, and zero friction. Instant launch with one tap.
              </p>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 4: HIGH-CONTRAST COMPARISON MATRIX                           */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-cyan-500/30 text-cyan-400 bg-cyan-950/30 mb-3">
              <span>HOW PAIRTALK COMPARES</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              PairTalk vs. Private Tutors vs. Public Groups
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              See why thousands of candidates choose PairTalk for daily IELTS Speaking practice.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800/90 bg-zinc-900/20 backdrop-blur-sm">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="p-4 sm:p-5 text-zinc-400 font-mono text-xs uppercase tracking-wider">Dimension</th>
                  <th className="p-4 sm:p-5 text-cyan-400 font-mono text-xs uppercase tracking-wider bg-cyan-950/30 border-x border-cyan-500/30">
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" />
                      <span>PairTalk (P2P)</span>
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 text-zinc-400 font-mono text-xs uppercase tracking-wider">Cambly / iTalki</th>
                  <th className="p-4 sm:p-5 text-zinc-400 font-mono text-xs uppercase tracking-wider">Discord / Telegram Groups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {/* Row 1 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Match Speed</td>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/30 flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>&lt; 3 seconds (Automated)</span>
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">24–48h advance booking</td>
                  <td className="p-4 sm:p-5 text-zinc-400">Hours waiting / ghosted</td>
                </tr>

                {/* Row 2 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Cost per Hour</td>
                  <td className="p-4 sm:p-5 font-bold text-emerald-300 bg-cyan-950/20 border-x border-cyan-500/30">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>100% Free / ~$0.15–$0.27</span>
                    </div>
                  </td>
                  <td className="p-4 sm:p-5 text-rose-400 font-mono">$20 – $50 / hour</td>
                  <td className="p-4 sm:p-5 text-zinc-400">Free (Massive time waste)</td>
                </tr>

                {/* Row 3 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Rubric Calibration</td>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/30 flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Official 4 Criteria (FC/LR/GRA/P)</span>
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">Tutor-dependent (Casual chat)</td>
                  <td className="p-4 sm:p-5 text-zinc-400 flex items-center gap-1.5 text-zinc-500">
                    <X className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>None (Unstructured chat)</span>
                  </td>
                </tr>

                {/* Row 4 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Identity Protection</td>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/30 flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>100% Anonymous (P2P-XXXXXXXX)</span>
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">Real name, video &amp; profile exposed</td>
                  <td className="p-4 sm:p-5 text-zinc-400">Public handle &amp; avatar visible</td>
                </tr>

                {/* Row 5 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Format Discipline</td>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/30 flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Part 1, 2 Cue Card &amp; 3 Timers</span>
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">Varies by teacher</td>
                  <td className="p-4 sm:p-5 text-zinc-500 flex items-center gap-1.5">
                    <X className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>No structure, interruptions</span>
                  </td>
                </tr>

                {/* Row 6 */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-semibold text-white">Availability</td>
                  <td className="p-4 sm:p-5 font-bold text-cyan-300 bg-cyan-950/20 border-x border-cyan-500/30 flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>24/7 On-Demand Global Pool</span>
                  </td>
                  <td className="p-4 sm:p-5 text-zinc-400">Subject to tutor schedule</td>
                  <td className="p-4 sm:p-5 text-zinc-400">Unpredictable online users</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 5: THE VIRAL GROWTH ENGINE                                   */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-amber-500/30 text-amber-400 bg-amber-950/30 mb-3">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>VIRAL GROWTH ENGINE</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Earn Free Practice Calls &amp; Win Championship Rewards
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              Invite your study circle to unlock permanent bonus calls and compete on the global leaderboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Growth Card 1: Referral Bonus Calls */}
            <div className="relative p-8 rounded-3xl bg-gradient-to-b from-cyan-950/30 to-zinc-900/50 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.1)] overflow-hidden group">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/20">
                <Gift className="w-7 h-7" />
              </div>
              <div className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 mb-3">
                PERPETUAL REWARDS
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Permanent Referral Bonus Calls</h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Share your personal invite link from <span className="text-white font-semibold">@{botUsername}</span> with IELTS aspirants in your group chats. Whenever a candidate joins, both you and your friend receive permanent bonus practice calls that never expire.
              </p>
              <div className="flex items-center gap-3 text-xs font-mono text-cyan-300 bg-cyan-950/60 p-3.5 rounded-xl border border-cyan-500/20">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>+1 Permanent Call for every invited partner</span>
              </div>
            </div>

            {/* Growth Card 2: Speaking Championships */}
            <div className="relative p-8 rounded-3xl bg-gradient-to-b from-amber-950/30 to-zinc-900/50 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.1)] overflow-hidden group">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                <Award className="w-7 h-7" />
              </div>
              <div className="inline-block px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 mb-3">
                MONTHLY SPRINT
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Speaking Championship Sprints</h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Compete on the live Community Leaderboard by completing speaking sessions and receiving high partner ratings. Top candidates on the leaderboard unlock complimentary monthly upgrades to <span className="text-white font-semibold">PLUS, PRO, and BOSS</span> tiers!
              </p>
              <div className="flex items-center gap-3 text-xs font-mono text-amber-300 bg-amber-950/60 p-3.5 rounded-xl border border-amber-500/20">
                <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Top 10 candidates win free VIP/PRO plan upgrades</span>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 6: OFFICIAL 2026 BAND DESCRIPTORS & SIMULATION              */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-emerald-500/30 text-emerald-400 bg-emerald-950/30 mb-3">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>2026 IELTS EXAM RUBRIC</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Official IELTS Speaking Band Descriptors
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              Calibrate your practice against the exact four assessment criteria used by British Council &amp; IDP examiners.
            </p>
          </div>

          {/* 4 Criteria Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-cyan-500/40 transition-colors">
              <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider mb-2">FC</div>
              <h3 className="text-base font-bold text-white mb-2">Fluency &amp; Coherence</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Speaking at length without noticeable effort or loss of coherence. Flexible use of discourse markers, natural linking, and minimal hesitation.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/40 transition-colors">
              <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider mb-2">LR</div>
              <h3 className="text-base font-bold text-white mb-2">Lexical Resource</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Rich vocabulary range, precise idiomatic language, skillful paraphrasing, and natural collocation usage with rare inaccuracies.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/40 transition-colors">
              <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-2">GRA</div>
              <h3 className="text-base font-bold text-white mb-2">Grammar Range &amp; Accuracy</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Flexible use of complex sentence structures, subordinate clauses, error-free sentences, and high grammatical control.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-purple-500/40 transition-colors">
              <div className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider mb-2">P</div>
              <h3 className="text-base font-bold text-white mb-2">Pronunciation</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Natural rhythm, expressive sentence stress, correct intonation contours, and effortless intelligibility throughout the session.
              </p>
            </div>
          </div>

          {/* 3 Exam Parts Simulation Banner */}
          <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
            <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <span>Full Format Simulations (Part 1, 2 &amp; 3)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="text-xs font-mono text-cyan-400 font-bold uppercase mb-1">Part 1 • 4–5 Mins</div>
                <div className="font-semibold text-white text-sm mb-1">Introduction &amp; Interview</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  General introductory questions on familiar topics (hometown, studies, work, hobbies) to build conversational comfort.
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="text-xs font-mono text-emerald-400 font-bold uppercase mb-1">Part 2 • 3–4 Mins</div>
                <div className="font-semibold text-white text-sm mb-1">Individual Long Turn (Cue Card)</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  1-minute preparation note-taking followed by a 2-minute uninterrupted monologue on a randomly generated IELTS task card.
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                <div className="text-xs font-mono text-amber-400 font-bold uppercase mb-1">Part 3 • 4–5 Mins</div>
                <div className="font-semibold text-white text-sm mb-1">Two-Way In-Depth Discussion</div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  Abstract, analytical questions linked to Part 2 topic, testing opinion justification, hypothetical thinking, and nuance.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 7: TRANSPARENT PRICING & 100% REFUND POLICY                 */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-cyan-500/30 text-cyan-400 bg-cyan-950/30 mb-3">
              <span>TRANSPARENT VALUE PLANS</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Flexible Plans Built for Every Aspirant
            </h2>
            <p className="mt-3 text-zinc-400 text-sm sm:text-base">
              Start completely free. Upgrade whenever you need extended call limits and cloud recordings.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {/* FREE Plan */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-zinc-400 font-bold uppercase tracking-wider mb-2">FREE</div>
                <div className="text-3xl font-extrabold text-white font-mono mb-1">0 XTR</div>
                <div className="text-xs text-zinc-500 mb-6">Free Forever • 0 UZS</div>
                <ul className="space-y-3 text-xs text-zinc-300 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>3 Practice Calls</strong> / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>15 Min</strong> Max Duration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>1 Cloud Recording</strong> (24h)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Standard Queue Match</span>
                  </li>
                </ul>
              </div>
              <a
                href={botAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 text-xs font-bold uppercase tracking-wider text-center text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all block cursor-pointer"
              >
                Start Free
              </a>
            </div>

            {/* PLUS Plan */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider mb-2">PLUS</div>
                <div className="text-3xl font-extrabold text-white font-mono mb-1">79 XTR</div>
                <div className="text-xs text-zinc-500 mb-6">~$1.58 • 15,000 UZS / mo</div>
                <ul className="space-y-3 text-xs text-zinc-300 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>10 Practice Calls</strong> / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>30 Min</strong> Max Duration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>3 Cloud Recordings</strong> (7 days)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Standard Queue Match</span>
                  </li>
                </ul>
              </div>
              <a
                href={botAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 text-xs font-bold uppercase tracking-wider text-center text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-all block cursor-pointer"
              >
                Choose PLUS
              </a>
            </div>

            {/* PRO Plan (MOST POPULAR) */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-cyan-950/40 to-zinc-900/60 border-2 border-cyan-500/80 flex flex-col justify-between relative shadow-[0_0_30px_rgba(6,182,212,0.2)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-cyan-400 text-black text-[10px] font-mono font-black uppercase tracking-widest rounded-full">
                MOST POPULAR
              </div>
              <div>
                <div className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider mb-2">PRO</div>
                <div className="text-3xl font-extrabold text-white font-mono mb-1">255 XTR</div>
                <div className="text-xs text-zinc-400 mb-6">~$5.10 • 55,000 UZS / mo</div>
                <ul className="space-y-3 text-xs text-zinc-200 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>25 Practice Calls</strong> / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>60 Min</strong> Max Duration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>7 Cloud Recordings</strong> (30 days)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span><strong>High Priority</strong> Radar Queue</span>
                  </li>
                </ul>
              </div>
              <a
                href={botAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 text-xs font-bold uppercase tracking-wider text-center text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all block cursor-pointer"
              >
                Upgrade to PRO
              </a>
            </div>

            {/* BOSS Plan */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider mb-2">BOSS</div>
                <div className="text-3xl font-extrabold text-white font-mono mb-1">679 XTR</div>
                <div className="text-xs text-zinc-500 mb-6">~$13.58 • 149,000 UZS / mo</div>
                <ul className="space-y-3 text-xs text-zinc-300 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>50 Practice Calls</strong> / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>90 Min</strong> Max Duration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>15 Cloud Recordings</strong> (90 days)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>VIP Instant</strong> Priority Queue</span>
                  </li>
                </ul>
              </div>
              <a
                href={botAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 text-xs font-bold uppercase tracking-wider text-center text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-all block cursor-pointer"
              >
                Unleash BOSS
              </a>
            </div>
          </div>

          {/* Server-Enforced 100% Refund Policy Banner */}
          <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row items-center gap-5 max-w-4xl mx-auto shadow-[0_0_30px_rgba(16,185,129,0.1)]">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="text-xs font-mono font-bold uppercase text-emerald-400 tracking-wider mb-1">
                Server-Enforced 100% Money-Back Guarantee
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                If you are not completely satisfied, request a full refund within <strong>48 hours</strong> of purchase with <strong>&lt;10%</strong> of monthly calls consumed. Telegram Stars are refunded instantly via <span className="font-mono text-emerald-300">/refund</span> in @{botUsername}, while bank card transfers settle in 1–3 business days.
              </p>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 8: DATA-BACKED FAQ ACCORDION                                */}
        {/* ==================================================================== */}
        <section className="py-16 border-t border-zinc-800/80">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-mono font-bold tracking-widest uppercase border border-cyan-500/30 text-cyan-400 bg-cyan-950/30 mb-3">
              <span>ANSWERS &amp; ASSURANCE</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-zinc-400 text-sm">
              Everything you need to know about practicing IELTS Speaking on PairTalk.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left text-white font-medium hover:text-cyan-400 transition-colors cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-semibold pr-4">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zinc-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800/40 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================================================================== */}
        {/* CTA BANNER                                                           */}
        {/* ==================================================================== */}
        <section className="my-12 p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-cyan-950/40 via-zinc-900/80 to-zinc-900/60 border border-cyan-500/30 text-center relative overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)]">
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Ready to Boost Your IELTS Speaking Band?
            </h2>
            <p className="mt-4 text-zinc-300 text-sm sm:text-base max-w-xl mx-auto">
              Join motivated learners practicing IELTS Speaking every day on PairTalk. 100% free to start on Telegram.
            </p>
            <div className="mt-8">
              <a
                href={botAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold uppercase tracking-wider text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all active:scale-95 cursor-pointer"
              >
                <Radio className="w-4 h-4" />
                <span>Launch PairTalk on Telegram</span>
              </a>
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* SECTION 9: FOOTER WITH EXPLICIT DEEP LINKS                           */}
        {/* ==================================================================== */}
        <footer className="py-10 border-t border-zinc-800/80 text-xs text-zinc-500">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Radio className="w-4 h-4" />
              </div>
              <span className="text-base font-bold tracking-wider text-white">
                PAIR<span className="text-cyan-400">TALK</span>
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
                V2.0
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <a
                href="#guidelines"
                onClick={(e) => {
                  if (onOpenGuidelines) {
                    e.preventDefault();
                    onOpenGuidelines();
                  }
                }}
                className="hover:text-cyan-400 transition-colors"
              >
                Community Guidelines
              </a>
              <a
                href="#privacy"
                onClick={(e) => {
                  if (onOpenPrivacy) {
                    e.preventDefault();
                    onOpenPrivacy();
                  }
                }}
                className="hover:text-cyan-400 transition-colors"
              >
                Privacy &amp; Refund Policy
              </a>
              <a
                href={botDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cyan-400 transition-colors"
              >
                Telegram Bot
              </a>
              <a
                href="https://t.me/PairTalkSupport"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cyan-400 transition-colors"
              >
                Support Desk
              </a>
            </div>
          </div>

          <div className="border-t border-zinc-900 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left text-[11px] text-zinc-600">
            <p>© {new Date().getFullYear()} PairTalk IELTS Speaking Network. All rights reserved.</p>
            <p className="max-w-md">
              Disclaimer: PairTalk is an autonomous peer-to-peer educational platform. IELTS is a registered trademark of University of Cambridge ESOL, British Council, and IDP Education Australia.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};
