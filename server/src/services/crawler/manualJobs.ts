import { prisma } from '../../config/database';
import { questionIngestionService } from './ingestionService';
import { logger } from '../../utils/logger';
import { CrawlerLease } from './lease';

export async function recoverManualCrawlerJobs(): Promise<void> {
  const staleBefore = new Date(Date.now()-120000);
  const stale = { status:{in:['PROCESSING','RUNNING']}, requestJson:{not:null}, startedAt:{lt:staleBefore} };
  if (await prisma.crawlerSyncLog.count({where:stale})) {
    const lease = new CrawlerLease();
    if (await lease.acquire()) {
      try {
        await lease.assertOwned();
        await prisma.crawlerSyncLog.updateMany({where:stale,data:{status:'FAILED',completedAt:new Date(),errors:'The worker was interrupted. Retry this crawl.'}});
      } finally { await lease.release(); }
    }
  }
  const jobs = await prisma.crawlerSyncLog.findMany({where:{status:'QUEUED'},orderBy:{startedAt:'asc'},take:1});
  for (const job of jobs) {
    const claimed = await prisma.crawlerSyncLog.updateMany({where:{id:job.id,status:'QUEUED'},data:{status:'PROCESSING',startedAt:new Date()}});
    if (claimed.count!==1) continue;
    try {
      const input = JSON.parse(job.requestJson || '{}');
      const result = await questionIngestionService.runIngestion({syncLogId:job.id,customUrl:input.customUrl,deepCrawl:input.deepCrawl===true});
      if (result.status==='LOCKED') await prisma.crawlerSyncLog.updateMany({where:{id:job.id,status:'PROCESSING'},data:{status:'QUEUED'}});
      else await prisma.crawlerSyncLog.update({where:{id:job.id},data:{status:result.status,completedAt:new Date(),sourcesProcessed:result.sourcesProcessed,questionsDiscovered:result.questionsDiscovered,questionsAccepted:result.questionsAccepted,duplicatesSkipped:result.duplicatesSkipped,topicsCreated:result.topicsCreated,durationMs:result.durationMs,errors:result.error??null}});
    } catch {
      await prisma.crawlerSyncLog.update({where:{id:job.id},data:{status:'FAILED',completedAt:new Date(),errors:'Manual crawl could not complete. Retry from the admin dashboard.'}});
    }
  }
}

export function startManualCrawlerWorker(): () => Promise<void> {
  let stopped = false, active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = recoverManualCrawlerJobs().catch(error => logger.warn('Manual crawler worker unavailable',{service:'crawler'},error)).finally(()=>{active=undefined;});
  };
  const timer = setInterval(tick,5000); timer.unref(); tick();
  return async () => { stopped=true;clearInterval(timer);await active; };
}
