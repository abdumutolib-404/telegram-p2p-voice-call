import { IeltsPart } from '@prisma/client';

export interface RawCandidateQuestion {
  part: IeltsPart;
  questionText: string;
  cueCardBullets?: string | null;
  questionType?: string;
  suggestedTopicSlug?: string;
  source: string;
  sourceUrl?: string;
}

export const OFFICIAL_2026_EXAM_FORECAST_BANK: RawCandidateQuestion[] = [
  // PART 1 - Technology & AI
  {
    part: 'PART_1',
    questionText: 'Do you frequently use artificial intelligence tools in your daily study or work routine?',
    suggestedTopicSlug: 'technology-ai',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How has mobile technology changed the way you communicate with family and friends?',
    suggestedTopicSlug: 'technology-ai',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you prefer learning new skills online or in a traditional physical classroom?',
    suggestedTopicSlug: 'education-career',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  // PART 1 - Hometown & Environment
  {
    part: 'PART_1',
    questionText: 'What do you like most about the city or town where you currently live?',
    suggestedTopicSlug: 'hometown-urban-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Are there any quiet green parks near your neighborhood where people can relax?',
    suggestedTopicSlug: 'environment-sustainability',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How do weather changes in your country affect your daily outdoor activities?',
    suggestedTopicSlug: 'environment-sustainability',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  // PART 1 - Daily Life & Food
  {
    part: 'PART_1',
    questionText: 'Do you prefer cooking meals at home or eating at local restaurants with friends?',
    suggestedTopicSlug: 'food-culinary',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What kind of sports or physical exercises do you enjoy to stay energetic?',
    suggestedTopicSlug: 'health-lifestyle',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // PART 2 - Cue Cards (with structured bullet points & prep instructions)
  {
    part: 'PART_2',
    questionText: 'Describe an ambitious goal or project that you have been working towards for a long time.',
    cueCardBullets: JSON.stringify([
      'What this ambition or project is',
      'When you first decided to pursue it',
      'What obstacles or challenges you have encountered along the way',
      'And explain why achieving this goal is particularly meaningful for your future',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'work-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a memorable journey or trip you took that did not go according to your original plan.',
    cueCardBullets: JSON.stringify([
      'Where and when you were traveling',
      'Who was accompanying you on the journey',
      'What unexpected difficulty or event occurred',
      'And explain how you managed the situation and what you learned from the experience',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'travel-tourism',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe an environmental rule or community regulation that you believe should be introduced in your city.',
    cueCardBullets: JSON.stringify([
      'What the regulation or rule would be',
      'How it would be implemented in your city',
      'What positive impacts it would produce on public health and nature',
      'And explain whether you think citizens would cooperate willingly with this rule',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'environment-sustainability',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a piece of modern electronic equipment or software that has significantly improved your daily productivity.',
    cueCardBullets: JSON.stringify([
      'What the device or software is',
      'How often and in what situations you utilize it',
      'What key features make it especially practical or convenient',
      'And explain how your daily life would be different if you no longer had access to it',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'technology-ai',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe an inspiring teacher, mentor, or older person who had a profound influence on your life choices.',
    cueCardBullets: JSON.stringify([
      'Who this person is and how you first met them',
      'What memorable advice or guidance they shared with you',
      'What qualities made their personality or teaching style exceptional',
      'And explain why their mentorship remains influential in your life today',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'education-career',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // PART 3 - Abstract Discussion Prompts
  {
    part: 'PART_3',
    questionText: 'In what ways do you think automated artificial intelligence systems will transform traditional employment sectors over the coming decade?',
    suggestedTopicSlug: 'technology-ai',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Should individual citizens or large corporate enterprises bear greater responsibility for reducing environmental waste and carbon emissions?',
    suggestedTopicSlug: 'environment-sustainability',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How has international travel influenced the preservation or modernization of local cultural traditions around the world?',
    suggestedTopicSlug: 'art-culture',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Why do you think personal ambitions and career goals change as individuals transition into different stages of their life?',
    suggestedTopicSlug: 'work-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'To what extent does formal academic education prepare young individuals for the psychological and practical demands of modern adulthood?',
    suggestedTopicSlug: 'education-career',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
];
