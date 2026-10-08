import { isIP } from 'node:net';

/** Nonblocking admission stays held until authentication work actually settles. */
export function authenticationAdmission(globalLimit=16, perIpLimit=4) {
  let active=0;
  const peers=new Map<string,number>();
  return (address:string): (()=>void)|null => {
    const raw=address.replace(/^::ffff:/i,'');
    const peer=isIP(raw) ? raw.toLowerCase() : 'unknown';
    const count=peers.get(peer)??0;
    if(active>=globalLimit || count>=perIpLimit)return null;
    active++;peers.set(peer,count+1);
    let released=false;
    return ()=>{if(released)return;released=true;active--;const next=(peers.get(peer)??1)-1;if(next)peers.set(peer,next);else peers.delete(peer);};
  };
}
