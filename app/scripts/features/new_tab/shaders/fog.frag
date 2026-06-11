precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                 hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p  = p * 2.1 + vec2(1.3, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2  uv = gl_FragCoord.xy / u_resolution;
  float t  = u_time * 0.04;

  float f = fbm(uv * 2.2 + vec2(t,        t * 0.55));
  f      += 0.55 * fbm(uv * 4.5 - vec2(t * 1.1, t * 0.35));
  f       = smoothstep(0.25, 0.80, f);

  gl_FragColor = vec4(0.80, 0.84, 0.90, f * 0.62);
}
