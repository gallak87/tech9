import assert from 'node:assert/strict';
import {advanceLocomotionPhase,locomotionFrame,LOCOMOTION_STRIDE} from '../src/hero-motion.js';

const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-10,message);
const phaseDistance=(a,b)=>Math.min(Math.abs(a-b),1-Math.abs(a-b));

// Equal travel must produce equal poses at different refresh rates, regardless
// of pauses or how frames partition the same path.
for(const running of [false,true]){
  const speed=running?180:105;
  const stride=LOCOMOTION_STRIDE[running?'run':'walk'];
  const totalTime=2.37;
  const expected=advanceLocomotionPhase(.23,speed*totalTime,running);
  for(const hz of [30,60,144]){
    let phase=.23,elapsed=0;
    while(elapsed<totalTime){
      const dt=Math.min(1/hz,totalTime-elapsed);
      phase=advanceLocomotionPhase(phase,speed*dt,running);
      elapsed+=dt;
    }
    near(phaseDistance(phase,expected),0,`${hz} Hz ${running?'run':'walk'} follows travel`);
  }
  let phase=.04;
  const frames=[];
  for(let i=0;i<6;i++){
    frames.push(locomotionFrame(phase));
    phase=advanceLocomotionPhase(phase,stride/6,running);
  }
  assert.deepEqual(frames,[0,1,2,3,4,5],'a stride visits all six frame indices; artwork is not evaluated');
  near(phase,.04,'a full stride wraps to its original pose');
}

let stoppedPhase=.37;
for(let i=0;i<240;i++)stoppedPhase=advanceLocomotionPhase(stoppedPhase,0,true);
near(stoppedPhase,.37,'blocked movement does not advance phase');
near(advanceLocomotionPhase(.37,-20,true),.37,'invalid negative travel is ignored');
near(advanceLocomotionPhase(.37,Number.NaN,true),.37,'invalid travel is ignored');
assert.ok(advanceLocomotionPhase(.37,.01,true)>.37,'tiny real movement still advances gait');

// Sliding on one axis only advances by the actual surviving displacement.
const axisDistance=15;
near(advanceLocomotionPhase(0,axisDistance,true),axisDistance/LOCOMOTION_STRIDE.run);
near(advanceLocomotionPhase(0,Math.hypot(axisDistance,axisDistance),true),Math.SQRT2*axisDistance/LOCOMOTION_STRIDE.run);

const walked=advanceLocomotionPhase(.2,21,false);
const startedRunning=advanceLocomotionPhase(walked,0,true);
near(startedRunning,walked,'changing speed or resuming movement preserves the foot in flight');
near(advanceLocomotionPhase(startedRunning,26,true),.7,'running advances using its longer stride');
assert.equal(locomotionFrame(1),0);
assert.equal(locomotionFrame(-.1),5);
assert.equal(locomotionFrame(Number.NaN),0);
console.log('Locomotion phase helpers verified: distance, cadence, pause/resume and collision travel; renderer integration remains paused.');
