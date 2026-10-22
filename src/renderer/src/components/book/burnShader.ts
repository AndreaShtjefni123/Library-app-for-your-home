// A burning-paper effect drawn on the graphics card (WebGL). Everything is procedural: "noise"
// patterns shape a ragged burn edge, charring, a glowing ember line, ash, rising flames, sparks
// and smoke. No images or AI involved. Technique after Kyle Halladay's dissolve shader and the
// classic fbm fire (see the research notes in ROADMAP.md).

export const BURN_VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

export const BURN_FRAGMENT = `
precision highp float;
varying vec2 vUv;               // canvas position, y up
uniform sampler2D uTex;         // the cover
uniform float uProgress;        // 0 → 1 over the whole burn
uniform float uTime;            // seconds
uniform float uSeed;            // a different fire every time
uniform float uFire;            // flame strength (fades in and out)
uniform vec2 uRes;              // canvas size in pixels
uniform vec4 uCover;            // where the cover sits in the canvas: x, y (bottom-left), w, h
uniform vec4 uTexXf;            // object-fit: cover crop: scale.xy, offset.zw

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// Black → deep red → orange → yellow → white-hot, like real fire.
vec3 fireRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.0), vec3(0.55, 0.04, 0.0), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(1.0, 0.33, 0.02), smoothstep(0.25, 0.5, t));
  c = mix(c, vec3(1.0, 0.72, 0.22), smoothstep(0.5, 0.8, t));
  return mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.8, 1.0, t));
}

void main() {
  vec2 cuv = (vUv - uCover.xy) / uCover.zw;                 // 0..1 over the cover
  float aspect = (uCover.w * uRes.y) / (uCover.z * uRes.x);
  vec2 np = vec2(cuv.x, cuv.y * aspect);                    // even-sized noise
  float front = mix(-0.55, 1.3, uProgress);

  // A ragged burn edge, plus pockets that burn through ahead of it.
  float n = fbm(np * 3.0 + uSeed);
  float n2 = fbm(np * 9.0 - uSeed * 1.7);
  float field = cuv.y + (n - 0.5) * 0.45 + (n2 - 0.5) * 0.08 - smoothstep(0.62, 0.8, fbm(np * 2.2 + uSeed * 3.1)) * 0.25;
  float d = field - front;                                  // > 0 paper left, < 0 burnt away

  vec4 col = vec4(0.0);                                     // premultiplied colour
  bool inside = cuv.x >= 0.0 && cuv.x <= 1.0 && cuv.y >= 0.0 && cuv.y <= 1.0;
  if (inside) {
    float heat = 1.0 - smoothstep(0.0, 0.18, d);
    vec2 wob = vec2(fbm(np * 6.0 + uTime * 1.5) - 0.5, 0.0) * 0.006 * heat;   // heat shimmer
    vec2 tuv = (cuv + wob) * uTexXf.xy + uTexXf.zw;
    tuv.y = 1.0 - tuv.y;
    vec3 c = texture2D(uTex, tuv).rgb;
    c *= mix(vec3(1.0), vec3(0.78, 0.55, 0.32), smoothstep(0.18, 0.05, d));  // browning
    c = mix(c, vec3(0.05, 0.03, 0.02), smoothstep(0.06, 0.0, d));             // char
    float flick = 0.55 + 0.45 * fbm(np * 25.0 + vec2(0.0, -uTime * 4.0));
    float glow = exp(-max(d, 0.0) / 0.012) * step(-0.002, d) * flick;         // glowing ember line
    c += fireRamp(0.5 + 0.5 * glow) * glow * 1.4;
    float a = smoothstep(-0.004, 0.004, d);
    float ashZone = smoothstep(-0.035, 0.0, d) * (1.0 - a);                   // thin crumbly ash fringe
    float ash = ashZone * smoothstep(0.42, 0.6, fbm(np * 38.0 + uSeed));
    float speck = ashZone * smoothstep(0.72, 0.82, fbm(np * 70.0 + uTime * 2.0));
    vec3 ashC = vec3(0.09, 0.08, 0.07) + fireRamp(0.62) * speck * 1.6;
    col = vec4(c * a + ashC * ash, max(a, ash));
  }

  // Thin smoke just above the flames, only over the book.
  float hxs = smoothstep(-0.1, 0.15, cuv.x) * smoothstep(1.1, 0.85, cuv.x);
  float sm = smoothstep(0.35, 0.75, fbm(np * 3.0 - vec2(0.0, uTime * 0.6))) * smoothstep(0.1, 0.25, d) * smoothstep(0.55, 0.25, d) * 0.22 * uFire * hxs;
  col = vec4(vec3(0.13) * sm, sm) + col * (1.0 - sm);

  // Flames: swirling noise rising from the edge, fading with height.
  float hx = smoothstep(-0.06, 0.06, cuv.x) * smoothstep(1.06, 0.94, cuv.x);
  // Stretched upward so the fire forms tall, thin tongues rather than clouds.
  vec2 fq = vec2(np.x * 6.5, np.y * 1.5 - uTime * 2.6);
  fq += (vec2(fbm(fq * 1.2 + uTime * 0.6), fbm(fq * 1.2 + 5.2)) - 0.5) * vec2(0.7, 1.1);
  float flameH = 0.2;
  float tongues = fbm(fq) * 1.55 - d / flameH;
  float flame = smoothstep(0.2, 0.8, tongues) * smoothstep(-0.03, 0.005, d) * hx * uFire;
  vec3 e = fireRamp(min(flame * 1.1, 0.82)) * flame * 0.95;   // orange-yellow, a little see-through

  // Sparks drifting up and swaying.
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    vec2 g = np * vec2(14.0, 10.0) * (1.0 + fl * 0.6) + vec2(0.0, -uTime * (1.6 + fl));
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id + fl * 17.0);
    vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
    off.x += sin(uTime * 3.0 + h * 6.283) * 0.15;
    float s = smoothstep(0.09, 0.0, length(f - off * 0.7)) * step(0.85, h);
    e += fireRamp(0.75 + 0.25 * h) * s * smoothstep(0.35, 0.0, d) * step(-0.01, d) * hx * uFire * 1.5;
  }

  col.rgb += e;
  col.a = max(col.a, clamp(max(e.r, max(e.g, e.b)), 0.0, 1.0));
  col.rgb = min(col.rgb, vec3(col.a));
  gl_FragColor = col;
}
`
