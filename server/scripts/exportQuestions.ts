import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/config/database';
import { IeltsPart } from '@prisma/client';
import { escapeCsvField } from '../src/utils/csv';

interface ExportOptions {
  topic?: string;
  part?: IeltsPart;
  format: 'json' | 'csv';
  out?: string;
  all?: boolean;
}

function parseArgs(): ExportOptions {
  const args = process.argv.slice(2);
  const options: ExportOptions = {
    format: 'json',
  };

  for (const arg of args) {
    if (arg === '--all') {
      options.all = true;
    } else if (arg.startsWith('--topic=')) {
      options.topic = arg.slice(8).trim();
    } else if (arg.startsWith('--part=')) {
      const p = arg.slice(7).trim().toUpperCase();
      if (['PART_1', 'PART_2', 'PART_3'].includes(p)) {
        options.part = p as IeltsPart;
      }
    } else if (arg.startsWith('--format=')) {
      const f = arg.slice(9).trim().toLowerCase();
      if (f === 'csv' || f === 'json') {
        options.format = f;
      }
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice(6).trim();
    }
  }

  return options;
}

async function run(): Promise<void> {
  const opts = parseArgs();
  console.log('=== IELTS Question Database Exporter ===');
  console.log(`Filter: ${opts.topic ? `Topic: ${opts.topic}` : 'All Topics'}`);
  if (opts.part) console.log(`Part: ${opts.part}`);
  console.log(`Format: ${opts.format.toUpperCase()}`);

  try {
    const where: any = { isActive: true };

    if (opts.part) {
      where.part = opts.part;
    }

    if (opts.topic && opts.topic !== 'all') {
      where.OR = [
        { topicId: opts.topic },
        { topic: { slug: opts.topic } },
        { topic: { name: { contains: opts.topic, mode: 'insensitive' } } },
      ];
    }

    const questions = await prisma.ieltsQuestion.findMany({
      where,
      orderBy: [{ topic: { name: 'asc' } }, { part: 'asc' }, { createdAt: 'desc' }],
      include: {
        topic: true,
      },
    });

    console.log(`Fetched ${questions.length} question(s) from database.`);

    if (questions.length === 0) {
      console.log('No matching questions found.');
      process.exit(0);
    }

    // Determine output file
    const defaultDir = path.resolve(__dirname, '..', 'exports');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const topicSlug = opts.topic ? opts.topic.replace(/[^a-z0-9_-]/gi, '_') : 'all';
    const defaultFileName = `questions_${topicSlug}_${timestamp}.${opts.format}`;
    const outPath = opts.out ? path.resolve(process.cwd(), opts.out) : path.join(defaultDir, defaultFileName);

    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    if (opts.format === 'json') {
      const outputData = {
        exportedAt: new Date().toISOString(),
        totalQuestions: questions.length,
        filter: {
          topic: opts.topic || 'ALL',
          part: opts.part || 'ALL',
        },
        questions: questions.map((q) => ({
          id: q.id,
          part: q.part,
          topicName: q.topic?.name ?? 'Unknown',
          topicSlug: q.topic?.slug ?? 'unknown',
          questionText: q.questionText,
          cueCardBullets: q.cueCardBullets ? (q.cueCardBullets.startsWith('[') ? JSON.parse(q.cueCardBullets) : q.cueCardBullets) : null,
          questionType: q.questionType,
          source: q.source,
          sourceUrl: q.sourceUrl,
          createdAt: q.createdAt.toISOString(),
        })),
      };

      fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf8');
    } else {
      // CSV Export
      const headers = [
        'ID',
        'Part',
        'Topic Name',
        'Topic Slug',
        'Question Text',
        'Cue Card Bullets',
        'Question Type',
        'Source',
        'Source URL',
        'Created At',
      ];

      const rows = questions.map((q) => [
        escapeCsvField(q.id),
        escapeCsvField(q.part),
        escapeCsvField(q.topic?.name ?? ''),
        escapeCsvField(q.topic?.slug ?? ''),
        escapeCsvField(q.questionText),
        escapeCsvField(q.cueCardBullets ?? ''),
        escapeCsvField(q.questionType),
        escapeCsvField(q.source),
        escapeCsvField(q.sourceUrl ?? ''),
        escapeCsvField(q.createdAt.toISOString()),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      fs.writeFileSync(outPath, csvContent, 'utf8');
    }

    console.log(`\nSuccessfully exported to: ${outPath}`);
    console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

    // Topic distribution summary
    const topicDist = new Map<string, number>();
    for (const q of questions) {
      const name = q.topic?.name || 'Unknown';
      topicDist.set(name, (topicDist.get(name) ?? 0) + 1);
    }

    console.log('\n--- Topic Distribution ---');
    for (const [topicName, count] of [...topicDist.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  * ${topicName}: ${count} question(s)`);
    }
  } catch (err) {
    console.error('Export failed:', err);
    process.exit(1);
  } finally {
    if (typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  }
}

void run();
