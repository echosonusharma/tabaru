#define PI 3.14159265
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

highp float random1d(float dt) {
  return fract(sin(mod(dt, 3.14)) * 43758.5453);
}

vec2 random_drop_pos(float val, vec2 screen_dim, vec2 velocity) {
  float max_x_move = velocity.x * abs(screen_dim.y / velocity.y);
  float x = -max_x_move * step(0.0, max_x_move)
           + (screen_dim.x + abs(max_x_move)) * random1d(val);
  float y = (1.0 + 0.05 * random1d(1.234 * val)) * screen_dim.y;
  return vec2(x, y);
}

float trail_alpha(vec2 pixel, vec2 pos, vec2 vel_dir, float width, float size) {
  vec2  pd   = pixel - pos;
  float proj = dot(pd, -vel_dir);
  float tang = dot(pd, pd) - proj * proj;
  float wsq  = width * width;
  float line = step(0.0, proj) * (1.0 - smoothstep(wsq * 0.5, wsq, tang));
  return line * (1.0 - smoothstep(size * 0.2, size, proj));
}

float wave_alpha(vec2 pixel, vec2 pos, float size, float t) {
  vec2  pd    = pixel - pos;
  float dist  = length(pd * vec2(1.0, 3.5));
  float inner = (0.05 + 0.8 * t) * size;
  float outer = inner + 0.25 * size;
  float ring  = smoothstep(inner, inner + 4.0, dist)
              * (1.0 - smoothstep(outer, outer + 4.0, dist));
  return ring * (1.0 - smoothstep(0.0, 0.7, t));
}

void main() {
  const float n_drops = 35.0;
  float trail_width   = 2.5;
  float trail_size    = 90.0;
  float wave_size     = 24.0;
  float fall_time     = 0.65;
  float life_time     = fall_time + 0.55;

  vec2 wind     = vec2((u_mouse.x - 0.5 * u_resolution.x) * 0.6, 0.0);
  vec2 velocity = wind + vec2(0.0, -0.95 * u_resolution.y / fall_time);
  vec2 vel_dir  = normalize(velocity);

  float alpha = 0.0;
  for (float i = 0.0; i < n_drops; i++) {
    float time    = u_time + life_time * (i + i / n_drops);
    float elapsed = mod(time, life_time);
    vec2  init    = random_drop_pos(
                      i + floor(time / life_time - i) * n_drops,
                      u_resolution, velocity);
    if (elapsed < fall_time) {
      alpha += trail_alpha(gl_FragCoord.xy, init + elapsed * velocity,
                           vel_dir, trail_width, trail_size);
    } else {
      alpha += wave_alpha(gl_FragCoord.xy, init + fall_time * velocity,
                          wave_size, elapsed - fall_time);
    }
  }

  alpha = clamp(alpha, 0.0, 0.88);
  gl_FragColor = vec4(0.78, 0.90, 1.0, alpha);
}
