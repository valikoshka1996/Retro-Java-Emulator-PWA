# Full State Snapshots — feasibility report

**Рішення: недоступні.** `EmulatorCapabilities.snapshots` має літеральний тип `false`. Немає saveState/loadState і немає кнопок, які видають screenshot/RMS за повний snapshot.

У дослідженому FreeJ2ME Web є персистентні RMS та експорт файлового дерева. Немає формату для JVM heap, Java thread stacks, program counters і scheduler state. Доступний CheerpJ library API запускає Java та викликає методи; в цій інтеграції не знайдено підтриманого API freeze/serialize/resume всієї VM. Це висновок для зафіксованої версії, а не твердження про всі майбутні продукти.

Навіть з дампом Java-об’єктів потрібні узгоджені знімки JS native handles, Canvas, WebGL textures/framebuffers, WASM MIDI/FFmpeg, AudioWorklet queues, часових баз, таймерів і pending async callbacks. Вони живуть поза JVM heap. Звичайна Java serialization не зберігає стек виконання. Заморожений canvas, screenshot чи резервна копія RMS не розв’язують цю задачу.

Для реалізації потрібен документований VM checkpoint API або інша VM зі snapshot support, barrier для потоків, серіалізація native resources, версійований формат та відтворювані перевірки після закриття процесу браузера. Потрібен окремий ліцензійний аналіз, якщо це передбачає зміни/постачання CheerpJ.

Критерій прийняття майбутньої функції: власний MIDlet без RMS виконує детерміновану послідовність; snapshot у середині роботи; повне завершення процесу браузера; відновлення у новому процесі; збігаються heap/counter, наступні події, графіка, звук і таймери. До проходження такого тесту capability залишається false.

Наявні слоти відновлюють **тільки RMS**. Точний момент гри не відновлюється; гра стартує заново й читає власні внутрішні збереження.
