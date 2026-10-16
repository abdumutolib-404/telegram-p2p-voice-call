import { useId, type ReactNode } from "react";
import "./section-faq.css";

export interface SectionQuestion { question: string; answer: ReactNode }
export function SectionFaq({ title, questions }: { title: string; questions: SectionQuestion[] }) {
  const id = useId();
  return <section className="section-faq" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <div className="section-faq__items">{questions.map(item => <details key={item.question}>
      <summary>{item.question}</summary>
      <div className="section-faq__answer">{item.answer}</div>
    </details>)}</div>
  </section>;
}
