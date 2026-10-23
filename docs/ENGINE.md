# Дослідження FreeJ2ME Web і інтеграція

Перевірено 23 жовтня 2026. Upstream: https://github.com/zb3/freej2me-web, commit `c19416e75cbc15f9a27f7e967ee81cb108761e30`. Локальний snapshot — `vendor/freej2me-web`. Не переносимо автоматично нові версії runtime.

## Код і запуск

- `web/src/main.js`: native bindings canvas/GL/audio, `cheerpjInit`, `cheerpjRunLibrary`, `FreeJ2ME.main(['app', appId])`.
- `web/run.html`: upstream використовує loader `https://cjrtnc.leaningtech.com/20260317_2978/loader.js`; та сама зафіксована URL використана тут.
- `src/org/recompile/freej2me/FreeJ2ME.java`: app mode відкриває `<appId>/app.jar`; створює `MobilePlatform('./'+appId, width, height)`; завантажує конфігурацію й MIDlet.
- `src/org/recompile/mobile/MIDletLoader.java`: overload з appId дозволяє задати незалежний від назви ID.
- `Config.java` / `ConfigScreen.java`: підтримані width, height, sound, phone (Standard, Nokia, Siemens, Motorola, SonyEricsson), rotate, fps, fontSize, dgFormat, forceFullscreen, queuedPaint, textureDisableFilter; `main` обирає MIDlet. UI відкриває лише реалізовану частину параметрів.
- Рендеринг 2D — native JS canvas; 3D — власні WebGL 2 bindings upstream. Це не нова реалізація JVM чи API.

## Файлова система та RMS

CheerpJ монтує `/files` як постійне браузерне сховище. Upstream `RecordStore.java` використовує `Mobile.getPlatform().dataPath + '/rms/' + recordStoreName`, записує власний двійковий формат через `FileOutputStream`, закриває файл після save. Не слід підміняти його JSON/base64.

Upstream `LauncherUtil.exportData()` архівує **весь** поточний каталог, а `importData()` перед імпортом **очищує** його. Тому ці методи не викликаються нашим UI: глобальний import зруйнував би ізоляцію профілів. `init.zip` з демонстраційними JAR не постачається.

Наш appId: `retro_<profile UUID без дефісів>_<SHA-256 JAR>`. Каталоги не залежать від manifest/name. Сховище застосунку використовує `profileId:hash` як стабільний ID гри. Кожен profile-import генерує новий UUID; дублікати в одному профілі відхиляються.

`java/RetroBridge.java` — окремий, відкритий bridge JAR. Він готує конфігурацію, імпортує тільки перевірені RMS-файли у конкретний каталог, експортує тільки `<appId>/rms/*`. `destroy()` викликає protected `destroyApp(true)` справжнього MIDlet через reflection; після цього адаптер чекає RMS і запис IndexedDB, прибирає iframe та відпускає Web Lock. Немає API з фальшивим success. Для завислої JVM є явне аварійне завершення.

При старті RMS із IndexedDB є авторитетною копією. Старі файли цього appId очищуються перед відновленням, щоб restore/delete не лишав зайвих RecordStore. Немає гарантії збереження останніх <3 с при аварійному закритті. Механізм профілів не захищає від коду, що навмисно виходить за межі MIDP і звертається до інших каталогів CheerpJ.

## Контрольовані зміни upstream

Оригінальний Java runtime JAR не змінено. `scripts/prepare-engine.mjs` копіює потрібні web assets у `public/engine`, нормалізує CRLF і контрольовано адаптує `main.js`:

1. Підключає `engine/bridge.js` і додатковий bridge JAR у library classpath.
2. Замінює встановлення за URL на handshake з батьківським UI та підготовку приватного appId.
3. Перенаправляє клавіші в mapping bridge; передає ready/error/exit/restart.
4. Передає integer/fit scaling, дозволяє fractional fallback на маленькому екрані та прибирає примусове повернення фокуса при відкритті UI.

### Запуск за reverse proxy без Range

На публічному домені відтворено зависання: aaPanel proxy повертав HTTP 200 на запит `Range`, хоча контейнер повертав HTTP 206. CheerpJ `/app` filesystem відхиляв такі відповіді. `engine/runtime.js` тепер отримує два невеликі JAR звичайним GET, перевіряє HTTP-статус, розмір і ZIP-сигнатуру та передає двійкові дані до `/str/` через [cheerpOSAddStringFile](https://cheerpj.com/docs/reference/cheerpOSAddStringFile). `cheerpjRunLibrary` використовує ці read-only memory paths, тому запуск рушія не залежить від Range на зовнішньому proxy. Ігрові JAR і RMS залишаються у попередніх каталогах `/files`, ID профілів і дані не змінюються.

Завантаження кожного runtime JAR обмежено 30 секундами, запуск library — 90 секундами, загальний запуск — 180 секундами. Стадії передаються UI; помилки скриптів обробляються ще до імпорту main.js. Java exception proxies, які не можна перетворити на рядок, отримують безпечне загальне повідомлення. Регресійний тест повертає HTTP 200 замість часткової відповіді та перевіряє запуск справжнього MIDlet і RMS; окремі тести перевіряють HTTP 502 та відсутній JS-модуль.

RPC перевіряє origin, вікно-джерело і випадковий token сесії. Це захист від випадкового/стороннього postMessage, не ізоляція від Java-коду того самого origin. Web Locks забороняє паралельний запуск рушія в інших вкладках цього origin. JAR передається через локальний structured clone, а не мережевий upload.

## Ліцензії

Основний FreeJ2ME: GPL v3 або пізніша за заголовками вихідних файлів. Upstream LICENSE містить також ASM/BSD-повідомлення. Вихідне дерево містить інші компоненти з окремими заголовками, зокрема tone-код Nokia/EPL-1.0, fluidsynth/LGPL, media/ffmpeg та інші; збережено повний snapshot і повідомлення. Це не твердження про relicensing всього дерева під одну ліцензію. Перед стороннім комерційним розповсюдженням потрібен окремий аудит усіх bundled native components.

За поточною офіційною сторінкою CheerpJ Community License дозволяє певне індивідуальне, FOSS та evaluation використання з credits; для self-hosting, redistribution/OEM та використання поза цими межами є комерційні умови. CheerpJ не включено у source repository; він завантажується з офіційного CDN.

Джерела: [upstream README](https://github.com/zb3/freej2me-web), [upstream LICENSE](https://github.com/zb3/freej2me-web/blob/c19416e75cbc15f9a27f7e967ee81cb108761e30/LICENSE), [CheerpJ licensing](https://cheerpj.com/docs/licensing.html), [CheerpJ filesystem](https://cheerpj.com/docs/guides/Filesystem.html). Технічні висновки про appId/RMS/конфігурацію зроблено з локальних вихідних файлів, зазначених вище.
