export const FOLLOW_PATH_STEP=3;
export const FOLLOW_DISTANCE=72;

// Breadcrumbs are spaced for path history, not animation frames. Include the
// leader's partial step and interpolate the follower's position between them.
export function followerPosition(path,leader,distance) {
  if(!path.length)return {x:leader.x,y:leader.y,facing:leader.facing};
  const remainder=Math.min(FOLLOW_PATH_STEP,Math.hypot(leader.x-path[0].x,leader.y-path[0].y));
  const cursor=Math.max(0,(distance-remainder)/FOLLOW_PATH_STEP),index=Math.floor(cursor);
  const a=path[Math.min(index,path.length-1)],b=path[Math.min(index+1,path.length-1)],t=cursor-index;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,facing:a.facing};
}
