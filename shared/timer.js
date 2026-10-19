// عداد موحّد بوقت الخادم: خزّن endAt في Firebase وكل جهاز يحسب منه
import { serverNow } from "./firebase.js";

export const deadline = seconds => serverNow() + seconds * 1000;

// ترجع دالة إيقاف. onTick(msLeft, secondsLeft) كل 100ms، وonEnd مرة واحدة
export function countdown(endAt, onTick, onEnd) {
  let done = false;
  const tick = () => {
    const left = Math.max(0, endAt - serverNow());
    onTick?.(left, Math.ceil(left / 1000));
    if (left <= 0 && !done) { done = true; clearInterval(id); onEnd?.(); }
  };
  const id = setInterval(tick, 100);
  tick();
  return () => { done = true; clearInterval(id); };
}
