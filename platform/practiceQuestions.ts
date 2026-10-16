import type { SectionQuestion } from "./SectionFaq";

export const pricingQuestions: SectionQuestion[] = [
  {question:"How are 15- and 30-minute prices counted?",answer:"A 30-minute call or recording costs twice the rounded 15-minute price and uses two balance units. Recordings cannot exceed calls in your pack. Selecting retention adds it for every selected recording."},
  {question:"How do you calculate Stars?",answer:"For each 15-minute call or recording, divide its UZS price by the admin's UZS-per-Star reference, add 25%, then round up to a whole Star. The initial reference is 255 UZS, based on the owner's 100 Stars = 25,500 UZS reference. Retention is rounded up once for the whole pack. Checkout shows the exact total."},
  {question:"Do I need a subscription?",answer:"No. Choose the calls and recordings you want. Purchased balances do not renew monthly and do not expire before use. Existing subscription benefits remain available under their original terms."},
  {question:"Do I have to buy recordings?",answer:"No. Calls work without recording. A recording includes both voices and requires both partners’ agreement. Retention is optional and applies to each recording you select."},
  {question:"What does 30-day retention mean?",answer:"The 30 days start when the audio is created, not when you buy it. Without retention, server copies are temporary delivery copies, removed after confirmed delivery or within 24 hours. Download your own copy from Telegram."},
  {question:"Why can the UZS and Stars amounts differ?",answer:"Buying Stars can cost different amounts by region, store and local tax. Review both totals before paying; a UZS price reference is not a guarantee of the amount your store charges for Stars."},
  {question:"What happens if a call or recording fails?",answer:"Failed connections and calls under five authorised seconds return the reserved call balance. A recording is charged when a usable audio file is ready; failed exports return its recording and retention balance. Reconnecting to the same call does not charge again."},
  {question:"Can I get a refund?",answer:"A full purchase refund is available within 48 hours when all purchased quantities remain unused and unreserved. Use /refund in the bot. Pending payments and older subscription purchases follow their applicable payment status and original refund terms."},
];
export const practiceQuestions: SectionQuestion[] = [
  {question:"How quickly will I find a partner?",answer:"Searching starts immediately. The time to connect depends on compatible learners being online. Your self-assessed speaking level helps find a suitable partner; it is not an official IELTS band score."},
  {question:"What should we talk about?",answer:"Use the IELTS Part 1, 2 and 3 prompts in the call, take turns and leave space for your partner to answer. PairTalk is peer speaking practice; your partner is not a paid tutor or certified examiner."},
  {question:"What if someone makes me uncomfortable?",answer:"End the call and report the partner from the after-call screen or History. Do not share private contact, financial or identity information. Use the platform for respectful speaking practice, not unsolicited sales or harassment."},
];
export const recordingQuestions: SectionQuestion[] = [
  {question:"Can I record without my partner’s permission?",answer:"No. Agree before recording, and respect a request to stop. An available recording button does not replace your partner’s consent."},
  {question:"Where can I find my audio?",answer:"Open History to view available recordings or send them to Telegram. Availability depends on delivery and the selected retention period. Keep your own copy if you need it after the server copy expires."},
];
export const offerQuestions: SectionQuestion[] = [
  {question:"Can I claim an offer more than once?",answer:"Each person can claim a campaign once. Repeated taps resume the current checkout; they do not create additional claims. Later campaigns can be claimed separately. A refund does not reset the campaign claim."},
  {question:"Why is an offer temporarily reserved?",answer:"Unpaid checkouts hold their places for up to 30 minutes or until the offer expires. If all remaining places are held, try later. New claims stop at expiry or when every place is purchased, even if an old channel post is still visible."},
];
export const accountQuestions: SectionQuestion[] = [
  {question:"Does joining @pairtalk enable private reminders?",answer:"No. Joining lets the server verify starter-gift eligibility. Optional private reminders start off. Enable categories in Account, or use /notifications in the bot. /stop_notifications stops optional reminders; requested receipts and essential account notices still arrive."},
  {question:"Can I update my speaking level?",answer:"Yes. Edit your speaking scores in Account. Matching uses your self-assessment and available learners; these scores are not official IELTS results."},
];
export const partnerQuestions: SectionQuestion[] = [
  {question:"How do saved-partner invitations work?",answer:"Save a partner after a call, then invite them from Partners when they are available. Invitations expire after 60 seconds and need acceptance. Both people need an available call allowance. Do not disturb pauses invitations."},
];
export const inviteQuestions: SectionQuestion[] = [
  {question:"When is an invitation bonus added?",answer:"The invitee must complete a qualifying call of at least 30 seconds. A bonus call is then added under the referral rules. Creating extra accounts or arranging fake calls to collect rewards is prohibited."},
];
export const safetyQuestions: SectionQuestion[] = [
  {question:"What should I do about abusive behavior?",answer:"End the call, then report the partner from the after-call screen or History. Include relevant details, keep private information out of public channels and use /appeal or support if you believe a restriction is mistaken."},
  {question:"Is speaking practice monitored live?",answer:"Continuous live supervision is not promised. Use the leave and report controls, do not share sensitive information, and get agreement before recording. PairTalk is for educational peer practice."},
];
export const privacyQuestions: SectionQuestion[] = [
  {question:"Does an alias make me anonymous?",answer:"Your partner sees a practice alias, but PairTalk still processes account IDs, call metadata, payments and requested recordings. Your voice or details you say may identify you. Transport encryption is not a promise that the media service cannot access the call."},
  {question:"Does deleting my account delete Telegram copies?",answer:"No. Files delivered to Telegram or downloaded by a participant are outside PairTalk's server deletion process. Contact support for account data requests and information about records needed for payments or disputes."},
];
