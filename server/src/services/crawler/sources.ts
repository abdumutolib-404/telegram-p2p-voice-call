import { IeltsPart } from '@prisma/client';

export interface RawCandidateQuestion {
  part: IeltsPart;
  questionText: string;
  cueCardBullets?: string | null;
  questionType?: string;
  suggestedTopicSlug?: string;
  extractedTopicName?: string;
  source: string;
  sourceUrl?: string;
}

export interface CrawlTargetSource {
  name: string;
  url: string;
  suggestedTopicSlug?: string;
  category: 'RECALL_FEED' | 'OFFICIAL_ARCHIVE' | 'COMMUNITY_BLOG';
  enabled: boolean;
}

export const VERIFIED_CRAWLER_TARGETS: CrawlTargetSource[] = [
  {
    name: 'IELTS Liz Speaking Part 1 Topic Bank',
    url: 'https://ieltsliz.com/ielts-speaking-part-1-topics/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Liz Speaking Part 2 & 3 Topics & Cue Cards',
    url: 'https://ieltsliz.com/ielts-speaking-part-2-topics-cue-cards/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Material Speaking Actual Tests Recent Recalls',
    url: 'https://ieltsmaterial.com/ielts-speaking-actual-tests-questions/',
    category: 'RECALL_FEED',
    enabled: true,
  },
  {
    name: 'IELTS Advantage Speaking Master Hub',
    url: 'https://www.ieltsadvantage.com/speaking/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Advantage Speaking Part 1 Topics',
    url: 'https://www.ieltsadvantage.com/speaking/ielts-speaking-part-1/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Advantage Speaking Part 2 Cue Cards',
    url: 'https://www.ieltsadvantage.com/speaking/ielts-speaking-part-2/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Advantage Speaking Part 3 Discussion',
    url: 'https://www.ieltsadvantage.com/speaking/ielts-speaking-part-3/',
    category: 'COMMUNITY_BLOG',
    enabled: true,
  },
  {
    name: 'IELTS Mentor Speaking Sample Part 1 Index',
    url: 'https://ielts-mentor.com/speaking-sample/ielts-speaking-part-1',
    category: 'OFFICIAL_ARCHIVE',
    enabled: true,
  },
  {
    name: 'Cambridge IELTS Actual Test Recalls Part 2',
    url: 'https://ielts-mentor.com/speaking-sample/ielts-speaking-part-2',
    category: 'OFFICIAL_ARCHIVE',
    enabled: true,
  },
  {
    name: 'Cambridge IELTS Actual Test Recalls Part 3 Discussion',
    url: 'https://ielts-mentor.com/speaking-sample/ielts-speaking-part-3',
    category: 'OFFICIAL_ARCHIVE',
    enabled: true,
  },
];

export const OFFICIAL_2026_EXAM_FORECAST_BANK: RawCandidateQuestion[] = [
  // ==========================================
  // TOPIC 1: TECHNOLOGY & ARTIFICIAL INTELLIGENCE
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you frequently use artificial intelligence tools in your daily study or work routine?',
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How has mobile technology changed the way you communicate with family and friends?',
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you think robot technology will replace human assistants in shops and customer service?',
    suggestedTopicSlug: 'technology-digital-life',
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
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a website or digital application that you find extremely useful for learning new concepts.',
    cueCardBullets: JSON.stringify([
      'What website or app it is',
      'How you first discovered it',
      'What kind of knowledge or information it provides',
      'And explain why you prefer it over other digital platforms',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'In what ways do you think automated artificial intelligence systems will transform traditional employment sectors over the coming decade?',
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Do you believe children are becoming too reliant on digital screens for entertainment and basic problem-solving?',
    suggestedTopicSlug: 'technology-digital-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 2: ENVIRONMENT & SUSTAINABILITY
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Are there any quiet green parks near your neighborhood where people can relax?',
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How do weather changes in your country affect your daily outdoor activities?',
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What environmental issues are people in your home country most concerned about right now?',
    suggestedTopicSlug: 'environment-nature-wildlife',
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
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a beautiful natural place or scenic landscape that you would like to revisit in the future.',
    cueCardBullets: JSON.stringify([
      'Where this place is located',
      'When and with whom you first visited it',
      'What distinctive natural features made it memorable',
      'And explain why preserving such natural scenery is important for future generations',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Should individual citizens or large corporate enterprises bear greater responsibility for reducing environmental waste and carbon emissions?',
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How can municipal governments encourage citizens to adopt renewable energy and public transportation?',
    suggestedTopicSlug: 'environment-nature-wildlife',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 3: EDUCATION & CAREER
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you prefer learning new skills online or in a traditional physical classroom?',
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What subject did you find most challenging when you were studying at secondary school?',
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you think people should continue learning new professional skills throughout their whole life?',
    suggestedTopicSlug: 'education-learning',
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
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a difficult practical skill you learned as an adult that required a lot of persistent practice.',
    cueCardBullets: JSON.stringify([
      'What the skill was and why you decided to learn it',
      'Who taught you or how you practiced it on your own',
      'What difficulties or moments of frustration you encountered',
      'And explain how mastering this skill has boosted your personal confidence',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'To what extent does formal academic education prepare young individuals for the psychological and practical demands of modern adulthood?',
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Do you think practical apprenticeships are as valuable as university degrees in today’s evolving job market?',
    suggestedTopicSlug: 'education-learning',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 4: WORK & AMBITION
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'What kind of work or career path would you like to pursue in the upcoming five years?',
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you find it easy to balance your professional workload with personal relaxation?',
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
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
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a successful businessperson or entrepreneur whom you admire.',
    cueCardBullets: JSON.stringify([
      'Who this person is and what company they built',
      'How they started their business journey',
      'What leadership traits or innovations made them successful',
      'And explain what lessons you draw from their professional achievements',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Why do you think personal ambitions and career goals change as individuals transition into different stages of their life?',
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Is financial compensation the most crucial factor when employees decide whether to remain in a long-term position?',
    suggestedTopicSlug: 'work-career-ambition',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 5: TRAVEL & GLOBAL TOURISM
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you prefer traveling alone, with close friends, or with family members?',
    suggestedTopicSlug: 'travel-tourism-transport',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What kind of souvenirs or tokens do you typically bring home when you visit a new place?',
    suggestedTopicSlug: 'travel-tourism-transport',
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
    suggestedTopicSlug: 'travel-tourism-transport',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe an ancient historic city or architectural monument you visited that fascinated you.',
    cueCardBullets: JSON.stringify([
      'Where it is and what historical period it belongs to',
      'What the architecture or atmosphere felt like in person',
      'What interesting historical story you discovered there',
      'And explain why preserving historic monuments is vital for global heritage',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'travel-tourism-transport',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How has international travel influenced the preservation or modernization of local cultural traditions around the world?',
    suggestedTopicSlug: 'travel-tourism-transport',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Can excessive mass tourism damage delicate natural ecosystems and historical heritage sites?',
    suggestedTopicSlug: 'travel-tourism-transport',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 6: ART, CULTURE & HERITAGE
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Did you enjoy drawing, painting, or sculpting when you were a child?',
    suggestedTopicSlug: 'art-music-culture',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you enjoy visiting public art galleries or history museums in your free time?',
    suggestedTopicSlug: 'art-music-culture',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a traditional cultural festival or celebration in your country that you find particularly vibrant.',
    cueCardBullets: JSON.stringify([
      'What the festival is and when it takes place',
      'What special foods, garments, or rituals are associated with it',
      'How your family and local community participate',
      'And explain why this tradition holds a special place in your cultural identity',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'art-music-culture',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Why is it important for governments to subsidize public arts, museums, and classical music?',
    suggestedTopicSlug: 'art-music-culture',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 7: HEALTH, SPORTS & LIFESTYLE
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'What kind of sports or physical exercises do you enjoy to stay energetic?',
    suggestedTopicSlug: 'health-fitness-sports',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you find it easy to maintain regular sleeping habits and wake up early?',
    suggestedTopicSlug: 'health-fitness-sports',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a healthy lifestyle habit that you recently adopted to improve your physical or mental well-being.',
    cueCardBullets: JSON.stringify([
      'What the habit is and when you initiated it',
      'Why you felt it was necessary to change your daily routine',
      'How challenging it was to sustain this habit consistently',
      'And explain what noticeable benefits you have observed since adopting it',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'health-fitness-sports',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Why are sedentary lifestyle diseases becoming more prevalent among urban populations worldwide?',
    suggestedTopicSlug: 'health-fitness-sports',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 8: FOOD & CULINARY ARTS
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you prefer cooking meals at home or eating at local restaurants with friends?',
    suggestedTopicSlug: 'food-dining-culinary',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What traditional dishes from your home country would you recommend to a foreign tourist?',
    suggestedTopicSlug: 'food-dining-culinary',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a memorable dinner or special meal you had with friends or family on an important occasion.',
    cueCardBullets: JSON.stringify([
      'Where and when the meal took place',
      'Who shared the meal with you and what occasion was celebrated',
      'What distinctive dishes were served',
      'And explain why that particular meal remains vivid and meaningful in your memory',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'food-dining-culinary',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How has the globalization of international fast-food chains impacted traditional dietary culture?',
    suggestedTopicSlug: 'food-dining-culinary',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 9: HOMETOWN & URBAN LIFE
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'What do you like most about the city or town where you currently live?',
    suggestedTopicSlug: 'hometown-urban-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Has your hometown changed significantly over the past ten years?',
    suggestedTopicSlug: 'hometown-urban-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe an exciting public facility or community center in your town that people enjoy visiting.',
    cueCardBullets: JSON.stringify([
      'Where it is located and what it offers',
      'How often you and other residents visit it',
      'What activities or events take place there',
      'And explain how this facility contributes to the social cohesion of your community',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'hometown-urban-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'What are the main advantages and challenges of living in a densely populated megacity versus a peaceful countryside town?',
    suggestedTopicSlug: 'hometown-urban-life',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 10: MEDIA, SOCIAL PLATFORMS & ENTERTAINMENT
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Where do you usually find out about current domestic and international news events?',
    suggestedTopicSlug: 'media-entertainment',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'What kinds of podcasts, radio programs, or audio broadcasts do you enjoy listening to?',
    suggestedTopicSlug: 'media-entertainment',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe an impactful film, documentary, or television series that gave you a new perspective on life.',
    cueCardBullets: JSON.stringify([
      'What the film or series was and when you watched it',
      'Who the main characters were or what social theme it explored',
      'What scenes or plot twists made a strong impression on you',
      'And explain why this story influenced your thoughts or worldview',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'media-entertainment',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How has algorithmic content curation on social media influenced public discourse and polarization?',
    suggestedTopicSlug: 'media-entertainment',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 11: SCIENCE & FUTURE INNOVATION
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Did you find science experiments exciting when you studied biology or physics at school?',
    suggestedTopicSlug: 'science-space-innovation',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you enjoy gazing at the stars or reading about space exploration missions?',
    suggestedTopicSlug: 'science-space-innovation',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a scientific breakthrough or medical discovery that you think will have the greatest impact on human longevity.',
    cueCardBullets: JSON.stringify([
      'What the discovery or scientific field is',
      'When and how you first learned about it',
      'How it works or how it will be applied in everyday medicine',
      'And explain whether this breakthrough could bring unintended ethical or social consequences',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'science-space-innovation',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Is space exploration worth the astronomical governmental funding when billions of people face terrestrial poverty and climate crises?',
    suggestedTopicSlug: 'science-space-innovation',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 12: PSYCHOLOGY & HUMAN RELATIONSHIPS
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you prefer having a broad circle of casual acquaintances or a small group of very close friends?',
    suggestedTopicSlug: 'family-friends-people',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How do you usually calm your thoughts when you experience high pressure or nervous anxiety?',
    suggestedTopicSlug: 'family-friends-people',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a situation where an unexpected stranger offered you genuine kindness or assistance.',
    cueCardBullets: JSON.stringify([
      'Where and when this incident occurred',
      'What dilemma or difficulty you were experiencing',
      'What the stranger did to assist you without expecting anything in return',
      'And explain how this selfless act changed your view of human nature',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'family-friends-people',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'In our fast-paced modern society, why do many people find it increasingly difficult to establish deep and enduring friendships?',
    suggestedTopicSlug: 'family-friends-people',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  // ==========================================
  // TOPIC 13: FASHION, CLOTHING & ACCESSORIES
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Do you enjoy shopping for fashionable clothes or do you prefer practical everyday outfits?',
    suggestedTopicSlug: 'fashion-clothing-accessories',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you often wear accessories such as wristwatches, jewelry, or sunglasses when going out?',
    suggestedTopicSlug: 'fashion-clothing-accessories',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a special piece of clothing or accessory you wore for an important event.',
    cueCardBullets: JSON.stringify([
      'What item of clothing or accessory it was',
      'Where and why you acquired it',
      'For what special occasion you wore it',
      'And explain how you felt wearing it',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'fashion-clothing-accessories',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'Why do you think fast fashion has become so prevalent globally, and what are its drawbacks?',
    suggestedTopicSlug: 'fashion-clothing-accessories',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 14: LEISURE, HABITS & DAILY ROUTINE
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'What is your typical morning routine before starting your daily studies or work tasks?',
    suggestedTopicSlug: 'leisure-habits-daily',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'How do you usually spend your weekend leisure time to relax and unwind?',
    suggestedTopicSlug: 'leisure-habits-daily',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a daily habit or routine that helps you remain focused and productive.',
    cueCardBullets: JSON.stringify([
      'What the habit or routine is',
      'When and how you first established it',
      'How much time you dedicate to it each day',
      'And explain how it contributes to your overall daily balance',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'leisure-habits-daily',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'How has the balance between leisure time and professional commitments shifted over recent generations?',
    suggestedTopicSlug: 'leisure-habits-daily',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

  // ==========================================
  // TOPIC 15: SOCIETY, LAW & COMMUNITY
  // ==========================================
  {
    part: 'PART_1',
    questionText: 'Have you ever taken part in any volunteer work or community support activities?',
    suggestedTopicSlug: 'society-law-community',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_1',
    questionText: 'Do you think rules and regulations in public spaces are strictly observed in your country?',
    suggestedTopicSlug: 'society-law-community',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_2',
    questionText: 'Describe a public rule or community project that significantly improved safety or welfare in your area.',
    cueCardBullets: JSON.stringify([
      'What rule or community project it was',
      'How it was organized or enforced',
      'Who benefited most from this initiative',
      'And explain why you consider it an important societal contribution',
    ]),
    questionType: 'CUE_CARD',
    suggestedTopicSlug: 'society-law-community',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },
  {
    part: 'PART_3',
    questionText: 'To what extent should citizens be held personally responsible for the welfare and safety of their local communities?',
    suggestedTopicSlug: 'society-law-community',
    source: 'IELTS_2026_EXAM_FORECAST',
    sourceUrl: 'https://pairtalk.online/docs/forecast',
  },

];
