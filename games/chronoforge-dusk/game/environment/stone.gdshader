shader_type spatial;
render_mode specular_schlick_ggx;
uniform vec4 tint : source_color = vec4(0.30,0.335,0.31,1.0);
uniform bool vertical = false;
varying vec3 world;
varying vec3 world_normal;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void vertex() { world=(MODEL_MATRIX*vec4(VERTEX,1)).xyz; world_normal=MODEL_NORMAL_MATRIX*NORMAL; }
void fragment() {
    vec2 p=world.xz;
    if(vertical) { p=vec2(abs(world_normal.x)>0.5?world.z:world.x,world.y); }
    vec2 scale=vertical?vec2(1.28,0.64):vec2(1.35,0.88);
    vec2 cell=p/scale;
    cell.x+=mod(floor(cell.y),2.0)*0.5;
    vec2 id=floor(cell), uv=fract(cell);
    vec2 edge=min(uv,1.0-uv)*scale;
    float seam=min(edge.x,edge.y);
    float aa=max(fwidth(seam),0.002);
    float mortar=1.0-smoothstep(0.008-aa,0.023+aa,seam);
    float fine=noise(p*84.0);
    float wear=noise(p*1.9)*0.09+noise(p*8.0)*0.055+fine*0.025;
    vec3 stone=tint.rgb*(0.76+hash(id)*0.38)+wear-0.045;
    float moss=smoothstep(0.58,0.77,noise(p*0.7+7.0))*(vertical?0.18:0.32);
    stone=mix(stone,vec3(0.22,0.28,0.17),moss);
    ALBEDO=mix(stone,vec3(0.085,0.12,0.105),mortar*0.74);
    if(vertical) { ALBEDO*=mix(0.53,1.0,smoothstep(-2.0,0.3,world.y)); }
    float fracture=abs(uv.y-(0.28+uv.x*0.39+noise(p*15.0)*0.06));
    float crack=(1.0-smoothstep(0.002,0.01,fracture))*step(.84,hash(id+12.0));
    ALBEDO*=1.0-crack*.42;
    ROUGHNESS=0.83+fine*0.13;
    // Restrained pores and edge relief. Geometry still owns the silhouette.
    NORMAL_MAP=normalize(vec3((noise(p*64.0+0.03)-fine)*0.11,(noise(p*64.0+2.4)-fine)*0.11,1.0))*0.5+0.5;
    NORMAL_MAP_DEPTH=0.35;
}
