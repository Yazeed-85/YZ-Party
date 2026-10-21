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
function dtw(A, B) {                                     // مسافة DTW بحزمة مقيّدة، مقيسة على طول المسار
  const n = A.length, m = B.length, band = Math.max(Math.abs(n - m), Math.ceil(0.35 * Math.max(n, m))) + 2, INF = 1e18;
  let prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF);
    const c = Math.round(i * m / n), lo = Math.max(1, c - band), hi = Math.min(m, c + band);
    for (let j = lo; j <= hi; j++) {
      let s = 0; const a = A[i - 1], b = B[j - 1]; for (let k = 0; k < a.length; k++) { const t = a[k] - b[k]; s += t * t; }
      cur[j] = Math.sqrt(s) + Math.min(prev[j], prev[j - 1], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m] / (n + m);
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

export const P = { sw: 1, dw: 2, c1: 1, d0: 2.2, kmax: 8 };   // أوزان السمات (مضبوطة بالتجربة على أصوات عربية مولَّدة)
export const T = { exact: 0.58, close: 0.42 };           // حدود التصنيف على الدرجة (0..1): ارفعها لتشديد الحكم
export function analyze(a, b) {
  const FA = trim(features(a)), FB = trim(features(b));
  if (FA.length < 15) return { cat: 'none', score: 0, why: 'تسجيل الجملة الأصلية قصير جداً' };
  if (FB.length < 15) return { cat: 'bad', score: 0, why: 'لم يُسمع كلام' };
  const dA = dynamics(FA), dB = dynamics(FB), syA = syllables(FA), syB = syllables(FB);
  const lenR = FB.length / FA.length, syR = syA && syB ? Math.min(syA, syB) / Math.max(syA, syB) : 0;
  const d = dtw(prep(FA), prep(FB));
  let s = 1 / (1 + Math.pow(d / P.d0, 4));                // درجة من المسافة
  const dynR = dA ? dB / dA : 0;
  if (dynR < 0.55) s *= Math.max(0.1, dynR / 0.55);      // جرس شبه ثابت = همهمة لا كلام
  const pen = Math.abs(Math.log(lenR)); if (pen > 0.15) s *= Math.max(0.3, 1 - 1.5 * (pen - 0.15)); // طول مختلف
  s *= 0.55 + 0.45 * syR;                                // اختلاف عدد المقاطع
  const cat = s >= T.exact ? 'exact' : s >= T.close ? 'close' : 'bad';
  return { cat, score: +s.toFixed(3), d: +d.toFixed(3), lenR: +lenR.toFixed(2), syR: +syR.toFixed(2), dynR: +dynR.toFixed(2), sy: [syA, syB] };
}
