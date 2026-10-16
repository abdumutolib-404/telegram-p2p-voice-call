import { reserveCredit } from './credits';
import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod, calculateEffectiveCallDuration } from './plan';
import { getActiveBonusCallsCount } from './referralService';
import { hasAcceptedCurrentTerms } from './terms';

/** All call creation paths share ordered participant locks, including pending invitations. */
export async function admitCall(userAId: string, userBId: string, roomName: string, status: 'ACTIVE' | 'PENDING') {
  if (userAId === userBId) throw new Error('A call requires two different participants.');
  return prisma.$transaction(async tx => {
    for (const id of [userAId, userBId].sort()) await lockRow(tx, 'User', id);
    const users = await Promise.all([userAId, userBId].map(id => tx.user.findUnique({ where: { id } })));
    await tx.callSession.updateMany({where:{status:"PENDING",createdAt:{lte:new Date(Date.now()-60000)},OR:[{userAId:{in:[userAId,userBId]}},{userBId:{in:[userAId,userBId]}}]},data:{status:"CANCELLED",endedAt:new Date(),duration:0}});
    const durationUsers=[];
    const walletUsers=new Set<string>();
    for (const user of users) {
      if (!user?.onboarded || !hasAcceptedCurrentTerms(user) || user.isPermanentlyBanned || (user.isBanned && !user.bannedUntil) || (user.bannedUntil && user.bannedUntil > new Date()) || (status === 'PENDING' && user.id === userBId && user.dnd)) throw new Error('Participant is unavailable.');
      const active = await tx.callSession.findFirst({ where: { status: { in: ['ACTIVE', 'PENDING'] }, OR: [{ userAId: user.id }, { userBId: user.id }] } });
      if (active) throw new Error('Participant already has an active or pending call.');
      const entitlement = getEffectiveEntitlement(user);
      const used = await getUserCallsUsedThisPeriod(user.id, user, tx);
      if (!entitlement.isUnlimited && used >= entitlement.callLimit && await getActiveBonusCallsCount(user.id, tx) <= 0) throw new Error('Participant call allowance has been reached.');
      const bonus=await getActiveBonusCallsCount(user.id,tx);
      const wantsThirty=user.preferredCallMinutes===30;
      const useWallet=!entitlement.isAdmin&&(used>=entitlement.baseCallLimit||(wantsThirty&&entitlement.maxDurationMinutes<30))&&(bonus<=0||wantsThirty);
      if(useWallet)walletUsers.add(user.id);
      durationUsers.push(useWallet?{...user,creditCallActive:true,activeCallCreditUnits:wantsThirty?2:1}:bonus>0&&used>=entitlement.baseCallLimit?{...user,creditCallActive:true,activeCallCreditUnits:1}:user);
    }
    const allowedMinutes=calculateEffectiveCallDuration(durationUsers[0],durationUsers[1]);
    const session = await tx.callSession.create({ data: { roomName, userAId, userBId, status,allowedMinutes } });
    for (const user of users) {
      if (!user) continue;
      if (walletUsers.has(user.id)) await reserveCredit(tx,session.id,user.id,'CALL');
    }
    return session;
  }, { maxWait: 10000, timeout: 15000 });
}

export async function activatePendingCall(id: string) {
  return prisma.$transaction(async tx => {
    const invitation = await tx.callSession.findUnique({where:{id}});
    if (!invitation || invitation.status !== 'PENDING' || invitation.createdAt.getTime() + 60000 <= Date.now()) return {count:0};
    for (const userId of [invitation.userAId,invitation.userBId].sort()) await lockRow(tx,'User',userId);
    for (const userId of [invitation.userAId,invitation.userBId]) {
      const user=await tx.user.findUnique({where:{id:userId}});
      if (!user?.onboarded || !hasAcceptedCurrentTerms(user) || user.isPermanentlyBanned || (user.isBanned && !user.bannedUntil) || (user.bannedUntil && user.bannedUntil > new Date())) throw new Error('Participant is unavailable.');
      if (userId === invitation.userBId && user.dnd) throw new Error('Participant is unavailable.');
      const entitlement=getEffectiveEntitlement(user),used=await getUserCallsUsedThisPeriod(user.id,user,tx);
      if (!entitlement.isUnlimited && !user.creditCallActive && used >= entitlement.callLimit && await getActiveBonusCallsCount(user.id,tx) <= 0) throw new Error('Participant call allowance has been reached.');
    }
    return tx.callSession.updateMany({where:{id,status:'PENDING',createdAt:{gt:new Date(Date.now()-60000)}},data:{status:'ACTIVE'}});
  },{maxWait:10000,timeout:15000});
}
