import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

async function main() {
  console.log('=== Google Gemini API Key Diagnostic Tool ===\n');

  const rawKey = process.env.GEMINI_API_KEY;
  if (!rawKey) {
    console.error('❌ ERROR: GEMINI_API_KEY environment variable is NOT set in .env or environment.');
    console.error('👉 Please set GEMINI_API_KEY=AIzaSy... in your environment or .env file.');
    process.exit(1);
  }

  const cleanKey = rawKey.trim().replace(/^["']|["']$/g, '').trim();
  const masked = cleanKey.length > 8 
    ? `${cleanKey.substring(0, 6)}...${cleanKey.substring(cleanKey.length - 4)}` 
    : '***';

  console.log(`🔑 Key detected: ${masked} (length: ${cleanKey.length} chars)`);
  if (rawKey.startsWith('"') || rawKey.startsWith("'")) {
    console.warn('⚠️ WARNING: Your GEMINI_API_KEY variable had surrounding quotation marks which were automatically stripped.');
  }

  const genAI = new GoogleGenerativeAI(cleanKey);

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const modelName of models) {
    console.log(`\n⏳ Testing model: ${modelName}...`);
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const prompt = `Return a JSON object with: {"status": "ok", "model": "${modelName}", "speakingQuestionValid": true}`;
      const response = await model.generateContent(prompt);
      const text = response.response.text();

      console.log(`✅ SUCCESS with ${modelName}!`);
      console.log(`📄 Response: ${text.trim()}`);
    } catch (err: unknown) {
      console.error(`❌ FAILED with ${modelName}:`);
      if (err instanceof Error) {
        console.error(`   Message: ${err.message}`);
        console.error(`   Name:    ${err.name}`);
        if ((err as any).status) {
          console.error(`   Status:  ${(err as any).status}`);
        }
      } else {
        console.error(`   Error:   ${String(err)}`);
      }
    }
  }

  console.log('\n=== Diagnostic Complete ===');
}

main().catch((err) => {
  console.error('Unhandled fatal error:', err);
  process.exit(1);
});
