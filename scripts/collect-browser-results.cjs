const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const response=await fetch('http://127.0.0.1:4183/qa/results',{signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,200);const data=await response.json();
 const canonical=screen=>screen.startsWith('IELTS Question Simulator Studio')?'IELTS Question Simulator Studio':screen.trim();
 const latest=new Map(),dialogs=[];
 for(const report of data.reports){if(![375,768,1440].includes(report.width))continue;const item={...report,screen:canonical(report.screen)};if(item.dialog){dialogs.push(item);continue;}latest.set(item.screen+'|'+item.width,item);}
 const results=[...latest.values()].sort((a,b)=>a.screen.localeCompare(b.screen)||a.width-b.width);
 assert.equal(results.length,27);for(const result of results){assert.equal(result.overflow,false);assert.equal(result.violations.length,0);}
 const output=path.resolve(__dirname,'../docs/verification/admin-browser.json');fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),syntheticFixtures:true,viewportResults:results,dialogResults:dialogs.slice(-1)},null,2)+'\n');
 console.log('Saved 27 layout/accessibility results: zero page overflow and zero axe violations.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
