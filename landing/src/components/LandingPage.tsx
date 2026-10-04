import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  ShieldCheck,
  SlidersHorizontal,
  BookOpen,
  Check,
  Mic,
  LockKeyhole,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { practiceUrl } from "./SiteLayout";
import { StatsSummary } from "./StatsPage";
import { faqs } from "../content";

const steps = [
  {
    n: "01",
    icon: <SlidersHorizontal />,
    title: "Make it your practice.",
    text: "Set your self-assessed speaking level and the skills you want to work on. Matching considers your level and complementary strengths.",
    tag: "YOUR LEVEL. YOUR FOCUS.",
  },
  {
    n: "02",
    icon: <AudioLines />,
    title: "Meet on common ground.",
    text: "Join the queue and connect with another available learner. No public phone numbers. No endless “anyone online?” messages.",
    tag: "A PARTNER, NOT A GROUP CHAT.",
  },
  {
    n: "03",
    icon: <BookOpen />,
    title: "Speak. Listen. Try again.",
    text: "Use speaking prompts, swap roles, and give thoughtful feedback. Build a routine that makes speaking feel more familiar.",
    tag: "PROGRESS THROUGH PRACTICE.",
  },
];
const bars = [12, 26, 42, 22, 56, 35, 64, 28, 45, 18, 32, 52, 24, 40, 15];
const practiceParts = [
  {
    title: "Everyday conversations",
    question: "What do you enjoy about where you live?",
    detail:
      "Start with a familiar topic. Give a reason, then add a small example.",
    action: "Ask. Listen. Follow up.",
  },
  {
    title: "Your long turn",
    question: "Describe a skill you would like to learn.",
    detail:
      "What is it? Why does it interest you? How would you start learning it?",
    action: "Make a few notes. Tell your story.",
  },
  {
    title: "A deeper discussion",
    question: "How has technology changed the way people learn?",
    detail:
      "Explore both sides. Explain your opinion and invite your partner’s perspective.",
    action: "Explore. Explain. Exchange ideas.",
  },
];

function PracticeBoard() {
  const [part, setPart] = useState(1);
  const prompt = practiceParts[part];
  return (
    <div
      className="practice-board"
      data-reveal=""
      data-motion=""
      data-enter="left"
    >
      <div className="board-heading">
        <BookOpen size={20} />
        <span>A MOMENT TO PRACTICE</span>
        <span>0{part + 1} / 03</span>
      </div>
      <div
        className="practice-switch"
        aria-label="Choose an IELTS Speaking part"
      >
        {practiceParts.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={part === i}
            onClick={() => setPart(i)}
          >
            Part {i + 1}
          </button>
        ))}
      </div>
      <div className="practice-prompt" aria-live="polite" aria-atomic="true">
        <div className="prompt-content" key={part}>
          <p className="eyebrow">{prompt.title}</p>
          <h3>{prompt.question}</h3>
          <p>{prompt.detail}</p>
          <div className="prompt-note">
            <MessageCircle size={17} />
            <span>{prompt.action}</span>
          </div>
        </div>
      </div>
      <div className="board-foot">
        <span>Example practice prompt</span>
        <span>Take turns. Grow together.</span>
      </div>
    </div>
  );
}

function ConversationVisual() {
  return (
    <div
      className="conversation-visual"
      data-motion=""
      aria-label="Illustration of two learners practicing together"
    >
      <div className="visual-grid" aria-hidden="true" />
      <div className="visual-note">
        <SlidersHorizontal size={16} />
        <span>Your level. Your focus.</span>
      </div>
      <div className="conversation-card">
        <div className="conversation-top">
          <span>
            <span className="status-dot" /> A SPACE TO SPEAK
          </span>
          <span>
            PAIR<span className="visual-slash">/</span>TALK
          </span>
        </div>
        <div className="conversation-people">
          <div>
            <span className="visual-avatar visual-avatar-mint">A</span>
            <span>Your voice</span>
          </div>
          <div className="voice-signal" aria-hidden="true">
            {bars.map((height, i) => (
              <i key={i} style={{ height, animationDelay: `${i * 45}ms` }} />
            ))}
          </div>
          <div>
            <span className="visual-avatar visual-avatar-coral">B</span>
            <span>A new perspective</span>
          </div>
        </div>
        <div className="conversation-message">
          <span className="eyebrow">ONE CONVERSATION AT A TIME</span>
          <p>
            A little practice.
            <br />
            <em>A lot more confidence.</em>
          </p>
        </div>
        <div className="conversation-foot">
          <span>
            <Mic size={15} /> Speaking practice
          </span>
          <span>ILLUSTRATIVE PREVIEW</span>
        </div>
      </div>
      <div className="visual-caption">
        <AudioLines size={20} />
        <p>
          Two voices.
          <br />
          <strong>One shared step forward.</strong>
        </p>
        <ArrowUpRight size={18} />
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy" data-motion="">
            <p className="eyebrow">
              <span className="status-dot" /> A SPACE TO SPEAK, NOT JUST STUDY
            </p>
            <h1>
              <span className="hero-line">Your next</span>
              <span className="hero-line">conversation.</span>
              <em className="hero-line">Your next step.</em>
            </h1>
            <p className="hero-description">
              Find an IELTS speaking partner on Telegram. Turn what you know
              into words, one real conversation at a time.
            </p>
            <div className="hero-actions">
              <a className="button" href={practiceUrl}>
                Find my speaking partner <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="/how-it-works">
                See how it works <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-notes">
              <span>
                <Check size={14} /> Free to get started
              </span>
              <span>
                <Check size={14} /> No extra app to install
              </span>
            </div>
          </div>
          <ConversationVisual />
        </div>
        <div className="container hero-bottom">
          <span>REAL PEOPLE. REAL CONVERSATIONS.</span>
          <span>
            Made for IELTS speaking practice <ArrowRight size={15} />
          </span>
        </div>
      </section>
      <section className="proof-strip">
        <div className="container" data-motion="">
          <div className="proof-heading">
            <p className="eyebrow">SMALL CONVERSATIONS. SHARED PROGRESS.</p>
            <a className="text-link" href="/stats">
              Explore our community <ArrowUpRight size={16} />
            </a>
          </div>
          <StatsSummary fallbackFeatures />
        </div>
      </section>
      <section className="section container journey-section" id="how-it-works">
        <div className="section-heading" data-reveal>
          <div>
            <p className="eyebrow">LESS SEARCHING. MORE SPEAKING.</p>
            <h2>
              A practice partner.
              <br />
              Without the group-chat search.
            </h2>
          </div>
          <p>
            You bring the willingness to try.
            <br />
            We make finding a conversation simpler.
          </p>
        </div>
        <div className="steps-grid journey-track" data-motion="">
          {steps.map((step, i) => (
            <article
              className={`step-card journey-step journey-step-${i + 1}`}
              key={step.n}
              data-reveal
              style={{ "--order": i } as CSSProperties}
            >
              <div className="step-top">
                <span>{step.n}</span>
                {step.icon}
              </div>
              <div className="step-art" aria-hidden="true">
                {i === 0 ? (
                  <>
                    <span className="preference-line">
                      <i />
                      <b />
                    </span>
                    <span className="preference-line">
                      <i />
                      <b />
                    </span>
                    <span className="preference-line">
                      <i />
                      <b />
                    </span>
                  </>
                ) : i === 1 ? (
                  <>
                    <span className="match-person">A</span>
                    <span className="match-connection">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="match-person">B</span>
                  </>
                ) : (
                  <>
                    <span className="speech-piece">Hello.</span>
                    <span className="speech-piece">Let’s talk.</span>
                  </>
                )}
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="card-caption">{step.tag}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="practice-section">
        <div className="container practice-grid">
          <PracticeBoard />
          <div className="practice-copy" data-reveal data-enter="right">
            <p className="eyebrow">A LITTLE STRUCTURE GOES A LONG WAY.</p>
            <h2>
              Less “what do we talk about?” <em>More talking.</em>
            </h2>
            <p>
              Make the conversation count. Practice familiar topics, take a
              longer turn, or explore a deeper question together.
            </p>
            <ul className="check-list">
              <li>
                <Check /> Practice IELTS Speaking Parts 1, 2, and 3
              </li>
              <li>
                <Check /> Work on fluency, vocabulary, grammar, and
                pronunciation
              </li>
              <li>
                <Check /> Take turns speaking and giving feedback
              </li>
            </ul>
            <a className="text-link" href="/ielts-speaking">
              Build a better practice routine <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
      </section>
      <section className="section container safety-grid" data-motion="">
        <div data-reveal data-enter="left">
          <p className="eyebrow">CONFIDENCE STARTS WITH COMFORT.</p>
          <h2>
            Your voice.
            <br />
            <em>Your boundaries.</em>
          </h2>
          <div className="boundary-note">
            <ShieldCheck size={23} />
            <span>
              A space built around
              <br />
              <strong>your comfort.</strong>
            </span>
          </div>
          <div
            className="alias-diagram"
            aria-label="Example of an alias shown to a practice partner"
          >
            <div className="alias-card">
              <span className="alias-avatar">R</span>
              <div>
                <span className="eyebrow">YOUR PAIRTALK ALIAS</span>
                <strong>River</strong>
              </div>
              <ShieldCheck size={22} />
            </div>
            <div className="alias-boundary">
              <LockKeyhole size={16} />
              <span>Contact details stay off your partner’s view</span>
            </div>
            <div className="boundary-options">
              <span>
                <Check size={14} /> Choose what you share
              </span>
              <span>
                <Check size={14} /> Leave when you need to
              </span>
            </div>
          </div>
        </div>
        <div className="safety-copy" data-reveal data-enter="right">
          <h3>Practice with an alias, not a public profile.</h3>
          <p>
            Your partner sees your PairTalk alias rather than your Telegram
            contact details. Leave a call whenever you need to, and report
            inappropriate behavior afterward.
          </p>
          <p>
            Choose what you share. Agree with your partner before recording, and
            keep personal information private.
          </p>
          <a className="text-link" href="/safety">
            Our approach to safer practice <ArrowUpRight size={17} />
          </a>
        </div>
      </section>
      <section className="starter-section">
        <div className="container starter-grid">
          <div data-reveal>
            <p className="eyebrow">START SMALL. KEEP GOING.</p>
            <h2>
              A first conversation
              <br />
              costs nothing.
            </h2>
            <p>
              Try peer practice on the free plan. Choose a paid plan in Telegram
              when you want more calls or longer sessions.
            </p>
            <a className="button" href={practiceUrl}>
              Start with a free call <ArrowUpRight size={18} />
            </a>
          </div>
          <div
            className="starter-card welcome-pass"
            data-reveal
            data-motion=""
            data-enter="scale"
          >
            <div className="pass-heading">
              <span className="card-caption">YOUR FIRST STEP</span>
              <Sparkles size={20} />
            </div>
            <span className="pass-stamp" aria-hidden="true">
              LET’S
              <br />
              BEGIN
            </span>
            <div className="starter-price">
              Free <span>to get started</span>
            </div>
            <ul className="check-list">
              <li>
                <Check /> Speaking partner matching
              </li>
              <li>
                <Check /> In-call practice prompts
              </li>
              <li>
                <Check /> A space to listen and be heard
              </li>
            </ul>
            <a className="text-link" href="/pricing">
              Compare plans and limits <ArrowRight size={17} />
            </a>
            <p className="fine-print">
              Current allowances and paid prices are confirmed in the Telegram
              app before purchase.
            </p>
          </div>
        </div>
      </section>
      <section className="section container home-faq">
        <div className="faq-intro" data-reveal>
          <div>
            <p className="eyebrow">GOOD QUESTIONS. CLEAR ANSWERS.</p>
            <h2>Before you say hello.</h2>
            <span className="faq-punctuation" aria-hidden="true">
              ?
            </span>
          </div>
          <a className="text-link" href="/faq">
            All questions <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="faq-list" data-reveal>
          {faqs.slice(0, 5).map((faq) => (
            <details key={faq.q}>
              <summary>
                {faq.q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section" data-motion="">
        <div className="closing-echo" aria-hidden="true">
          <i />
          <i />
          <i />
          <AudioLines />
        </div>
        <div className="container" data-reveal data-enter="scale">
          <p className="eyebrow">YOU DON’T NEED PERFECT WORDS TO START.</p>
          <h2>
            You just need
            <br />
            <em>your next conversation.</em>
          </h2>
          <a className="button" href={practiceUrl}>
            Let’s start speaking <ArrowUpRight size={19} />
          </a>
          <p>Open PairTalk in Telegram. Bring your curiosity.</p>
        </div>
      </section>
    </>
  );
}
