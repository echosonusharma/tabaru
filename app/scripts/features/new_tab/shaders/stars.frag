precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float rand2(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

float star(vec2 uv, float density, float layer) {
  vec2 grid = floor(uv * density);
  vec2 jitter = vec2(rand2(grid + layer), rand2(grid + layer + 7.3)) - 0.5;
  vec2 offset = fract(uv * density) - 0.5 - jitter * 0.7;
  float r = rand2(grid + layer);
  float size = 0.015 + 0.025 * rand2(grid + layer + 2.1);
  float twinkle = 0.55 + 0.45 * sin(u_time * (1.2 + 2.8 * r) + r * 6.2832);
  return smoothstep(size, 0.0, length(offset)) * twinkle;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Three layers: large bright, medium, small dim
  float s = star(uv, 12.0, 0.0)
          + star(uv, 28.0, 13.0) * 0.65
          + star(uv, 55.0, 31.0) * 0.35;

  s = clamp(s, 0.0, 1.0);
  gl_FragColor = vec4(1.0, 1.0, 1.0, s);
}
