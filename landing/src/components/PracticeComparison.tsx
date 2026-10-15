import { practiceUrl } from "./SiteLayout";

const options = [
  {
    name: "PairTalk",
    focus: "For regular speaking practice",
    featured: true,
    details: [
      ["Starting a session", "Join the queue in Telegram. Match when a compatible learner is available."],
      ["Speaking support", "Built-in prompts for Parts 1, 2 and 3. Take turns speaking and listening."],
      ["Feedback", "Swap observations with another learner. Peer feedback, without an expert assessment."],
      ["Cost", "Start on the free plan. Paid plans offer more calls or longer sessions."],
    ],
  },
  {
    name: "Private tutors",
    focus: "For individual guidance",
    featured: false,
    details: [
      ["Starting a session", "Choose a tutor and book a lesson around your schedules."],
      ["Speaking support", "Teacher-led lessons that can target your specific weaknesses and exam technique."],
      ["Feedback", "Personalised corrections and explanations from your tutor."],
      ["Cost", "Paid lessons or courses. Rates and packages vary by tutor."],
    ],
  },
  {
    name: "Practice communities",
    focus: "For meeting fellow learners",
    featured: false,
    details: [
      ["Starting a session", "Find a partner in a group and arrange a time and place to talk."],
      ["Speaking support", "Choose a format together. Topics and organised sessions depend on the group."],
      ["Feedback", "Peer advice and shared resources. The level of guidance varies by community."],
      ["Cost", "Often free to join. Access rules and any fees depend on the group."],
    ],
  },
];

export function PracticeComparison() {
  return (
    <section className="band section" id="compare" aria-labelledby="comparison-title">
      <div className="wrap">
        <div className="section-head practice-comparison__intro">
          <h2 id="comparison-title">More ways to learn. More reasons to speak.</h2>
          <p>Find the support that fits your next step. Use PairTalk for speaking practice between lessons, or alongside your favourite community.</p>
        </div>
        <div className="practice-comparison">
          {options.map(option => (
            <article
              className={`practice-comparison__option${option.featured ? " practice-comparison__option--featured" : ""}`}
              key={option.name}
              aria-label={option.name}
            >
              <div className="practice-comparison__heading">
                <h3>{option.name}</h3>
                <p>{option.focus}</p>
              </div>
              <dl>
                {option.details.map(([label, description]) => (
                  <div className="practice-comparison__detail" key={label}>
                    <dt>{label}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
        <div className="practice-comparison__footer">
          <p>These are typical ways to practise. Individual tutors and communities differ. PairTalk provides peer practice; it does not award official IELTS scores.</p>
          <a className="btn btn--primary" href={practiceUrl}>Try PairTalk free</a>
        </div>
      </div>
    </section>
  );
}
