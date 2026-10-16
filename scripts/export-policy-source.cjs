// Render the same React content as the website; no second copy of policy prose.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]||path.join(root,'output/policies/source.json'));
  const {createServer}=await import(pathToFileURL(path.join(root,'landing/node_modules/vite/dist/node/index.js')).href);
  const {renderToStaticMarkup}=require('../landing/node_modules/react-dom/server');
  const server=await createServer({root:path.join(root,'landing'),server:{middlewareMode:true},appType:'custom'});
  try{
    const {pages}=await server.ssrLoadModule('/src/content.tsx');
    const routes=['/terms','/privacy','/community-guidelines','/refund-policy'];
    const data=routes.map(route=>({route,title:pages[route].eyebrow,heading:pages[route].heading,intro:pages[route].intro,sections:pages[route].sections.map(section=>({id:section.id,title:section.title,html:renderToStaticMarkup(section.body)}))}));
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n');
    console.log('Exported four published policy pages.');
  }finally{await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
