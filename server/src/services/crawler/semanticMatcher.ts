/**
 * Semantic NLP Question Matcher & Paraphrase Deduplicator
 * 
 * Accurately detects paraphrased IELTS questions like:
 * "Are you a student or do you work?" vs "Do you work or study?"
 * "What do you do in your free time?" vs "How do you spend your leisure time?"
 */

// Conversational filler stopwords to ignore in IELTS speaking questions
const STOPWORDS = new Set([
  'a', 'about', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'being',
  'both', 'but', 'by', 'can', 'could', 'describe', 'did', 'do', 'does', 'doing',
  'explain', 'for', 'from', 'get', 'had', 'has', 'have', 'having', 'he', 'her',
  'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'like', 'many', 'may', 'me', 'might', 'more', 'most', 'much', 'my', 'no', 'not',
  'of', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over', 'said', 'same',
  'say', 'see', 'should', 'so', 'some', 'such', 'talk', 'tell', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you',
  'your', 'yours', 'yourself', 'spend', 'spent', 'spending', 'usually', 'often',
  'frequently', 'normally', 'tend', 'used', 'time',
]);

// Multi-word IELTS phrase canonicalization
const PHRASE_CANONICALS: Array<[RegExp, string]> = [
  [/free\s+time/gi, 'leisure'],
  [/spare\s+time/gi, 'leisure'],
  [/leisure\s+time/gi, 'leisure'],
  [/where\s+you\s+(?:grew\s+up|were\s+born)/gi, 'hometown'],
  [/native\s+(?:city|town|place)/gi, 'hometown'],
  [/place\s+(?:where\s+)?you\s+live/gi, 'housing'],
  [/public\s+transit/gi, 'transport'],
  [/public\s+transport/gi, 'transport'],
  [/high\s+school/gi, 'study'],
  [/secondary\s+school/gi, 'study'],
  [/artificial\s+intelligence/gi, 'ai'],
  [/social\s+media/gi, 'media'],
];

// IELTS-specific domain synonym canonicalization dictionary
const SYNONYM_MAP: Record<string, string> = {
  // Study & Education
  student: 'study',
  pupil: 'study',
  studying: 'study',
  studies: 'study',
  university: 'study',
  college: 'study',
  school: 'study',
  academic: 'study',
  learner: 'study',

  // Work & Career
  working: 'work',
  worker: 'work',
  job: 'work',
  career: 'work',
  employment: 'work',
  employed: 'work',
  profession: 'work',
  occupation: 'work',
  workplace: 'work',

  // Hometown & Living
  birthplace: 'hometown',
  native: 'hometown',
  flat: 'housing',
  apartment: 'housing',
  house: 'housing',
  accommodation: 'housing',
  residence: 'housing',
  neighborhood: 'area',
  district: 'area',

  // Leisure & Free Time
  leisure: 'leisure',
  freetime: 'leisure',
  relax: 'leisure',
  relaxing: 'leisure',
  relaxation: 'leisure',
  hobby: 'pastime',
  hobbies: 'pastime',
  pastime: 'pastime',

  // Travel & Transport
  vacation: 'holiday',
  trip: 'journey',
  travel: 'journey',
  traveling: 'journey',
  transit: 'transport',
  automobile: 'car',
  vehicle: 'car',

  // Media & Devices
  gadget: 'device',
  mobile: 'phone',
  smartphone: 'phone',
  cinema: 'movie',
  film: 'movie',
  television: 'tv',
  broadcast: 'media',
};

/**
 * Lightweight rule-based suffix stemmer
 */
function stemWord(word: string): string {
  if (word.length < 5) return word;

  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('tion') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ment') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('able') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);

  return word;
}

/**
 * Extracts and canonicalizes core content tokens from an IELTS question
 */
export function extractContentTokens(text: string): string[] {
  if (!text) return [];

  let normalized = text.toLowerCase();

  // Normalize multi-word phrases first
  for (const [pattern, replacement] of PHRASE_CANONICALS) {
    normalized = normalized.replace(pattern, ` ${replacement} `);
  }

  const rawTokens = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const contentTokens: string[] = [];

  for (const token of rawTokens) {
    if (STOPWORDS.has(token) || token.length < 3) continue;

    // Check synonym map first
    let canonical = SYNONYM_MAP[token] || token;

    // Apply suffix stemming
    canonical = stemWord(canonical);

    // Re-check synonym map post-stemming
    canonical = SYNONYM_MAP[canonical] || canonical;

    contentTokens.push(canonical);
  }

  return contentTokens;
}

/**
 * Generates an order-independent canonical signature key
 * e.g. "Are you a student or do you work?" -> "study_work"
 * e.g. "Do you work or study?" -> "study_work"
 */
export function generateCanonicalSemanticKey(text: string): string {
  const tokens = Array.from(new Set(extractContentTokens(text)));
  tokens.sort();
  return tokens.join('_');
}

/**
 * Computes Jaccard Similarity between two texts: |A ∩ B| / |A ∪ B|
 * Returns a score between 0.0 (completely distinct) and 1.0 (identical content words)
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = new Set(extractContentTokens(textA));
  const setB = new Set(extractContentTokens(textB));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Checks whether a candidate question is a semantic paraphrase duplicate
 * of any existing question in the bank.
 */
export function isSemanticDuplicate(
  candidateText: string,
  existingQuestions: Array<{ questionText: string; canonicalKey?: string }>,
  similarityThreshold = 0.70
): { isDuplicate: boolean; matchedQuestion?: string; score?: number } {
  const candidateKey = generateCanonicalSemanticKey(candidateText);

  // Check fast-path: Exact canonical key match
  for (const item of existingQuestions) {
    const existingKey = item.canonicalKey || generateCanonicalSemanticKey(item.questionText);
    if (candidateKey && candidateKey === existingKey) {
      return {
        isDuplicate: true,
        matchedQuestion: item.questionText,
        score: 1.0,
      };
    }
  }

  // Check fuzzy Jaccard similarity
  for (const item of existingQuestions) {
    const similarity = calculateJaccardSimilarity(candidateText, item.questionText);
    if (similarity >= similarityThreshold) {
      return {
        isDuplicate: true,
        matchedQuestion: item.questionText,
        score: similarity,
      };
    }
  }

  return { isDuplicate: false };
}
