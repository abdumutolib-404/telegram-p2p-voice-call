import type { ReactNode } from "react";
export interface Guide {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  sections: { id: string; title: string; body: ReactNode }[];
}
export const faqs = [
  {
    q: "What is PairTalk?",
    a: "PairTalk connects English learners for peer-to-peer IELTS speaking practice through a Telegram Mini App. Choose your self-assessed level, join the matching queue, and practice in a voice call with another available learner.",
  },
  {
    q: "Do I need anything besides Telegram?",
    a: "You need a Telegram account, an internet connection, and a working microphone. Register in the bot, read the Terms of Use PDF, and agree before opening your dashboard from Telegram. Allow microphone access when joining a call. Headphones can help reduce echo; there is no separate PairTalk app to install.",
  },
  {
    q: "Can I start for free?",
    a: "Yes. Join @pairtalk and verify membership in the Mini App to claim three one-time 15-minute call units. Two units can cover one 30-minute call. Add calls, recordings and optional retention separately when you need more; check Pricing for the published totals.",
  },
  {
    q: "Will my partner see my Telegram details?",
    a: "Your partner sees your PairTalk alias rather than your Telegram name, username, or phone number. Anything you choose to say during a conversation can still identify you, so avoid sharing private details.",
  },
  {
    q: "Is my partner a teacher or official IELTS examiner?",
    a: "Your partner is another learner. Peer practice gives you speaking time and a chance to exchange feedback, but it does not replace qualified teaching or an official assessment. PairTalk cannot guarantee an IELTS score.",
  },
  {
    q: "How long does finding a partner take?",
    a: "It depends on who is available and how your practice preferences align. There is no guaranteed wait time. If no match is available, try another time rather than treating an empty queue as a connection problem.",
  },
  {
    q: "Can I practice all three Speaking parts?",
    a: "Yes. Use everyday questions for Part 1, a cue-card style long turn for Part 2, and follow-up discussion for Part 3. Swap roles with your partner. The speaking guide includes an example routine and original prompts.",
  },
  {
    q: "What if a call feels uncomfortable?",
    a: "Leave the call immediately. You can report inappropriate behavior through the post-call flow. Do not share personal information or send money to another learner. Contact PairTalk support if you need help.",
  },
  {
    q: "Are calls recorded?",
    a: "Recordings are optional and separate from calls. Optional storage keeps each recording for 30 days from creation; without it, server copies last only for delivery recovery, up to 24 hours. Agree with your partner before recording. See the privacy policy for how recordings and call metadata are handled.",
  },
  {
    q: "Can I request a refund?",
    a: "Full unused purchases can be refunded within 48 hours, provided the complete purchased quantities remain available and unreserved. Legacy subscription purchases retain their original refund rules. Use /refund in the bot or contact support.",
  },
];
export const pages: Record<string, Guide> = {
  "/how-it-works": {
    title: "How PairTalk Works | Find an IELTS Speaking Partner",
    description:
      "Learn how to find a speaking partner on Telegram, set your level, join a voice call, and turn peer feedback into a practical IELTS study routine.",
    eyebrow: "FROM “HELLO” TO A HABIT",
    heading: "A simpler way to find your speaking partner.",
    intro:
      "Peer practice works best when you spend your time speaking, not searching. Here’s what to expect from your first PairTalk conversation.",
    sections: [
      {
        id: "get-started",
        title: "Start in Telegram",
        body: (
          <>
            <p>
              Open the PairTalk bot in Telegram to register. Read the Terms of
              Use PDF and choose Agree and continue before registration
              proceeds. Then open your dashboard using the bot’s Open dashboard
              button. Your Telegram account signs you in; you do not need a
              separate PairTalk password.
            </p>
            <p>
              Use a quiet space and headphones if possible. Allow microphone
              access when your device asks. The public website never needs
              access to your microphone.
            </p>
            <p>
              Calls, post-call ratings, reports, and account settings live in
              your dashboard. Registration, payments, and refund requests remain
              in Telegram. A direct dashboard URL does not provide account
              access.
            </p>
          </>
        ),
      },
      {
        id: "choose-level",
        title: "Choose your level and focus",
        body: (
          <>
            <p>
              Set your self-assessed whole-band level from 5 to 9 and your
              preferences for fluency and coherence, lexical resource,
              grammatical range and accuracy, and pronunciation. These settings
              help PairTalk consider your level and complementary strengths when
              matching.
            </p>
            <p>
              Your settings are practice preferences, not an official IELTS
              result. If you are unsure, use your recent teacher feedback or a
              realistic assessment of your current speaking ability.
            </p>
          </>
        ),
      },
      {
        id: "find-partner",
        title: "Join the matching queue",
        body: (
          <>
            <p>
              Start searching in the Mini App. PairTalk looks for another
              available learner. Waiting time depends on the queue and your
              preferences; matching is not guaranteed within a fixed number of
              seconds.
            </p>
            <p>
              When a match is ready, follow the call prompts and microphone
              instructions. You and your partner appear under aliases, so you do
              not need to exchange Telegram contact information.
            </p>
          </>
        ),
      },
      {
        id: "practice",
        title: "Give the conversation a shape",
        body: (
          <>
            <p>
              Agree on a topic and decide who will speak first. Try a few short
              questions, a cue-card style long turn, and a discussion. Switch
              roles so both partners get speaking time.
            </p>
            <ul>
              <li>Start with a familiar topic to settle in.</li>
              <li>Let your partner finish before giving feedback.</li>
              <li>Offer one specific strength and one useful improvement.</li>
              <li>
                Try the difficult answer again rather than memorizing a script.
              </li>
            </ul>
            <p>
              Our <a href="/ielts-speaking">IELTS speaking guide</a> includes a
              short practice routine and original example questions.
            </p>
          </>
        ),
      },
      {
        id: "finish",
        title: "Finish with a useful next step",
        body: (
          <>
            <p>
              After the call, leave honest partner feedback. If someone behaved
              inappropriately, use the reporting flow rather than continuing the
              conversation. You may leave at any point.
            </p>
            <p>
              Choose one thing to carry into your next call: clearer examples,
              fewer repeated phrases, or a more organized answer. Progress comes
              from a sustainable routine, not a guaranteed number of calls.
            </p>
          </>
        ),
      },
    ],
  },
  "/ielts-speaking": {
    title: "IELTS Speaking Practice Guide | Parts 1, 2 & 3 | PairTalk",
    description:
      "Understand IELTS Speaking Parts 1, 2, and 3. Explore original practice prompts, the four assessment criteria, and a simple partner practice routine.",
    eyebrow: "MAKE YOUR SPEAKING TIME COUNT",
    heading: "Practice the conversation. Understand the test.",
    intro:
      "A practical guide to IELTS Speaking and a thoughtful way to rehearse with a partner. You don’t need a perfect answer to have a useful practice session.",
    sections: [
      {
        id: "format",
        title: "Understand the speaking format",
        body: (
          <>
            <p>
              The official IELTS Speaking test takes 11–14 minutes and has three
              parts. Academic and General Training use the same Speaking format.
              For the authoritative description and current assessment
              materials, use the{" "}
              <a href="https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking">
                official IELTS Speaking format
              </a>
              .
            </p>
            <p>
              PairTalk is an independent peer practice service. A conversation
              with another learner is practice, not a certified mock test or an
              official score assessment.
            </p>
          </>
        ),
      },
      {
        id: "part-1",
        title: "Part 1 · Everyday conversation",
        body: (
          <>
            <p>
              Part 1 covers familiar topics such as your studies, work,
              interests, or surroundings. Practice answering directly, then add
              a reason or a small example. Avoid turning every short question
              into a prepared speech.
            </p>
            <div className="article-callout">
              <span className="eyebrow">ORIGINAL PRACTICE QUESTIONS</span>
              <ul>
                <li>What do you enjoy about the place where you live?</li>
                <li>When do you prefer to study, and why?</li>
                <li>Has the way you listen to music changed?</li>
              </ul>
            </div>
            <p>
              Partner exercise: ask three questions, listen without
              interrupting, and identify one answer that could benefit from a
              clearer example. Then swap roles.
            </p>
          </>
        ),
      },
      {
        id: "part-2",
        title: "Part 2 · Your long turn",
        body: (
          <>
            <p>
              In the test you receive a topic card, have one minute to prepare,
              and speak for one to two minutes. In practice, use short notes to
              organize your ideas rather than writing a full script.
            </p>
            <div className="article-callout">
              <span className="eyebrow">ORIGINAL PRACTICE PROMPT</span>
              <h3>Describe a skill you would like to learn.</h3>
              <p>
                Say what the skill is, why it interests you, how you would
                begin, and how it could change your daily life.
              </p>
            </div>
            <p>
              Partner exercise: time the preparation and long turn. The listener
              notes whether the story was easy to follow. Repeat once with a
              clearer beginning, example, and ending.
            </p>
          </>
        ),
      },
      {
        id: "part-3",
        title: "Part 3 · A deeper discussion",
        body: (
          <>
            <p>
              Part 3 develops the earlier topic into broader questions. Practice
              giving a view, explaining your reasoning, and considering another
              perspective. Concrete examples can make an abstract point easier
              to understand.
            </p>
            <ul>
              <li>
                Why do adults sometimes find it difficult to learn new skills?
              </li>
              <li>How has technology changed the way people learn?</li>
              <li>Should schools give practical skills more time?</li>
            </ul>
            <p>
              Partner exercise: ask a follow-up question such as “Has that
              changed over time?” or “Would everyone agree?” Aim to develop an
              idea rather than force an impressive phrase into every answer.
            </p>
          </>
        ),
      },
      {
        id: "criteria",
        title: "Four areas to listen for",
        body: (
          <>
            <p>
              Official assessment covers fluency and coherence, lexical
              resource, grammatical range and accuracy, and pronunciation. Peer
              feedback can help you notice patterns, but peers may not assess
              these areas reliably enough to predict a band score.
            </p>
            <ul>
              <li>
                <strong>Fluency and coherence:</strong> could your listener
                follow your ideas?
              </li>
              <li>
                <strong>Lexical resource:</strong> could you express the meaning
                and paraphrase when needed?
              </li>
              <li>
                <strong>Grammar:</strong> were your sentences clear, and did you
                use a useful range?
              </li>
              <li>
                <strong>Pronunciation:</strong> were your words and connected
                speech understandable?
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "routine",
        title: "A routine you can repeat",
        body: (
          <>
            <p>
              Try a short warm-up, a long turn for each partner, and a few
              follow-up questions. Reserve time for feedback. Ask your partner
              to name a specific moment rather than give only “good” or “bad.”
            </p>
            <p>
              Finish by choosing one improvement for your next session. If you
              want formal evaluation or targeted instruction, work with a
              qualified teacher. PairTalk provides additional opportunities to
              speak; it does not promise a test result.
            </p>
          </>
        ),
      },
    ],
  },
  "/safety": {
    title: "Safer Speaking Practice | PairTalk Safety Guide",
    description:
      "Protect your personal information, set boundaries, leave uncomfortable calls, and report inappropriate behavior during PairTalk speaking practice.",
    eyebrow: "YOUR COMFORT COMES FIRST",
    heading: "Good conversations have boundaries.",
    intro:
      "You should be able to focus on practice without feeling pressured to share personal information or stay in a conversation.",
    sections: [
      {
        id: "privacy",
        title: "Keep personal information private",
        body: (
          <>
            <p>
              PairTalk displays your alias to partners instead of your Telegram
              contact details. That does not prevent someone from learning
              information you share aloud. Keep your address, phone number,
              school details, passwords, payment information, and private social
              accounts to yourself.
            </p>
            <p>
              You do not need to move to a private chat or another app to
              complete a speaking session. A partner asking for contact
              information is not an obligation to provide it.
            </p>
          </>
        ),
      },
      {
        id: "leave",
        title: "Leave when you need to",
        body: (
          <>
            <p>
              End the call if a partner is abusive, explicit, discriminatory, or
              makes you uncomfortable. You do not need to argue, explain, or
              finish a timed exercise first.
            </p>
            <p>
              Use the post-call reporting flow for inappropriate behavior.
              Describe what happened without including unrelated private
              details. For further help, contact{" "}
              <a href="https://t.me/PairTalkSupport">PairTalk support</a>.
            </p>
          </>
        ),
      },
      {
        id: "money",
        title: "Avoid payment requests from partners",
        body: (
          <>
            <p>
              Speaking partners should not sell services, ask for money, or
              request account verification codes. Purchase PairTalk plans only
              through the service’s own payment flow. Never share a Telegram
              login code with someone claiming to be support.
            </p>
            <p>
              Promises of guaranteed exam scores, paid “official answers,” or
              private investment opportunities do not belong in a practice call.
            </p>
          </>
        ),
      },
      {
        id: "recording",
        title: "Agree before recording",
        body: (
          <>
            <p>
              Recording is optional. Discuss it with your partner before
              starting and respect a refusal. Plan allowances and retention
              apply to recordings stored by PairTalk; they cannot control copies
              someone makes outside the service.
            </p>
            <p>
              Do not post someone’s voice publicly without their permission.
              Read the <a href="/privacy">privacy policy</a> for service data
              and recording retention information.
            </p>
          </>
        ),
      },
      {
        id: "younger-users",
        title: "For younger learners",
        body: (
          <>
            <p>
              The existing terms require users to be at least 13, or the
              applicable minimum age of digital consent, with guardian
              permission when required. Guardians should discuss online
              boundaries and supervise use appropriately.
            </p>
            <p>
              For an immediate threat, seek help from a trusted person or the
              appropriate local emergency service. PairTalk support is not an
              emergency response service.
            </p>
          </>
        ),
      },
    ],
  },
  "/community-guidelines": {
    title: "Community Guidelines | Respectful Practice on PairTalk",
    description:
      "Learn the standards for respectful speaking practice, useful peer feedback, honest ratings, and reporting on PairTalk.",
    eyebrow: "A BETTER CONVERSATION, TOGETHER",
    heading: "Be the partner you would want to meet.",
    intro:
      "PairTalk exists for English speaking practice. A welcoming community depends on respectful behavior and a fair chance for everyone to participate.",
    sections: [
      {
        id: "respect",
        title: "Respect the person behind the voice",
        body: (
          <>
            <p>
              No harassment, hate speech, threats, sexual content, bullying, or
              discrimination. Respect differences in accent, background,
              ability, and opinion. Do not pressure someone to discuss a topic
              they have declined.
            </p>
            <p>
              Give both partners time to speak. Listen patiently; interrupting
              to correct every mistake can make practice less useful.
            </p>
          </>
        ),
      },
      {
        id: "feedback",
        title: "Make feedback specific and kind",
        body: (
          <>
            <p>
              Comment on what your partner said rather than making judgments
              about them. “Your example helped me understand your point” is more
              useful than a vague score. Ask whether they want detailed
              corrections.
            </p>
            <p>
              Ratings should reflect the interaction honestly. Do not trade
              ratings, coordinate fake reviews, or retaliate because someone
              left a call.
            </p>
          </>
        ),
      },
      {
        id: "fair-use",
        title: "Keep the space for practice",
        body: (
          <>
            <p>
              No advertising, commercial solicitation, spam, impersonation, or
              scams. Do not use bots, duplicate accounts, or automated queue
              activity to exploit limits, referrals, or competitions.
            </p>
            <p>
              Protect the service and other learners. Do not attempt to bypass
              security, access another account, or disrupt calls.
            </p>
            <p>
              Do not use PairTalk for dating, sexual solicitation, recruiting,
              political campaigning, gambling, fraud or collecting personal data.
              Do not exchange payment details with a practice partner, impersonate
              a tutor or examiner, or sell access to another account. Gift and
              campaign limits apply to the person using the account; creating
              extra accounts to collect them again is abuse.
            </p>
            <p>
              Ask before recording and stop if either partner withdraws agreement.
              Do not publish, sell, train models on or reuse another person's
              voice without their permission and any consent required by law.
              Use reports honestly and include only details needed for review.
            </p>
          </>
        ),
      },
      {
        id: "reports",
        title: "Reports and moderation",
        body: (
          <>
            <p>
              Leave an inappropriate call and submit a report through the
              post-call flow. Reports and feedback can inform moderation. The
              existing policy allows warnings, temporary suspension, and
              permanent bans depending on the behavior and history.
            </p>
            <p>
              If you believe a restriction was applied incorrectly, use the
              appeal flow offered by the bot or contact support. A report is not
              permission to publish another learner’s private information.
            </p>
          </>
        ),
      },
    ],
  },
  "/faq": {
    title: "PairTalk FAQ | Speaking Partners, Calls, Plans & Privacy",
    description:
      "Answers about IELTS speaking partners on Telegram, free practice, matching, microphones, privacy, recordings, and refunds.",
    eyebrow: "A FEW THINGS BEFORE YOU BEGIN",
    heading: "Questions, meet answers.",
    intro:
      "The practical details of practicing with PairTalk. For account or billing help, contact support through Telegram.",
    sections: faqs.map((f, i) => ({
      id: `question-${i + 1}`,
      title: f.q,
      body: <p>{f.a}</p>,
    })),
  },
  "/privacy": {
    title: "Privacy Policy & Recording Retention | PairTalk",
    description:
      "How PairTalk uses account data, call metadata, optional recordings, and aggregate statistics. Learn about retention and contacting support.",
    eyebrow: "PRIVACY & RECORDING RETENTION",
    heading: "Know what you share.",
    intro:
      "Effective 16 October 2026. PairTalk uses account and session information to provide speaking practice, fulfil purchases and respond to safety concerns. This policy explains that processing and your choices.",
    sections: [
      {
        id: "account-data",
        title: "Account and practice data",
        body: (
          <>
            <p>
              The service stores your numeric Telegram ID, generated alias,
              self-assessed bands and preferences, subscription status, and
              practice activity. Call metadata includes participants, timing,
              duration, status, ratings, and submitted feedback or reports.
              Payment records support billing and refunds.
            </p>
            <p>
              Partners are shown your PairTalk alias rather than your Telegram
              contact information. The public statistics page exposes aggregate
              figures, not account identities, private comments, recordings, or
              payment details.
            </p>
            <p>
              We also keep purchased call, recording and retention balances,
              checkout totals and status, campaign claims, starter-gift eligibility,
              notification preferences, last activity and notification delivery
              outcomes. These records prevent duplicate charges, gifts and claims,
              recover interrupted work and apply your messaging choices. We check
              your channel membership through Telegram when you request the starter
              gift; joining does not subscribe you to private promotional messages.
            </p>
          </>
        ),
      },
      {
        id: "audio",
        title: "Voice calls and optional recordings",
        body: (
          <>
            <p>
              Voice calls use WebRTC transport encryption and media
              infrastructure. Transport encryption is not a promise of
              end-to-end encryption inaccessible to the media service.
            </p>
            <p>
              Cloud recording is optional and requires agreement. Purchased recordings
              have optional 30-day storage from creation. Without storage, a server
              copy is kept only for delivery recovery, up to 24 hours, and may be
              removed after all owners receive it in Telegram. Legacy Free, Plus,
              Pro and Boss recording entitlements retain their original retention
              rules. Check History for the file’s exact availability. Expired
              recordings are scheduled for deletion and cannot be restored after removal.
            </p>
          </>
        ),
      },
      {
        id: "service-providers",
        title: "Service infrastructure",
        body: (
          <>
            <p>
              Telegram provides account authentication and the Mini App
              environment. LiveKit infrastructure handles calls, PostgreSQL and
              Redis support service state, and configured object storage
              supports recordings. Hosting and security infrastructure process
              technical requests needed to operate the website and app.
            </p>
            <p>
              Do not assume that a partner alias makes everything you say
              anonymous. Keep identifying information out of conversations and
              avoid publishing another person’s audio without permission.
            </p>
            <p>
              Hosting, media delivery and storage providers may process information
              outside your country. Telegram receives messages and delivered audio
              under its own privacy policy. Private calls are not represented as
              public question-library data. Do not submit confidential information
              in speaking prompts, reports or support messages.
            </p>
          </>
        ),
      },
      {
        id: "rights",
        title: "Access, deletion, and support",
        body: (
          <>
            <p>
              You can view your current account settings, plan, and call history
              in the app. The existing policy provides for requests to access or
              delete account data through{" "}
              <a href="https://t.me/PairTalkSupport">@PairTalkSupport</a> or the
              bot’s billing support command, <code>/paysupport</code>. Its
              support team will explain the request and any verification needed.
            </p>
            <p>
              Contact support for questions about a recording, payment record,
              or data request. Do not post private account information in a
              public channel.
            </p>
            <p>
              Necessary account, payment, fraud-prevention and dispute records may
              need to remain after account closure for the purposes for which they
              are required. Deleting PairTalk data does not delete files already
              delivered to Telegram, downloaded by another participant or retained
              by that participant. Ask support about a specific record or request.
            </p>
          </>
        ),
      },
      {
        id: "refunds",
        title: "Payments and refunds",
        body: (
          <>
            <p>
              A full unused purchase can be refunded within 48 hours if
              the complete purchased quantities remain available and unreserved.
              Use /refund in Telegram. Eligible Stars refunds return the original
              payment. Existing subscription purchases keep their original
              48-hour or less-than-10%-used eligibility rules and applicable
              account restrictions. Supported legacy card refunds are reviewed
              and ordinarily settle within 1–3 business days.
            </p>
            <p>
              See the <a href="/terms#payments">subscription terms</a> and
              contact billing support for your specific transaction.
            </p>
            <p>
              New UZS pack payments are manually verified. Request a refund
              through /refund from the paying account. While a full unused-purchase
              refund is reviewed, its quantities are reserved and cannot be spent.
              Confirmation completes the refund; a rejected refund restores that
              reservation once. A provider's pending or uncertain response is not
              a completed refund. Contact /paysupport before submitting a second
              payment or another refund for the same transaction.
            </p>
            <p>
              Free gifts and zero-price offers have no payment to return. Partial
              pack refunds are not automated. Purchase and account checks apply,
              but this policy does not remove mandatory rights under applicable
              law. Processing time can depend on the payment provider and review;
              we do not promise instant settlement.
            </p>
          </>
        ),
      },
    ],
  },
  "/terms": {
    title: "Terms of Service | PairTalk Speaking Practice",
    description:
      "PairTalk service terms: eligibility, peer practice, fair use, subscriptions, refunds, intellectual property, and support.",
    eyebrow: "TERMS OF SERVICE",
    heading: "The terms of practicing together.",
    intro:
      "Effective 16 October 2026. These terms cover PairTalk peer speaking practice, purchases, public offers, recordings and account use. Read them and the privacy policy before agreeing in the bot.",
    sections: [
      {
        id: "eligibility",
        title: "Acceptance and eligibility",
        body: (
          <>
            <p>
              By accessing or using PairTalk through the website, Telegram bot,
              or Mini App, you agree to these terms. If you do not agree, do not
              use the service.
            </p>
            <p>
              Registration in the Telegram bot requires reading the versioned
              Terms of Use PDF and explicitly agreeing before continuing. You
              can request the document again using <code>/terms</code>.
              Recording a call requires separate agreement with your partner.
            </p>
            <p>
              You must be at least 13 years old, or the minimum age of digital
              consent in your jurisdiction. Users under the age of majority
              require parent or guardian permission. A valid Telegram account is
              required and you must meet Telegram's current age rules, including
              any higher regional minimum. Guardian permission does not bypass
              Telegram's eligibility rules. You are responsible for your account's security. Creating multiple
              accounts or automated accounts to exploit rewards or rankings is
              prohibited.
            </p>
          </>
        ),
      },
      {
        id: "service",
        title: "Peer practice and its limits",
        body: (
          <>
            <p>
              PairTalk connects learners for IELTS speaking simulations and
              conversational practice. Partners are peers. PairTalk does not
              issue official IELTS certificates or test report forms and does
              not guarantee any examination result.
            </p>
            <p>
              Follow the{" "}
              <a href="/community-guidelines">community guidelines</a> and{" "}
              <a href="/safety">safety guide</a>. Harassment, hate speech,
              explicit content, commercial solicitation, automated abuse, and
              attempts to compromise the service are prohibited. Violations can
              result in warnings, temporary suspension, or permanent bans.
            </p>
          </>
        ),
      },
      {
        id: "payments",
        title: "Calls, recordings, payments, and legacy subscriptions",
        body: (
          <>
            <p>
              New eligible accounts can claim three one-time 15-minute call units
              after joining @pairtalk and passing a server membership check.
              Leaving and rejoining does not repeat the gift. Previously granted
              balances remain available. Paid calls and recordings do not expire
              before use and do not renew automatically. Choose a 15- or 30-minute
              duration; a 30-minute call or recording uses two 15-minute units and
              costs exactly twice its rounded 15-minute price in the same currency.
              Recordings cannot exceed the calls in a purchased pack. Optional
              retention covers every recording in that pack and lasts 30 days
              from audio creation. Without retention, server copies are removed
              after confirmed delivery or within a 24-hour recovery window.
              Telegram may retain a delivered copy independently.
            </p>
            <p>
              Prices are set by the administrator and shown before checkout.
              The initial 15-minute prices are 3,500 UZS per call and 4,200 UZS
              per recording, plus 3 UZS per recording for 30-day retention.
              Stars are calculated separately for each 15-minute service: divide
              its UZS price by the editable UZS-per-Star reference, add 25 percent
              and round up to a whole Star. The initial reference is 255 UZS,
              based on the owner's 100 Stars for 25,500 UZS reference. This gives
              18 Stars per 15-minute call and 21 Stars per recording. Retention
              is calculated once for the pack and rounded up separately. Regional
              taxes, app-store charges and purchase methods can change what you
              pay to acquire Stars; the reference is not a guaranteed exchange rate.
              Your approved order keeps its recorded total if prices later change.
            </p>
            <p>
              Stars payments use Telegram's official invoice. Where the UZS
              option is offered, choosing it queues private bot payment instructions
              and closes the Mini App. Pending instructions or a submitted receipt
              do not add a balance: the administrator must verify the transfer.
              Check the order number, payee and total, and submit proof before the
              checkout deadline. Contact /paysupport if you transferred money but
              the checkout expired or delivery is uncertain; do not pay again.
              Existing subscriptions retain their original purchase terms.
            </p>
            <p>
              A full purchase refund can be requested within 48 hours of
              payment when the complete purchased quantities remain available and
              unreserved. Failed connections and calls with fewer than five
              authorised seconds return
              their reserved call; failed recording exports return recording and
              storage add-ons. Existing subscription refunds keep their original rules. Use{" "}
              <code>/refund</code> or contact support. See the{" "}
              <a href="/refund-policy">refund policy</a> for payment-specific
              settlement information.
            </p>
          </>
        ),
      },
      {
        id: "offers-and-reminders",
        title: "Public offers and optional reminders",
        body: (
          <>
            <p>
              Discount packs are published in @pairtalk and shown in Plans.
              Each campaign can be purchased once per account, subject to the
              displayed participant count and expiry. The discount is applied
              to the complete original pack total separately in UZS and Stars,
              with the result rounded up to whole currency units. A 20 percent
              discount means paying 80 percent of the original total. A 100
              percent offer is claimed without a payment invoice.
            </p>
            <p>
              An unpaid checkout can temporarily reserve a place for up to 30
              minutes or until the offer ends, whichever comes first. Starting
              checkout does not guarantee a purchase after that deadline. New
              claims stop when the campaign sells out or expires, even if an old
              channel message remains visible. Already authorised payments are
              honoured. Cancel an unpaid checkout before choosing a different
              currency; a payment awaiting confirmation must be resolved first.
              Refunds do not make a campaign claim reusable.
            </p>
            <p>
              Practice, unfinished-checkout, peak-activity and community reminders
              are optional and start off. Choose categories and quiet hours in
              Account or use /notifications. Use /stop_notifications to stop
              optional private messages. We apply at least 24 hours between
              optional reminders and recheck relevance before sending. Joining
              the channel does not enable these messages. Requested receipts,
              necessary account notices and safety messages are separate.
            </p>
          </>
        ),
      },
      {
        id: "intellectual-property",
        title: "Intellectual property and independence",
        body: (
          <>
            <p>
              PairTalk software, designs, logos, and algorithms are the
              platform’s proprietary intellectual property. References to IELTS
              criteria and formats are for educational description.
            </p>
            <p>
              IELTS is a trademark of its owners. PairTalk is not affiliated
              with, endorsed by, or sponsored by Cambridge, the British Council,
              or IDP. Official format and assessment information should be
              checked with <a href="https://ielts.org">IELTS</a>.
            </p>
          </>
        ),
      },
      {
        id: "liability",
        title: "Availability and liability",
        body: (
          <>
            <p>
              PairTalk is provided “as is” and “as available,” without
              warranties of any kind. The service is not responsible for the
              personal conduct, opinions, or statements of speaking partners,
              and provides tools to leave and report calls.
            </p>
            <p>
              To the maximum extent permitted by applicable law, PairTalk’s
              aggregate liability for claims arising out of or related to these
              terms shall not exceed the amount paid by the user to PairTalk in
              the three months preceding the incident.
            </p>
            <p>
              PairTalk is intended for educational peer speaking practice. You
              are responsible for unlawful or prohibited use, your statements,
              the information you disclose and any unauthorised redistribution
              of another person's audio. We do not approve private arrangements
              between participants. These limits do not exclude rights that
              cannot lawfully be excluded, or remove our responsibility where
              applicable law requires it. Reports are reviewed but continuous
              live supervision and immediate moderation are not promised.
            </p>
          </>
        ),
      },
      {
        id: "changes",
        title: "Changes and contact",
        body: (
          <>
            <p>
              The service may amend its terms. Material changes are communicated
              through the Telegram bot or an updated terms page. A new versioned
              agreement requires explicit acceptance in the bot before registered
              practice continues. A later price change applies to new checkouts;
              it does not rewrite an already authorised payment.
            </p>
            <p>
              For account, billing, privacy, or terms questions, contact{" "}
              <a href="https://t.me/PairTalkSupport">@PairTalkSupport</a>.
            </p>
          </>
        ),
      },
    ],
  },
};

// Keep the dedicated policy consistent with the reviewed payment policy.
pages["/refund-policy"] = {
  title: "Refund Policy | PairTalk",
  description: "PairTalk refund eligibility, Telegram Stars and card payment handling, and how to request a refund through the bot.",
  eyebrow: "Refund policy",
  heading: "Refund policy",
  intro: "Request a refund through the PairTalk bot. Eligibility depends on your purchase, usage and account status.",
  sections: [
    { id: "eligibility", title: "When a refund may be available", body: pages["/privacy"].sections.find(section => section.id === "refunds")!.body },
    { id: "request", title: "How to request a refund", body: <><p>Use <code>/refund</code> in the PairTalk bot from the account that made the purchase. Choose the purchase and follow the bot’s instructions. The bot checks purchase ownership, payment state and eligibility before proceeding.</p><p>For help with a specific transaction, use <code>/paysupport</code> or contact <a href="https://t.me/PairTalkSupport">PairTalk support</a>. Keep receipt and account information out of public channels.</p></> },
    { id: "related", title: "Related policies", body: <p>Read the <a href="/terms#payments">payment terms</a> and <a href="/privacy">privacy policy</a> for payment records and service conditions.</p> },
  ],
};
