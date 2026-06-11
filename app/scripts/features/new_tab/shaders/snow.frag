precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float snowLayer(vec2 uv, float density, float speed, float size, float layer) {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 grid    = vec2(uv.x * aspect, uv.y) * density;
  vec2 cell    = floor(grid);
  vec2 pos     = fract(grid);

  float t    = mod(u_time * speed + hash(vec3(cell, layer)), 1.0);
  float sway = sin(u_time * (0.3 + 0.4 * hash(vec3(cell, layer + 1.0)))
             + hash(vec3(cell, layer + 2.0)) * 6.28318) * 0.2;

  vec2 flake = pos - vec2(0.5 + sway, 1.0 - t);
  float b    = hash(vec3(cell, layer + 3.0));
  return smoothstep(size, 0.0, length(flake)) * (0.5 + 0.5 * b);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  float s = snowLayer(uv,  6.0, 0.08,  0.06,  0.0)
          + snowLayer(uv, 13.0, 0.14,  0.04, 10.0) * 0.75
          + snowLayer(uv, 22.0, 0.22,  0.025, 20.0) * 0.5;

  s = clamp(s, 0.0, 1.0);
  gl_FragColor = vec4(0.93, 0.97, 1.0, s * 0.88);
}
