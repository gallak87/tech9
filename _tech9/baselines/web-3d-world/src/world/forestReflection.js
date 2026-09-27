import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';

/** Scene-owned low-frequency forest reflection field, authored entirely in source. */
export function createForestReflection(renderer) {
  const scene = new Scene();
  const geometry = new SphereGeometry(10, 32, 16);
  const material = new ShaderMaterial({
    side: BackSide,
    vertexShader:
      'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
    varying vec3 vDirection;
    void main(){
      vec3 d=normalize(vDirection);
      float angle=atan(d.z,d.x);
      float crown=0.38+0.09*sin(angle*7.0)+0.06*sin(angle*17.0+0.7);
      float trees=1.0-smoothstep(crown-0.13,crown+0.12,d.y);
      vec3 sky=mix(vec3(0.28,0.34,0.37),vec3(0.43,0.54,0.65),max(d.y,0.0));
      vec3 foliage=mix(vec3(0.028,0.042,0.032),vec3(0.085,0.11,0.085),max(d.y,0.0));
      vec3 color=mix(sky,foliage,trees);
      color=mix(vec3(0.035,0.032,0.025),color,smoothstep(-0.3,0.0,d.y));
      gl_FragColor=vec4(color,1.0);
    }`,
  });
  scene.add(new Mesh(geometry, material));
  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(scene, 0.06, 0.1, 30);
  } finally {
    generator.dispose();
    geometry.dispose();
    material.dispose();
  }
}
