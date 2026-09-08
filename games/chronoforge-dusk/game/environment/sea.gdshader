shader_type spatial;
render_mode specular_schlick_ggx;
uniform float coast_time = 0.0;
varying vec3 world;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float rect(vec2 p,vec2 c,vec2 b) { vec2 q=abs(p-c)-b; return length(max(q,0.0))+min(max(q.x,q.y),0.0); }
void vertex() { world=(MODEL_MATRIX*vec4(VERTEX,1)).xyz; }
void fragment() {
    vec2 p=world.xz;
    float t=coast_time;
    float n=noise(p*0.23+vec2(t*0.025,0))+noise(p*1.5+vec2(0,t*0.035))*0.3;
    float shore=rect(p,vec2(-10,13),vec2(8,7));
    shore=min(shore,rect(p,vec2(-22,13.9),vec2(4,4.1)));
    shore=min(shore,rect(p,vec2(4,8),vec2(6,2)));
    shore=min(shore,rect(p,vec2(13.5,-2.5),vec2(3.5,15.5)));
    shore=min(shore,rect(p,vec2(1,-14),vec2(16,4)));
    shore=min(shore,rect(p,vec2(-12,-2),vec2(3,8)));
    shore=min(shore,rect(p,vec2(-11,-21),vec2(4,3)));
    float shallow=1.0-smoothstep(0.0,5.0,shore);
    vec3 water=mix(vec3(0.006,0.048,0.075),vec3(0.04,0.18,0.175),shallow*0.65+n*0.2);
    float wave=sin(shore*5.5-t*0.85+n*5.0);
    float foam=smoothstep(0.72,0.99,wave)*(1.0-smoothstep(0.3,2.6,shore))*smoothstep(0.25,0.8,noise(p*4.0+vec2(t*0.05)));
    foam*=smoothstep(0.32,0.70,noise(p*0.7+vec2(t*.08)));
    ALBEDO=mix(water,vec3(0.65,0.79,0.71),clamp(foam,0.0,0.72));
    float nx=cos(p.x*1.7+p.y*.8+t*.5)*.075+cos(p.x*4.1-p.y*2.3+t*.8)*.026;
    float ny=sin(p.y*2.5+p.x*.6+t*.65)*.075;
    NORMAL_MAP=normalize(vec3(nx,ny,1.0))*.5+.5;
    ROUGHNESS=0.29+foam*.42;
    METALLIC=0.12;
    SPECULAR=0.65;
}
