import { useEffect, useRef } from "react";
import { BRAND_RGB } from "../lib/brand.js";

const COLORS = BRAND_RGB;

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_mode;
uniform vec3 u_beige;
uniform vec3 u_white;
uniform vec3 u_graphite;
uniform vec3 u_grey;
uniform vec3 u_ice;
uniform vec3 u_wine;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 13.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_res, vec2(1.0));
  float t = u_time * 0.085;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / max(u_res.y, 1.0);

  vec3 col = u_graphite;

  if (u_mode < 0.5) {
    float brush = fbm(vec2(uv.x * 5.0 + t * 0.08, uv.y * 1.6));
    float wineEdge = smoothstep(0.62, 0.0, uv.y) * (0.55 + 0.2 * brush);
    float iceEdge = smoothstep(0.28, 1.0, uv.y) * (0.45 + 0.2 * (1.0 - brush));
    float travel = uv.x - (0.28 + 0.44 * (0.5 + 0.5 * sin(t * 0.22)));
    float caustic = exp(-travel * travel * 10.0);

    col = mix(col, u_grey, 0.04);
    col = mix(col, u_wine, wineEdge * 0.16);
    col = mix(col, u_ice, iceEdge * 0.12 + caustic * 0.05);
    col = mix(col, u_white, caustic * 0.03);
    col = mix(u_graphite, col, 0.55);
  } else {
    float d = length(p);
    float marble = fbm(p * 2.2 + vec2(t * 0.07, -t * 0.05));
    col = u_graphite;
    col = mix(col, u_grey, marble * 0.04);
    col = mix(col, u_wine, smoothstep(0.78, 1.0, marble) * 0.05);
    float ring = abs(d - 0.27);
    col = mix(col, u_ice, (1.0 - smoothstep(0.0, 0.034, ring)) * 0.22);
    col = mix(col, u_graphite, smoothstep(0.47, 0.5, d) * 0.2);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function BrandShader({ live = true, mode = "banner" }) {
  const ref = useRef(null);
  const liveRef = useRef(live);
  const kickRef = useRef(() => {});
  liveRef.current = live;

  useEffect(() => {
    kickRef.current();
  }, [live]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMode = gl.getUniformLocation(prog, "u_mode");
    gl.uniform3fv(gl.getUniformLocation(prog, "u_beige"), COLORS.beige);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_white"), COLORS.white);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_graphite"), COLORS.graphite);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_grey"), COLORS.grey);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_ice"), COLORS.ice);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_wine"), COLORS.wine);
    gl.uniform1f(uMode, mode === "orb" ? 1 : 0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let start = performance.now();
    let dead = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function frame(now) {
      resize();
      const t = reduce.matches ? 0 : (now - start) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!dead && liveRef.current && !reduce.matches && !document.hidden) {
        raf = requestAnimationFrame(frame);
      }
    }

    function kick() {
      cancelAnimationFrame(raf);
      if (dead) return;
      if (liveRef.current && !reduce.matches) raf = requestAnimationFrame(frame);
      else frame(start);
    }

    kickRef.current = kick;
    const ro = new ResizeObserver(kick);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", kick);
    kick();

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", kick);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, [mode]);

  return <canvas className="rg-shader" ref={ref} aria-hidden="true" />;
}
