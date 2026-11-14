#!/usr/bin/env node
/*
 * Gera a animação do buraco negro do banner e a grava entre os marcadores
 * <!-- BEGIN black-hole animation --> e <!-- END black-hole animation -->
 * de assets/banner.svg.
 *
 * O buraco negro é o piece "black hole" do ascii.rest 0.4.0 (MIT, @bas3line,
 * https://ascii.rest/black-hole/), com uma mudança: as harmônicas do disco
 * são todas pares. Assim meia volta no tempo (30 s do loop de 60 s) cai
 * exatamente na mesma textura e o loop CSS de 30 s fecha sem salto.
 *
 * A saída usa CSS (keyframes de opacity) em vez de script, então funciona
 * dentro de <img> no README do GitHub.
 *
 * Uso: node scripts/gen_blackhole.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- configuração
const COLS = 64;
const ROWS = 20;
const ROW_FROM = 3;   // as linhas 0-2 e 17-19 são só estrelas e ficam estáticas
const ROW_TO = 16;    // no banner; a animação cobre o disco inteiro (129..285)
const SPIN = 7;       // voltas da borda interna no loop nativo de 60 s
const SECONDS = 30;   // loop CSS; metade do loop nativo, textura idêntica
const FPS = 6;        // 180 quadros, ~1,06 MB (o gzip do GitHub reduz ~10x)
const COLORS = 8;     // rampa completa do ascii.rest

// ------------------------------------------------------------- o piece (MIT)
const RAMP = " .:-=+*#%@";
const SX = 3, SY = 4;
const D = 30, IN = 3, OUT = 9;
const TILT = 0.15;
const SPAN = 0.34;
const GAIN = 1.6, FLOOR = 0.03;
const LOOP = 60;
const BANDS = 12;
const BMAX = 12, NB = 1500, H = 0.02;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paths() {
  const f = (u) => 1.5 * u * u - u;
  const table = [];
  for (let n = 0; n < NB; n++) {
    const b = ((n + 0.5) / NB) * BMAX;
    let u = 1 / D, w = Math.sqrt(1 - (b / D) ** 2) / b;
    const us = [u];
    while (u < 1 && (u > 1 / (OUT + 1) || w > 0)) {
      const k1 = w, l1 = f(u);
      const k2 = w + (H / 2) * l1, l2 = f(u + (H / 2) * k1);
      const k3 = w + (H / 2) * l2, l3 = f(u + (H / 2) * k2);
      const k4 = w + H * l3, l4 = f(u + H * k3);
      u += (H / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      w += (H / 6) * (l1 + 2 * l2 + 2 * l3 + l4);
      us.push(u);
    }
    table.push(Float32Array.from(us));
  }
  return table;
}

function makeBlackHole({ cols = COLS, rows = ROWS, spin = SPIN } = {}) {
  const cw = (2 * SPAN) / cols;
  const s = Math.sin(TILT), c = Math.cos(TILT);
  const table = paths();
  const rand = mulberry32(17);
  const TAB = 256;
  const band = [];
  for (let b = 0; b < BANDS; b++) {
    const r = IN + ((OUT - IN) * b) / (BANDS - 1);
    const turns = Math.max(1, Math.round(spin * (IN / r) ** 1.5));
    // harmônicas pares: a textura repete a cada meia volta
    const waves = [2, 4, 6, 8, 12].map((k) => [k, rand() * 6.283, (0.5 + rand()) / Math.sqrt(k)]);
    const tab = new Float32Array(TAB);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < TAB; i++) {
      for (const [k, p, a] of waves) tab[i] += a * Math.sin((k * 2 * Math.PI * i) / TAB + p);
      lo = Math.min(lo, tab[i]);
      hi = Math.max(hi, tab[i]);
    }
    for (let i = 0; i < TAB; i++) tab[i] = 0.45 + (0.55 * (tab[i] - lo)) / (hi - lo);
    band.push({ tab, turns });
  }
  const cells = Array.from({ length: cols * rows }, () => []);
  const empty = new Uint8Array(cols * rows).fill(1);
  for (let j = 0; j < rows * SY; j++) {
    const y = (rows / 2 + 0.5 - (j + 0.5) / SY) * 2 * cw;
    for (let i = 0; i < cols * SX; i++) {
      const x = ((i + 0.5) / SX - cols / 2) * cw;
      const k = Math.floor(j / SY) * cols + Math.floor(i / SX);
      const n = Math.hypot(x, y, 1);
      const d = [x / n, (y * c - s) / n, (y * s + c) / n];
      const out = d[1] * s - d[2] * c;
      const side = Math.sqrt(1 - out * out);
      const e2 = [d[0] / side, (d[1] - out * s) / side, (d[2] + out * c) / side];
      const us = table[Math.min(NB - 1, Math.floor((D * side * NB) / BMAX))];
      if (us[us.length - 1] >= 1) empty[k] = 0;
      const end = Math.min((us.length - 1) * H, 5.6);
      let light = 1;
      for (let a = (Math.atan2(-s, e2[1]) + 2 * Math.PI) % Math.PI; a < end; a += Math.PI) {
        const p = a / H, q = Math.floor(p);
        const r = 1 / (us[q] + (us[q + 1] - us[q]) * (p - q));
        if (r <= IN || r >= OUT) continue;
        const phi = Math.atan2(Math.sin(a) * e2[2] - Math.cos(a) * c, Math.sin(a) * e2[0]);
        const edge = Math.min(1, (r - IN) / 0.7) * (1 - ((r - IN) / (OUT - IN)) ** 2);
        const doppler = 1 - 0.5 * Math.cos(phi);
        const pos = ((r - IN) / (OUT - IN)) * (BANDS - 1);
        const b0 = Math.min(BANDS - 2, Math.floor(pos));
        empty[k] = 0;
        cells[k].push(b0, pos - b0, phi, (light * edge * doppler * (IN / r) ** 1.5) / (SX * SY));
        light *= 0.45;
      }
    }
  }
  const stars = new Uint8Array(cols * rows);
  for (let k = 0; k < cols * rows; k++) stars[k] = empty[k] && rand() < 0.03 ? 1 : 0;
  const at = (b, a) => {
    const i = Math.floor((a / (2 * Math.PI)) * TAB) % TAB;
    return band[b].tab[i < 0 ? i + TAB : i];
  };
  return (t) => {
    const turn = (2 * Math.PI * (t % LOOP)) / LOOP;
    let out = "";
    for (let r = 0; r < rows; r++) {
      if (r) out += "\n";
      for (let q = 0; q < cols; q++) {
        const k = r * cols + q;
        const h = cells[k];
        let sum = 0;
        for (let i = 0; i < h.length; i += 4) {
          const b = h[i], fr = h[i + 1], phi = h[i + 2];
          const g0 = at(b, phi - band[b].turns * turn), g1 = at(b + 1, phi - band[b + 1].turns * turn);
          sum += h[i + 3] * (g0 + (g1 - g0) * fr);
        }
        const v = Math.min(1, Math.max(0, sum * GAIN - FLOOR) / (1 - FLOOR)) ** 0.75;
        const ch = RAMP[Math.round(v * (RAMP.length - 1))];
        out += ch === " " && stars[k] ? "." : ch;
      }
    }
    return out;
  };
}

// ------------------------------------------------------ SVG compacto por quadro
const CW = 10, CELL = 2, CH = CW * CELL; // unidade local: 10 de largura, 20 de altura
const BASE = 4;                            // linha de base 4 unidades acima do rodapé da célula
const PREFIX = "b";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PALETTE = {
  8: ["#484F58", "#56D364", "#79C0FF", "#58A6FF", "#FFD700", "#FFA657", "#FF8C00", "#FFFFFF"],
};
// nível da rampa -> cor: " . : - = + * # % @" (espaço não pinta; + usa o azul de =)
const RAMP_MAP = Uint8Array.from([0, 1, 2, 3, 4, 4, 5, 6, 7, 8]);
function rampMap() {
  return RAMP_MAP;
}

function buildPart(frame) {
  const rows = ROW_TO - ROW_FROM + 1;
  const map = rampMap();
  const palette = PALETTE[COLORS];
  const n = Math.max(1, Math.round(SECONDS * FPS));
  const shots = Array.from({ length: n }, (_, i) => {
    const text = frame(i / FPS).split("\n").slice(ROW_FROM, ROW_TO + 1).join("\n");
    const color = new Uint8Array(COLS * rows);
    let k = 0;
    for (const ch of text) {
      if (ch === "\n") continue;
      color[k++] = map[Math.max(0, RAMP.indexOf(ch))];
    }
    return { text, color };
  });
  const same = (a, b) => a.text === b.text && a.color.every((v, i) => v === b.color[i]);
  const frames = [];
  shots.forEach((shot, i) => {
    const f = frames.find((f) => same(f.shot, shot));
    if (f) f.slots.add(i);
    else frames.push({ shot, slots: new Set([i]) });
  });

  const used = new Set();
  const bodyOf = (shot) => shot.text.split("\n").map((line, y) => {
    const t = line.replace(/\s+$/, "");
    if (!t) return "";
    let out = "", run = "", cur = -1;
    const flush = () => {
      if (run) out += cur < 0 ? esc(run) : `<tspan class="${PREFIX}c${cur}">${esc(run)}</tspan>`;
      run = "";
    };
    for (let x = 0; x < t.length; x++) {
      const c = t[x] === " " ? cur : shot.color[y * COLS + x];
      if (c !== cur) flush();
      if (c >= 0) used.add(c);
      cur = c;
      run += t[x];
    }
    flush();
    return `<text y="${(y + 1) * CH - BASE}">${out}</text>`;
  }).join("");
  const inks = () => [...used].sort((a, b) => a - b).map((c) => `.${PREFIX}c${c}{fill:${palette[c - 1]}}`).join("");
  const pct = (i) => `${+((i / n) * 100).toFixed(3)}%`;
  let keys = "";
  const groups = [];
  frames.forEach((f, j) => {
    let kf = "", state = -1;
    for (let i = 0; i <= n; i++) {
      const v = i < n ? (f.slots.has(i) ? 1 : 0) : 0;
      if (v !== state) (kf += `${pct(i)}{opacity:${v}}`), (state = v);
    }
    keys += `@keyframes ${PREFIX}k${j}{${kf}}.${PREFIX}k${j}{animation-name:${PREFIX}k${j}}`;
    groups.push(`<g class="${PREFIX}f ${PREFIX}k${j}">${bodyOf(f.shot)}</g>`);
  });
  const css = inks() +
    `.${PREFIX}f{opacity:0;animation:${SECONDS}s step-end infinite}${keys}` +
    `@media (prefers-reduced-motion:reduce){.${PREFIX}f{animation:none}.${PREFIX}k0{opacity:1}}`;
  return { css, body: groups.join("\n"), frames: frames.length };
}

// ------------------------------------------------------------------- montagem
const frame = makeBlackHole();
if (frame(0) !== frame(SECONDS)) throw new Error("o loop não fecha: textura diferente no fim");

const part = buildPart(frame);
// linha de base da linha 3 (y=129 no banner): 10 - 4 = 16 unidades locais, escala 0,6
const ty = (129 - 16 * 0.6).toFixed(1);
const fragment = `    <!-- BEGIN black-hole animation (gerado por scripts/gen_blackhole.mjs) -->
    <style>
      #bh-anim text { font: 16.67px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; white-space: pre; }
      ${part.css}
    </style>
    <g id="bh-anim" xml:space="preserve">
      <g transform="translate(40 ${ty}) scale(0.6)">
${part.body}
      </g>
    </g>
    <!-- END black-hole animation -->`;

const asset = join(ROOT, "assets/banner.svg");
let svg = readFileSync(asset, "utf8");
const begin = "    <!-- BEGIN black-hole animation";
const end = "    <!-- END black-hole animation -->";
const b = svg.indexOf(begin);
const e = svg.indexOf(end);
if (b < 0 || e < 0) throw new Error("marcadores da animação não encontrados em assets/banner.svg");
svg = svg.slice(0, b) + fragment + svg.slice(e + end.length);
writeFileSync(asset, svg);
console.log(`assets/banner.svg: ${(svg.length / 1024).toFixed(1)} KB, ${part.frames} quadros, ${SECONDS} s a ${FPS} fps`);
