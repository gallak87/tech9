import fs from 'node:fs';
import crypto from 'node:crypto';
import {ASSET_MANIFEST} from '../src/assets.js';
const root=new URL('../',import.meta.url);
const rows=ASSET_MANIFEST.map(entry=>{
 const data=fs.readFileSync(new URL('public/'+entry.url,root));
 return {id:entry.id,kind:entry.kind,biome:entry.biome||null,file:entry.url,width:data.readUInt32BE(16),height:data.readUInt32BE(20),sourceBytes:data.length,frames:entry.metadata?.frames?.length||entry.columns*entry.rows,sha256:crypto.createHash('sha256').update(data).digest('hex')};
});
// Inspect the live manifest on demand; do not create a second inventory in docs.
console.log(JSON.stringify({sourceCount:rows.length,compressedBytes:rows.reduce((n,r)=>n+r.sourceBytes,0),sources:rows},null,2));
