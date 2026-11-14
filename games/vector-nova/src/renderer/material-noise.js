/** The matching metric value-noise primitive used by mineral finishes. World
 * composition, sampling scales and different noise algorithms stay local. */
export function valueNoise3DGLSL(hash, noise) {
  return `
float ${hash}(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float ${noise}(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(${hash}(i),${hash}(i+vec3(1,0,0)),f.x),mix(${hash}(i+vec3(0,1,0)),${hash}(i+vec3(1,1,0)),f.x),f.y),mix(mix(${hash}(i+vec3(0,0,1)),${hash}(i+vec3(1,0,1)),f.x),mix(${hash}(i+vec3(0,1,1)),${hash}(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
}
