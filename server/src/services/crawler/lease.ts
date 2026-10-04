import { DistributedLeaderLock } from '../leaderLock';

/** Ingestion and destructive cleanup share ownership; force never bypasses an active owner. */
export class CrawlerLease {
  private readonly lock = new DistributedLeaderLock({ lockKey: 'pairtalk:crawler:lock', ttlMs: 60000 });
  private timer: NodeJS.Timeout | undefined;
  private heartbeat: Promise<void> | undefined;
  private closed = false;
  private lost = false;

  async acquire(): Promise<boolean> {
    if (!await this.lock.acquire()) return false;
    this.schedule();
    return true;
  }

  private schedule(): void {
    if (this.closed || this.lost) return;
    this.timer = setTimeout(() => {
      this.heartbeat = this.lock.renew().then(owned => {
        if (!owned) this.lost = true;
        this.schedule();
      });
    }, 20000);
  }

  async assertOwned(): Promise<void> {
    if (this.closed || this.lost || !await this.lock.renew()) {
      this.lost = true;
      throw new Error('Crawler lease lost; further content changes stopped.');
    }
    if (this.closed || this.lost) throw new Error('Crawler lease lost; further content changes stopped.');
  }

  async release(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    await this.heartbeat;
    await this.lock.release();
  }
}
