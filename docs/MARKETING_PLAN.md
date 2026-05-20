# SkyAtlas — Маркетинг-план

> Реалистичный план продвижения indie consumer-app с bootstrap бюджетом $3-5k на год.

---

## Контекст

- **Продукт**: SkyAtlas — Letterboxd для полётов. Офлайн-трекинг + коллекция стран/POI + Wrapped.
- **Целевая аудитория**: путешественники 25-45, англоязычные рынки, 3-8 рейсов/год.
- **Конкуренты**: Flighty ($50/год), FR24 (free for observers).
- **Главный viral asset**: Year Wrapped + Instagram Story share card.
- **Главный риск**: low frequency = слабый habit, retention зависит от Daily Sky Facts + Wrapped.

---

## Фаза 1: Pre-launch (за месяц до релиза)

### 1. Build waitlist через лендинг
- Лендинг готов в `landing/index.html`
- Деплой на **Vercel** (бесплатно)
- Купить домен `skyatlas.app` (~$10/год)
- На лендинге: hero + 5 скриншотов + tagline + email-форма
- **Цель**: 500-1000 emails до launch — это твоя seed-аудитория для launch day

### 2. Build-in-public на Twitter/X
- Создать аккаунт **@skyatlas_app**
- 2-3 поста в неделю: progress screenshots, design decisions, what you learned
- Хэштеги: `#aviation #travel #indieapp #buildinpublic #appstore`
- **Цель**: 500 followers до launch

### 3. Подготовить press kit
- Скриншоты в 3 размерах (6.7", 6.5", 5.5" iPhone)
- Логотип в PNG/SVG
- Founder story (1 абзац)
- Контакт email
- Архив `press-kit.zip` на лендинге

---

## Фаза 2: Launch Day

**Запускайся во вторник или среду утром по US East времени** (лучшее время для ProductHunt + media).

### 1. ProductHunt (главный канал)
- Заранее найти "hunter" с 500+ followers через https://www.producthunt.com/hunters
- Submit за день до запуска, hunter публикует утром
- **Первые 10 часов критичны** — попроси 30-50 друзей upvote + комментарии
- Подготовить ответы на типичные вопросы заранее
- **Цель**: Top 5 продукт дня = 5,000-15,000 visits

### 2. Hacker News
- Заголовок: `Show HN: SkyAtlas — Letterboxd for flights`
- Tone: технический + честно про tradeoffs
- Описать tech stack (React Native + Expo + Fastify)
- **Цель**: первая страница = 5,000-20,000 visits

### 3. Reddit organic (осторожно — читать правила subreddit!)
- **r/travel** (3.4M подписчиков)
- **r/aviation** (1M)
- **r/solotravel** (1.4M)
- **r/digitalnomad** (2M)
- **r/iosapps** (200k)
- **Tone**: "I built X because of Y problem I had" — НЕ "buy my app"

### 4. Twitter announcement thread
- 10-12 твитов с скриншотами
- Tag aviation/travel accounts
- Pin to profile
- DM 20-30 знакомых попросить ретвит

### 5. Apple Editorial pitch
- За **4 недели до launch** — pitch в Apple через App Store Connect → "Feature your app"
- Tone: design quality + unique angle (Letterboxd for flights)
- **Что нужно**: editorial-quality screenshots, App Preview video, unique positioning statement

---

## Фаза 3: Месяцы 1-3 после launch

### 1. ASO (App Store Optimization) — главный долгосрочный канал

**Keywords**:
```
flight tracker, offline flight, travel diary, flight log,
journey tracker, aviation, atlas, world map, passport,
trip planner, flight tracker offline
```

**A/B тесты**:
- App icon (Apple поддерживает с iOS 15)
- Скриншоты (порядок и контент)
- Subtitle и promotional text

**Ratings**:
- Запрашивать после успешного полёта (нативный iOS prompt)
- Цель: 4.6+ rating = boost в search ranking

### 2. Micro-influencer outreach (~$200-500/мес)

**Поиск**:
- Modash.io (free trial для 10k-100k подписчиков)
- Aviation + travel niche

**Outreach DM template**:
```
Hi [name], I built SkyAtlas — an offline flight tracker that shows
you the places below as you fly. Thought it might fit your travel
content. Happy to give you free Pro + custom referral code if you'd
like to try. No pressure, just a fellow traveler appreciating your work.
```

**Цель**: 3-5 интеграций/месяц с CTR 2-5%

### 3. Content marketing (бесплатно, времязатратно)

**Blog `skyatlas.app/blog`**:
- "What's flying under your plane: Tokyo→NYC route POIs"
- "Why offline flight tracking matters in 2026"
- "How to start your travel atlas: complete beginner guide"
- "10 most flown routes and what's below"
- SEO-target long-tail queries

**Частота**: 1 пост в неделю
**Цель**: 10k organic traffic в месяц через 6 месяцев

### 4. TikTok / Instagram Reels organic
- Если успеем AR — это вирусный формат
- Иначе: красивые видео полётов + музыка
- Хук в первые 2 секунды (что увидишь, не "скачайте app")
- **Цель**: 1 viral video (>100k views) = 5-20k downloads

---

## Фаза 4: Декабрь — критичный момент (Wrapped)

**Wrapped кампания — твой главный organic boost**

### За 2 недели до релиза Wrapped
- Тизер в Twitter / Instagram
- "Coming December 1: Your 2026 in the skies"
- Email-кампания для существующих юзеров

### День релиза Wrapped
- Push-уведомление всем юзерам: "Your 2026 in the skies is ready 🎉"
- Шеринг card → Instagram Story → виральность через travel-community
- Pitch travel-журналистам как "Spotify Wrapped для путешественников"
- DM travel-инфлюенсерам с готовым Wrapped (если у них достаточно полётов)

### Цель
- 30%+ юзеров шарят
- Попадание в travel-Twitter
- Media coverage в TechCrunch / The Verge / Wired

---

## Бюджет 12 месяцев

| Категория | Стоимость | Описание |
|---|---|---|
| Apple Developer | $99 | Обязательно для App Store |
| Домен + хостинг | $70 | Vercel free + Hetzner $5/мес для backend |
| AviationStack | $120 | $10/мес (опционально) |
| Sentry / PostHog / RevenueCat | $0 | Free tiers покрывают первые 10k юзеров |
| Designer для screenshots | $300-500 | Один раз перед launch |
| Видео editor для App Preview | $200 | 30-секундное видео |
| Micro-influencers | $1,500-3,000 | $200-500/мес × 6 |
| ASA test (опционально) | $500-1,000 | Apple Search Ads для validation |
| **ИТОГО** | **$3,000-5,000** | На весь год |

**С $5k в год realistic outcome**: 1,000-3,000 paying users = **$20k-60k ARR**

---

## Чего НЕ делать (типичные ошибки indie)

❌ **Не запускай платный маркетинг до D30 > 25%** — сжигаешь деньги в воду
❌ **Не пиши инвесторам до $20k MRR** — закроются двери на корню
❌ **Не строй новые фичи до launch** — продукт уже готов, теперь нужны юзеры
❌ **Не делай free tier слишком щедрым** — каннибализация Pro
❌ **Не игнорируй негативные отзывы** — отвечай на каждый в App Store
❌ **Не запускайся одновременно на iOS + Android** — focus на одной платформе сначала
❌ **Не платить за фейковые ratings** — Apple банит
❌ **Не использовать стандартные шаблоны для screenshots** — провал conversion

---

## Чек-лист на сегодня-завтра

- [ ] Зарегистрировать **@skyatlas_app** на Twitter/X
- [ ] Деплой `landing/index.html` на **Vercel**
- [ ] Купить домен **skyatlas.app** (Namecheap / Cloudflare)
- [ ] Зарегистрировать **Apple Developer аккаунт** ($99)
- [ ] Создать app record в **App Store Connect**
- [ ] Запустить **waitlist** в Twitter (pinned tweet)
- [ ] Подготовить **press kit ZIP** на лендинге
- [ ] Найти **hunter** для ProductHunt

---

## Метрики которые надо отслеживать

### Первые 30 дней
- Total downloads
- D1, D7, D30 retention
- Trial → Paid conversion rate
- App Store rating + review count
- Avg session length
- POIs viewed per user

### Критические пороги
- **D30 > 35%**: продукт sticky, продолжай маркетинг
- **D30 25-35%**: пограничная зона, итерируй
- **D30 < 20%**: что-то фундаментально не так, **stop и pivot**

### Северная звезда метрика
**Daily Active Users (DAU)** — главный показатель habit.
Если daily push работает, должно расти даже без новых flights.

---

## Решающие моменты (decision points)

### Месяц 3
**Условие**: посмотреть D30 retention
- **D30 > 30%** → continue consumer playbook
- **D30 < 25%** → pivot to B2B (white-label для авиакомпаний)

### Месяц 6
**Условие**: посмотреть MRR
- **MRR > $5k** → reinvest в дизайн/маркетинг, hire designer part-time
- **MRR $1-5k** → continue bootstrap, иторируй
- **MRR < $1k** → реальный pivot или закрытие

### Месяц 12
**Условие**: посмотреть общий ARR + B2B traction
- **ARR > $50k + B2B контракт в работе** → consider revenue-based financing
- **ARR $20-50k** → продолжай как indie, расширяй каналы
- **ARR < $20k** → честно оценить — продукт vs market vs effort

---

## Финансовая стратегия

### Bootstrap → Revenue → Optional Funding

**0-6 месяцев**: Pure bootstrap. Собственное время + $3-5k.
**6-12 месяцев**: Reinvest revenue в дизайнера/маркетинг.
**12-18 месяцев**: При MRR > $20k и B2B-traction → revenue-based financing ($50-150k) или angel ($100-300k).
**18+ месяцев**: При outlier-сценарии (MRR > $50k) → seed $1-2M с индустри-focused funds (Calm Fund, Earnest).

### НЕ нужно классический VC
- VC ждут $10M+ ARR в 5 лет
- Travel-consumer-app realistic ceiling — $1-3M ARR
- VC заберёт твою optionality
- Bootstrap = долгосрочная свобода

---

## Реалистичный exit-сценарий (4-6 лет)

**Acquisition** ($20-50M) от:
- Booking.com / Expedia / Tripadvisor
- Airline alliance (Star Alliance, OneWorld, SkyTeam)
- Apple (если попал в acquisition radar)

**Условие**: достигнуть B-сценария ($720k+ ARR) или B2B-pivot с 5+ контрактами.

---

## Шансы успеха (по аудиту)

| Сценарий | Вероятность | Условия |
|---|---|---|
| Wipeout (<500 paid) | 25% | Если retention < 20% и не pivot |
| Sustainable indie ($30-80k ARR) | 35% | Tier 1 фичи + правильное позиционирование |
| Letterboxd-tier ($200-500k ARR) | 20% | + viral момент через travel-influencer |
| B2B pivot ($150-500k ARR) | 15% | Если consumer не взлетит, качество кода/дизайна = pitch |
| Unicorn pathway | 5% | Apple integration / acquisition |

**Суммарная вероятность «что-то приличное получится»: 75%**.
Это сильно выше среднего для indie consumer app (90% умирают).

---

## Главный risk-фактор: выгорание

Большинство indie-успехов выглядят как мгновенный взлёт, а на деле — 18 месяцев pivoting в темноте.

**Заложи в план**:
- 3 месяца тишины после launch (D30 покажет тренд)
- 6 месяцев до "момента истины" (либо traction, либо pivot)
- 12 месяцев до решения "indie vs B2B vs закрыть"

**Психологическая выносливость = главный MVP**, не код.

---

*Документ создан: 2026-05-20*
*Источник: SkyAtlas audit + market analysis*
