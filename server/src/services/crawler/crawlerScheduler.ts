import cron from 'node-cron';
import type { Bot } from 'grammy';
import type { MyContext } from '../../bot/types';
import { questionIngestionService } from './ingestionService';
import { questionFilterService } from './questionFilterService';
import { topicNotificationService } from '../topicNotificationService';
import { logger } from '../../utils/logger';

/**
 * Starts the Two-Tier Scheduled Lifecycle:
 * 1. Weekly Searcher (Sundays at 03:00 UTC): Autonomous deep web crawl & question discovery
 * 2. Daily Filter (Every day at 04:00 UTC): Question re-sorting, duplicate pruning & text cleanup
 */
export function startCrawlerLifecycleCron(botSupplier?: () => Bot<MyContext> | null) {
  logger.info('Initializing Two-Tier IELTS Question Lifecycle Scheduler', {
    service: 'crawler_scheduler',
  });

  // 1. Weekly Searcher: Every Sunday at 03:00 UTC ('0 3 * * 0')
  const weekly = cron.schedule('0 3 * * 0', async () => {
    logger.info('Running scheduled Weekly IELTS Searcher crawl...', {
      service: 'crawler_scheduler',
      event: 'weekly_searcher_run',
    });

    try {
      const result = await questionIngestionService.runIngestion({
        deepCrawl: true,
        onNewTopics: async (newCount, topics) => {
          const bot = botSupplier ? botSupplier() : null;
          if (bot) {
            await topicNotificationService.broadcastNewTopics(newCount, topics, bot);
          }
        },
      });

      logger.info('Weekly Searcher crawl completed', {
        service: 'crawler_scheduler',
        result,
      });
    } catch (err: unknown) {
      logger.error('Scheduled Weekly Searcher encountered error', {
        service: 'crawler_scheduler',
      }, err);
    }
  });

  // 2. Daily Filter: Every day at 04:00 UTC ('0 4 * * *')
  const daily = cron.schedule('0 4 * * *', async () => {
    logger.info('Running scheduled Daily IELTS Question Filter & Janitor cycle...', {
      service: 'crawler_scheduler',
      event: 'daily_filter_run',
    });

    try {
      const result = await questionFilterService.runFilterCycle();
      logger.info('Daily Question Filter cycle completed', {
        service: 'crawler_scheduler',
        result,
      });
    } catch (err: unknown) {
      logger.error('Scheduled Daily Question Filter encountered error', {
        service: 'crawler_scheduler',
      }, err);
    }
  });
  return () => { weekly.stop(); daily.stop(); };
}
