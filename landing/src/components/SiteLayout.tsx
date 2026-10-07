import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Menu, X, AudioLines } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { usePageMotion } from "../lib/usePageMotion";
const bot = (import.meta.env.VITE_BOT_USERNAME || "PairTalkBot").replace(
  /^@/,
  "",
);
export const practiceUrl = `https://t.me/${bot}?start=register`;
export const supportUrl = "https://t.me/PairTalkSupport";
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="PairTalk home">
      <span className="brand-mark">
        <AudioLines size={23} strokeWidth={2.5} />
      </span>
      pairtalk<span className="brand-period">.</span>
    </a>
  );
}
export function SiteLayout({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  usePageMotion(path);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const links = [
    ["/how-it-works", "How it works"],
    ["/ielts-speaking", "Speaking guide"],
    ["/stats", "Our community"],
    ["/pricing", "Compare prices"],
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container nav-wrap">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
          <a className="button button-small nav-cta" href={practiceUrl}>
            Start speaking <ArrowUpRight size={16} />
          </a>
          <button
            className="menu-toggle"
            ref={menuButton}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls={open ? "mobile-nav" : undefined}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            className="mobile-nav container"
            aria-label="Mobile navigation"
          >
            {links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </a>
            ))}
            <a href={practiceUrl}>Start speaking on Telegram ↗</a>
          </nav>
        )}
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Brand />
              <p>
                A little practice.
                <br />A lot more confidence.
              </p>
            </div>
            <div>
              <h2>Explore</h2>
              <a href="/how-it-works">How it works</a>
              <a href="/pricing">Plans & pricing</a>
              <a href="/stats">Community statistics</a>
              <a href="/faq">Questions & answers</a>
            </div>
            <div>
              <h2>Learn</h2>
              <a href="/ielts-speaking">IELTS speaking guide</a>
              <a href="/ielts-speaking#part-1">Part 1: everyday topics</a>
              <a href="/ielts-speaking#part-2">Part 2: your long turn</a>
              <a href="/ielts-speaking#part-3">Part 3: deeper discussion</a>
            </div>
            <div>
              <h2>Practice safely</h2>
              <a href="/safety">Safety guide</a>
              <a href="/community-guidelines">Community guidelines</a>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of service</a>
              <a href={supportUrl}>Contact support ↗</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getUTCFullYear()} PairTalk</span>
            <p>
              Independent peer practice. No affiliation with IELTS, the British
              Council, IDP, or Cambridge. No guaranteed test scores.
            </p>
            <a href="/sitemap.xml">Sitemap</a>
          </div>
        </div>
      </footer>
    </>
  );
}
