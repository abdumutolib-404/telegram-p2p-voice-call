import { PolicySummary } from './PolicySummary';
import { safetyQuestions } from '../../../platform/practiceQuestions';
export interface GuidelinesScreenProps { onBack?:()=>void }
export function GuidelinesScreen({onBack}:GuidelinesScreenProps) {
  return <PolicySummary title="Community guidelines" route="community-guidelines" onBack={onBack} questions={safetyQuestions}>
    <article className="dashboard-card"><h2>Make room for your partner</h2><p>Use PairTalk for English speaking practice. Take turns, listen patiently and ask before giving detailed corrections. Respect differences in accent, background and ability. Self-assessed bands and peer ratings are not official IELTS results.</p></article>
    <article className="dashboard-card"><h2>Respect boundaries</h2><p>No harassment, threats, hate speech, discrimination, sexual content or pressure to discuss an unwanted topic. Leave whenever you need to. Ask before recording, stop if agreement is withdrawn and do not publish or reuse another person's audio without permission.</p></article>
    <article className="dashboard-card"><h2>Keep the space for practice</h2><p>No dating solicitation, advertising, scams, recruiting, gambling, political campaigning or personal-data collection. Do not exchange payment details with a practice partner. Do not impersonate a tutor or examiner.</p><p>No extra accounts, fake calls, automated queue activity or traded ratings to exploit gifts, offers, referrals or contests. Do not attempt to access another account, bypass limits or disrupt the service.</p></article>
    <article className="dashboard-card"><h2>Report concerns and appeal mistakes</h2><p>End an inappropriate call, then use Report on the after-call screen or in History. Include relevant details and avoid public accusations or private information. Moderation can include warnings, temporary suspension and bans. Use /appeal or support if you believe a restriction is mistaken.</p><p>PairTalk provides educational peer practice and reporting tools. Continuous live supervision is not promised. You are responsible for prohibited or unlawful use and what you share; applicable rights and responsibilities still apply.</p></article>
  </PolicySummary>;
}
export default GuidelinesScreen;
