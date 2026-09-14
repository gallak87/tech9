export const VIEW_WIDTH=960,VIEW_HEIGHT=600,MAX_RENDER_SCALE=3;

// Preserve logical game coordinates while supplying enough backing pixels for
// the displayed canvas. The cap covers a 1440px-wide Retina stage at 2x DPR.
export function displaySize(cssWidth,cssHeight,pixelRatio=1){
  const width=Number.isFinite(cssWidth)&&cssWidth>0?cssWidth:VIEW_WIDTH;
  const height=Number.isFinite(cssHeight)&&cssHeight>0?cssHeight:VIEW_HEIGHT;
  const ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
  const density=Math.min(ratio,VIEW_WIDTH*MAX_RENDER_SCALE/width,VIEW_HEIGHT*MAX_RENDER_SCALE/height);
  return {width:Math.max(1,Math.round(width*density)),height:Math.max(1,Math.round(height*density))};
}

export function createGameDisplay(canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('A 2D canvas is required to render the game.');
  let rect=canvas.getBoundingClientRect();
  const observer=new ResizeObserver(entries=>{
    const next=entries[0]?.contentRect;
    if(next?.width>0&&next.height>0)rect=next;
  });
  observer.observe(canvas);
  return {
    ctx,
    beginFrame(){
      // Checking DPR here also catches zoom and moving between monitors without
      // a CSS resize. Only a changed backing size allocates a new bitmap.
      const size=displaySize(rect.width,rect.height,window.devicePixelRatio||1);
      const resized=canvas.width!==size.width||canvas.height!==size.height;
      if(canvas.width!==size.width)canvas.width=size.width;
      if(canvas.height!==size.height)canvas.height=size.height;
      ctx.setTransform(size.width/VIEW_WIDTH,0,0,size.height/VIEW_HEIGHT,0,0);
      ctx.imageSmoothingEnabled=false; // Scenery remains nearest-neighbor.
      return resized;
    },
    dispose(){observer.disconnect();},
  };
}
