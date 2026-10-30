// صفحات الألعاب: سطر واحد في أعلى الوحدة (import '../../shared/comms-auto.js') يُظهر شريط الدردشة والمايك ويعيد الاتصال بالقناة الصوتية تلقائياً.
// الصنف yzc-on يُضبط فوراً (قبل أول رسم لـ scoreBar) ليحجز فراغ الشريط وسط شريط النقاط.
import { getCode } from "./room.js";
import { initComms } from "./comms.js";

const code = getCode();
if (code) {
  document.documentElement.classList.add("yzc-on");
  initComms({ mode: "game" }).enter(code).catch(e => { console.warn("comms", e); document.documentElement.classList.remove("yzc-on"); });
}
