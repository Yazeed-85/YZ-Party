// الغرف واللاعبون. هيكل البيانات: rooms/{code}/{meta, players, party/scores, game}
import { db, ready, ref, get, set, update, remove, onValue, runTransaction, onDisconnect } from "./firebase.js";

export const roomRef = (c, p = "") => ref(db, `rooms/${c}` + (p ? "/" + p : ""));
export const gameRef = (c, p = "") => roomRef(c, "game" + (p ? "/" + p : ""));

export const savedName = () => localStorage.getItem("yz_name") || "";
export const saveName = n => localStorage.setItem("yz_name", n);
export const cleanName = n => (n || "").replace(/\s+/g, " ").trim().slice(0, 16);
export const getCode = () => new URLSearchParams(location.search).get("room") || sessionStorage.getItem("yz_room");
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
  stopPresence = () => { un(); onDisconnect(pr).cancel(); stopPresence = null; };
}

async function addPlayer(code, uid, name) {
  await set(roomRef(code, `players/${uid}`), { name: cleanName(name), joinedAt: Date.now(), connected: true });
  setCode(code);
  trackPresence(code, uid);
}

export async function createRoom(name, mode = "single", maxPlayers = 4) {
  const u = await ready;
  for (let i = 0; i < 8; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const meta = { host: u.uid, mode, maxPlayers, status: "lobby", createdAt: Date.now() };
    const r = await runTransaction(roomRef(code, "meta"), cur => (cur ? undefined : meta));
    if (r.committed) { await addPlayer(code, u.uid, name); return code; }
  }
  throw new Error("تعذر إنشاء الغرفة، حاول مرة أخرى");
}

export async function joinRoom(code, name) {
  const u = await ready;
  const meta = (await get(roomRef(code, "meta"))).val();
  if (!meta || meta.status === "closed") throw new Error("الغرفة غير موجودة");
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

export const pickGame = (code, id) => update(roomRef(code, "meta"), { pick: id });

export async function startGame(code, gameId) {
  await remove(gameRef(code));
  await update(roomRef(code, "meta"), { status: "playing", game: gameId, startedAt: Date.now() });
}

export async function leaveRoom(code) {
  const u = await ready;
  const meta = (await get(roomRef(code, "meta"))).val();
  stopPresence?.();
  if (meta?.host === u.uid) await update(roomRef(code, "meta"), { status: "closed" });
  await remove(roomRef(code, `players/${u.uid}`)).catch(() => {});
  sessionStorage.removeItem("yz_room");
}
