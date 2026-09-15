-- Deterministic native-pixel drawing primitives. No reference-image sampling.
local M={}
function M.round(v) return math.floor(v+.5) end
function M.add(a,b) return {a[1]+b[1],a[2]+b[2]} end
function M.sub(a,b) return {a[1]-b[1],a[2]-b[2]} end
function M.mix(a,b,t) return {a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t} end
function M.rot(p,a) local r=math.rad(a);local c,s=math.cos(r),math.sin(r);return {p[1]*c-p[2]*s,p[1]*s+p[2]*c} end
function M.localTo(origin,angle) return function(p) return M.add(origin,M.rot(p,angle)) end end
function M.map(points,fn) local out={};for i,p in ipairs(points) do out[i]=fn(p) end;return out end
function M.pixel(im,x,y,c)
 x,y=M.round(x),M.round(y)
 assert(x>=0 and x<im.width and y>=0 and y<im.height,'Drawing left canvas at '..x..','..y)
 im:drawPixel(x,y,c)
end
function M.line(im,a,b,c)
 local x,y,x2,y2=M.round(a[1]),M.round(a[2]),M.round(b[1]),M.round(b[2])
 local dx,dy=math.abs(x2-x),-math.abs(y2-y);local sx,sy=x<x2 and 1 or -1,y<y2 and 1 or -1;local err=dx+dy
 while true do
  M.pixel(im,x,y,c);if x==x2 and y==y2 then break end
  local e=2*err;if e>=dy then err=err+dy;x=x+sx end;if e<=dx then err=err+dx;y=y+sy end
 end
end
function M.poly(im,points,c,edge)
 local ps=M.map(points,function(p) return {M.round(p[1]),M.round(p[2])} end)
 local lo,hi=im.height,0;for _,p in ipairs(ps) do lo=math.min(lo,p[2]);hi=math.max(hi,p[2]) end
 for y=lo,hi do
  local xs={};local py=y+.01
  for i,p in ipairs(ps) do local q=ps[i%#ps+1]
   if (p[2]<=py and q[2]>py) or (q[2]<=py and p[2]>py) then xs[#xs+1]=p[1]+(py-p[2])*(q[1]-p[1])/(q[2]-p[2]) end
  end
  table.sort(xs)
  for i=1,#xs-1,2 do for x=math.ceil(xs[i]),math.floor(xs[i+1]) do M.pixel(im,x,y,c) end end
 end
 for i,p in ipairs(ps) do M.line(im,p,ps[i%#ps+1],edge or c) end
end
function M.disc(im,at,rx,ry,c)
 for y=math.ceil(at[2]-ry),math.floor(at[2]+ry) do for x=math.ceil(at[1]-rx),math.floor(at[1]+rx) do
  if ((x-at[1])/rx)^2+((y-at[2])/ry)^2<=1 then M.pixel(im,x,y,c) end
 end end
end
function M.basis(a,b)
 local dx,dy=b[1]-a[1],b[2]-a[2];local d=math.sqrt(dx*dx+dy*dy);assert(d>0)
 return function(t,w) return {a[1]+dx*t-dy/d*w,a[2]+dy*t+dx/d*w} end
end
function M.band(im,a,b,w1,w2,c,edge)
 local p=M.basis(a,b);M.poly(im,{p(0,-w1),p(1,-w2),p(1,w2),p(0,w1)},c,edge)
end
function M.limb(im,points,widths,c,edge)
 -- Draw the entire joint silhouette before filling it, so the two bones share a socket.
 for pass=1,2 do local extra=pass==1 and 1 or 0;local col=pass==1 and edge or c
  for i,p in ipairs(points) do M.disc(im,p,widths[i]+extra,widths[i]+extra,col) end
  for i=1,#points-1 do M.band(im,points[i],points[i+1],widths[i]+extra,widths[i+1]+extra,col) end
 end
end
function M.color(hex) return app.pixelColor.rgba(tonumber(hex:sub(1,2),16),tonumber(hex:sub(3,4),16),tonumber(hex:sub(5,6),16),255) end
return M
