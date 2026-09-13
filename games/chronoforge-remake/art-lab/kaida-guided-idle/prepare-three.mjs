// Deterministic INPUT preparation only. The model authors the candidate art.
// Node's built-in zlib keeps this experiment free of package/model installs.
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';
const here=new URL('./',import.meta.url);
const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
function chunk(type,data){const name=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([head,name,data,tail]);}
function save(name,w,h,pixels){const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)pixels.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);writeFileSync(new URL(name,here),Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
function read(bytes){
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);if(bytes[24]!==8||bytes[25]!==6||bytes[28]!==0)throw Error('Expected non-interlaced RGBA8 source atlas');
 const parts=[];for(let p=8;p<bytes.length;){const length=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')parts.push(bytes.subarray(p+8,p+8+length));p+=12+length;}
 const raw=inflateSync(Buffer.concat(parts)),pixels=Buffer.alloc(w*h*4),stride=w*4;
 const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unknown PNG filter');for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
 return {w,h,pixels};
}
const source=read(readFileSync(new URL('../../assets/kaida.png',here))),cell=181;
if(source.w!==cell*6||source.h!==cell*8)throw Error('Kaida atlas dimensions changed; update guide landmarks first.');
const reference=Buffer.alloc(cell*cell*4);for(let y=0;y<cell;y++)source.pixels.copy(reference,y*cell*4,y*source.w*4,(y*source.w+cell)*4);
// Original reference is preserved; this script only writes three-pose inputs.
const W=2304,H=1024,scale=4,offsetX=22,offsetY=156;
const board=Buffer.alloc(W*H*4),guide=Buffer.alloc(W*H*4);
for(let p=0;p<guide.length;p+=4){guide[p]=24;guide[p+1]=27;guide[p+2]=35;guide[p+3]=255;}
for(let p=0;p<board.length;p+=4){board[p]=32;board[p+1]=35;board[p+2]=41;board[p+3]=255;}
for(let col=0;col<3;col++)for(let y=0;y<cell*scale;y++)for(let x=0;x<cell*scale;x++){const src=(Math.floor(y/scale)*cell+Math.floor(x/scale))*4,dst=((y+offsetY)*W+col*768+x+offsetX)*4;const alpha=reference[src+3]/255;for(let ch=0;ch<3;ch++)board[dst+ch]=Math.round(reference[src+ch]*alpha+board[dst+ch]*(1-alpha));}
save('three-edit-target.png',W,H,board);
const point=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const p=(y*W+x)*4;for(let i=0;i<3;i++)guide[p+i]=color[i];guide[p+3]=255;};
function disc(x,y,r,color){for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(a*a+b*b<=r*r)point(x+a,y+b,color);}
function line(a,b,color,width=4){const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=steps;i++){const t=steps?i/steps:0;disc(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,width/2,color);}}
// Coordinates are local to the original sprite cell, not a generic mannequin.
const rest={head:[101,44],neck:[97,63],shoulderL:[81,66],shoulderR:[111,67],elbowL:[73,88],elbowR:[119,88],wristL:[69,109],wristR:[125,113],hipL:[86,102],hipR:[108,102],kneeL:[77,132],kneeR:[109,135],ankleL:[67,165],ankleR:[112,165],toeL:[72,174],toeR:[122,174],swordTip:[171,151]};
const inhale=structuredClone(rest);for(const name of ['neck','shoulderL','shoulderR'])inhale[name][1]-=1.5;inhale.head[1]-=1;inhale.elbowL[1]-=.75;inhale.elbowR[1]-=.75;
const gold=[242,201,112],cyan=[93,211,216],pink=[236,112,173],muted=[82,89,107];
const limbs=[['head','neck'],['neck','shoulderL'],['neck','shoulderR'],['shoulderL','elbowL'],['elbowL','wristL'],['shoulderR','elbowR'],['elbowR','wristR'],['shoulderL','hipL'],['shoulderR','hipR'],['hipL','hipR'],['hipL','kneeL'],['kneeL','ankleL'],['ankleL','toeL'],['hipR','kneeR'],['kneeR','ankleR'],['ankleR','toeR']];
const halfway=Object.fromEntries(Object.entries(rest).map(([name,p])=>[name,p.map((v,i)=>(v+inhale[name][i])/2)]));
for(const [col,pose] of [rest,halfway,inhale].entries()){
 const p=name=>[col*768+offsetX+pose[name][0]*scale,offsetY+pose[name][1]*scale];
 line([col*768+50,852],[col*768+718,852],muted,2);
 for(const [a,b]of limbs)line(p(a),p(b),cyan,5);
 for(const name of Object.keys(pose).filter(name=>name!=='swordTip'))disc(...p(name),6,cyan);
 line(p('wristR'),p('swordTip'),pink,5);
 for(const name of ['toeL','toeR','wristR','swordTip']){const [x,y]=p(name);line([x-12,y],[x+12,y],gold,3);line([x,y-12],[x,y+12],gold,3);}
}
for(const x of [768,1536])line([x,40],[x,984],muted,2);save('three-pose-guides.png',W,H,guide);
writeFileSync(new URL('three-landmarks.json',here),JSON.stringify({canvas:[W,H],cellWidth:768,sourceCell:[cell,cell],scale,offset:[offsetX,offsetY],rest,halfway,inhale,notes:'Visual reference only; not an editing mask or actual ControlNet conditioning. Gold marks are invariant anchors. Guide overlays must not appear in the generated art.'},null,2)+'\n');
console.log('Prepared one three-column target on a solid matte and rest/halfway/inhale guides.');
