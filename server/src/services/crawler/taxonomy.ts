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
];

export function classifyTopic(text: string, bullets?: string | null): string {
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

    // Secondary keywords get 1.5x weight
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

  return bestSlug;
}
