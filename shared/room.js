// الغرف واللاعبون. هيكل البيانات:
//   rooms/{code}/{meta, players, kicked, party/scores, game}   +   roomIndex/{code}: {t: آخر نشاط, s: open|closed}
// roomIndex فهرس خفيف يسمح بتنظيف الغرف المهملة دون قراءة محتوى أي غرفة.
import { db, ready, ref, get, set, update, remove, onValue, runTransaction, onDisconnect, serverTimestamp, serverNow } from "./firebase.js";

export const STALE_MS = 3 * 3600e3;   // غرفة بلا أي نشاط 3 ساعات تُحذف
export const CLOSED_MS = 5 * 60e3;    // الغرفة المغلقة تُحذف بعد 5 دقائق
const BEAT_MS = 2 * 60e3;             // نبضة نشاط كل دقيقتين لمن هو داخل الغرفة
const HEAL_MS = 10e3;                 // تأكيد حالة «متصل» كل 10 ثوانٍ

export const roomRef = (c, p = "") => ref(db, `rooms/${c}` + (p ? "/" + p : ""));
export const gameRef = (c, p = "") => roomRef(c, "game" + (p ? "/" + p : ""));
const idxRef = c => ref(db, `roomIndex/${c}`);

export const savedName = () => localStorage.getItem("yz_name") || "";
export const saveName = n => localStorage.setItem("yz_name", n);
export const cleanName = n => (n || "").replace(/\s+/g, " ").trim().slice(0, 16);
const okCode = c => (/^\d{4}$/.test(c || "") ? c : null);   // لا نقبل إلا 4 أرقام حتى لا يُحقن مسار في قاعدة البيانات
export const getCode = () => okCode(new URLSearchParams(location.search).get("room")) || okCode(sessionStorage.getItem("yz_room"));
const setCode = c => sessionStorage.setItem("yz_room", c);
export const lobbyUrl = c => `../../index.html?room=${c}`; // من داخل games/اسم-اللعبة/
export const goLobby = c => { location.href = lobbyUrl(c); };

let stopPresence = null;
function trackPresence(code, uid) {
  stopPresence?.();
  const pr = roomRef(code, `players/${uid}/connected`);
  const un = onValue(ref(db, ".info/connected"), s => {
    if (s.val()) { onDisconnect(pr).set(false); set(pr, true).catch(() => {}); }
  });
  const beat = () => update(idxRef(code), { t: serverTimestamp() }).catch(() => {});
  beat(); const iv = setInterval(beat, BEAT_MS);
  // شفاء المؤشر: onDisconnect القادم من الصفحة السابقة (أو من تعليق الهاتف) قد يصل بعد أن كتبنا true فيبقى false خطأً.
  // لذلك نؤكد «متصل» دورياً وعند العودة للتطبيق أو عودة الشبكة. الكتابة بقيمة مماثلة لا تكلّف شيئاً.
  const assert = () => set(pr, true).catch(() => {});
  const heal = setInterval(assert, HEAL_MS), first = setTimeout(assert, 2500);
  const vis = () => { if (!document.hidden) assert(); };
  document.addEventListener("visibilitychange", vis); addEventListener("online", assert); addEventListener("pageshow", assert);
  stopPresence = () => {
    un(); clearInterval(iv); clearInterval(heal); clearTimeout(first);
    document.removeEventListener("visibilitychange", vis); removeEventListener("online", assert); removeEventListener("pageshow", assert);
    onDisconnect(pr).cancel(); stopPresence = null;
  };
}
export const stopTracking = () => stopPresence?.();

async function addPlayer(code, uid, name) {
  await set(roomRef(code, `players/${uid}`), { name: cleanName(name), joinedAt: Date.now(), connected: true });
  setCode(code);
  trackPresence(code, uid);
}

// رقم الغرفة فريد: نحجزه بمعاملة على meta فلا تنجح إلا إن كان فارغاً فعلاً (حتى لو تسابق جهازان)
export async function createRoom(name, mode = "single", maxPlayers = 4) {
  const u = await ready;
  for (let i = 0; i < 12; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const meta = { host: u.uid, mode, maxPlayers, status: "lobby", createdAt: Date.now() };
    const r = await runTransaction(roomRef(code, "meta"), cur => (cur ? undefined : meta));
    if (r.committed) {
      await set(idxRef(code), { t: serverTimestamp(), s: "open" }).catch(() => {});
      await addPlayer(code, u.uid, name);
      return code;
    }
  }
  throw new Error("تعذر إنشاء الغرفة، حاول مرة أخرى");
}

// فحص سريع: none = غير موجودة أو مغلقة، started = بدأت اللعبة وأنت لست عضواً، ok = يمكنك الانضمام
export async function checkRoom(code) {
  const u = await ready;
  const meta = (await get(roomRef(code, "meta"))).val();
  if (!meta || meta.status === "closed") return "none";
  if (meta.status === "lobby") return "ok";
  return (await get(roomRef(code, `players/${u.uid}`))).exists() ? "ok" : "started";
}

export async function joinRoom(code, name) {
  const u = await ready;
  const meta = (await get(roomRef(code, "meta"))).val();
  if (!meta || meta.status === "closed") throw new Error("الغرفة غير موجودة");
  if ((await get(roomRef(code, `kicked/${u.uid}`))).exists()) throw new Error("تم طردك من هذه الغرفة");
  const mine = (await get(roomRef(code, `players/${u.uid}`))).exists();
  if (!mine && meta.status !== "lobby") throw new Error("اللعبة بدأت بالفعل");
  await addPlayer(code, u.uid, name);
  const n = Object.keys((await get(roomRef(code, "players"))).val() || {}).length;
  if (!mine && n > meta.maxPlayers) { await remove(roomRef(code, `players/${u.uid}`)); stopPresence?.(); throw new Error("الغرفة ممتلئة"); }
  return code;
}

// تستدعيها كل صفحة لعبة في بدايتها: تتحقق أنك عضو وترجع سياق الغرفة
export async function enterRoom() {
  const u = await ready;
  const code = getCode();
  if (!code) throw new Error("لا توجد غرفة");
  try {
    const [m, p] = await Promise.all([get(roomRef(code, "meta")), get(roomRef(code, "players"))]);
    const meta = m.val(), players = p.val();
    if (!meta || meta.status === "closed" || !players?.[u.uid]) throw 0;
    setCode(code);
    trackPresence(code, u.uid);
    return { code, uid: u.uid, isHost: meta.host === u.uid, meta, players };
  } catch { throw new Error("لست عضواً في هذه الغرفة"); }
}

// cb = { meta, players, scores } كلها اختيارية. ترجع دالة لإيقاف المراقبة
export function watchRoom(code, cb) {
  const err = e => console.error(e);
  const subs = [
    onValue(roomRef(code, "meta"), s => cb.meta?.(s.val()), err),
    onValue(roomRef(code, "players"), s => cb.players?.(s.val()), err),
    onValue(roomRef(code, "party/scores"), s => cb.scores?.(s.val()), err)
  ];
  return () => subs.forEach(u => u());
}

// تحقق مباشر (قراءة من الخادم) قبل أي إجراء حاسم: هل ما زلتُ عضواً؟ وهل الغرفة ما زالت مفتوحة؟
export async function amIIn(code) { const u = await ready; return (await get(roomRef(code, `players/${u.uid}`))).exists(); }
export async function roomOpen(code) { const m = (await get(roomRef(code, "meta"))).val(); return !!m && m.status !== "closed"; }

export const pickGame = (code, id) => update(roomRef(code, "meta"), { pick: id });

export async function startGame(code, gameId) {
  await remove(gameRef(code));
  await update(roomRef(code, "meta"), { status: "playing", game: gameId, startedAt: Date.now() });
}

// المضيف يطرد لاعباً: يُسجَّل في kicked فلا يستطيع العودة، ثم يُحذف من اللاعبين
export async function kickPlayer(code, uid) {
  await set(roomRef(code, `kicked/${uid}`), true);
  await remove(roomRef(code, `players/${uid}`));
}

export async function leaveRoom(code) {
  const u = await ready;
  const meta = (await get(roomRef(code, "meta"))).val();
  stopPresence?.();
  if (meta?.host === u.uid) {
    await update(roomRef(code, "meta"), { status: "closed" });
    await update(idxRef(code), { s: "closed", t: serverTimestamp() }).catch(() => {});
  }
  await remove(roomRef(code, `players/${u.uid}`)).catch(() => {});
  sessionStorage.removeItem("yz_room");
}

// إلغاء لعبة لم تبدأ فعلياً (مثلاً عدد اللاعبين غير صحيح): المضيف يعيد الحالة إلى lobby ثم يعود الجميع
export async function backToLobby(ctx) {
  if (ctx.isHost) await update(roomRef(ctx.code, "meta"), { status: "lobby", game: null }).catch(() => {});
  goLobby(ctx.code);
}
export const abortGame = ctx => setTimeout(() => backToLobby(ctx), ctx.isHost ? 1800 : 3200);   // غير المضيف ينتظر قليلاً حتى لا يعلق في دورة إعادة توجيه

// تنظيف الغرف المهملة: يعمل من أي جهاز يفتح الصفحة الرئيسية (مرة كل 5 دقائق كحد أقصى)
export async function sweepRooms() {
  try {
    const last = +localStorage.getItem("yz_sweep") || 0;
    if (Date.now() - last < 5 * 60e3) return;
    localStorage.setItem("yz_sweep", String(Date.now()));
    await ready;
    const idx = (await get(ref(db, "roomIndex"))).val() || {}, now = serverNow();
    for (const [code, v] of Object.entries(idx)) {
      const age = now - (v?.t || 0);
      if (age > STALE_MS || (v?.s === "closed" && age > CLOSED_MS)) {
        try { await remove(roomRef(code)); await remove(idxRef(code)); } catch { /* ليست لدينا صلاحية: نتركها */ }
      }
    }
  } catch (e) { console.warn("sweep", e); }
}
