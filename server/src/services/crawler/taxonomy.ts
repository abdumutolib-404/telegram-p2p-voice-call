export interface TopicDefinition {
  name: string;
  slug: string;
  description: string;
  keywords: string[];
  relevance: number;
}

export const SEED_TOPICS: TopicDefinition[] = [
  {
    name: 'Technology & AI',
    slug: 'technology-ai',
    description: 'Artificial intelligence, digital devices, internet, automation, and tech impacts on daily life.',
    keywords: ['ai', 'technology', 'computer', 'internet', 'robot', 'smartphone', 'software', 'app', 'online', 'digital', 'device', 'social media', 'automation'],
    relevance: 10,
  },
  {
    name: 'Hometown & Urban Life',
    slug: 'hometown-urban-life',
    description: 'Cities, hometowns, neighborhoods, architecture, public transport, and urban living.',
    keywords: ['hometown', 'city', 'town', 'village', 'neighborhood', 'street', 'building', 'architecture', 'suburb', 'traffic', 'crowded', 'hometowns'],
    relevance: 9,
  },
  {
    name: 'Environment & Sustainability',
    slug: 'environment-sustainability',
    description: 'Climate change, recycling, green energy, pollution, parks, weather, and conservation.',
    keywords: ['environment', 'pollution', 'recycle', 'climate', 'green', 'weather', 'rain', 'temperature', 'clean', 'solar', 'waste', 'eco-friendly'],
    relevance: 9,
  },
  {
    name: 'Art & Culture',
    slug: 'art-culture',
    description: 'Museums, paintings, traditional festivals, literature, music, history, and cultural heritage.',
    keywords: ['art', 'artist', 'museum', 'gallery', 'painting', 'music', 'song', 'culture', 'tradition', 'festival', 'history', 'cultural', 'dance'],
    relevance: 8,
  },
  {
    name: 'Education & Career',
    slug: 'education-career',
    description: 'University, schooling, career goals, qualifications, studying methods, and teachers.',
    keywords: ['education', 'school', 'university', 'study', 'student', 'teacher', 'course', 'subject', 'career', 'profession', 'job', 'degree', 'qualification'],
    relevance: 10,
  },
  {
    name: 'Family & Relationships',
    slug: 'family-relationships',
    description: 'Friends, parents, childhood, mentors, community connections, and interpersonal communication.',
    keywords: ['family', 'parent', 'friend', 'relationship', 'childhood', 'relative', 'brother', 'sister', 'neighbor', 'mentor', 'companion', 'advice'],
    relevance: 9,
  },
  {
    name: 'Travel & Tourism',
    slug: 'travel-tourism',
    description: 'Holidays, tourism, exploring foreign countries, memorable journeys, and transport.',
    keywords: ['travel', 'trip', 'journey', 'holiday', 'vacation', 'tourist', 'tourism', 'destination', 'flight', 'hotel', 'abroad', 'foreign'],
    relevance: 9,
  },
  {
    name: 'Health & Lifestyle',
    slug: 'health-lifestyle',
    description: 'Exercise, physical fitness, mental health, diet, habits, and relaxation routines.',
    keywords: ['health', 'exercise', 'sport', 'fitness', 'diet', 'sleep', 'relax', 'gym', 'wellness', 'doctor', 'hospital', 'routine', 'stress'],
    relevance: 9,
  },
  {
    name: 'Media & Entertainment',
    slug: 'media-entertainment',
    description: 'Movies, television, podcasts, books, news media, and recreational activities.',
    keywords: ['movie', 'film', 'cinema', 'book', 'reading', 'tv', 'television', 'show', 'podcast', 'actor', 'news', 'entertainment', 'video'],
    relevance: 8,
  },
  {
    name: 'Food & Culinary',
    slug: 'food-culinary',
    description: 'Cooking, favorite dishes, restaurants, international cuisine, and dining habits.',
    keywords: ['food', 'cook', 'cooking', 'restaurant', 'meal', 'dish', 'breakfast', 'dinner', 'cuisine', 'flavor', 'taste', 'eating'],
    relevance: 8,
  },
  {
    name: 'Nature & Wildlife',
    slug: 'nature-wildlife',
    description: 'Animals, pets, countryside, oceans, forests, gardens, and botanical life.',
    keywords: ['nature', 'animal', 'pet', 'wildlife', 'forest', 'tree', 'garden', 'plant', 'flower', 'ocean', 'river', 'mountain', 'bird'],
    relevance: 8,
  },
  {
    name: 'Work & Ambition',
    slug: 'work-ambition',
    description: 'Professional aspirations, workplace environments, teamwork, leadership, and success.',
    keywords: ['work', 'colleague', 'office', 'boss', 'company', 'business', 'ambition', 'goal', 'achievement', 'leadership', 'teamwork', 'project'],
    relevance: 9,
  },
  {
    name: 'Daily Life & Habits',
    slug: 'daily-life-habits',
    description: 'Morning routines, shopping, hobbies, personal time, celebrations, and life organization.',
    keywords: ['daily', 'habit', 'morning', 'routine', 'shopping', 'money', 'gift', 'time', 'weekend', 'celebration', 'hobby', 'free time'],
    relevance: 8,
  },
];

export function classifyTopic(text: string, bullets?: string | null): string {
  const haystack = (text + ' ' + (bullets ?? '')).toLowerCase();
  let bestSlug = 'daily-life-habits';
  let bestScore = 0;

  for (const topic of SEED_TOPICS) {
    let score = 0;
    for (const kw of topic.keywords) {
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
