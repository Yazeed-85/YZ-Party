// دوال الصوت النقية (بلا واجهة): تحويل المعدّل، تجهيز التسجيل، ترميز Base64، وتحسين وضوح الصوت المعكوس. تُستعمل في اللعبة وفي صفحة التجارب lab.html.
export const SR = 16000, SR_HI = 24000;

// تغيير معدّل العينة بمرشّح sinc مُنَعَّم (Hann): بلا تشويه ولا تعرّج، ويعمل فوراً بلا سياق صوت
export function resample(x, from, to) {
  if (from === to) return x;
  const r = from / to, n = Math.floor(x.length / r), y = new Float32Array(n), fc = Math.min(1, to / from) * 0.97, Wd = 12 / fc;
  for (let i = 0; i < n; i++) {
    const c = i * r; let acc = 0;
    for (let k = Math.max(0, Math.ceil(c - Wd)), e = Math.min(x.length - 1, Math.floor(c + Wd)); k <= e; k++) {
      const u = k - c, z = Math.PI * fc * u, sn = Math.abs(z) < 1e-9 ? 1 : Math.sin(z) / z;
      acc += x[k] * fc * sn * (0.5 + 0.5 * Math.cos(Math.PI * u / Wd));
    }
    y[i] = acc;
  }
  return y;
}
// تجهيز التسجيل: تحويل لـ24kHz، إزالة الإزاحة، قصّ الصمت بتساهل (حدّ منخفض + هامش 120ms قبل و250ms بعد)، تطبيع الشدة، وتلاشٍ قصير عند الطرفين. بلا ضاغط ولا بوابة ضجيج.
export function prepare(raw, sr) {
  const x = resample(raw, sr, SR_HI); let mean = 0; for (let i = 0; i < x.length; i++) mean += x[i]; mean /= x.length || 1; for (let i = 0; i < x.length; i++) x[i] -= mean;
  const fr = SR_HI / 100, n = Math.floor(x.length / fr), rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let q = 0; for (let k = 0; k < fr; k++) q += x[i * fr + k] ** 2; rms[i] = Math.sqrt(q / fr); }
  const so = [...rms].sort((p, q) => p - q), floor = so[Math.floor(n * 0.1)] || 0, peak = so[n - 1] || 0, thr = Math.max(floor * 2.5, peak * 0.012, 0.002);
  let a = 0, b = n - 1; while (a < b && rms[a] < thr) a++; while (b > a && rms[b] < thr) b--;
  const y = x.slice(Math.max(0, (a - 12) * fr), Math.min(x.length, (b + 26) * fr)); let m = 0; for (let i = 0; i < y.length; i++) m = Math.max(m, Math.abs(y[i]));
  const g = m ? 0.9 / m : 1, fd = Math.round(SR_HI * 0.006);
  for (let i = 0; i < y.length; i++) { let v = y[i] * g; if (i < fd) v *= i / fd; else if (i > y.length - fd) v *= (y.length - i) / fd; y[i] = v; }
  y.sr = SR_HI; return y;
}

export function toB64(f) {
  const i16 = new Int16Array(f.length); for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
  const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b, sr = SR) {
  const s = atob(b), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  const i16 = new Int16Array(u8.buffer), f = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32767;
  f.sr = sr; return f;
}

// مُعادِل شدة قبل العكس. الكلام المعكوس يضيع منه ما كان ضعيفاً في آخر الكلمات (حروف ساكنة وتلاشي الحركات) لأنها تصير في بدايات تسبقها أصوات عالية،
// فنرفع الأجزاء الخافتة نحو شدة موحّدة (بحدّ أقصى للرفع، وبلا رفع لما دون أرضية الضجيج)، ونبرز الحروف الاحتكاكية قليلاً. strength: 0 = بلا تغيير، 1 = كامل.
export function enhance(x, strength = 1) {
  const sr = x.sr || SR_HI, n = x.length, y = new Float32Array(n), win = Math.round(sr * 0.02), env = new Float32Array(n);
  let acc = 0; const sq = new Float32Array(n); for (let i = 0; i < n; i++) sq[i] = x[i] * x[i];
  for (let i = 0; i < n; i++) { acc += sq[i]; if (i >= win) acc -= sq[i - win]; env[i] = Math.sqrt(Math.max(0, acc) / win); }
  const sorted = Float32Array.from(env).sort(), floor = sorted[Math.floor(n * 0.1)] || 0, top = sorted[Math.floor(n * 0.9)] || 1e-3, target = top * 0.7;
  let g = 1; const atk = Math.exp(-1 / (sr * 0.01)), rel = Math.exp(-1 / (sr * 0.06));
  for (let i = 0; i < n; i++) {
    const e = Math.max(env[i], 1e-5), want = e < floor * 2 ? 1 : Math.min(5, Math.max(0.6, Math.pow(target / e, 0.7)));
    g = want < g ? atk * g + (1 - atk) * want : rel * g + (1 - rel) * want;
    y[i] = x[i] * (1 + (g - 1) * strength);
  }
  const k = 0.55 * strength; let prev = 0, m = 0;
  for (let i = 0; i < n; i++) { const v = y[i]; y[i] = v - k * prev; prev = v; }
  for (let i = 0; i < n; i++) y[i] = Math.tanh(y[i] * 1.2); for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i]));
  const sc = m ? 0.9 / m : 1; for (let i = 0; i < n; i++) y[i] *= sc;
  y.sr = sr; return y;
}
