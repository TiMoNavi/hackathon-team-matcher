// apps/ciaorelated/src/screens/create/post/utils/matrix.ts
import type { Matrix } from "react-native-color-matrix-image-filters";
export type Matrix20 = [
  number,number,number,number,number,
  number,number,number,number,number,
  number,number,number,number,number,
  number,number,number,number,number
];

// -------------------- Adjust-Keys (einheitlich!) --------------------
export type AdjustState = {
  bright: number; // -1..1   Helligkeit
  contr:  number; // -1..1   Kontrast
  sat:    number; // -1..1   Sättigung
  temp:   number; // -1..1   Wärme: +R / -B
  hue:    number; // -180..180 Grad
  fade:   number; // 0..1    Verblassen
};

export const DEFAULT_ADJUST: AdjustState = {
  bright: 0, contr: 0, sat: 0, temp: 0, hue: 0, fade: 0,
};

// -------------------- Identität --------------------
export const IDENTITY: Matrix20 = [
  1,0,0,0,0,
  0,1,0,0,0,
  0,0,1,0,0,
  0,0,0,1,0,
];

// Ganz oben hast du bereits: export type Matrix20 = [...20 numbers...]
// und export const IDENTITY: Matrix20
// und export function concatColorMatrices(B: Matrix20, A: Matrix20): Matrix20 { ... }

// Komposition beliebig vieler Matrizen in korrekter Reihenfolge:
// Erst A anwenden, dann B, dann C ...  => concat(C, concat(B, concat(A, I)))
export function concatMatrix(...mats: Array<Matrix20 | null | undefined>): Matrix20 {
  const usable = (mats.filter(Boolean) as Matrix20[]);
  if (usable.length === 0) return IDENTITY;
  return usable.reduce<Matrix20>(
    (acc, m) => concatColorMatrices(m, acc),
    IDENTITY                           // ← Initialwert: Identitätsmatrix
  );
}
// -------------------- Komposition (B ∘ A) --------------------
// Erst A anwenden, dann B → concat(B, A)
export function concatColorMatrices(B: Matrix20, A: Matrix20): Matrix20 {
  const out = new Array<number>(20).fill(0);
  for (let i = 0; i < 4; i++) {          // Zeile
    for (let j = 0; j < 5; j++) {        // Spalte
      if (j === 4) {
        // Bias: B * A.bias + B.bias
        out[i*5 + 4] =
          B[i*5 + 0] * A[0*5 + 4] +
          B[i*5 + 1] * A[1*5 + 4] +
          B[i*5 + 2] * A[2*5 + 4] +
          B[i*5 + 3] * A[3*5 + 4] +
          B[i*5 + 4];
      } else {
        // 4x4
        out[i*5 + j] =
          B[i*5 + 0] * A[0*5 + j] +
          B[i*5 + 1] * A[1*5 + j] +
          B[i*5 + 2] * A[2*5 + j] +
          B[i*5 + 3] * A[3*5 + j];
      }
    }
  }
  return out as Matrix20;
}

// helper: mehrere in Reihenfolge verketten (links→rechts)
function chain(...mats: Matrix20[]): Matrix20 {
  return mats.reduce((acc, m) => concatColorMatrices(m, acc), IDENTITY);
}

// -------------------- Konstanten --------------------
const Lr = 0.2126, Lg = 0.7152, Lb = 0.0722; // Rec.709 luma

// -------------------- Einzel-Matrizen (kräftig, aber kontrolliert) --------------------
export function brightnessMatrix(x: number): Matrix20 {
  // spürbare Helligkeit: Offset ±0.35
  const t = x * 0.35;
  return [
    1,0,0,0,t,
    0,1,0,0,t,
    0,0,1,0,t,
    0,0,0,1,0,
  ];
}

export function contrastMatrix(x: number): Matrix20 {
  // Faktor 1 ± 1.0
  const c = 1 + x * 1.0;
  const t = (1 - c) * 0.5; // um 0.5 zentrieren
  return [
    c,0,0,0,t,
    0,c,0,0,t,
    0,0,c,0,t,
    0,0,0,1,0,
  ];
}

export function saturationMatrix(x: number): Matrix20 {
  // Faktor 1 ± 1.2
  const s = 1 + x * 1.2;
  const a = (1 - s) * Lr + s;
  const b = (1 - s) * Lg;
  const c = (1 - s) * Lb;
  return [
    a, b, c, 0, 0,
    (1 - s) * Lr, (1 - s) * Lg + s, (1 - s) * Lb, 0, 0,
    (1 - s) * Lr, (1 - s) * Lg, (1 - s) * Lb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

export function temperatureMatrix(x: number): Matrix20 {
  // +R / -B, kräftiger: ±0.25
  const r = 1 + x * 0.25;
  const b = 1 - x * 0.25;
  return [
    r,0,0,0,0,
    0,1,0,0,0,
    0,0,b,0,0,
    0,0,0,1,0,
  ];
}

export function hueMatrix(deg: number): Matrix20 {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    Lr + (1 - Lr) * cos - Lr * sin,   Lg - Lg * cos - Lg * sin,     Lb - Lb * cos + (1 - Lb) * sin, 0, 0,
    Lr - Lr * cos + 0.143 * sin,      Lg + (1 - Lg) * cos + 0.140 * sin, Lb - Lb * cos - 0.283 * sin, 0, 0,
    Lr - Lr * cos - (1 - Lr) * sin,   Lg - Lg * cos + Lg * sin,     Lb + (1 - Lb) * cos + Lb * sin, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

export function fadeMatrix(f: number): Matrix20 {
  // kräftiger Fade: weniger Kontrast & Sättigung + leichter Lift
  const c = 1 - 0.6 * f; // 1 → 0.4
  const t = 0.08 * f;
  const mC: Matrix20 = [
    c,0,0,0,t,
    0,c,0,0,t,
    0,0,c,0,t,
    0,0,0,1,0,
  ];
  const mS = saturationMatrix(-0.4 * f);
  return chain(mC, mS);
}

// Gesamte Adjust-Matrix (Reihenfolge feinabgestimmt)
export function buildAdjustMatrix(a: AdjustState): Matrix20 {
  let m = IDENTITY;
  m = chain(m, brightnessMatrix(a.bright));
  m = chain(m, contrastMatrix(a.contr));
  m = chain(m, saturationMatrix(a.sat));
  m = chain(m, temperatureMatrix(a.temp));
  if (a.hue)  m = chain(m, hueMatrix(a.hue));
  if (a.fade) m = chain(m, fadeMatrix(a.fade));
  return m;
}

// -------------------- Filter-Presets --------------------
export type FilterKey =
  | "none" | "sepia" | "mono" | "warm" | "cool"
  | "noir" | "dramatic" | "lomo" | "instant" | "fade"
  | "vignette";

export const isVignette = (k: FilterKey) => k === "vignette";

// Basismatrizen
const SEPIA: Matrix20 = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0,     0,     0,     1, 0,
];

const GRAYSCALE: Matrix20 = [
  Lr, Lg, Lb, 0, 0,
  Lr, Lg, Lb, 0, 0,
  Lr, Lg, Lb, 0, 0,
  0,  0,  0,  1, 0,
];

export function filterToMatrix(k: FilterKey): Matrix20 {
  switch (k) {
    case "none":     return IDENTITY;
    case "mono":     return GRAYSCALE;
    case "sepia":    return SEPIA;

    case "warm": {
      const s = saturationMatrix(+0.18);
      const t = temperatureMatrix(+0.20);
      const b = brightnessMatrix(+0.02);
      return chain(t, s, b);
    }

    case "cool": {
      const s = saturationMatrix(+0.08);
      const t = temperatureMatrix(-0.22);
      return chain(t, s);
    }

    case "noir": {
      const c = contrastMatrix(+0.45);
      const b = brightnessMatrix(+0.02);
      return chain(GRAYSCALE, c, b);
    }

    case "dramatic": {
      const c = contrastMatrix(+0.40);
      const t = temperatureMatrix(-0.10);
      const s = saturationMatrix(-0.06);
      return chain(c, t, s);
    }

    case "lomo": {
      const s = saturationMatrix(+0.28);
      const c = contrastMatrix(+0.15);
      const t = temperatureMatrix(+0.12);
      return chain(s, c, t);
    }

    case "instant": {
      const f = fadeMatrix(0.35);
      const t = temperatureMatrix(+0.10);
      const s = saturationMatrix(-0.06);
      return chain(f, t, s);
    }

    case "fade":     return fadeMatrix(0.40);
    case "vignette": return IDENTITY; // Overlay separat
  }
}
