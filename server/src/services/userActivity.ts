import { prisma } from '../config/database';
/** Background/account updates do not count as a learner opening the product. */
export async function touchUserActivity(user:{id:string;lastActiveAt?:Date},now=new Date()) {
  if(!(user.lastActiveAt instanceof Date)||now.getTime()-user.lastActiveAt.getTime()<60000)return;
  const changed=await prisma.user.updateMany({where:{id:user.id,lastActiveAt:{lt:new Date(now.getTime()-60000)}},data:{lastActiveAt:now}});
  if(changed.count)user.lastActiveAt=now;
}
