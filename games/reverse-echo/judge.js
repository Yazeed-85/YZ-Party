// حَكَم صوتي: يقارن صوتَي الجملة (الأصلية ومحاولة المقلّد بعد إعادتها طبيعية) عبر سمات MFCC وDTW.
// ليس تعرّفاً على الكلام، بل مقارنة لشكل النطق (المقاطع، الحروف، الإيقاع) مع كشف الهمهمة والضجيج والصمت.
const SR = 16000, WIN = 400, HOP = 160, NFFT = 512, NMEL = 26, NCEP = 13;

function fft(re, im) {                                   // FFT تكرارية (طول من قوى الـ2)
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const hz2mel = f => 2595 * Math.log10(1 + f / 700), mel2hz = m => 700 * (10 ** (m / 2595) - 1);
const FB = (() => {                                      // مرشحات ميل مثلثية
  const lo = hz2mel(80), hi = hz2mel(7600), pts = Array.from({ length: NMEL + 2 }, (_, i) => mel2hz(lo + (hi - lo) * i / (NMEL + 1)));
  const bins = pts.map(f => Math.floor((NFFT + 1) * f / SR)), fb = [];
  for (let m = 1; m <= NMEL; m++) {
    const f = new Float32Array(NFFT / 2 + 1);
    for (let k = bins[m - 1]; k < bins[m]; k++) f[k] = (k - bins[m - 1]) / (bins[m] - bins[m - 1] || 1);
    for (let k = bins[m]; k < bins[m + 1]; k++) f[k] = (bins[m + 1] - k) / (bins[m + 1] - bins[m] || 1);
    fb.push(f);
  }
  return fb;
})();
const HAM = Float32Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (WIN - 1)));

function features(x) {                                   // لكل إطار: لوغ الطاقة + MFCC
  const out = [], re = new Float32Array(NFFT), im = new Float32Array(NFFT);
  for (let s = 0; s + WIN <= x.length; s += HOP) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = (x[s + i] - 0.97 * (i ? x[s + i - 1] : 0)) * HAM[i];
    fft(re, im);
    const mel = FB.map(f => { let e = 0; for (let k = 0; k < f.length; k++) if (f[k]) e += f[k] * (re[k] * re[k] + im[k] * im[k]); return Math.log(e + 1e-9); });
    let en = 0; for (let i = 0; i < WIN; i++) en += x[s + i] * x[s + i];
    const c = new Float32Array(NCEP);
    for (let k = 0; k < NCEP; k++) { let a = 0; for (let m = 0; m < NMEL; m++) a += mel[m] * Math.cos(Math.PI * k * (m + .5) / NMEL); c[k] = a; }
    c[0] = Math.log(en / WIN + 1e-9);
    out.push(c);
  }
  return out;
}
function trim(F) {                                       // إزالة الصمت من الطرفين بحسب الطاقة
  if (!F.length) return F;
  const mx = Math.max(...F.map(f => f[0])), thr = mx - 4.6;
  let a = 0, b = F.length - 1;
  while (a < b && F[a][0] < thr) a++;
  while (b > a && F[b][0] < thr) b--;
  return F.slice(a, b + 1);
}
function prep(F) {                                       // c1..c12 مع تطبيع المتوسط والتباين + المشتقات
  const n = F.length, d = NCEP - 1, X = F.map(f => Float32Array.from(f.slice(1)));
  for (let k = 0; k < d; k++) {
    let m = 0; X.forEach(r => (m += r[k])); m /= n;
    let v = 0; X.forEach(r => (v += (r[k] - m) ** 2)); const sd = Math.sqrt(v / n) || 1;
    X.forEach(r => (r[k] = (r[k] - m) / sd));
  }
  return X.map((r, i) => { const o = new Float32Array(2 * d); const p = X[Math.max(0, i - 2)], q = X[Math.min(n - 1, i + 2)]; for (let k = 0; k < d; k++) { const on = k < P.kmax ? 1 : 0; o[k] = r[k] * P.sw * (k === 0 ? P.c1 : 1) * on; o[d + k] = (q[k] - p[k]) / 2 * P.dw * on; } return o; });
}
function dtw(A, B, pen = 0) {                            // مسافة DTW بحزمة مقيّدة وعقوبة للانحراف عن القطر
  const n = A.length, m = B.length, band = Math.max(Math.abs(n - m), Math.ceil(0.3 * Math.max(n, m))) + 2, INF = 1e18;
  let prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF);
    const c = Math.round(i * m / n), lo = Math.max(1, c - band), hi = Math.min(m, c + band);
    for (let j = lo; j <= hi; j++) {
      let s = 0; const a = A[i - 1], b = B[j - 1]; for (let k = 0; k < a.length; k++) { const t = a[k] - b[k]; s += t * t; }
      cur[j] = Math.sqrt(s) + Math.min(prev[j - 1], prev[j] + pen, cur[j - 1] + pen);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m] / (n + m);
}

function dtwPath(A, B, pen = 0) {                        // يرجع المسافة الكلية ومتوسط المسافة في كل ثلث من المسار
  const n = A.length, m = B.length, band = Math.max(Math.abs(n - m), Math.ceil(0.3 * Math.max(n, m))) + 2, INF = 1e18, W = m + 1;
  const D = new Float64Array((n + 1) * W).fill(INF), Lc = new Float32Array((n + 1) * W);
  D[0] = 0;
  for (let i = 1; i <= n; i++) {
    const c = Math.round(i * m / n), lo = Math.max(1, c - band), hi = Math.min(m, c + band);
    for (let j = lo; j <= hi; j++) {
      let s = 0; const a = A[i - 1], b = B[j - 1]; for (let k = 0; k < a.length; k++) { const t = a[k] - b[k]; s += t * t; }
      const dist = Math.sqrt(s); Lc[i * W + j] = dist;
      D[i * W + j] = dist + Math.min(D[(i - 1) * W + j - 1], D[(i - 1) * W + j] + pen, D[i * W + j - 1] + pen);
    }
  }
  const steps = []; let i = n, j = m;
  while (i > 0 && j > 0) {
    steps.push(Lc[i * W + j]);
    const dg = D[(i - 1) * W + j - 1], up = D[(i - 1) * W + j] + pen, lf = D[i * W + j - 1] + pen;
    if (dg <= up && dg <= lf) { i--; j--; } else if (up <= lf) i--; else j--;
  }
  steps.reverse();
  const k = Math.max(1, Math.floor(steps.length / 3)), seg = [0, 1, 2].map(t => { const a = steps.slice(t * k, t === 2 ? steps.length : (t + 1) * k); return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); });
  return { d: D[n * W + m] / (n + m), seg };
}
function dynamics(F) {                                   // تغيّر الجرس عبر الزمن: الكلام متغيّر والهمهمة شبه ثابتة
  const n = F.length; if (n < 3) return 0; let t = 0;
  for (let k = 1; k < NCEP; k++) { let m = 0; F.forEach(r => (m += r[k])); m /= n; let v = 0; F.forEach(r => (v += (r[k] - m) ** 2)); t += Math.sqrt(v / n); }
  return t / (NCEP - 1);
}
function syllables(F) {                                  // عدد قمم الطاقة (تقريباً عدد المقاطع)
  const e = F.map(f => f[0]); if (e.length < 5) return 0;
  const s = e.map((_, i) => { let a = 0, c = 0; for (let k = -3; k <= 3; k++) if (e[i + k] !== undefined) { a += e[i + k]; c++; } return a / c; });
  const mx = Math.max(...s), mn = Math.min(...s), thr = mn + 0.35 * (mx - mn); let cnt = 0, last = -99;
  for (let i = 1; i < s.length - 1; i++) if (s[i] > s[i - 1] && s[i] >= s[i + 1] && s[i] > thr && i - last >= 10) { cnt++; last = i; }
  return cnt;
}

export const P = { sw: 1, dw: 2, c1: 1, d0: 2.2, kmax: 8, pen: 0.1, relHi: 0.95, relLo: 0.6, wRel: 0.8, sg: 0.35, segD0: 3.0 };   // أوزان مضبوطة بالتجربة
export const T = { exact: 0.6, close: 0.33 };            // حدود التصنيف على الدرجة الخام: ارفعها لتشديد الحكم
// النسبة المعروضة للاعبين: تُحوَّل لتنسجم مع التصنيف (قريب = 50% إلى 75%، مطابق = 75% فأكثر، وما دون 50% سيء)
export const pct = s => s >= T.exact ? 0.75 + 0.25 * (s - T.exact) / (1 - T.exact) : s >= T.close ? 0.5 + 0.25 * (s - T.close) / (T.exact - T.close) : 0.5 * s / T.close;

// أحد المراجع: نفس محاولة المقلِّد لكن بترتيب زمني مختلف. إن كانت الجملة صحيحة فالترتيب مهم فتبتعد عن الأصل،
// وإن كانت جملة مختلفة فلا فرق يُذكر. فنسبة (المسافة الحقيقية ÷ مسافة المراجع) تقيس النطق لا الصوت أو الميكروفون.
const rev = X => X.slice().reverse();
const rot = (X, f) => { const k = Math.floor(X.length * f); return X.slice(k).concat(X.slice(0, k)); };
const perm = X => { const q = Math.floor(X.length / 4), ch = [0, 1, 2, 3].map(i => X.slice(i * q, i === 3 ? X.length : (i + 1) * q)); return [].concat(ch[2], ch[0], ch[3], ch[1]); };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function analyze(a, b) {
  const FA = trim(features(a)), FB = trim(features(b));
  if (FA.length < 15) return { cat: 'none', score: 0, why: 'تسجيل الجملة الأصلية قصير جداً' };
  if (FB.length < 15) return { cat: 'bad', score: 0, why: 'لم يُسمع كلام' };
  const dA = dynamics(FA), dB = dynamics(FB), syA = syllables(FA), syB = syllables(FB);
  const lenR = FB.length / FA.length, syR = syA && syB ? Math.min(syA, syB) / Math.max(syA, syB) : 0;
  const XA = prep(FA), XB = prep(FB);
  const pa = dtwPath(XA, XB, P.pen), d = pa.d, dseg = Math.max(...pa.seg);   // أسوأ ثلث من الجملة
  const dr = median([rev(XB), rot(XB, 1 / 3), rot(XB, 2 / 3), perm(XB)].map(r => dtw(XA, r, P.pen)));
  const rel = d / (dr || 1);
  const absS = 1 / (1 + Math.pow(d / P.d0, 4));
  const relS = Math.max(0, Math.min(1, (P.relHi - rel) / (P.relHi - P.relLo)));
  const segS = 1 / (1 + Math.pow(dseg / P.segD0, 4));
  const base = Math.pow(absS, 1 - P.wRel) * Math.pow(relS, P.wRel) * Math.pow(segS, P.sg);
  let s = base;
  const dynR = dA ? dB / dA : 0;
  if (dynR < 0.55) s *= Math.max(0.1, dynR / 0.55);      // جرس شبه ثابت = همهمة لا كلام
  const pen = Math.abs(Math.log(lenR)); if (pen > 0.15) s *= Math.max(0.3, 1 - 1.5 * (pen - 0.15));   // طول مختلف
  s *= 0.55 + 0.45 * syR;                                // اختلاف عدد المقاطع
  const cat = s >= T.exact ? 'exact' : s >= T.close ? 'close' : 'bad';
  return { cat, score: +pct(s).toFixed(3), raw: s, base: +pct(base).toFixed(3), dseg: +dseg.toFixed(2), timing: +Math.max(0, 1 - pen / 0.7).toFixed(3), d: +d.toFixed(3), rel: +rel.toFixed(3), lenR: +lenR.toFixed(2), syR: +syR.toFixed(2), dynR: +dynR.toFixed(2) };
}
