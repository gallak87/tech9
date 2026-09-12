import {readdir,readFile,cp,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENEMIES,ITEMS} from '../src/data.js';
import {OBJECTS,INTERIORS} from '../src/world.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=await readdir(path.join(root,'src'));
for(const file of files.filter(f=>f.endsWith('.js'))){
  execFileSync(process.execPath,['--check',path.join(root,'src',file)]);
  const body=await readFile(path.join(root,'src',file),'utf8');
  for(const [,p] of body.matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/g)) await readFile(path.join(root,'src',p));
}
for(const hero of ['kaida','vex','rune']) await readFile(path.join(root,'assets',hero+'.png'));
const sprites=JSON.parse(await readFile(path.join(root,'assets/sprites/manifest.json'),'utf8'));
for(const [key,sheet] of Object.entries(sprites.sheets)){
  const png=await readFile(path.join(root,'assets/sprites',sheet.file));
  if(png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.readUInt32BE(16)<sheet.columns||png.readUInt32BE(20)<sheet.rows)throw Error('Invalid sprite sheet '+key);
  if(sheet.rowCuts&&(sheet.rowCuts.length!==sheet.rows+1||sheet.rowCuts[0]!==0||sheet.rowCuts.at(-1)!==png.readUInt32BE(20)||sheet.rowCuts.some((n,i)=>!Number.isInteger(n)||(i>0&&n<=sheet.rowCuts[i-1]))))throw Error('Invalid sprite row boundaries '+key);
}
for(const [kind,ids] of [['enemies',Object.keys(ENEMIES)],['items',Object.keys(ITEMS)],['npcs',[...OBJECTS,...Object.values(INTERIORS).flatMap(r=>r.objects)].filter(o=>o.type==='npc'&&!sprites.excluded.npcs.includes(o.id)).map(o=>o.id)]]){
  for(const id of ids)if(!sprites[kind][id])throw Error('Missing generated sprite mapping '+kind+'/'+id);
}
for(const kind of ['enemies','items','npcs','props'])for(const [id,entry] of Object.entries(sprites[kind])){
  const sheet=sprites.sheets[entry.sheet];if(!sheet)throw Error('Unknown sprite sheet for '+kind+'/'+id);
  const rows=kind==='enemies'?Object.values(entry.rows):[entry.row];
  if(rows.some(row=>row<0||row>=sheet.rows)||(entry.frames??(entry.col+1))>sheet.columns)throw Error('Sprite frame outside sheet '+kind+'/'+id);
}
const dist=path.join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist);
for(const entry of ['index.html','src','assets'])await cp(path.join(root,entry),path.join(dist,entry),{recursive:true});
console.log(`Build verified ${files.length} source files, 3 hero atlases and ${Object.keys(sprites.sheets).length} generated sprite sheets; static release in dist/.`);
