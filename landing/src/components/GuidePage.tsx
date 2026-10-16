import { ArrowUpRight } from "lucide-react";
import { faqs, type Guide } from "../content";
import { practiceUrl } from "./SiteLayout";
import { SectionFaq } from '../../../platform/SectionFaq';
import { pricingQuestions, privacyQuestions, safetyQuestions, practiceQuestions } from '../../../platform/practiceQuestions';
export function GuidePage({ page, path }: { page: Guide; path: string }) {
  return (
    <>
      <section className="container page-intro">
        <a className="breadcrumb" href="/">
          PairTalk /
        </a>

        <h1>{page.heading}</h1>
        <p>{page.intro}</p>
      </section>
      {path === '/faq' ? <div className="wrap faq-page">{[
        {title:'Getting started',questions:[0,1,2,4]}, {title:'Matching and calls',questions:[5,6]},
        {title:'Safety and privacy',questions:[3,7]}, {title:'Plans, recordings and payments',questions:[8,9]},
      ].map(group=><section className="faq-group" key={group.title}><h2>{group.title}</h2>{group.questions.map(index=><details className="acc" name="faq" id={page.sections[index].id} key={faqs[index].q}><summary>{faqs[index].q}</summary><div className="acc__body">{faqs[index].a}</div></details>)}</section>)}</div> : <div className="container article-layout">
        <aside className="article-index">
          <h2>On this page</h2>
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
          {page.sections.map((s) => (
            <section id={s.id} key={s.id}>

              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
          {path==='/ielts-speaking'&&<SectionFaq title="Practice questions" questions={practiceQuestions}/>}
          {['/terms','/privacy','/refund-policy','/community-guidelines'].includes(path)&&<SectionFaq title="Common questions" questions={path==='/privacy'?privacyQuestions:path==='/community-guidelines'?safetyQuestions:pricingQuestions.slice(-2)}/>}
          {['/terms','/privacy','/refund-policy','/community-guidelines'].includes(path)&&<p><a href="/policies/pairtalk-policies-2026-10-16.pdf" download>Download all policies as PDF</a></p>}
          <div className="article-related">
            <h2>Keep exploring</h2>
            <a href="/how-it-works">How PairTalk works</a>
            <a href="/ielts-speaking">IELTS speaking practice guide</a>
            <a href="/safety">Practice safely</a>
            <a href="/faq">Frequently asked questions</a>
          </div>
        </article>
      </div>}
    </>
  );
}
