import 'dotenv/config';
import { prisma, connectDB, disconnectDB } from '../src/config/database';

export const EMOJI_REGEX = /(?:\p{Extended_Pictographic}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{200D}])/u;

export const JUNK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /will these questions be/i, reason: 'student_question_query' },
  { pattern: /how long should/i, reason: 'student_timing_faq' },
  { pattern: /asked in 202/i, reason: 'student_exam_date_query' },
  { pattern: /\bwriting\b/i, reason: 'writing_task_leak' },
  { pattern: /\bevaluate\b/i, reason: 'essay_prompt_leak' },
  { pattern: /cause and effect/i, reason: 'essay_structure_leak' },
  { pattern: /probably by foot/i, reason: 'blogger_commentary' },
  { pattern: /is it good for improving/i, reason: 'student_advice_query' },
];

export function detectGarbageQuestion(text: string): { isGarbage: boolean; reason: string | null } {
  if (!text || text.trim().length === 0) {
    return { isGarbage: true, reason: 'empty_text' };
  }

  // 1. Emoji check
  if (EMOJI_REGEX.test(text)) {
    return { isGarbage: true, reason: 'contains_emoji' };
  }

  // 2. Junk phrase check
  for (const item of JUNK_PATTERNS) {
    if (item.pattern.test(text)) {
      return { isGarbage: true, reason: item.reason };
    }
  }

  return { isGarbage: false, reason: null };
}

export async function run(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('=== IELTS Question Database Garbage Purge ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (preview only, no deletions)' : 'LIVE EXECUTION (deleting garbage)'}`);

  try {
    await connectDB();
    const questions = await prisma.ieltsQuestion.findMany({
      select: {
        id: true,
        part: true,
        questionText: true,
        topicId: true,
        topic: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    console.log(`Total questions scanned in database: ${questions.length}`);

    const garbageItems: Array<{
      id: string;
      part: string;
      topic: string;
      text: string;
      reason: string;
    }> = [];

    for (const q of questions) {
      const check = detectGarbageQuestion(q.questionText);
      if (check.isGarbage) {
        garbageItems.push({
          id: q.id,
          part: q.part,
          topic: q.topic?.name || q.topicId,
          text: q.questionText,
          reason: check.reason || 'unknown',
        });
      }
    }

    if (garbageItems.length === 0) {
      console.log('✅ No garbage questions found. Database is 100% clean!');
      return;
    }

    console.log(`\nFound ${garbageItems.length} garbage question(s):\n`);
    for (const item of garbageItems) {
      console.log(`- [${item.reason}] (${item.part} | ${item.topic}) ID: ${item.id}`);
      console.log(`  "${item.text}"\n`);
    }

    if (isDryRun) {
      console.log(`\n[DRY RUN] ${garbageItems.length} question(s) would be permanently deleted. Re-run without --dry-run to purge.`);
    } else {
      console.log(`Purging ${garbageItems.length} garbage question(s)...`);
      const deleteResult = await prisma.ieltsQuestion.deleteMany({
        where: {
          id: { in: garbageItems.map((g) => g.id) },
        },
      });
      console.log(`✅ Successfully purged ${deleteResult.count} garbage question(s) from database!`);
    }
  } catch (error: any) {
    console.error('❌ Purge failed:', error.message || error);
    process.exitCode = 1;
  } finally {
    await disconnectDB().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  run();
}
