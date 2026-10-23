# GitHub Actions → Docker → aaPanel

Repository: https://github.com/valikoshka1996/Retro-Java-Emulator-PWA

## Схема

`push main` → перевірки Node/Java/Playwright → Docker build на GitHub runner → перевірка контейнера й byte ranges → `docker save` → SSH/SCP → `docker load` → окремий Compose-проєкт → healthcheck → активація релізу.

PR виконує перевірки та Docker smoke test **без** SSH-деплою. `workflow_dispatch` деплоїть лише `main`. GitHub Actions використовує `contents: read` і зафіксовані SHA офіційних actions. Docker Hub/GHCR login чи PAT для деплою не потрібні: готовий образ передається безпосередньо на сервер.

## Secrets і Variables

У GitHub: **Settings → Secrets and variables → Actions → Secrets**:

| Назва | Значення |
|---|---|
| `IP_SERVER` | IP або DNS-ім’я сервера, без `http://`, порту чи шляху |
| `SSH_KEY` | Повний приватний SSH-ключ з BEGIN/END і справжніми переносами рядків; ключ без passphrase |
| `USER` | `root` для поточної конфігурації |

Цих трьох secrets достатньо. Ключ записується тільки в тимчасовий файл GitHub runner і видаляється після кроку; не включається в образ чи repository.

Необов’язковий secret `SSH_KNOWN_HOSTS` — перевірений запис SSH host key у форматі `known_hosts`. Коли його немає, workflow отримує host key через `ssh-keyscan` перед з’єднанням (довіра при першому підключенні). Якщо хочете зафіксувати ключ сервера, отримайте `ssh-keyscan -p 22 IP_СЕРВЕРА` на довіреному комп’ютері та порівняйте fingerprint із сервером перед збереженням цього secret.

**Variables** можна не створювати; типові значення:

| Variable | Типове значення | Коли змінювати |
|---|---|---|
| `SSH_PORT` | `22` | Якщо sshd слухає інший порт |
| `APP_PORT` | `18087` | Якщо цей localhost-порт уже зайнятий |

Якщо змінюєте `APP_PORT`, змініть також Target у aaPanel. Не використовуйте 80, 443, порт панелі або інших сервісів.

## Вимоги до сервера

Ubuntu, Docker Engine та Compose v2 з підтримкою `up --wait --wait-timeout`. Потрібні штатні `bash`, `curl`, `ss`, `flock`, `sha256sum`. Користувач SSH має право виконувати Docker і записувати `/opt/retro-java-emulator-pwa`. Поточний `root` відповідає цим вимогам.

Образ наразі збирається для Linux x86_64 / amd64. Перед запуском скрипт звіряє архітектуру із сервером і відхиляє невідповідність, не змінюючи чинний застосунок. Для ARM потрібне окреме налаштування build платформи.

Workflow **не встановлює і не оновлює Docker**, не перезапускає Docker daemon, aaPanel чи host Nginx, не змінює firewall, DNS, сертифікати або конфігурації інших сайтів. Якщо aaPanel встановила Docker без Compose, увімкніть/оновіть Compose через вашу панель перед повторним запуском.

## Ізоляція

- Compose project: `retro-java-emulator-pwa`.
- Каталог: `/opt/retro-java-emulator-pwa`; чужий непорожній каталог без маркера цього проєкту не використовується.
- Контейнер слухає лише `127.0.0.1:18087`; зовнішній порт не відкривається.
- Немає host volumes, доступу до Docker socket, privileged mode чи запису в каталоги інших сайтів.
- Runtime: Nginx без root, read-only filesystem, окремий tmpfs, `cap_drop: ALL`, 128 МБ RAM, 0.5 CPU, обмежені PID і ротація логів.
- Контейнери чужого Compose-проєкту не видаляються й не перезапускаються. Конфлікт порту/імені перериває деплой.
- Немає `docker system prune`, глобального `docker compose down` чи масового видалення образів. `compose down` у smoke test використовується тільки для окремого CI-проєкту на GitHub runner, не на сервері.

## Поля reverse proxy на вашому скріншоті

У **Add a reverse proxy project → Default project**:

| Поле | Значення |
|---|---|
| **Show Proxy Path** | Вимкнено; якщо вмикаєте — шлях `/` |
| **Domain name** | `retrojava.pp.ua` |
| **Target**, тип | `URL address` |
| **Target**, адреса | `http://127.0.0.1:18087` |
| **Send Host** | `$http_host` |
| **URL Rewrite** | Порожньо; `/aaa` та `/bbb` не вводити |
| **Remark** | `Java Retro Emulator PWA` або `retrojava.pp.ua` |

Натисніть **Confirm**. Це має бути окремий Proxy Project для цього домену; наявний сайт не редагуйте. Target — внутрішній HTTP, навіть якщо зовнішній домен використовує HTTPS. Адреса коректна для стандартної aaPanel з host Nginx; якщо сам reverse proxy запущений в іншому контейнері, його `127.0.0.1` означатиме інший network namespace.

Для **цього** proxy project:

1. DNS A для `retrojava.pp.ua` має вказувати на фактичний IP сервера. За наявності AAAA він теж має вести на цей сервер або його слід виправити для цього домену.
2. У вкладці **SSL** випустіть Let's Encrypt для `retrojava.pp.ua`; після успіху увімкніть **Force HTTPS**.
3. У налаштуваннях цього proxy вимкніть додатковий proxy/cache і content replacement. Кешування hashed assets уже налаштоване всередині контейнера; `sw.js` має залишатися `no-store`, HTML — `no-cache`.
4. Не вмикайте заголовки COOP/COEP, що блокують зовнішній CheerpJ. Немає потреби додавати WebSocket-налаштування.
5. Proxy має передавати `Range` і `If-Range` до upstream та не приховувати `Content-Range`. За потреби додайте **в location лише цього proxy**, не в глобальний nginx.conf:

```nginx
proxy_set_header Range $http_range;
proxy_set_header If-Range $http_if_range;
proxy_cache off;
```

Стандартний proxy вже передає ці request headers. Не дублюйте директиви, якщо вони вже є. Не додавайте другий `location /` у готовий блок aaPanel.

Офіційна документація панелі: [Proxy Project](https://www.aapanel.com/docs/Function/proxy.html).

## Перший запуск

1. Переконайтеся, що три secrets є в цьому repository, а не тільки в іншому проєкті.
2. Після push відкрийте **Actions → Test, build and deploy**.
3. Дочекайтеся зелених перевірок, Docker smoke test і SSH deployment. Якщо порт зайнятий, workflow пояснить конфлікт; задайте вільний `APP_PORT` і повторіть Run workflow.
4. Налаштуйте reverse proxy та SSL, як вище.
5. Відкрийте `https://retrojava.pp.ua/`, створіть/імпортуйте профіль і перевірте RMS Probe.

На сервері для діагностики тільки цього застосунку:

```bash
curl -f http://127.0.0.1:18087/healthz
docker ps --filter label=com.docker.compose.project=retro-java-emulator-pwa
docker compose -p retro-java-emulator-pwa \
  --env-file /opt/retro-java-emulator-pwa/current/release.env \
  -f /opt/retro-java-emulator-pwa/current/compose.yaml logs --tail=100 web
```

Перевірка зовні після налаштування aaPanel:

```bash
curl -I https://retrojava.pp.ua/sw.js
curl -sS -D - -o /dev/null -H 'Range: bytes=0-15' \
  https://retrojava.pp.ua/engine/freej2me-web.jar
```

Для worker очікується `Cache-Control: no-store, max-age=0`; для JAR — **206 Partial Content**, `Content-Range: bytes 0-15/...` і довжина 16 байтів. Якщо localhost працює, а домен дає 502, перевіряйте Target/SSL тільки цього proxy. Якщо домен дає HTML замість JAR — перевірте rewrite та cache цього proxy.

Java Retro додатково підтримує proxy, який прибирає Range: невеликі бібліотеки рушія завантажуються звичайним GET у read-only `/str/` filesystem CheerpJ. Повернення HTTP 200 із повним коректним JAR більше не блокує запуск. HTTP 502, HTML замість JAR або відсутній модуль показуються як помилка запуску. Це не вимагає редагування глобального nginx.conf чи перезапуску aaPanel.

## Оновлення і відкат

Кожний push у `main` проходить перевірки перед деплоєм. Образ позначено повним Git SHA. Для кожної спроби створюється окремий `releases/<sha>-<run-id>-<attempt>` із Compose та `release.env`; `current` перемикається тільки після healthcheck і перевірки byte ranges. Заміна контейнера може спричинити коротку перерву в HTTP-відповідях; zero-downtime не заявляється.

Якщо новий контейнер не пройшов перевірку, скрипт запускає попередню успішну конфігурацію. Якщо це найперший запуск, невдалий контейнер залишається для діагностики. Помилка деплою залишається червоною в Actions навіть після успішного відкату.

Ручний відкат до `previous`:

```bash
cd /opt/retro-java-emulator-pwa
release=$(readlink -f previous)
test -n "$release" && test -f "$release/release.env" && test -f "$release/compose.yaml"
docker compose -p retro-java-emulator-pwa --env-file "$release/release.env" \
  -f "$release/compose.yaml" up -d --no-deps --wait --wait-timeout 90 web
# Після успішного запуску:
ln -sfn "$release" /opt/retro-java-emulator-pwa/current
```

Старі образи навмисно не видаляються автоматично. Якщо потрібно звільнити місце, видаляйте лише конкретні застарілі теги `retro-java-emulator-pwa:<sha>`, які не використовуються `current` або `previous`. Глобальний prune на спільному сервері не потрібний.

Ігри, RMS і профілі лишаються в браузерному IndexedDB; Docker-деплой їх не містить і не мігрує. Перехід з `localhost` на `https://retrojava.pp.ua` — інший origin: експортуйте локальний профіль і імпортуйте його на домені. Встановлена PWA оновлює оболонку через кнопку «Оновити» після зупинки гри.
