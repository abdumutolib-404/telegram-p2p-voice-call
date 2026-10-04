import { ArrowUpRight } from "lucide-react";
import type { Guide } from "../content";
import { practiceUrl } from "./SiteLayout";
export function GuidePage({ page }: { page: Guide }) {
  return (
    <>
      <section className="container page-intro">
        <a className="breadcrumb" href="/">
          PairTalk /
        </a>
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.heading}</h1>
        <p>{page.intro}</p>
      </section>
      <div className="container article-layout">
        <aside className="article-index">
          <p className="eyebrow">ON THIS PAGE</p>
          <nav aria-label="On this page">
            {page.sections.map((s) => (
              <a href={`#${s.id}`} key={s.id}>
                {s.title}
              </a>
            ))}
          </nav>
          <a className="text-link" href={practiceUrl}>
            Start speaking <ArrowUpRight size={16} />
          </a>
        </aside>
        <article className="article-body">
          {page.sections.map((s, i) => (
            <section id={s.id} key={s.id}>
              <span className="article-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <div className="article-related">
            <h2>Keep exploring</h2>
            <a href="/how-it-works">How PairTalk works ↗</a>
            <a href="/ielts-speaking">IELTS speaking practice guide ↗</a>
            <a href="/safety">Practice safely ↗</a>
            <a href="/faq">Frequently asked questions ↗</a>
          </div>
        </article>
      </div>
    </>
  );
}
