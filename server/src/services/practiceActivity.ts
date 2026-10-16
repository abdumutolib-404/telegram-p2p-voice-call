import { prisma } from '../config/database';
import { getRedis, isRedisReady } from '../config/redis';

export const SURGE_MINIMUM=12;
export async function practiceActivity(now=new Date()) {
  if(!isRedisReady())return null;
  const redis=getRedis(),bands=Array.from({length:11},(_,i)=>(4+i/2).toFixed(1));
  const [active,learners,queues]=await Promise.all([
    prisma.callSession.count({where:{status:'ACTIVE'}}),
    prisma.user.count({where:{lastActiveAt:{gte:new Date(now.getTime()-7*86400000)},isBanned:false,isPermanentlyBanned:false}}),
    Promise.all(bands.map(band=>redis.scard(`match_queue:band:${band}`))),
  ]);
  const callersCount=active*2,queuedCount=queues.reduce((sum,n)=>sum+n,0);
  return {callersCount,queuedCount,totalCount:callersCount+queuedCount,threshold:Math.max(SURGE_MINIMUM,Math.floor(learners*.1))};
}

const compatibleScript=`-- OPTIONAL_REMINDER_COMPATIBLE_QUEUE
local self_id=ARGV[1]
local minutes=tonumber(ARGV[2])
for _,pool in ipairs(KEYS) do
  local candidates=redis.call('SRANDMEMBER',pool,100)
  for _,id in ipairs(candidates) do
    if id~=self_id and redis.call('GET','user_queue:'..id) and (tonumber(redis.call('GET','match_duration:'..id)) or 15)==minutes then return 1 end
  end
end
return 0`;
export async function hasCompatiblePracticeQueue(user:{id:string;band:number;preferredCallMinutes:number}) {
  if(!isRedisReady())return false;
  const center=Math.round(user.band*2)/2,bands=[-1,-.5,0,.5,1].map(n=>center+n).filter(n=>n>=4&&n<=9);
  if(!bands.length)return false;
  const keys=bands.map(n=>`match_queue:band:${n.toFixed(1)}`);
  return await getRedis().eval(compatibleScript,keys.length,...keys,user.id,String(user.preferredCallMinutes===30?30:15))===1;
}
