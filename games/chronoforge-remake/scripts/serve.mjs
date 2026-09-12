import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT || 4179);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
 try {
   const url=new URL(req.url,'http://localhost');
   let target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
   if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return;}
   if((await stat(target)).isDirectory()) target=path.join(target,'index.html');
   const data=await readFile(target);
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Chronoforge running at http://127.0.0.1:${port}`));
