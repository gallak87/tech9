import * as T from 'three';
import { createOrielBackdrop } from '../levels/oriel/backdrop/index.js';
import { editorBiome } from './biomes.js';

const shellFragment = /* glsl */ `
varying vec3 ray;
uniform vec3 cylinderCenter;
uniform float cylinderRadius;
uniform bool cylinderAlongX;
uniform vec3 groundHaze;

float hash(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * vec3(.1031,.103,.0973));
  p += dot(p,p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float softenedBox(vec2 position, vec2 halfSize, vec2 softness) {
  vec2 band = 1. - smoothstep(halfSize - softness, halfSize + softness, abs(position));
  return band.x * band.y;
}

void main() {
  vec3 origin = (cameraPosition - cylinderCenter) / cylinderRadius;
  vec3 direction = normalize(ray);
  if (cylinderAlongX) {
    origin = origin.zyx;
    direction = direction.zyx;
  }
  origin.xy *= min(1.,.97 / max(length(origin.xy),.0001));

  // The road stays planar in the editor. The distant curved shell is an
  // optical backdrop and never occupies any world-space track or flight lane.
  float a = max(dot(direction.xy,direction.xy),.0001);
  float b = dot(origin.xy,direction.xy);
  float c = dot(origin.xy,origin.xy);
  float nearToAxis = max(0.,-b/a);
  float shellDistance = max(0.,(-b + sqrt(max(b*b + a*(1.-c),0.)))/a);
  vec3 wall = origin + direction * min(shellDistance,14.);
  float angle = atan(wall.x,wall.y);
  vec2 landscape = vec2(angle * 5.093,wall.z * 3.4);
  vec2 ward = floor(landscape);
  ward.x = mod(ward.x,32.);
  vec2 field = fract(landscape) - .5;
  vec2 edge = clamp(fwidth(landscape),.002,.22);
  float parcel = hash(ward);
  float strips = sin(field.y * (30.+14.*parcel) + field.x * 3.);
  float resolved = 1.-smoothstep(.02,.13,edge.y);
  vec3 crop = mix(vec3(.055,.14,.069),vec3(.24,.34,.14),parcel);
  crop *= 1. + strips * .09 * resolved;
  float embankment = softenedBox(field,vec2(.485,.473),edge);
  vec3 hall = mix(vec3(.25,.29,.22),crop,embankment);

  // Paint reservoirs, civic blocks and their shaded faces into the shell
  // itself. Their silhouettes read as inhabited districts on the far wall.
  vec2 lakePosition = vec2(field.x + .14 * sin(field.y * 5. + parcel * 7.),field.y);
  float lake = length(lakePosition / vec2(.34,.42));
  float water = (1. - smoothstep(.88,.98 + edge.y,lake)) * step(.68,parcel);
  hall = mix(hall,mix(vec3(.017,.19,.19),vec3(.037,.30,.28),water),water);
  vec2 street = landscape * vec2(3.,4.) + vec2(round(parcel * 2.)*.5,0.);
  vec2 plot = fract(street) - .5;
  vec2 roofEdge = clamp(fwidth(street),.003,.32);
  float city = smoothstep(.19,.32,parcel) * (1. - smoothstep(.55,.68,parcel));
  float building = hash(floor(street));
  float shadow = softenedBox(plot + vec2(.05,-.03),vec2(.33,.32),roofEdge);
  float roof = softenedBox(plot - vec2(.03),vec2(.23,.24 + building*.08),roofEdge);
  hall = mix(hall,vec3(.08,.10,.073),shadow * city * .76);
  hall = mix(hall,mix(vec3(.31,.34,.26),vec3(.63,.58,.39),building),roof * city);

  float seam = abs(fract(wall.z * .48 + .5) - .5);
  float ribbon = 1. - smoothstep(.012,.035,seam);
  hall = mix(hall,vec3(.44,.40,.25),ribbon * .67);
  float haze = 1.-exp(-shellDistance*.16);
  vec3 color = mix(hall,vec3(.43,.57,.54),.075 + .86 * haze);
  float aboveHorizon = smoothstep(-.03,.105,direction.y);
  color = mix(groundHaze,color,aboveHorizon);
  vec3 sunPosition = origin + direction * nearToAxis;
  float solarOffset = length(sunPosition.xy);
  if (nearToAxis > 0. && nearToAxis < shellDistance) {
    float collar = smoothstep(.43,.49,abs(fract(sunPosition.z*3.2)-.5));
    float linelight = 1. - smoothstep(.004,.008,solarOffset);
    float sunFade = mix(.64,1.,aboveHorizon);
    color += vec3(2.8,2.14,1.12) * linelight * (1. - .8 * collar) * sunFade;
    color += vec3(.31,.23,.09) * exp(-solarOffset*35.) * sunFade;
  }
  gl_FragColor = vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function orielShellLayout(bounds) {
  const center = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  const across = Math.min(size.x, size.z);
  const headroom = T.MathUtils.clamp(across * 0.11, 220, 400);
  // Fit the lower outside corner of the route and keep the sun above it.
  const minimumRadius = Math.max(
    980,
    Math.hypot(across * 0.5 + 180, size.y + headroom + 100),
    (across * 0.5 + 170) / 0.93,
  );
  const openRadius = Math.max(1650, across * 1.06, size.y * 1.9);
  const radius = T.MathUtils.lerp(
    minimumRadius,
    Math.max(minimumRadius, openRadius),
    0.5,
  );
  center.y =
    (bounds.isEmpty() ? 0 : bounds.max.y) +
    headroom +
    (radius - minimumRadius) * 0.5;
  return {
    center,
    radius,
    alongX: size.x > size.z,
    across,
    length: Math.max(size.x, size.z),
  };
}

export function createEditorOrielBackdrop(document, track) {
  const source = createOrielBackdrop();
  const material = source.group.children[0].material;
  const uniforms = {
    cylinderCenter: { value: new T.Vector3() },
    cylinderRadius: { value: 980 },
    cylinderAlongX: { value: false },
    groundHaze: { value: new T.Color(editorBiome('oriel').renderer.fog.color) },
  };
  material.uniforms = uniforms;
  material.fragmentShader = shellFragment;
  const fitBounds = (bounds) => {
    const { center, radius, alongX } = orielShellLayout(bounds);
    uniforms.cylinderCenter.value.copy(center);
    uniforms.cylinderRadius.value = radius;
    uniforms.cylinderAlongX.value = alongX;
  };
  source.fitTrack = (currentTrack) =>
    fitBounds(currentTrack?.bounds ?? new T.Box3());
  fitBounds(
    track?.bounds ??
      new T.Box3().setFromPoints(
        (document.points ?? []).map(({ x, y, z }) => new T.Vector3(x, y, z)),
      ),
  );
  return source;
}
