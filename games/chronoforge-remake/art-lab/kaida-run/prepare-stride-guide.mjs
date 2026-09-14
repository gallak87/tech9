// Code-native pose diagram only; no generated character pixels are edited.
import {writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
const width=1536,height=1024,pixels=Buffer.alloc(width*height*4);
for(let i=0;i<pixels.length;i+=4){pixels[i]=38;pixels[i+1]=42;pixels[i+2]=52;pixels[i+3]=255;}
const circle=(x,y,r,color)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(height-1,y+r);yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(width-1,x+r);xx++)if((xx-x)**2+(yy-y)**2<=r*r){const i=(yy*width+xx)*4;for(let c=0;c<3;c++)pixels[i+c]=color[c];}};
const line=(a,b,color,r=8)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=n;i++)circle(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,r,color);};
// Four frames read left-to-right then top-to-bottom. Near leg = cyan, far = orange.
// 1 near foot forward/contact; 2 near support, far knee lifted;
// 3 far foot forward/contact, near leg folds BEHIND; 4 far support, near knee lifted.
const poses=[
 {near:[[380,280],[461,348],[489,452],[518,454]],far:[[366,280],[300,368],[340,402],[364,411]]},
 {near:[[380,286],[364,362],[350,452],[382,454]],far:[[366,286],[469,302],[430,371],[456,379]]},
 {near:[[380,280],[300,368],[340,402],[364,411]],far:[[366,280],[461,348],[489,452],[518,454]]},
 {near:[[380,286],[469,302],[430,371],[456,379]],far:[[366,286],[364,362],[350,452],[382,454]]},
];
for(let f=0;f<4;f++){
 const ox=f%2*768,oy=Math.floor(f/2)*512,at=p=>[p[0]+ox,p[1]+oy];
 line(at([90,456]),at([680,456]),[90,96,114],1);
 const p=poses[f];
 for(const [key,color]of [['far',[245,163,82]],['near',[78,222,235]]])for(let i=1;i<p[key].length;i++)line(at(p[key][i-1]),at(p[key][i]),color,10);
 line(at([375,280]),at([412,173]),[220,220,215],14);circle(...at([429,116]),36,[220,220,215]);
 line(at([414,176]),at([484,225]),[220,220,215],9);line(at([484,225]),at([526,182]),[220,220,215],9);
 line(at([395,176]),at([327,221]),[150,155,170],9);line(at([327,221]),at([288,254]),[150,155,170],9);
 line(at([286,254]),at([179,371]),[220,102,175],4);
 // One through four dots mark order without requiring a font dependency.
 for(let dot=0;dot<=f;dot++)circle(ox+52+dot*19,oy+45,5,[255,238,198]);
}
const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name),h=Buffer.alloc(4),tail=Buffer.alloc(4);h.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([h,type,data,tail]);};
const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;
const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
writeFileSync(new URL('stride-guide.png',import.meta.url),Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
