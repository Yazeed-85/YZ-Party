// سجل المشاكل للمالك فقط: أي خطأ تقني (قواعد Firebase، رفض صلاحية، انقطاع غير متوقع…) يُرسل هنا بصمت إلى diag/ ويظهر في لوحة التحكم (تبويب «المشاكل»).
// اللاعب العادي لا يرى أي رسالة تقنية أبداً: toast() في ui.js يمرّر كل رسالة خطأ على isOwnerOnly/isTechnical قبل عرضها.
import { db, ref, push, ready, serverTimestamp } from "./firebase.js";
import { identity } from "./identity.js";

const seen = new Map(); let sent = 0;
export function report(kind, err, extra = "") {
  try {
    const raw = String(err?.code || err?.message || err || "").replace(/\s+/g, " ").slice(0, 160);
    const key = kind + "|" + raw, now = Date.now();
    if (sent >= 15 || now - (seen.get(key) || 0) < 60e3) return;      // لا إغراق: مرة كل دقيقة لكل خطأ و15 كحد أقصى للجلسة
    seen.set(key, now); sent++;
    console.warn("diag:", kind, raw);
    Promise.all([ready, identity().catch(() => ({}))]).then(([, me]) =>
      push(ref(db, "diag"), { k: String(kind).slice(0, 30), m: raw, x: String(extra).slice(0, 80), p: location.pathname.slice(-40), u: me?.pid || "", t: serverTimestamp() })).catch(() => {});
  } catch { /* التسجيل نفسه لا يجوز أن يفشل أمام اللاعب */ }
}
const AR = /[؀-ۿ]/;
// رسائل تخص المالك (الإعداد والقواعد) لا تُعرض لأي لاعب
export const isOwnerOnly = m => /firebase|rules\.json|permission|denied|قواعد|الصق ملف|publish/i.test(String(m || ""));
// رسالة إنجليزية/تقنية خام: لا تُعرض أيضاً (نعرض بدلها رسالة ودّية عامة)
export const isTechnical = m => !AR.test(String(m || ""));
