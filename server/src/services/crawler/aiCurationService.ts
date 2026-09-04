import { GoogleGenerativeAI, SchemaType, ResponseSchema } from '@google/generative-ai';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { CANONICAL_TOPIC_SLUGS, classifyTopic, normalizeToCanonicalSlug } from './taxonomy';

export interface GeminiConnectionState {
  status: 'CONNECTED' | 'FAILED' | 'NOT_CONFIGURED';
  model: string;
  lastChecked: string;
  lastError: string | null;
  latencyMs?: number;
}

export interface CuratedQuestionResult {
  index: number;
  isValidIeltsSpeaking: boolean;
  rejectionReason: string | null;
  part: 'PART_1' | 'PART_2' | 'PART_3';
  canonicalTopicSlug: string;
  cleanedText: string;
}

const curationResponseSchema: ResponseSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      index: {
        type: SchemaType.INTEGER,
        description: '0-based index of the question candidate matching the input array',
      },
      isValidIeltsSpeaking: {
        type: SchemaType.BOOLEAN,
        description: 'True if authentic IELTS Speaking prompt; False if student comment, FAQ, writing task, blog banter, or junk',
      },
      rejectionReason: {
        type: SchemaType.STRING,
        description: 'Reason for rejection if isValidIeltsSpeaking is false, e.g. student_comment, faq, writing_task_guide, blog_commentary, or null if valid',
      },
      part: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['PART_1', 'PART_2', 'PART_3'],
        description: 'IELTS Speaking part (PART_1: personal interview, PART_2: 2-minute cue card prompt, PART_3: abstract thematic discussion)',
      },
      canonicalTopicSlug: {
        type: SchemaType.STRING,
        format: 'enum',
        enum: [...CANONICAL_TOPIC_SLUGS],
        description: 'One of the 15 canonical Cambridge IELTS topic slugs',
      },
      cleanedText: {
        type: SchemaType.STRING,
        description: 'Cleaned question text with emojis, blog jokes, informal annotations stripped',
      },
    },
    required: ['index', 'isValidIeltsSpeaking', 'part', 'canonicalTopicSlug', 'cleanedText'],
  },
};

const SYSTEM_INSTRUCTION = `You are an expert Cambridge IELTS Speaking Examiner and Content Curator.
Your task is to analyze candidate questions scraped from the web and determine whether each question is an authentic, valid IELTS Speaking exam question (Part 1, Part 2 cue card, or Part 3 discussion).

Strict Rejection Criteria (set isValidIeltsSpeaking = false and specify rejectionReason):
1. student_comment: Questions asked by students/readers (e.g., "Will these questions be asked in 2022/2026?", "How long should my answer be?", "Is it good for improving?", "Can you give me feedback?").
2. faq: Meta-questions, test format guides, or FAQs (e.g., "How to prepare for IELTS?", "What score do I need for Canada?").
3. blog_commentary: Blogger side remarks, banter, rhetorical dialogue, or jokes (e.g., "Probably by foot I assume😂", "What do you think guys? Let me know below!").
4. writing_task_guide: IELTS Writing Task 1 or Task 2 prompts or essay writing instructions (e.g., questions with "the chart/graph below shows...", "write an essay", "evaluate - what do you think", "cause and effect essay", "write at least 250 words").
5. incomplete_or_garbage: Fragments, navigation labels, unintelligible text.

Strict Acceptance Criteria (isValidIeltsSpeaking = true, rejectionReason = null):
- Authentic examiner speaking prompts.
- Part 1: Brief personal interview question about everyday topics (hometown, studies, work, hobbies, daily habits).
- Part 2: Cue card prompts ("Describe a...", "Talk about a...").
- Part 3: In-depth analytical/opinion/societal discussion questions.

Cleaned Text:
- Strip all emojis (e.g. 🤔, 😂, 👀, 😭, 🥀).
- Strip leading question numbers, bullets, or blogger annotations (e.g. "1. ", "Q2: ", "(IELTS Liz)").
- Ensure proper punctuation and capitalization.

Canonical Topic Slug:
- MUST be strictly chosen from the 15 Cambridge IELTS canonical topic families:
  education-learning, work-career-ambition, hometown-urban-life, family-friends-people,
  technology-digital-life, media-entertainment, travel-tourism-transport, health-fitness-sports,
  food-dining-culinary, environment-nature-wildlife, art-music-culture,
  fashion-clothing-accessories, leisure-habits-daily, society-law-community, science-space-innovation.`;

/**
 * Strips emojis, leading numbering, and blogger annotations from question text.
 * Uses \p{Extended_Pictographic} to ensure comprehensive emoji coverage (e.g. ⏰, ⭐, etc.).
 * Preserves numbers at the beginning of sentences (e.g. "20 years ago...").
 */
export function stripEmojisAndJunk(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:\p{Extended_Pictographic}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{200D}])/gu, '')
    .replace(/^(?:(?:q|question)\s*\d+[:.)\s]*|(?:[•\-\*]|\d+[:.)])\s*)+/gi, '')
    .replace(/\s*\((?:ielts\s*liz|ielts\s*advantage|ielts\s*material|model\s*answer)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Robust heuristic curation fallback used when GEMINI_API_KEY is not configured or network call fails.
 */
export function heuristicCuration(
  candidate: { text: string; bullets?: string[]; contextTopic?: string },
  index: number,
): CuratedQuestionResult {
  const rawText = (candidate.text || '').trim();
  const cleanedText = stripEmojisAndJunk(rawText);
  const lower = rawText.toLowerCase();

  // 0. Detect empty, unintelligible or short fragments (< 10 chars)
  if (!cleanedText || cleanedText.length < 10) {
    return {
      index,
      isValidIeltsSpeaking: false,
      rejectionReason: 'incomplete_or_garbage',
      part: 'PART_1',
      canonicalTopicSlug: 'leisure-habits-daily',
      cleanedText,
    };
  }

  // 1. Detect student comment patterns
  if (
    lower.includes('will these questions') ||
    lower.includes('asked in 202') ||
    lower.includes('how long should') ||
    lower.includes('is it good for improving') ||
    lower.includes('can i get band') ||
    lower.includes('thank you so much') ||
    lower.includes('please reply') ||
    lower.includes('my exam is on') ||
    lower.includes('my test is on') ||
    lower.includes('give me feedback') ||
    lower.includes('give feedback') ||
    lower.includes('check my answer')
  ) {
    return {
      index,
      isValidIeltsSpeaking: false,
      rejectionReason: 'student_comment',
      part: 'PART_1',
      canonicalTopicSlug: 'leisure-habits-daily',
      cleanedText,
    };
  }

  // 2. Detect FAQ / blog commentary
  if (
    lower.includes('how to prepare') ||
    lower.includes('probably by foot') ||
    lower.includes('i assume') ||
    lower.includes('what do you think guys') ||
    lower.includes('leave a comment') ||
    lower.includes('frequently asked questions') ||
    lower.includes('test format faq')
  ) {
    return {
      index,
      isValidIeltsSpeaking: false,
      rejectionReason: lower.includes('probably by foot') ? 'blog_commentary' : 'faq',
      part: 'PART_1',
      canonicalTopicSlug: 'leisure-habits-daily',
      cleanedText,
    };
  }

  // 3. Detect IELTS Writing Task guide
  if (
    lower.includes('evaluate –') ||
    lower.includes('evaluate -') ||
    lower.includes('evaluate:') ||
    /\bevaluate\b/i.test(lower) ||
    lower.includes('cause and effect') ||
    lower.includes('writing task') ||
    lower.includes('write an essay') ||
    lower.includes('write at least 250 words') ||
    lower.includes('summarise the information') ||
    lower.includes('the graph below') ||
    lower.includes('the table below') ||
    lower.includes('the chart below') ||
    (lower.startsWith('writing') && lower.includes('task'))
  ) {
    return {
      index,
      isValidIeltsSpeaking: false,
      rejectionReason: 'writing_task_guide',
      part: 'PART_3',
      canonicalTopicSlug: 'education-learning',
      cleanedText,
    };
  }

  // 4. Validate authentic speaking prompt
  let part: 'PART_1' | 'PART_2' | 'PART_3' = 'PART_1';
  if (/^(?:describe|talk about)\s+/i.test(cleanedText) || (candidate.bullets && candidate.bullets.length > 0)) {
    part = 'PART_2';
  } else if (
    cleanedText.length > 100 ||
    /^(?:in what ways|to what extent|how do you think|why do some people|what are the advantages|do you agree that|what impact does)\b/i.test(cleanedText)
  ) {
    part = 'PART_3';
  }

  const topic = classifyTopic(cleanedText, candidate.bullets ? candidate.bullets.join(' ') : undefined, candidate.contextTopic);
  const canonicalTopicSlug = normalizeToCanonicalSlug(topic);

  return {
    index,
    isValidIeltsSpeaking: true,
    rejectionReason: null,
    part,
    canonicalTopicSlug,
    cleanedText,
  };
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) from Gemini responses.
 */
export function cleanJsonText(raw: string): string {
  let cleaned = (raw || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return cleaned;
}

/**
 * Default candidate models in priority order for 2026.
 * Gemini 2.5 Flash is the fast multimodal GA model; 2.5 Flash-Lite is ultra-efficient;
 * Gemini 3 Flash is frontier; legacy models included for backward compatibility.
 */
export const DEFAULT_GEMINI_MODELS: readonly string[] = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash',
  'gemini-2.0-flash',
];

export function getTargetGeminiModels(): string[] {
  const configuredModel = (process.env.GEMINI_MODEL || env.GEMINI_MODEL)?.trim();
  const models = configuredModel ? [configuredModel, ...DEFAULT_GEMINI_MODELS] : [...DEFAULT_GEMINI_MODELS];
  return Array.from(new Set(models.filter(Boolean)));
}

interface ListModelsResponse {
  models?: Array<{
    name: string;
    supportedGenerationMethods?: string[];
  }>;
}

let discoveredModelsCache: { models: string[]; timestamp: number } | null = null;
const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function _resetDiscoveredModelsCache(): void {
  discoveredModelsCache = null;
}

/**
 * Autonomously queries ModelService.ListModels on the Gemini API endpoint
 * to discover which models are currently available and support generateContent for the provided API key.
 */
export async function discoverSupportedGeminiModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (discoveredModelsCache && now - discoveredModelsCache.timestamp < DISCOVERY_CACHE_TTL_MS) {
    return discoveredModelsCache.models;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    if (typeof timeoutId.unref === 'function') timeoutId.unref();

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as ListModelsResponse;
    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    const validModels = data.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort((a, b) => {
        const score = (name: string) => {
          if (name.includes('2.5-flash') && !name.includes('lite')) return 100;
          if (name.includes('2.5-flash-lite')) return 90;
          if (name.includes('3-flash')) return 85;
          if (name.includes('flash') && !name.includes('lite')) return 80;
          if (name.includes('flash-lite')) return 70;
          if (name.includes('pro')) return 50;
          return 10;
        };
        return score(b) - score(a);
      });

    if (validModels.length > 0) {
      discoveredModelsCache = { models: validModels, timestamp: now };
    }

    return validModels;
  } catch {
    return [];
  }
}

export class AiCurationService {
  private geminiState: GeminiConnectionState | null = null;
  private lastCheckTimestamp = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds
  private inFlightCheck: Promise<GeminiConnectionState> | null = null;
  private activeModel: string | null = null;

  public getActiveModel(): string | null {
    return this.activeModel;
  }

  public getCandidateModels(): string[] {
    const base = getTargetGeminiModels();
    if (this.activeModel && !base.includes(this.activeModel)) {
      return [this.activeModel, ...base];
    }
    if (this.activeModel) {
      return [this.activeModel, ...base.filter((m) => m !== this.activeModel)];
    }
    return base;
  }

  private sanitizeErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err || 'Gemini ping failed');
    return raw
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza[REDACTED]');
  }

  public getSanitizedApiKey(): string | undefined {
    const rawApiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
    if (!rawApiKey) return undefined;
    const apiKey = rawApiKey.trim().replace(/^["']+|["']+$/g, '').trim();
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
      return undefined;
    }
    return apiKey;
  }

  /**
   * Directly tests Gemini connection with a minimal ping prompt ('ping').
   * Caches successful or failed results for 60 seconds unless forceLive = true.
   * Concurrently deduplicates live in-flight checks to prevent quota exhaustion.
   * Auto-falls back to ModelService.ListModels discovery if default models return 404.
   */
  public async checkGeminiConnection(forceLive = false): Promise<GeminiConnectionState> {
    const apiKey = this.getSanitizedApiKey();
    const defaultModel = this.activeModel || this.getCandidateModels()[0] || 'gemini-2.5-flash';
    if (!apiKey) {
      const state: GeminiConnectionState = {
        status: 'NOT_CONFIGURED',
        model: defaultModel,
        lastChecked: new Date().toISOString(),
        lastError: null,
      };
      this.geminiState = state;
      this.lastCheckTimestamp = Date.now();
      return state;
    }

    const now = Date.now();
    if (!forceLive && this.geminiState && now - this.lastCheckTimestamp < this.CACHE_TTL_MS) {
      return this.geminiState;
    }

    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    this.inFlightCheck = (async (): Promise<GeminiConnectionState> => {
      const startTime = Date.now();
      const modelsToTry = this.getCandidateModels();
      let succeededModel: string | null = null;
      let lastErr: unknown = null;
      let lastAttemptedModel = defaultModel;

      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        for (const modelName of modelsToTry) {
          lastAttemptedModel = modelName;
          let timeoutId: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Gemini ping timed out after 10000ms')), 10000);
            if (typeof timeoutId.unref === 'function') timeoutId.unref();
          });

          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const response = await Promise.race([model.generateContent('ping'), timeoutPromise]);
            if (response) {
              succeededModel = modelName;
              this.activeModel = modelName;
              break;
            }
          } catch (err) {
            lastErr = err;
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        // If candidate models failed or returned 404, trigger autonomous model discovery
        if (!succeededModel) {
          const discovered = await discoverSupportedGeminiModels(apiKey);
          for (const discoveredModel of discovered) {
            if (modelsToTry.includes(discoveredModel)) continue;
            lastAttemptedModel = discoveredModel;
            let timeoutId: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Gemini ping timed out after 10000ms')), 10000);
              if (typeof timeoutId.unref === 'function') timeoutId.unref();
            });

            try {
              const model = genAI.getGenerativeModel({ model: discoveredModel });
              const response = await Promise.race([model.generateContent('ping'), timeoutPromise]);
              if (response) {
                succeededModel = discoveredModel;
                this.activeModel = discoveredModel;
                break;
              }
            } catch (err) {
              lastErr = err;
            } finally {
              if (timeoutId) clearTimeout(timeoutId);
            }
          }
        }
      } catch (clientErr) {
        lastErr = clientErr;
      }

      const latencyMs = Date.now() - startTime;

      if (succeededModel) {
        const state: GeminiConnectionState = {
          status: 'CONNECTED',
          model: succeededModel,
          lastChecked: new Date().toISOString(),
          lastError: null,
          latencyMs,
        };
        this.geminiState = state;
        this.lastCheckTimestamp = Date.now();
        return state;
      } else {
        const errMsg = this.sanitizeErrorMessage(lastErr);
        const state: GeminiConnectionState = {
          status: 'FAILED',
          model: lastAttemptedModel,
          lastChecked: new Date().toISOString(),
          lastError: errMsg,
          latencyMs,
        };
        this.geminiState = state;
        this.lastCheckTimestamp = Date.now();
        return state;
      }
    })();

    try {
      return await this.inFlightCheck;
    } finally {
      this.inFlightCheck = null;
    }
  }

  /**
   * Returns the latest cached Gemini connection state.
   * If uninitialized and an API key is present, kicks off an in-flight check without poisoning the cache.
   */
  public getGeminiStatus(): GeminiConnectionState {
    if (this.geminiState) {
      return this.geminiState;
    }
    const defaultModel = this.activeModel || this.getCandidateModels()[0] || 'gemini-2.5-flash';
    const apiKey = this.getSanitizedApiKey();
    if (!apiKey) {
      const state: GeminiConnectionState = {
        status: 'NOT_CONFIGURED',
        model: defaultModel,
        lastChecked: new Date().toISOString(),
        lastError: null,
      };
      this.geminiState = state;
      this.lastCheckTimestamp = Date.now();
      return state;
    }

    // Trigger async background check so subsequent calls receive live verified state.
    // Notice lastCheckTimestamp is left at 0 so checkGeminiConnection(false) is NOT cache-blocked.
    void this.checkGeminiConnection(false).catch(() => undefined);

    const state: GeminiConnectionState = {
      status: 'CONNECTED',
      model: defaultModel,
      lastChecked: new Date().toISOString(),
      lastError: null,
    };
    this.geminiState = state;
    this.lastCheckTimestamp = 0;
    return state;
  }

  public _setCachedState(state: GeminiConnectionState | null): void {
    this.geminiState = state;
    this.lastCheckTimestamp = state ? Date.now() : 0;
    this.inFlightCheck = null;
    this.activeModel = state ? state.model : null;
    _resetDiscoveredModelsCache();
  }

  /**
   * Curates a batch of candidate questions using Gemini 2.0 Flash with strict responseSchema.
   * Gracefully falls back to heuristic curation if GEMINI_API_KEY is not configured or network call fails.
   */
  public async curateQuestionBatch(
    candidates: Array<{ text: string; bullets?: string[]; contextTopic?: string }>,
  ): Promise<CuratedQuestionResult[]> {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    // Chunk into batches of 50 for optimal Gemini throughput and reliability
    if (candidates.length > 50) {
      const results: CuratedQuestionResult[] = [];
      for (let i = 0; i < candidates.length; i += 50) {
        const slice = candidates.slice(i, i + 50);
        const sliceResults = await this.curateQuestionBatch(slice);
        for (let j = 0; j < sliceResults.length; j++) {
          sliceResults[j].index = i + j;
          results.push(sliceResults[j]);
        }
      }
      return results;
    }

    // Initialize with heuristic curation fallback results for guaranteed coverage
    const results: CuratedQuestionResult[] = candidates.map((c, i) => heuristicCuration(c, i));

    const apiKey = this.getSanitizedApiKey();
    const defaultModel = this.activeModel || this.getCandidateModels()[0] || 'gemini-2.5-flash';
    if (!apiKey) {
      this.geminiState = {
        status: 'NOT_CONFIGURED',
        model: defaultModel,
        lastChecked: new Date().toISOString(),
        lastError: null,
      };
      this.lastCheckTimestamp = Date.now();
      logger.debug('GEMINI_API_KEY not configured. Using heuristic curation fallback.', {
        service: 'ai_curator',
        count: candidates.length,
      });
      return results;
    }

    const startTime = Date.now();
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const promptPayload = JSON.stringify(
        candidates.map((c, idx) => ({
          index: idx,
          text: c.text,
          bullets: c.bullets || [],
          contextTopic: c.contextTopic,
        })),
      );

      const prompt = `Evaluate and curate the following ${candidates.length} candidate questions for Cambridge IELTS Speaking:\n${promptPayload}`;

      let responseText: string | null = null;
      let lastError: unknown = null;
      let succeededModel: string | null = null;
      let lastAttemptedModel = defaultModel;

      // Tier 1: Try candidate models in priority order
      const modelsToTry = this.getCandidateModels();
      for (const modelName of modelsToTry) {
        lastAttemptedModel = modelName;
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: curationResponseSchema,
              temperature: 0.1,
            },
            systemInstruction: SYSTEM_INSTRUCTION,
          });

          const response = await model.generateContent(prompt);
          responseText = response.response.text();
          if (responseText) {
            succeededModel = modelName;
            this.activeModel = modelName;
            break;
          }
        } catch (modelErr: unknown) {
          lastError = modelErr;
          const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr);
          logger.warn(`Gemini attempt with ${modelName} (structured schema) failed: ${errMsg}`, {
            service: 'ai_curator',
            model: modelName,
            error: errMsg,
          });

          // If schema rejected by API (400 / INVALID_ARGUMENT), retry prompt-based JSON without schema
          if (errMsg.includes('400') || errMsg.includes('schema') || errMsg.includes('INVALID_ARGUMENT')) {
            try {
              const promptJsonModel = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.1,
                },
                systemInstruction: `${SYSTEM_INSTRUCTION}\nOutput must be a valid JSON array of objects with keys: index (number), isValidIeltsSpeaking (boolean), rejectionReason (string or null), part (PART_1, PART_2, or PART_3), canonicalTopicSlug (string), cleanedText (string).`,
              });
              const response = await promptJsonModel.generateContent(prompt);
              responseText = response.response.text();
              if (responseText) {
                succeededModel = modelName;
                this.activeModel = modelName;
                break;
              }
            } catch (schemaFallbackErr: unknown) {
              lastError = schemaFallbackErr;
            }
          }
        }
      }

      // Tier 2: If candidate models failed or returned 404, trigger autonomous model discovery
      if (!responseText) {
        const discovered = await discoverSupportedGeminiModels(apiKey);
        for (const discoveredModel of discovered) {
          if (modelsToTry.includes(discoveredModel)) continue;
          lastAttemptedModel = discoveredModel;
          try {
            const model = genAI.getGenerativeModel({
              model: discoveredModel,
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: curationResponseSchema,
                temperature: 0.1,
              },
              systemInstruction: SYSTEM_INSTRUCTION,
            });

            const response = await model.generateContent(prompt);
            responseText = response.response.text();
            if (responseText) {
              succeededModel = discoveredModel;
              this.activeModel = discoveredModel;
              break;
            }
          } catch (discoveredErr: unknown) {
            lastError = discoveredErr;
          }
        }
      }

      if (!responseText) {
        const errMsg = this.sanitizeErrorMessage(lastError);
        this.geminiState = {
          status: 'FAILED',
          model: lastAttemptedModel,
          lastChecked: new Date().toISOString(),
          lastError: errMsg,
          latencyMs: Date.now() - startTime,
        };
        this.lastCheckTimestamp = Date.now();
        logger.warn(`Gemini AI Curation failed (${errMsg}). Falling back to heuristic curation.`, {
          service: 'ai_curator',
          error: errMsg,
        });
        return results;
      }

      const parsed = JSON.parse(cleanJsonText(responseText));

      if (Array.isArray(parsed)) {
        for (let k = 0; k < parsed.length; k++) {
          const item = parsed[k];
          if (!item || typeof item !== 'object') continue;

          // Determine target index: either explicit index or array position if within bounds
          let targetIdx = -1;
          if (typeof item.index === 'number' && item.index >= 0 && item.index < candidates.length) {
            targetIdx = item.index;
          } else if (k < candidates.length && (item.index === undefined || item.index === null)) {
            targetIdx = k;
          }

          if (targetIdx >= 0) {
            const isValid = Boolean(item.isValidIeltsSpeaking);
            const part: 'PART_1' | 'PART_2' | 'PART_3' =
              item.part === 'PART_2' ? 'PART_2' : item.part === 'PART_3' ? 'PART_3' : 'PART_1';
            const canonicalTopicSlug = normalizeToCanonicalSlug(item.canonicalTopicSlug);
            const cleanedText = item.cleanedText
              ? stripEmojisAndJunk(item.cleanedText)
              : stripEmojisAndJunk(candidates[targetIdx]?.text || '');

            results[targetIdx] = {
              index: targetIdx,
              isValidIeltsSpeaking: isValid,
              rejectionReason: isValid ? null : (item.rejectionReason || 'rejected_by_ai'),
              part,
              canonicalTopicSlug,
              cleanedText: cleanedText || stripEmojisAndJunk(candidates[targetIdx]?.text || ''),
            };
          }
        }

        this.geminiState = {
          status: 'CONNECTED',
          model: succeededModel || this.activeModel || defaultModel,
          lastChecked: new Date().toISOString(),
          lastError: null,
          latencyMs: Date.now() - startTime,
        };
        this.lastCheckTimestamp = Date.now();
        return results;
      }

      this.geminiState = {
        status: 'FAILED',
        model: lastAttemptedModel,
        lastChecked: new Date().toISOString(),
        lastError: 'AI Curation returned non-array JSON',
        latencyMs: Date.now() - startTime,
      };
      this.lastCheckTimestamp = Date.now();
      logger.warn('AI Curation returned non-array JSON. Using heuristic fallback.', {
        service: 'ai_curator',
        expected: candidates.length,
      });
      return results;
    } catch (err: unknown) {
      const errMsg = this.sanitizeErrorMessage(err);
      this.geminiState = {
        status: 'FAILED',
        model: defaultModel,
        lastChecked: new Date().toISOString(),
        lastError: errMsg,
        latencyMs: Date.now() - startTime,
      };
      this.lastCheckTimestamp = Date.now();
      logger.warn(`Gemini AI Curation failed (${errMsg}). Falling back to heuristic curation.`, {
        service: 'ai_curator',
        error: errMsg,
      });
      return results;
    }
  }

  /**
   * Curates a single candidate question.
   */
  public async curateQuestion(candidate: {
    text: string;
    bullets?: string[];
  }): Promise<CuratedQuestionResult> {
    const results = await this.curateQuestionBatch([candidate]);
    return results[0];
  }
}

export const aiCurationService = new AiCurationService();
