import React, { useEffect, useCallback, useState } from 'react';
import {
  HelpCircle,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Radio,
  ExternalLink,
} from 'lucide-react';

export interface FaqScreenProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export const FaqScreen: React.FC<FaqScreenProps> = ({ onBack, onNavigate }) => {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botAppUrl = `https://t.me/${botUsername}?startapp=1`;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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

  const categories = [
    { id: 'all', label: 'All Questions' },
    { id: 'matchmaking', label: 'Matchmaking & Radar' },
    { id: 'scoring', label: 'Scoring & IELTS Rubric' },
    { id: 'pricing', label: 'Pricing & Refunds' },
    { id: 'privacy', label: 'Privacy & Safety' },
    { id: 'tech', label: 'Technical & Audio' },
  ];

  const faqItems = [
    {
      category: 'matchmaking',
      q: 'What is PairTalk and how does live IELTS Speaking matchmaking work?',
      a: "PairTalk is an autonomous peer-to-peer IELTS Speaking practice platform that operates natively inside Telegram and modern web browsers. Candidates configure their target whole-band scores (Band 5 to 9) across the four official IELTS criteria (Fluency, Vocabulary, Grammar, Pronunciation). When you tap 'Start Practicing', PairTalk's matchmaking radar pairs you with an active, criteria-matched study buddy worldwide in under 3 seconds inside an encrypted WebRTC voice room.",
    },
    {
      category: 'matchmaking',
      q: 'Who is PairTalk designed for?',
      a: 'PairTalk is designed for serious IELTS Academic and General Training candidates aiming for Band 6.0, 6.5, 7.0, 7.5, 8.0, or higher who need consistent, daily speaking practice. It is ideal for self-studying learners who want to eliminate speaking anxiety, test their impromptu speaking skills, and practice without paying $20–$50/hour for private tutors.',
    },
    {
      category: 'matchmaking',
      q: 'Why is PairTalk better than searching for IELTS study buddies in Discord servers or Telegram group chats?',
      a: 'In public group chats and Discord channels, candidates regularly face unresponsive study partners, ghosting, misaligned English proficiency levels, background noise, and privacy risks. PairTalk eliminates waiting and ghosting by connecting active candidates on demand in <3 seconds with strict criteria matching, studio-grade WebRTC SFU audio, and 100% anonymous aliases.',
    },
    {
      category: 'scoring',
      q: 'How does PairTalk use the official IELTS Speaking Band Descriptors (FC, LR, GRA, P)?',
      a: 'PairTalk aligns directly with the official British Council / IDP IELTS Speaking Band Descriptors: Fluency & Coherence (FC), Lexical Resource (LR), Grammatical Range & Accuracy (GRA), and Pronunciation (P). Learners set their individual target sub-scores, allowing the algorithm to match candidates with complementary strengths for maximum mutual learning synergy.',
    },
    {
      category: 'scoring',
      q: 'Can I practice IELTS Speaking Part 1, Part 2 (Cue Card), and Part 3 (Discussion) on PairTalk?',
      a: 'Yes. PairTalk voice sessions are structured to simulate the complete 2026 IELTS Speaking exam format. Partners can alternate roles as examiner and candidate across Part 1 introductory questions, Part 2 1-minute preparation and 2-minute cue card monologues, and Part 3 abstract two-way discussions.',
    },
    {
      category: 'pricing',
      q: 'How much does IELTS Speaking practice cost on PairTalk compared to private tutors?',
      a: 'Private 1-on-1 IELTS tutors on Cambly, iTalki, or Preply typically cost $20 to $50 per hour. PairTalk is 100% free to start with complimentary monthly practice calls. Paid accelerator tiers (PLUS, PRO, BOSS) range from 79 to 679 Telegram Stars ($1.58 to $13.58 / 15,000 to 149,000 UZS) for up to 50 practice calls of up to 90 minutes each, delivering over 95% cost savings compared to traditional tutoring.',
    },
    {
      category: 'scoring',
      q: 'How does PairTalk help candidates achieve Band 6.5, Band 7.0, or Band 8.0 in IELTS Speaking 2026?',
      a: 'Achieving IELTS Band 7+ requires spontaneous fluency without unnatural hesitation, flexible idiomatic vocabulary, complex clause structures with high accuracy, and natural rhythm with correct intonation. PairTalk provides daily high-repetition conversational exposure with criteria-matched candidates, eliminating speaking anxiety and building spontaneous English reflex.',
    },
    {
      category: 'privacy',
      q: 'Is PairTalk completely anonymous and how is candidate privacy protected?',
      a: 'PairTalk enforces strict privacy. Each candidate is assigned a randomized anonymous identifier (e.g. P2P-0284DB68). Your real name, phone number, and Telegram username are never shared with partners. Live voice calls are encrypted via WebRTC SFU, and optional cloud audio recordings are automatically and permanently purged once the tier retention window expires.',
    },
    {
      category: 'pricing',
      q: 'What is the official refund policy on PairTalk paid plans?',
      a: 'PairTalk provides a server-enforced 100% money-back guarantee. You are eligible for a full refund if requested within 48 hours of subscription purchase AND you have consumed less than 10% of your monthly call allowance. Telegram Stars refunds are processed instantly via /refund in the bot, while bank card transfers settle within 1–3 business days.',
    },
    {
      category: 'pricing',
      q: 'How do referral bonus calls and the Speaking Sprint work?',
      a: 'When you invite a study partner using your unique referral link, both you and your partner receive permanent bonus practice calls added to your balance. Active participants also compete on the live Community Leaderboard during Speaking Championships to win complimentary VIP, BOSS, and PRO plan upgrades.',
    },
    {
      category: 'tech',
      q: 'Do I need to download or install any external application to use PairTalk?',
      a: 'No external downloads or account setups are needed. PairTalk runs directly inside Telegram as a Telegram Mini App across iOS, Android, macOS, Windows, and Web. Simply launch @PairTalkBot to start practicing immediately.',
    },
    {
      category: 'tech',
      q: 'What audio equipment and browser permissions are required for PairTalk?',
      a: 'Any smartphone, tablet, or computer with a functional microphone works. Headphones or earbuds are strongly recommended to prevent acoustic echo. Ensure you allow microphone access when prompted by Telegram or your browser.',
    },
    {
      category: 'privacy',
      q: 'What should I do if my speaking partner is unresponsive, abusive, or refuses to speak English?',
      a: 'You have total control: tap the Report Partner button on your active call screen. Select the reason and choose to permanently block them. The call ends immediately, you will never be matched with them again, and our moderation engine receives the audit report.',
    },
  ];

  const filteredFaqs = faqItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.a.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#05070E] text-slate-100 p-4 sm:p-8 md:p-12 font-sans selection:bg-cyan-500 selection:text-slate-950">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/15">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                <span>KNOWLEDGE BASE &amp; FAQ</span>
                <span>•</span>
                <span>PAIRTALK PLATFORM</span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-mono font-black tracking-tight text-white uppercase">
                FREQUENTLY ASKED QUESTIONS
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/50 font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matchmaking, whole-band scoring, refund policy, audio setup..."
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                    : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-2xl font-mono text-xs text-slate-400">
              No matching questions found for "{searchQuery}". Try a different keyword or category.
            </div>
          ) : (
            filteredFaqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-2xl bg-[#090D18] border border-slate-800 overflow-hidden transition-all duration-200"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="w-full p-5 text-left flex items-start justify-between gap-4 hover:bg-slate-900/30 transition-colors cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {faq.q}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm font-mono text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* CTA Footer */}
        <div className="p-8 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border border-cyan-500/30 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Have More Questions?</h3>
          <p className="text-xs sm:text-sm text-slate-300 font-mono max-w-xl mx-auto">
            Our support desk is always online to help you with practice questions, billing, and technical guidance.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <a
              href={botAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 active:scale-95"
            >
              <Radio className="w-4 h-4" />
              <span>Launch PairTalk Bot</span>
            </a>
            <a
              href="https://t.me/PairTalkSupport"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Support Desk</span>
            </a>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('how-it-works')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <span>How It Works</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaqScreen;
