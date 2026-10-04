import { prisma } from '../../config/database';
import { lockRow } from '../../utils/transactionLock';

/** The parent lock also coordinates with the key-share lock taken by question FK inserts. */
export async function purgeEmptyNonCanonicalTopic(id: string, canonicalSlugs: ReadonlySet<string>): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await lockRow(tx, 'IeltsTopic', id);
    const topic = await tx.ieltsTopic.findUnique({ where: { id } });
    if (!topic || canonicalSlugs.has(topic.slug)) return false;
    if (await tx.ieltsQuestion.count({ where: { topicId: id } }) !== 0) return false;
    await tx.ieltsTopic.delete({ where: { id } });
    return true;
  });
}
