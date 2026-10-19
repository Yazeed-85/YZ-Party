// الاتصال بـ Firebase + الدخول المجهول + وقت الخادم. لا تضع هنا منطق ألعاب.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as rtdb from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9gSlrcndzI7UIbv1sne5EqczSvsdJ6xA",
  authDomain: "yz-party.firebaseapp.com",
  databaseURL: "https://yz-party-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "yz-party",
  storageBucket: "yz-party.firebasestorage.app",
  messagingSenderId: "68569933588",
  appId: "1:68569933588:web:c0bffe1e4d521722a78401"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = rtdb.getDatabase(app);
export const { ref, get, set, update, remove, onValue, runTransaction, onDisconnect } = rtdb;

// يرجع المستخدم الحالي (نفس المعرّف بين الصفحات لأن الجلسة محفوظة في المتصفح)
export const ready = (async () => {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
})();

// وقت الخادم: يتطابق بين الجهازين بخلاف Date.now()
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;
