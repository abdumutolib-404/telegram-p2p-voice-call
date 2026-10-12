import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X, AudioLines } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useAccordionMotion } from "../hooks/useAccordionMotion";
const bot = (import.meta.env.VITE_BOT_USERNAME || "PairTalkBot").replace(/^@/, "");
export const practiceUrl = `https://t.me/${bot}?start=register`;
export const supportUrl = "https://t.me/PairTalkSupport";
export function Brand() {
  return <a className="logo" href="/" aria-label="PairTalk home"><span className="logo__mark"><AudioLines size={20} aria-hidden="true" /></span><span>pairtalk<span className="logo__dot">.</span></span></a>;
}
const links = [["/how-it-works", "How it works"], ["/ielts-speaking", "Speaking guide"], ["/stats", "Community"], ["/pricing", "Plans"]];
export function SiteLayout({children, path}: {children: ReactNode; path: string}) {
  useAccordionMotion(path);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const update = () => { setMobile(query.matches); if (!query.matches) setOpen(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); }

    };
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !menuButton.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", close); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header" data-open={open}><div className="wrap site-header__bar"><Brand />
      <nav className="site-nav" ref={menu} id="site-nav" aria-label="Main navigation" inert={mobile && !open ? true : undefined} aria-hidden={mobile && !open ? true : undefined} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== menuButton.current) setOpen(false); }}>{links.map(([href,label]) => <a key={href} href={href} aria-current={path===href?"page":undefined} onClick={()=>setOpen(false)}>{label}</a>)}<a className="btn btn--primary mobile-start" href={practiceUrl}>Start speaking</a></nav>
      <div className="site-header__actions"><ThemeToggle /><a className="btn btn--primary" href={practiceUrl}>Start speaking</a><button className="icon-btn nav-toggle" ref={menuButton} type="button" aria-label={open?"Close navigation":"Open navigation"} aria-expanded={open} aria-controls="site-nav" onClick={()=>setOpen(!open)}>{open?<X size={20} />:<Menu size={20} />}</button></div>
    </div></header>
    <main id="main">{children}</main>
    <footer className="site-footer"><div className="wrap"><div className="site-footer__grid">
      <div><Brand /><p className="footer-description">Peer speaking practice for IELTS learners, inside Telegram.</p></div>
      <div><h2>Product</h2><ul>{[["/how-it-works","How it works"],["/pricing","Plans"],["/faq","FAQ"],["/stats","Community"]].map(([href,label])=><li key={href}><a href={href}>{label}</a></li>)}</ul></div>
      <div><h2>Learn</h2><ul><li><a href="/ielts-speaking">Speaking guide</a></li><li><a href="/ielts-speaking#part-1">Part 1 questions</a></li><li><a href="/ielts-speaking#part-2">Part 2 cue cards</a></li><li><a href="/ielts-speaking#part-3">Part 3 discussion</a></li></ul></div>
      <div><h2>Trust</h2><ul>{[["/safety","Safety"],["/community-guidelines","Community guidelines"],["/privacy","Privacy"],["/terms","Terms"],["/refund-policy","Refund policy"]].map(([href,label])=><li key={href}><a href={href}>{label}</a></li>)}<li><a href={supportUrl}>Contact support ↗</a></li></ul></div>
    </div><p className="site-footer__legal">PairTalk is an independent peer practice service. It is not affiliated with, endorsed by, or connected to IELTS, the British Council, IDP, or Cambridge. A conversation with another learner is practice, not a certified mock test or official score assessment. No guaranteed test scores.</p><div className="footer-meta"><span>© {new Date().getUTCFullYear()} PairTalk. All rights reserved.</span><a href="/sitemap.xml">Sitemap</a></div></div></footer>
  </>;
}
