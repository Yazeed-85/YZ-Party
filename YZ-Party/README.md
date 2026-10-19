# YZ Party

ألعاب جماعية عبر Firebase، تعمل على GitHub Pages.

## الإعداد
1. Firebase Console ← Realtime Database ← Rules: الصق محتوى `firebase.rules.json` ثم Publish.
2. Authentication ← Sign-in method: تأكد أن Anonymous مفعّل.
3. Google Cloud Console ← APIs & Services ← Credentials ← مفتاح الـAPI: قيّده بـHTTP referrers على `yazeed-85.github.io/*`.
4. ارفع كل الملفات إلى المستودع (بنفس المجلدات) وافتح `https://yazeed-85.github.io/YZ-Party/`.

## إضافة لعبة
1. ضع مجلدها في `games/اسم-اللعبة/` وأول ما تفتح صفحتها استدعِ `enterRoom()` من `shared/room.js`.
2. في نهايتها استدعِ `finishGame(ctx, makeResult(...))` من `shared/result.js`.
3. في `shared/games-registry.js` غيّر `ready` إلى `true`.
