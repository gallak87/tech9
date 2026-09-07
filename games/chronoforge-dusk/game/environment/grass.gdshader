shader_type spatial;
render_mode cull_disabled;
uniform float coast_time = 0.0;
varying vec3 world;
void vertex() {
    world=(MODEL_MATRIX*vec4(VERTEX,1)).xyz;
    float h=clamp(VERTEX.y,0.0,1.2);
    VERTEX.x+=sin(coast_time*1.7+world.x*.8+world.z*.6)*h*h*.10;
    VERTEX.z+=sin(coast_time*1.1+world.x*.6)*h*h*.04;
}
void fragment() {
    float variation=fract(sin(dot(floor(world.xz*8.0),vec2(13.1,51.7)))*1348.4);
    ALBEDO=mix(vec3(.075,.15,.055),vec3(.22,.29,.11),variation*.6+UV.y*.2);
    ROUGHNESS=.95;
    BACKLIGHT=vec3(.12,.15,.06);
}
