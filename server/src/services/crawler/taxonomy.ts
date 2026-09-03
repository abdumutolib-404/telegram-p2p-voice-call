export interface TopicDefinition {
  name: string;
  slug: string;
  description: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  relevance: number;
}

export const SEED_TOPICS: TopicDefinition[] = [
  {
    name: 'Technology & AI',
    slug: 'technology-ai',
    description: 'Artificial intelligence, digital devices, internet, automation, and tech impacts on daily life.',
    primaryKeywords: ['ai', 'artificial intelligence', 'robot', 'software', 'algorithm', 'computer', 'smartphone', 'automation'],
    secondaryKeywords: ['technology', 'internet', 'app', 'online', 'digital', 'device', 'screen', 'electronic'],
    relevance: 10,
  },
  {
    name: 'Media & Entertainment',
    slug: 'media-entertainment',
    description: 'News media, newspapers, journalism, television, radio, podcasts, movies, cinema, and streaming.',
    primaryKeywords: ['news', 'newspaper', 'journalism', 'journalist', 'headline', 'article', 'broadcast', 'podcast', 'radio', 'press', 'media'],
    secondaryKeywords: ['movie', 'film', 'cinema', 'book', 'reading', 'tv', 'television', 'show', 'actor', 'entertainment', 'video', 'series', 'documentary'],
    relevance: 9,
  },
  {
    name: 'Hometown & Urban Life',
    slug: 'hometown-urban-life',
    description: 'Cities, hometowns, neighborhoods, architecture, public transport, and urban living.',
    primaryKeywords: ['hometown', 'birthplace', 'native city', 'neighborhood', 'suburb', 'architecture'],
    secondaryKeywords: ['city', 'town', 'village', 'street', 'building', 'traffic', 'crowded', 'hometowns', 'urban', 'rural'],
    relevance: 9,
  },
  {
    name: 'Environment & Sustainability',
    slug: 'environment-sustainability',
    description: 'Climate change, recycling, green energy, pollution, parks, weather, and conservation.',
    primaryKeywords: ['pollution', 'recycle', 'recycling', 'climate', 'solar energy', 'renewable', 'conservation', 'eco-friendly'],
    secondaryKeywords: ['environment', 'green', 'weather', 'rain', 'temperature', 'clean', 'waste', 'emissions', 'nature park'],
    relevance: 9,
  },
  {
    name: 'Art & Culture',
    slug: 'art-culture',
    description: 'Museums, paintings, traditional festivals, literature, music, history, and cultural heritage.',
    primaryKeywords: ['museum', 'gallery', 'painting', 'sculpture', 'heritage', 'festival', 'tradition'],
    secondaryKeywords: ['art', 'artist', 'music', 'song', 'culture', 'history', 'cultural', 'dance', 'classical'],
    relevance: 8,
  },
  {
    name: 'Education & Career',
    slug: 'education-career',
    description: 'University, schooling, career goals, qualifications, studying methods, and teachers.',
    primaryKeywords: ['university', 'college', 'degree', 'qualification', 'exam', 'teacher', 'professor', 'curriculum', 'schooling'],
    secondaryKeywords: ['education', 'school', 'study', 'student', 'course', 'subject', 'career', 'profession', 'learn', 'skill'],
    relevance: 10,
  },
  {
    name: 'Family & Relationships',
    slug: 'family-relationships',
    description: 'Friends, parents, childhood, mentors, community connections, and interpersonal communication.',
    primaryKeywords: ['family', 'parents', 'childhood', 'relative', 'brother', 'sister', 'friendship', 'mentor'],
    secondaryKeywords: ['friend', 'relationship', 'neighbor', 'companion', 'advice', 'elderly', 'acquaintance'],
    relevance: 9,
  },
  {
    name: 'Travel & Tourism',
    slug: 'travel-tourism',
    description: 'Holidays, tourism, exploring foreign countries, memorable journeys, and transport.',
    primaryKeywords: ['tourism', 'tourist', 'vacation', 'souvenir', 'foreign country', 'sightseeing'],
    secondaryKeywords: ['travel', 'trip', 'journey', 'holiday', 'destination', 'flight', 'hotel', 'abroad', 'foreign'],
    relevance: 9,
  },
  {
    name: 'Health & Lifestyle',
    slug: 'health-lifestyle',
    description: 'Exercise, physical fitness, mental health, diet, habits, and relaxation routines.',
    primaryKeywords: ['exercise', 'fitness', 'gym', 'wellness', 'diet', 'nutrition', 'mental health', 'disease', 'workout'],
    secondaryKeywords: ['health', 'sport', 'sleep', 'relax', 'doctor', 'hospital', 'routine', 'stress', 'energetic'],
    relevance: 9,
  },
  {
    name: 'Food & Culinary',
    slug: 'food-culinary',
    description: 'Cooking, favorite dishes, restaurants, international cuisine, and dining habits.',
    primaryKeywords: ['cooking', 'restaurant', 'cuisine', 'recipe', 'flavor', 'culinary', 'dietary'],
    secondaryKeywords: ['food', 'cook', 'meal', 'dish', 'breakfast', 'lunch', 'dinner', 'taste', 'eating', 'fast food'],
    relevance: 8,
  },
  {
    name: 'Nature & Wildlife',
    slug: 'nature-wildlife',
    description: 'Animals, pets, countryside, oceans, forests, gardens, and botanical life.',
    primaryKeywords: ['wildlife', 'animal', 'forest', 'botanical', 'species', 'ecosystem', 'ocean'],
    secondaryKeywords: ['nature', 'pet', 'tree', 'garden', 'plant', 'flower', 'river', 'mountain', 'bird'],
    relevance: 8,
  },
  {
    name: 'Work & Ambition',
    slug: 'work-ambition',
    description: 'Professional aspirations, workplace environments, teamwork, leadership, and success.',
    primaryKeywords: ['colleague', 'office', 'boss', 'company', 'workplace', 'ambition', 'promotion', 'salary', 'entrepreneur'],
    secondaryKeywords: ['work', 'business', 'goal', 'achievement', 'leadership', 'teamwork', 'project', 'professional'],
    relevance: 9,
  },
  {
    name: 'Daily Life & Habits',
    slug: 'daily-life-habits',
    description: 'Morning routines, shopping habits, chores, personal schedules, and life organization.',
    primaryKeywords: ['morning routine', 'daily routine', 'bedtime', 'daily schedule', 'shopping habit', 'household chore', 'waking up'],
    secondaryKeywords: ['daily', 'habit', 'shopping', 'money', 'gift', 'weekend', 'celebration', 'hobby', 'free time', 'spare time'],
    relevance: 8,
  },
  {
    name: 'Science & Future Innovation',
    slug: 'science-innovation',
    description: 'Scientific breakthroughs, space exploration, medical discoveries, physics, and human longevity.',
    primaryKeywords: ['science', 'scientific', 'discovery', 'experiment', 'biology', 'physics', 'space exploration', 'breakthrough'],
    secondaryKeywords: ['space', 'medical', 'medicine', 'longevity', 'research', 'laboratory', 'innovation', 'astronomy'],
    relevance: 9,
  },
  {
    name: 'Psychology & Human Relationships',
    slug: 'psychology-relationships',
    description: 'Interpersonal friendships, mental resilience, anxiety, human nature, empathy, and social psychology.',
    primaryKeywords: ['psychology', 'psychological', 'friendship', 'acquaintance', 'anxiety', 'pressure', 'mental health'],
    secondaryKeywords: ['kindness', 'stranger', 'friend', 'relationship', 'emotion', 'calm', 'loneliness', 'social'],
    relevance: 8,
  },
];

export interface EmergentTopicCandidate {
  name: string;
  slug: string;
  description: string;
  relevance: number;
}

export interface EmergenceDecision {
  slug: string;
  score: number;
  isEmergent: boolean;
  emergentTopic?: EmergentTopicCandidate;
}

export const EMERGING_TOPIC_ALIASES: Record<string, { name: string; slug: string; description: string }> = {
  perfume: {
    name: 'Perfumes & Scents',
    slug: 'perfumes-scents',
    description: 'Fragrances, wearing perfume, gifting perfume, and personal scents in IELTS speaking.',
  },
  perfumes: {
    name: 'Perfumes & Scents',
    slug: 'perfumes-scents',
    description: 'Fragrances, wearing perfume, gifting perfume, and personal scents in IELTS speaking.',
  },
  scent: {
    name: 'Perfumes & Scents',
    slug: 'perfumes-scents',
    description: 'Fragrances, wearing perfume, gifting perfume, and personal scents in IELTS speaking.',
  },
  scents: {
    name: 'Perfumes & Scents',
    slug: 'perfumes-scents',
    description: 'Fragrances, wearing perfume, gifting perfume, and personal scents in IELTS speaking.',
  },
  mirror: {
    name: 'Mirrors',
    slug: 'mirrors',
    description: 'Using mirrors, interior decoration, vanity mirrors, and mirror reflection topics.',
  },
  mirrors: {
    name: 'Mirrors',
    slug: 'mirrors',
    description: 'Using mirrors, interior decoration, vanity mirrors, and mirror reflection topics.',
  },
  agriculture: {
    name: 'Agriculture & Farming',
    slug: 'agriculture-farming',
    description: 'Farming practices, crops, rural agriculture, food production, and agricultural technology.',
  },
  farming: {
    name: 'Agriculture & Farming',
    slug: 'agriculture-farming',
    description: 'Farming practices, crops, rural agriculture, food production, and agricultural technology.',
  },
  farm: {
    name: 'Agriculture & Farming',
    slug: 'agriculture-farming',
    description: 'Farming practices, crops, rural agriculture, food production, and agricultural technology.',
  },
  farms: {
    name: 'Agriculture & Farming',
    slug: 'agriculture-farming',
    description: 'Farming practices, crops, rural agriculture, food production, and agricultural technology.',
  },
  jewelry: {
    name: 'Jewelry',
    slug: 'jewelry',
    description: 'Rings, necklaces, precious metals, watches, and personal ornaments in IELTS speaking.',
  },
  jewellery: {
    name: 'Jewelry',
    slug: 'jewelry',
    description: 'Rings, necklaces, precious metals, watches, and personal ornaments in IELTS speaking.',
  },
  sunglasses: {
    name: 'Sunglasses',
    slug: 'sunglasses',
    description: 'Wearing sunglasses, eye protection, fashion accessories, and summer habits.',
  },
  hat: {
    name: 'Hats & Headwear',
    slug: 'hats-headwear',
    description: 'Wearing hats, caps, traditional headwear, and fashion preferences.',
  },
  hats: {
    name: 'Hats & Headwear',
    slug: 'hats-headwear',
    description: 'Wearing hats, caps, traditional headwear, and fashion preferences.',
  },
  shoes: {
    name: 'Shoes & Footwear',
    slug: 'shoes-footwear',
    description: 'Footwear preferences, comfortable shoes, shoe shopping, and fashion.',
  },
  shoe: {
    name: 'Shoes & Footwear',
    slug: 'shoes-footwear',
    description: 'Footwear preferences, comfortable shoes, shoe shopping, and fashion.',
  },
  watches: {
    name: 'Watches',
    slug: 'watches',
    description: 'Wristwatches, smartwatches, punctuality, and timekeeping accessories.',
  },
  watch: {
    name: 'Watches',
    slug: 'watches',
    description: 'Wristwatches, smartwatches, punctuality, and timekeeping accessories.',
  },
  fishing: {
    name: 'Fishing',
    slug: 'fishing',
    description: 'Fishing as a hobby, seafood industry, water recreation, and relaxation.',
  },
  tea: {
    name: 'Tea & Coffee',
    slug: 'tea-coffee',
    description: 'Tea and coffee drinking habits, cafes, traditional hot beverages, and social culture.',
  },
  coffee: {
    name: 'Tea & Coffee',
    slug: 'tea-coffee',
    description: 'Tea and coffee drinking habits, cafes, traditional hot beverages, and social culture.',
  },
  bicycle: {
    name: 'Bicycles & Cycling',
    slug: 'bicycles-cycling',
    description: 'Riding bicycles, cycling lanes, green transportation, and recreation.',
  },
  cycling: {
    name: 'Bicycles & Cycling',
    slug: 'bicycles-cycling',
    description: 'Riding bicycles, cycling lanes, green transportation, and recreation.',
  },
  photography: {
    name: 'Photography',
    slug: 'photography',
    description: 'Taking photos, cameras, smartphone photography, and preserving memories.',
  },
  photos: {
    name: 'Photography',
    slug: 'photography',
    description: 'Taking photos, cameras, smartphone photography, and preserving memories.',
  },
  photo: {
    name: 'Photography',
    slug: 'photography',
    description: 'Taking photos, cameras, smartphone photography, and preserving memories.',
  },
  gardens: {
    name: 'Gardens & Parks',
    slug: 'gardens-parks',
    description: 'Public gardens, home gardening, botanical parks, and flower cultivation.',
  },
  gardening: {
    name: 'Gardens & Parks',
    slug: 'gardens-parks',
    description: 'Public gardens, home gardening, botanical parks, and flower cultivation.',
  },
  flowers: {
    name: 'Flowers & Plants',
    slug: 'flowers-plants',
    description: 'Growing flowers, gifting flowers, national flowers, and botanical beauty.',
  },
};

const GENERIC_STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'always', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot',
  'could', 'couldn', 'did', 'didn', 'difference', 'different', 'do', 'does', 'doesn', 'doing', 'don', 'down',
  'during', 'each', 'enjoy', 'explain', 'feel', 'felt', 'few', 'first', 'for', 'from', 'further', 'had', 'hadn',
  'has', 'hasn', 'have', 'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'kind', 'last', 'life', 'like', 'lot', 'many',
  'me', 'might', 'more', 'most', 'much', 'must', 'my', 'myself', 'never', 'no', 'nor', 'not', 'now', 'of', 'off',
  'often', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'part',
  'people', 'person', 'place', 'places', 'popular', 'prefer', 'question', 'questions', 'same', 'say', 'she', 'should',
  'shouldn', 'so', 'some', 'someone', 'something', 'sometimes', 'such', 'talk', 'tell', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'think', 'this', 'those', 'through', 'time', 'times',
  'to', 'too', 'type', 'under', 'until', 'up', 'usually', 'very', 'was', 'wasn', 'we', 'were', 'weren', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'won', 'would', 'wouldn', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'ielts', 'speaking', 'answer', 'answers', 'sample', 'cue', 'card', 'topic', 'topics', 'test',
  'describe', 'one', 'two', 'three', 'recent', 'actual', 'exam', 'forecast',
  'find', 'found', 'broad', 'easy', 'maintain', 'regular', 'circle', 'casual', 'small', 'group', 'close', 'early',
  'exciting', 'studied', 'wearing', 'wear', 'wears', 'check', 'checking', 'piece', 'pieces', 'bought', 'buy', 'buying',
  'going', 'leaving', 'leave', 'social', 'event', 'events', 'value', 'valuable', 'sentimental', 'essential',
  'rooms', 'living', 'home', 'wall', 'walls', 'decorative', 'decoration'
]);

export function slugifyTopic(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatCapitalizedTopicName(raw: string): string {
  return raw
    .trim()
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => {
      if (w.toLowerCase() === 'and') return '&';
      if (w.toLowerCase() === 'ai') return 'AI';
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export function cleanSubjectFromHeading(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  // 1. Check known emerging topic keywords directly
  const tokens = cleaned.toLowerCase().split(/[^a-z]+/);
  for (const t of tokens) {
    if (EMERGING_TOPIC_ALIASES[t]) {
      return EMERGING_TOPIC_ALIASES[t].name;
    }
  }

  // 2. Split on typical delimiters: - , | , : , / , •
  const segments = cleaned.split(/[-|:–—•/]/).map((s) => s.trim()).filter(Boolean);
  let bestCandidate = '';

  for (const seg of segments) {
    const withoutNoise = seg
      .replace(/\b(?:ielts|speaking|part\s*[123]|part\s*one|part\s*two|part\s*three|cue\s*card|topics?|questions?|answers?|sample|forecast|actual|recent|test|202[456]|model\s*answer)\b/gi, '')
      .replace(/\b(?:describe\s+(?:a|an|the|someone|something)|talk\s+about|you\s+(?:own|like|have|would|prefer)|piece\s+of)\b/gi, '')
      .trim();

    if (withoutNoise.length >= 3 && withoutNoise.length < 50) {
      bestCandidate = withoutNoise;
      break;
    }
  }

  if (!bestCandidate) {
    const stripped = cleaned
      .replace(/\b(?:ielts|speaking|part\s*[123]|cue\s*card|topics?|questions?|answers?|test|202[456]|describe\s+(?:a|an|the)|piece\s+of|you\s+(?:own|like))\b/gi, '')
      .trim();
    if (stripped.length >= 3 && stripped.length < 50) {
      bestCandidate = stripped;
    }
  }

  if (!bestCandidate) return null;

  const keyWord = bestCandidate.toLowerCase().replace(/[^a-z]/g, '');
  if (EMERGING_TOPIC_ALIASES[keyWord]) {
    return EMERGING_TOPIC_ALIASES[keyWord].name;
  }

  return formatCapitalizedTopicName(bestCandidate);
}

export function extractSubjectFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname
      .split('/')
      .filter((s) => s.length > 0 && !s.includes('.'));

    for (let i = pathSegments.length - 1; i >= 0; i--) {
      const seg = pathSegments[i];
      const tokens = seg
        .split(/[-_]+/)
        .map((t) => t.toLowerCase())
        .filter((t) => !GENERIC_STOPWORDS.has(t) && t.length > 2);

      if (tokens.length > 0) {
        for (const token of tokens) {
          if (EMERGING_TOPIC_ALIASES[token]) {
            return EMERGING_TOPIC_ALIASES[token].name;
          }
        }
        return formatCapitalizedTopicName(tokens.join(' '));
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function extractProminentNouns(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

export function detectGroupStrongSubject(
  questions: Array<{ questionText: string; cueCardBullets?: string | null; extractedTopicName?: string }>,
  fallbackHeading?: string | null,
  fallbackUrl?: string | null,
): string | null {
  if (fallbackHeading) {
    const fromHeading = cleanSubjectFromHeading(fallbackHeading);
    if (fromHeading) return fromHeading;
  }

  if (fallbackUrl) {
    const fromUrl = extractSubjectFromUrl(fallbackUrl);
    if (fromUrl) return fromUrl;
  }

  const nounCounter = new Map<string, number>();
  const totalQuestions = questions.length;

  for (const q of questions) {
    const nouns = new Set(extractProminentNouns(q.questionText + ' ' + (q.cueCardBullets ?? '')));
    for (const n of nouns) {
      nounCounter.set(n, (nounCounter.get(n) ?? 0) + 1);
    }
  }

  const sortedNouns = [...nounCounter.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedNouns.length > 0) {
    const [topNoun, count] = sortedNouns[0];
    // If noun occurs in >= 2 questions or >= 40% of questions in the group
    if (count >= 2 || (totalQuestions <= 2 && count >= 1)) {
      if (EMERGING_TOPIC_ALIASES[topNoun]) {
        return EMERGING_TOPIC_ALIASES[topNoun].name;
      }
      return formatCapitalizedTopicName(topNoun);
    }
  }

  return null;
}

export function calculateSeedSimilarity(text: string, bullets?: string | null): { bestSlug: string; bestScore: number } {
  const haystack = (text + ' ' + (bullets ?? '')).toLowerCase();
  let bestSlug = 'daily-life-habits';
  let bestScore = 0;

  for (const topic of SEED_TOPICS) {
    let score = 0;

    // Primary keywords get 4x weight
    for (const kw of topic.primaryKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(haystack)) {
        score += 4;
      } else if (haystack.includes(kw)) {
        score += 2;
      }
    }

    // Secondary keywords get 2x weight
    for (const kw of topic.secondaryKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(haystack)) {
        score += 2;
      } else if (haystack.includes(kw)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlug = topic.slug;
    }
  }

  return { bestSlug, bestScore };
}

export function evaluateTopicClassification(
  text: string,
  bullets?: string | null,
  contextSubject?: string | null,
): EmergenceDecision {
  const { bestSlug, bestScore } = calculateSeedSimilarity(text, bullets);

  // If score is 3 or higher, it aligns solidly with an existing seed topic
  if (bestScore >= 3) {
    return {
      slug: bestSlug,
      score: bestScore,
      isEmergent: false,
    };
  }

  // Score is < 3: DO NOT default to 'daily-life-habits' if a strong unique subject exists!
  // 1. Check contextSubject if passed
  if (contextSubject && contextSubject.trim().length >= 3) {
    const subjectTokens = contextSubject.toLowerCase().split(/[^a-z]+/);
    for (const t of subjectTokens) {
      if (EMERGING_TOPIC_ALIASES[t]) {
        const alias = EMERGING_TOPIC_ALIASES[t];
        return {
          slug: alias.slug,
          score: bestScore,
          isEmergent: true,
          emergentTopic: {
            name: alias.name,
            slug: alias.slug,
            description: alias.description,
            relevance: 6,
          },
        };
      }
    }
  }

  // 2. Check question text and bullets against known emerging topic aliases
  const textTokens = (text + ' ' + (bullets ?? ''))
    .toLowerCase()
    .split(/[^a-z]+/);

  for (const t of textTokens) {
    if (EMERGING_TOPIC_ALIASES[t]) {
      const alias = EMERGING_TOPIC_ALIASES[t];
      return {
        slug: alias.slug,
        score: bestScore,
        isEmergent: true,
        emergentTopic: {
          name: alias.name,
          slug: alias.slug,
          description: alias.description,
          relevance: 6,
        },
      };
    }
  }

  // 3. Extract custom strong subject if heading or context provided
  let strongSubject: string | null = null;
  if (contextSubject && contextSubject.trim().length >= 3) {
    strongSubject = cleanSubjectFromHeading(contextSubject) || contextSubject.trim();
  }

  // 4. Fallback to prominent nouns in question text
  if (!strongSubject) {
    const prominentNouns = extractProminentNouns(text + ' ' + (bullets ?? ''));
    if (prominentNouns.length > 0) {
      const topNoun = prominentNouns[0];
      if (EMERGING_TOPIC_ALIASES[topNoun]) {
        strongSubject = EMERGING_TOPIC_ALIASES[topNoun].name;
      } else {
        strongSubject = formatCapitalizedTopicName(topNoun);
      }
    }
  }

  if (strongSubject) {
    const lower = strongSubject.toLowerCase().replace(/[^a-z]/g, '');
    let topicName = strongSubject;
    let topicSlug = slugifyTopic(strongSubject);
    let topicDescription = `IELTS speaking practice questions and discussion regarding ${strongSubject}.`;

    if (EMERGING_TOPIC_ALIASES[lower]) {
      topicName = EMERGING_TOPIC_ALIASES[lower].name;
      topicSlug = EMERGING_TOPIC_ALIASES[lower].slug;
      topicDescription = EMERGING_TOPIC_ALIASES[lower].description;
    }

    return {
      slug: topicSlug,
      score: bestScore,
      isEmergent: true,
      emergentTopic: {
        name: topicName,
        slug: topicSlug,
        description: topicDescription,
        relevance: 6,
      },
    };
  }

  // Fallback if truly generic without any identifiable subject
  return {
    slug: 'daily-life-habits',
    score: bestScore,
    isEmergent: false,
  };
}

export function classifyTopic(text: string, bullets?: string | null, contextSubject?: string | null): string {
  return evaluateTopicClassification(text, bullets, contextSubject).slug;
}
