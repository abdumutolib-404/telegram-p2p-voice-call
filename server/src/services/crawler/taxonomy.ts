export interface TopicDefinition {
  name: string;
  slug: string;
  description: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  relevance: number;
}

/**
 * The 15 Canonical Cambridge IELTS Topic Families.
 * Every IELTS speaking prompt is systematically categorized into one of these 15 families.
 */
export const SEED_TOPICS: TopicDefinition[] = [
  {
    name: 'Education & Learning',
    slug: 'education-learning',
    description: 'Schooling, university degrees, academic research, studying methods, online courses, teachers, exams, and lifelong learning.',
    primaryKeywords: [
      'education', 'school', 'schooling', 'university', 'college', 'degree', 'qualification',
      'exam', 'examination', 'teacher', 'professor', 'curriculum', 'academic', 'study',
      'studying', 'student', 'students', 'learn', 'learning', 'classroom', 'lecture',
      'lectures', 'homework', 'tuition', 'scholarship', 'campus',
    ],
    secondaryKeywords: [
      'course', 'courses', 'subject', 'subjects', 'class', 'classes', 'textbook', 'textbooks',
      'library', 'diploma', 'major', 'grade', 'grades', 'assignment', 'assignments',
      'lesson', 'lessons', 'educate', 'pedagogy', 'mathematics', 'math', 'maths', 'language learning',
      'revision', 'knowledge', 'tutor', 'primary school', 'high school', 'secondary school',
      'undergraduate', 'postgraduate', 'master', 'kindergarten', 'preschool', 'handwriting',
      'classmate', 'classmates', 'schoolmate', 'schoolmates', 'educator', 'syllabus',
      'thesis', 'dissertation', 'literacy',
    ],
    relevance: 10,
  },
  {
    name: 'Work, Career & Ambition',
    slug: 'work-career-ambition',
    description: 'Employment, professions, career aspirations, workplace dynamics, leadership, colleagues, entrepreneurship, and professional ambitions.',
    primaryKeywords: [
      'career', 'careers', 'profession', 'professions', 'job', 'jobs', 'work', 'working',
      'workplace', 'occupation', 'employee', 'employees', 'employer', 'employers', 'boss',
      'bosses', 'colleague', 'colleagues', 'coworker', 'coworkers', 'ambition', 'ambitions',
      'promotion', 'salary', 'wage', 'wages', 'employment', 'entrepreneur', 'business',
      'resume', 'interview', 'professionals',
    ],
    secondaryKeywords: [
      'office', 'offices', 'management', 'manager', 'managers', 'leader', 'leaders',
      'leadership', 'teamwork', 'workload', 'career path', 'retire', 'retirement',
      'internship', 'hiring', 'corporation', 'company', 'companies', 'overtime',
      'vocational', 'freelance', 'self-employed', 'career choice', 'unemployment', 'co-worker',
      'vocation', 'worker', 'workers', 'workforce', 'startup', 'startups', 'executive',
      'resignation', 'part-time', 'full-time', 'remote work', 'career goal', 'career goals',
      'entrepreneurship',
    ],
    relevance: 10,
  },
  {
    name: 'Hometown, Cities & Urban Life',
    slug: 'hometown-urban-life',
    description: 'Cities, towns, hometowns, neighborhoods, architecture, public infrastructure, urban development, and local community life.',
    primaryKeywords: [
      'hometown', 'hometowns', 'city', 'cities', 'urban', 'town', 'towns', 'village',
      'villages', 'neighborhood', 'neighborhoods', 'suburb', 'suburbs', 'architecture',
      'downtown', 'metropolis', 'birthplace', 'native place', 'residential', 'accommodation',
    ],
    secondaryKeywords: [
      'street', 'streets', 'building', 'buildings', 'skyscraper', 'skyscrapers', 'apartment',
      'apartments', 'housing', 'infrastructure', 'public amenities', 'traffic', 'crowded',
      'quiet neighborhood', 'rural', 'countryside', 'district', 'community living', 'local area',
      'historic building', 'urbanization', 'facilities', 'living area', 'flat', 'flats',
      'house', 'houses', 'residence', 'resident', 'residents', 'neighbourhood',
      'neighbourhoods', 'suburban', 'locality', 'avenue', 'square', 'plaza', 'balcony',
      'city center', 'city centre', 'inner city', 'real estate',
    ],
    relevance: 9,
  },
  {
    name: 'Family, Friends & People',
    slug: 'family-friends-people',
    description: 'Parents, siblings, relatives, childhood memories, close friends, mentorship, interpersonal relationships, and influential people.',
    primaryKeywords: [
      'family', 'families', 'parent', 'parents', 'mother', 'father', 'brother', 'sister',
      'sibling', 'siblings', 'relative', 'relatives', 'friend', 'friends', 'friendship',
      'best friend', 'childhood', 'mentor', 'companion', 'acquaintance', 'acquaintances',
      'grandparents', 'grandmother', 'grandfather', 'name', 'names',
    ],
    secondaryKeywords: [
      'people', 'person', 'relationship', 'relationships', 'neighbor', 'neighbors', 'roommate',
      'roommates', 'cousin', 'cousins', 'uncle', 'aunt', 'family member', 'childhood memory',
      'close friend', 'role model', 'peer', 'peers', 'social circle', 'elderly', 'children',
      'upbringing', 'generation', 'interpersonal', 'companionship', 'psychology', 'human nature',
      'child', 'kid', 'kids', 'son', 'daughter', 'nephew', 'niece', 'grandchild',
      'grandchildren', 'grandpa', 'grandma', 'neighbour', 'neighbours', 'personality',
      'character', 'stranger', 'strangers', 'friendly', 'elder', 'elders', 'teenager',
      'teenagers',
    ],
    relevance: 9,
  },
  {
    name: 'Technology, AI & Digital Life',
    slug: 'technology-digital-life',
    description: 'Artificial intelligence, smartphones, internet, software, digital automation, social media, algorithms, and tech impacts on daily life.',
    primaryKeywords: [
      'ai', 'artificial intelligence', 'robot', 'robots', 'robotics', 'automation', 'software',
      'algorithm', 'algorithms', 'computer', 'computers', 'smartphone', 'smartphones',
      'mobile phone', 'mobile phones', 'technology', 'technological', 'digital', 'internet',
      'app', 'apps', 'application', 'applications', 'cyber',
    ],
    secondaryKeywords: [
      'device', 'devices', 'screen', 'screens', 'online', 'electronic', 'electronics',
      'gadget', 'gadgets', 'laptop', 'laptops', 'tablet', 'tablets', 'social media',
      'website', 'websites', 'data', 'programming', 'tech', 'smart device', 'virtual',
      'high-tech', 'cloud', 'network', 'hardware', 'virtual reality', 'digital device',
      'cybersecurity', 'touchscreen', 'video game', 'video games', 'gaming', 'gamer',
      'gamers', 'cell phone', 'cellphone', 'wi-fi', 'wifi', 'machine learning', 'chatgpt',
      'digital age', 'e-book', 'ebook', 'smart home',
    ],
    relevance: 10,
  },
  {
    name: 'Media, Books & Entertainment',
    slug: 'media-entertainment',
    description: 'News journalism, broadcasting, television shows, movies, cinema, literature, reading books, podcasts, and streaming entertainment.',
    primaryKeywords: [
      'news', 'newspaper', 'newspapers', 'journalism', 'journalist', 'journalists',
      'broadcast', 'media', 'podcast', 'podcasts', 'radio', 'television', 'tv', 'movie',
      'movies', 'film', 'films', 'cinema', 'book', 'books', 'reading', 'literature',
      'novel', 'novels', 'author', 'authors', 'magazine', 'magazines',
    ],
    secondaryKeywords: [
      'entertainment', 'actor', 'actors', 'actress', 'actresses', 'show', 'shows',
      'series', 'documentary', 'documentaries', 'streaming', 'video', 'videos', 'fiction',
      'non-fiction', 'reading habit', 'headline', 'headlines', 'press', 'article',
      'articles', 'story', 'stories', 'plot', 'comedy', 'drama', 'screening',
      'favorite book', 'channel', 'tv program', 'mass media', 'editor', 'celebrity',
      'celebrities', 'comic', 'comics', 'biography', 'movie theater', 'movie theatre',
      'blockbuster', 'tv show', 'reporter', 'reporters', 'bookstore', 'printed book',
    ],
    relevance: 9,
  },
  {
    name: 'Travel, Tourism & Transport',
    slug: 'travel-tourism-transport',
    description: 'Holidays, domestic and international tourism, vacations, transport vehicles, airlines, public transit, journeys, and memorable trips.',
    primaryKeywords: [
      'travel', 'traveling', 'travelling', 'trip', 'trips', 'journey', 'journeys',
      'tourism', 'tourist', 'tourists', 'vacation', 'vacations', 'holiday', 'holidays',
      'transport', 'transportation', 'flight', 'flights', 'airplane', 'airplanes', 'plane',
      'planes', 'train', 'trains', 'railway', 'subway', 'metro', 'bus', 'buses', 'car',
      'cars', 'vehicle', 'vehicles', 'driving', 'bicycle', 'bicycles', 'cycling', 'bike', 'bikes',
    ],
    secondaryKeywords: [
      'destination', 'destinations', 'abroad', 'foreign country', 'hotel', 'hotels',
      'souvenir', 'souvenirs', 'sightseeing', 'commute', 'commuter', 'commuters', 'route',
      'ticket', 'tickets', 'traffic jam', 'road', 'roads', 'highway', 'highways', 'airport',
      'airports', 'passenger', 'passengers', 'luggage', 'explore', 'voyage', 'backpacking',
      'rental car', 'public transit', 'drive', 'driver', 'drivers', 'motorcycle', 'motorbike',
      'taxi', 'cab', 'cruise', 'boat', 'ship', 'ferry', 'rail', 'airline', 'traveller',
      'travellers', 'traveler', 'travelers', 'itinerary', 'resort', 'hostel', 'map',
      'maps', 'tour guide', 'passport', 'overseas',
    ],
    relevance: 9,
  },
  {
    name: 'Health, Fitness & Sports',
    slug: 'health-fitness-sports',
    description: 'Physical exercise, gym workouts, team and individual sports, balanced diet, mental wellness, medical care, and healthy habits.',
    primaryKeywords: [
      'health', 'healthy', 'fitness', 'exercise', 'exercises', 'exercising', 'gym',
      'workout', 'workouts', 'sport', 'sports', 'athlete', 'athletes', 'athletics',
      'football', 'soccer', 'basketball', 'swimming', 'running', 'jogging', 'tennis',
      'yoga', 'wellness', 'nutrition', 'diet',
    ],
    secondaryKeywords: [
      'doctor', 'doctors', 'hospital', 'hospitals', 'medicine', 'medical', 'illness',
      'disease', 'diseases', 'mental health', 'stress', 'relaxation', 'sleep',
      'physical activity', 'marathon', 'training', 'stadium', 'match', 'tournament',
      'active', 'body', 'energetic', 'well-being', 'staying fit', 'fishing', 'workout routine',
      'walk', 'walking', 'swimmer', 'runner', 'badminton', 'volleyball', 'weight loss',
      'physical fitness', 'patient', 'patients', 'clinic', 'dentist', 'healthcare',
    ],
    relevance: 9,
  },
  {
    name: 'Food, Dining & Culinary',
    slug: 'food-dining-culinary',
    description: 'Cooking, restaurants, dining out, international cuisines, recipes, dietary habits, food culture, snacks, and traditional beverages.',
    primaryKeywords: [
      'food', 'foods', 'cooking', 'cook', 'cooks', 'cooked', 'meal', 'meals', 'dish',
      'dishes', 'cuisine', 'cuisines', 'restaurant', 'restaurants', 'dining', 'recipe',
      'recipes', 'culinary', 'taste', 'eating', 'chef', 'chefs', 'dietary', 'pasta',
    ],
    secondaryKeywords: [
      'breakfast', 'lunch', 'dinner', 'snack', 'snacks', 'dessert', 'desserts', 'fast food',
      'street food', 'flavor', 'flavors', 'ingredient', 'ingredients', 'tea', 'coffee',
      'cafe', 'cafes', 'beverage', 'beverages', 'baking', 'bake', 'rice', 'fruit',
      'fruits', 'vegetable', 'vegetables', 'meat', 'seafood', 'delicacy', 'homemade meal',
      'food market', 'dine', 'eat', 'eats', 'drink', 'drinks', 'drinking', 'water',
      'juice', 'soup', 'bread', 'cake', 'cakes', 'pizza', 'noodle', 'noodles',
      'kitchen', 'cookery', 'tasty', 'chocolate', 'refreshment',
    ],
    relevance: 8,
  },
  {
    name: 'Environment, Nature & Wildlife',
    slug: 'environment-nature-wildlife',
    description: 'Climate change, environmental protection, pollution, recycling, wildlife, animals, biodiversity, oceans, forests, weather, and agriculture.',
    primaryKeywords: [
      'environment', 'environmental', 'nature', 'wildlife', 'animal', 'animals', 'pet',
      'pets', 'climate', 'climate change', 'pollution', 'recycle', 'recycling', 'conservation',
      'eco-friendly', 'green energy', 'solar energy', 'forest', 'forests', 'ocean',
      'oceans', 'species', 'ecosystem', 'agriculture', 'agricultural', 'farming', 'farm',
      'farms', 'crop', 'crops', 'harvest',
    ],
    secondaryKeywords: [
      'tree', 'trees', 'plant', 'plants', 'flower', 'flowers', 'garden', 'gardens',
      'botanical', 'dog', 'dogs', 'cat', 'cats', 'bird', 'birds', 'creature', 'creatures',
      'sea', 'river', 'rivers', 'mountain', 'mountains', 'weather', 'rain', 'temperature',
      'clean energy', 'waste', 'emissions', 'biodiversity', 'natural park', 'global warming',
      'wild nature', 'soil', 'season', 'seasons', 'sunny', 'snow', 'wind', 'storm',
      'lake', 'lakes', 'beach', 'beaches', 'wilderness', 'habitat', 'habitats', 'ecology',
      'insect', 'insects', 'marine life', 'national park', 'gardening', 'farmer',
      'farmers', 'renewable energy',
    ],
    relevance: 9,
  },
  {
    name: 'Art, Music & Cultural Heritage',
    slug: 'art-music-culture',
    description: 'Visual arts, museums, exhibitions, musical genres, musical instruments, traditional festivals, cultural heritage, history, and performances.',
    primaryKeywords: [
      'art', 'arts', 'artist', 'artists', 'artwork', 'artworks', 'painting', 'paintings',
      'drawing', 'drawings', 'sculpture', 'sculptures', 'museum', 'museums', 'gallery',
      'galleries', 'exhibition', 'exhibitions', 'music', 'musical', 'musician', 'musicians',
      'song', 'songs', 'singer', 'singers', 'concert', 'concerts', 'band', 'bands',
      'musical instrument', 'culture', 'cultural', 'heritage', 'tradition', 'traditions',
      'traditional', 'festival', 'festivals',
    ],
    secondaryKeywords: [
      'history', 'historic', 'historical', 'craft', 'crafts', 'handicraft', 'dance',
      'dancing', 'classical music', 'pop music', 'performance', 'performances', 'theater',
      'theatre', 'folklore', 'ceremony', 'ceremonies', 'celebration', 'cultural event',
      'national custom', 'photography', 'photo', 'photos', 'camera', 'cameras',
      'monument', 'ancient', 'color', 'colors', 'colour', 'colours', 'instrument',
      'instruments', 'piano', 'guitar', 'violin', 'sing', 'singing', 'melody', 'opera',
      'orchestra', 'sculptor', 'painter', 'portrait', 'draw', 'cultural heritage',
      'national costume', 'historic site', 'monuments',
    ],
    relevance: 8,
  },
  {
    name: 'Fashion, Clothing & Accessories',
    slug: 'fashion-clothing-accessories',
    description: 'Clothing choices, fashion trends, personal styling, shopping for clothes, footwear, jewelry, perfumes, mirrors, watches, and accessories.',
    primaryKeywords: [
      'fashion', 'clothing', 'clothes', 'outfit', 'outfits', 'dress', 'dresses', 'wear',
      'wearing', 'accessory', 'accessories', 'perfume', 'perfumes', 'scent', 'scents',
      'fragrance', 'fragrances', 'cologne', 'jewelry', 'jewellery', 'mirror', 'mirrors',
      'shoes', 'shoe', 'footwear', 'sneakers', 'boots', 'hat', 'hats', 'cap', 'caps',
      'headwear', 'watch', 'watches', 'sunglasses', 'glasses',
    ],
    secondaryKeywords: [
      'style', 'trend', 'trends', 'fashion trend', 'casual wear', 'formal wear', 'suit',
      'suits', 'jacket', 'jackets', 'coat', 'coats', 't-shirt', 'jeans', 'uniform',
      'fabric', 'brand', 'brands', 'designer', 'designers', 'wardrobe', 'necklace',
      'necklaces', 'ring', 'rings', 'bracelet', 'bracelets', 'earrings', 'vanity',
      'reflection', 'wrist watch', 'timepiece', 'personal appearance', 'shopping for clothes',
      'bag', 'bags', 'handbag', 'handbags', 'purse', 'purses', 'wallet', 'wallets',
      'backpack', 'backpacks', 'earring', 'sandals', 'scarf', 'scarves', 'gloves',
      'belt', 'belts', 'shirt', 'shirts', 'trousers', 'pants', 'skirt', 'skirts',
      'garment', 'garments', 'costume', 'costumes', 'wristwatches', 'stylish', 'fashionable',
    ],
    relevance: 8,
  },
  {
    name: 'Leisure, Habits & Daily Routine',
    slug: 'leisure-habits-daily',
    description: 'Daily routines, morning and evening schedules, weekend activities, personal hobbies, shopping, chores, leisure time, and life organization.',
    primaryKeywords: [
      'routine', 'routines', 'daily routine', 'habit', 'habits', 'leisure', 'hobby',
      'hobbies', 'free time', 'spare time', 'schedule', 'schedules', 'chores', 'shopping',
      'gift', 'gifts', 'weekend', 'weekends', 'relaxation', 'pastime', 'pastimes', 'daily life',
    ],
    secondaryKeywords: [
      'morning', 'evening', 'bedtime', 'waking up', 'relax', 'unwind', 'lifestyle',
      'errands', 'household chore', 'cleaning', 'spending time', 'pocket money',
      'money management', 'buy', 'buying', 'purchase', 'leisure activity', 'time management',
      'personal plan', 'spare hour', 'day-to-day', 'daily', 'rest', 'resting', 'unwinding',
      'free hour', 'housework', 'cleaning house', 'tidy', 'tidying', 'errand', 'presents',
      'give gifts', 'receive gifts', 'morning routine', 'evening routine', 'daily habit',
      'spend free time', 'recreation', 'recreational',
    ],
    relevance: 8,
  },
  {
    name: 'Society, Law & Community',
    slug: 'society-law-community',
    description: 'Social rules, law enforcement, crime and justice, community volunteering, public services, civic responsibilities, government policies, and social welfare.',
    primaryKeywords: [
      'society', 'social', 'community', 'communities', 'law', 'laws', 'legal', 'police',
      'crime', 'crimes', 'justice', 'court', 'courts', 'rule', 'rules', 'government',
      'governments', 'volunteer', 'volunteers', 'volunteering', 'charity', 'citizen',
      'citizens', 'citizenship', 'public service', 'civic',
    ],
    secondaryKeywords: [
      'regulation', 'regulations', 'safety', 'security', 'social responsibility',
      'community service', 'equality', 'human rights', 'poverty', 'welfare', 'public order',
      'courtroom', 'lawyer', 'lawyers', 'judge', 'social issue', 'neighborhood community',
      'civic duty', 'social development', 'legislation', 'illegal', 'policeman',
      'policewoman', 'criminal', 'criminals', 'prison', 'jail', 'punishment', 'penalty',
      'fine', 'fines', 'obey', 'obeying', 'law enforcement', 'public safety',
      'community project', 'charitable', 'nonprofit', 'social welfare', 'policy', 'policies',
    ],
    relevance: 9,
  },
  {
    name: 'Science, Space & Innovation',
    slug: 'science-space-innovation',
    description: 'Scientific research, discoveries, space exploration, astronomy, physics, biology, medical breakthroughs, and scientific innovation.',
    primaryKeywords: [
      'science', 'scientific', 'scientist', 'scientists', 'experiment', 'experiments',
      'laboratory', 'laboratories', 'research', 'discovery', 'discoveries', 'invention',
      'inventions', 'space', 'universe', 'planet', 'planets', 'astronomy', 'astronaut',
      'astronauts', 'galaxy', 'space exploration', 'innovation', 'physics', 'biology', 'chemistry',
    ],
    secondaryKeywords: [
      'scientific breakthrough', 'medical discovery', 'genetics', 'dna', 'spacecraft',
      'satellite', 'satellites', 'rocket', 'rockets', 'solar system', 'stars',
      'scientific method', 'future innovation', 'laboratory experiment', 'natural science',
      'scientific theory', 'exploration', 'scientific advancement', 'telescope',
      'astronomer', 'astronomers', 'physicist', 'chemist', 'biologist', 'scientific study',
      'outer space', 'moon', 'mars', 'earth science', 'stem', 'breakthrough', 'innovative',
      'innovations', 'space travel', 'space station', 'orbit',
    ],
    relevance: 9,
  },
];

export const CANONICAL_TOPIC_SLUGS = [
  'education-learning',
  'work-career-ambition',
  'hometown-urban-life',
  'family-friends-people',
  'technology-digital-life',
  'media-entertainment',
  'travel-tourism-transport',
  'health-fitness-sports',
  'food-dining-culinary',
  'environment-nature-wildlife',
  'art-music-culture',
  'fashion-clothing-accessories',
  'leisure-habits-daily',
  'society-law-community',
  'science-space-innovation',
] as const;

export type CanonicalTopicSlug = (typeof CANONICAL_TOPIC_SLUGS)[number];

export const CANONICAL_SLUG_SET = new Set<string>(CANONICAL_TOPIC_SLUGS);

/**
 * Mapping of legacy or micro-topic aliases to the 15 Canonical Cambridge IELTS Topic Families.
 */
export const LEGACY_OR_ALIAS_SLUG_MAP: Record<string, CanonicalTopicSlug> = {
  // Legacy seed slugs:
  'technology-ai': 'technology-digital-life',
  'media-entertainment': 'media-entertainment',
  'hometown-urban-life': 'hometown-urban-life',
  'environment-sustainability': 'environment-nature-wildlife',
  'art-culture': 'art-music-culture',
  'education-career': 'education-learning',
  'family-relationships': 'family-friends-people',
  'travel-tourism': 'travel-tourism-transport',
  'health-lifestyle': 'health-fitness-sports',
  'food-culinary': 'food-dining-culinary',
  'nature-wildlife': 'environment-nature-wildlife',
  'work-ambition': 'work-career-ambition',
  'daily-life-habits': 'leisure-habits-daily',
  'science-innovation': 'science-space-innovation',
  'psychology-relationships': 'family-friends-people',

  // Old micro-topics absorbed into Fashion, Clothing & Accessories:
  'perfumes-scents': 'fashion-clothing-accessories',
  'perfume': 'fashion-clothing-accessories',
  'perfumes': 'fashion-clothing-accessories',
  'scent': 'fashion-clothing-accessories',
  'scents': 'fashion-clothing-accessories',
  'mirrors': 'fashion-clothing-accessories',
  'mirror': 'fashion-clothing-accessories',
  'jewelry': 'fashion-clothing-accessories',
  'jewellery': 'fashion-clothing-accessories',
  'sunglasses': 'fashion-clothing-accessories',
  'hats-headwear': 'fashion-clothing-accessories',
  'hats': 'fashion-clothing-accessories',
  'hat': 'fashion-clothing-accessories',
  'shoes-footwear': 'fashion-clothing-accessories',
  'shoes': 'fashion-clothing-accessories',
  'shoe': 'fashion-clothing-accessories',
  'watches': 'fashion-clothing-accessories',
  'watch': 'fashion-clothing-accessories',
  'clothing': 'fashion-clothing-accessories',
  'clothes': 'fashion-clothing-accessories',
  'fashion': 'fashion-clothing-accessories',

  // Old micro-topics absorbed into Environment, Nature & Wildlife:
  'agriculture-farming': 'environment-nature-wildlife',
  'agriculture': 'environment-nature-wildlife',
  'farming': 'environment-nature-wildlife',
  'farm': 'environment-nature-wildlife',
  'farms': 'environment-nature-wildlife',
  'gardens-parks': 'environment-nature-wildlife',
  'gardens': 'environment-nature-wildlife',
  'gardening': 'environment-nature-wildlife',
  'flowers-plants': 'environment-nature-wildlife',
  'flowers': 'environment-nature-wildlife',

  // Other absorbed topics:
  'fishing': 'health-fitness-sports',
  'tea-coffee': 'food-dining-culinary',
  'tea': 'food-dining-culinary',
  'coffee': 'food-dining-culinary',
  'pasta': 'food-dining-culinary',
  'pasta-dishes': 'food-dining-culinary',
  'bicycles-cycling': 'travel-tourism-transport',
  'bicycle': 'travel-tourism-transport',
  'cycling': 'travel-tourism-transport',
  'car': 'travel-tourism-transport',
  'cars': 'travel-tourism-transport',
  'photography': 'art-music-culture',
  'photos': 'art-music-culture',
  'photo': 'art-music-culture',
  'gift': 'leisure-habits-daily',
  'gifts': 'leisure-habits-daily',
};

export function normalizeToCanonicalSlug(rawSlugOrName?: string | null): CanonicalTopicSlug {
  if (!rawSlugOrName) return 'leisure-habits-daily';
  const clean = slugifyTopic(rawSlugOrName);
  if (CANONICAL_SLUG_SET.has(clean)) {
    return clean as CanonicalTopicSlug;
  }
  if (LEGACY_OR_ALIAS_SLUG_MAP[clean]) {
    return LEGACY_OR_ALIAS_SLUG_MAP[clean];
  }

  // Also check if candidate name contains keywords matching any canonical topic
  const candidateText = rawSlugOrName.replace(/[-_]+/g, ' ');
  const sim = calculateSeedSimilarity(candidateText);
  if (sim.bestScore > 0) {
    return sim.bestSlug;
  }

  return 'leisure-habits-daily';
}

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

/**
 * Kept for heading & URL subject extraction backward-compatibility.
 * Questions with these subjects are systematically absorbed into the 15 canonical families.
 */
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
  'exciting', 'studied', 'check', 'checking', 'piece', 'pieces', 'bought', 'going', 'leaving', 'leave',
  'social', 'event', 'events', 'value', 'valuable', 'sentimental', 'essential',
  'rooms', 'living', 'home', 'wall', 'walls', 'decorative', 'decoration',
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
      .replace(
        /\b(?:ielts|speaking|part\s*[123]|part\s*one|part\s*two|part\s*three|cue\s*card|topics?|questions?|answers?|sample|forecast|actual|recent|test|202[456]|model\s*answer)\b/gi,
        '',
      )
      .replace(
        /\b(?:describe\s+(?:a|an|the|someone|something)|talk\s+about|you\s+(?:own|like|have|would|prefer)|piece\s+of)\b/gi,
        '',
      )
      .trim();

    if (withoutNoise.length >= 3 && withoutNoise.length < 50) {
      bestCandidate = withoutNoise;
      break;
    }
  }

  if (!bestCandidate) {
    const stripped = cleaned
      .replace(
        /\b(?:ielts|speaking|part\s*[123]|cue\s*card|topics?|questions?|answers?|test|202[456]|describe\s+(?:a|an|the)|piece\s+of|you\s+(?:own|like))\b/gi,
        '',
      )
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
    if (count >= 2 || (totalQuestions <= 2 && count >= 1)) {
      if (EMERGING_TOPIC_ALIASES[topNoun]) {
        return EMERGING_TOPIC_ALIASES[topNoun].name;
      }
      return formatCapitalizedTopicName(topNoun);
    }
  }

  return null;
}

export function buildKeywordRegex(kw: string): RegExp {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kw.endsWith('y') && !/[aeiou]y$/i.test(kw)) {
    const base = escaped.slice(0, -1);
    return new RegExp(`\\b${base}(?:y|ies)\\b`, 'i');
  }
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i');
}

export function getCanonicalKeywords(keywords: string[]): string[] {
  const sorted = [...new Set(keywords.map((k) => k.toLowerCase().trim()))].sort(
    (a, b) => a.length - b.length,
  );
  const result: string[] = [];
  for (const kw of sorted) {
    const isPluralOfExisting = result.some((existing) => {
      const r = buildKeywordRegex(existing);
      return r.test(kw);
    });
    if (!isPluralOfExisting) {
      result.push(kw);
    }
  }
  return result;
}

const CANONICAL_TOPIC_KEYWORDS = SEED_TOPICS.map((topic) => ({
  slug: topic.slug as CanonicalTopicSlug,
  primaryRegexes: getCanonicalKeywords(topic.primaryKeywords).map((kw) => buildKeywordRegex(kw)),
  secondaryRegexes: getCanonicalKeywords(topic.secondaryKeywords).map((kw) => buildKeywordRegex(kw)),
}));

export function getContextCanonicalCandidate(contextSubject?: string | null): CanonicalTopicSlug | null {
  if (!contextSubject || contextSubject.trim().length < 3) return null;
  const slugified = slugifyTopic(contextSubject);
  if (CANONICAL_SLUG_SET.has(slugified)) {
    return slugified as CanonicalTopicSlug;
  }
  if (LEGACY_OR_ALIAS_SLUG_MAP[slugified]) {
    return LEGACY_OR_ALIAS_SLUG_MAP[slugified];
  }
  const norm = normalizeToCanonicalSlug(contextSubject);
  if (norm && norm !== 'leisure-habits-daily') {
    return norm;
  }
  const sim = calculateSeedSimilarity(contextSubject);
  if (sim.bestScore > 0) {
    return sim.bestSlug;
  }
  return null;
}

export function calculateSeedSimilarity(
  text: string,
  bullets?: string | null,
  contextCandidate?: CanonicalTopicSlug | null,
): { bestSlug: CanonicalTopicSlug; bestScore: number } {
  const haystack = [text, bullets].filter(Boolean).join(' ').toLowerCase();
  let bestSlug: CanonicalTopicSlug = 'leisure-habits-daily';
  let bestScore = 0;

  for (const item of CANONICAL_TOPIC_KEYWORDS) {
    let score = 0;

    for (const regex of item.primaryRegexes) {
      if (regex.test(haystack)) {
        score += 4;
      }
    }

    for (const regex of item.secondaryRegexes) {
      if (regex.test(haystack)) {
        score += 2;
      }
    }

    if (contextCandidate && item.slug === contextCandidate && score > 0) {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSlug = item.slug;
    }
  }

  return { bestSlug, bestScore };
}

/**
 * Classifies an IELTS question into one of the 15 Canonical Cambridge Topic Families.
 * Single-noun auto-emergence fallback is removed: no new micro-topics are spawned.
 */
export function evaluateTopicClassification(
  text: string,
  bullets?: string | null,
  contextSubject?: string | null,
): EmergenceDecision {
  const contextCandidate = getContextCanonicalCandidate(contextSubject);
  const { bestSlug, bestScore } = calculateSeedSimilarity(text, bullets, contextCandidate);

  // If score > 0, keyword dictionary matched a canonical family based on the actual question text
  if (bestScore > 0) {
    return {
      slug: bestSlug,
      score: bestScore,
      isEmergent: false,
    };
  }

  // Fallback when question text has 0 keyword matches: Resolve from context candidate if present
  if (contextCandidate) {
    return {
      slug: contextCandidate,
      score: 3,
      isEmergent: false,
    };
  }

  // Final Fallback: Leisure, Habits & Daily Routine
  return {
    slug: 'leisure-habits-daily',
    score: 0,
    isEmergent: false,
  };
}

export function classifyTopic(text: string, bullets?: string | null, contextSubject?: string | null): string {
  return evaluateTopicClassification(text, bullets, contextSubject).slug;
}
