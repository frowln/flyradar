# SkyAtlas — how place texts are written

These texts are what a passenger reads at the window, often in airplane mode,
glancing between the phone and the view. They replace the dry first paragraph
of an encyclopedia. Every entry answers three questions: *why should I look?*,
*what exactly do I look for?*, *what will I remember?*

## Voice

- A knowledgeable friend in the next seat: warm, precise, a little wonder, no
  hype. Second person, present tense. Short sentences.
- Lead with the hook — the most striking, visual or surprising thing. Never open
  with "X is a city in Y" / "X — это город в Y".
- The view from 10–11 km is the frame: shapes, colours, scale, what stands out,
  how it looks at dawn or at night, in winter or summer. Cruise altitude is
  about 11,000 m — useful for comparisons ("the summit is still 5 km below you").
- One idea per sentence. No lists of dates. No superlatives unless certain.
- Russian is written natively (not translated from English): «ёлочки», ё where
  it belongs, «вы» lowercase, numbers with a thin space (8 848 м).

## Truth

- Only well-established facts. If unsure of a number, round it ("about",
  «около») or leave it out. Never invent records, dates, legends or quotes.
- No wars or conflicts after 1900, no genocides, no terrorism, no air or other
  disasters with casualties, no current politics. Disputed territories: name
  the place, not whose it is.
- Religion only as culture and history, neutrally.
- Don't claim something is visible when it is not: individual buildings,
  statues and streets are not visible from cruise; city shapes, coastlines,
  rivers, lakes, snow, deserts, volcano cones and at night city lights are.

## Fields (per language)

| key | what | limit |
|---|---|---|
| `t` | tagline — one line under the name; a hook, not a definition | ≤ 60 characters |
| `s` | story — 2–4 sentences | 40–75 words (ja: 80–150 characters) |
| `w` | what to look for from the window — shape, colour, position relative to something recognisable | ≤ 25 words (ja ≤ 60 chars) |
| `f` | 2–3 facts, each a complete sentence, surprising and checkable | each ≤ 140 characters |
| `q` | one quiz question about this place: `{ "q": question, "a": right answer, "x": [two wrong answers] }` — wrong answers plausible, same type as the right one, never also true | q ≤ 90 chars, answers ≤ 40 chars |

File format — one JSON object keyed by the place `key` from the input file:

```json
{
  "Q39231": {
    "t": "Japan's near-perfect cone, alone on the plain",
    "s": "From cruise height Fuji looks drawn with a compass: a lone, symmetrical cone rising from flat land, white on top for much of the year. It is a volcano that last erupted in 1707, and its summit at 3,776 m is still about seven kilometres below you.",
    "w": "A lone white-capped cone standing apart from the hills, south-west of Tokyo.",
    "f": [
      "In 1707 its last eruption dusted Edo — today's Tokyo — with ash, about 100 km away.",
      "Its summit crater is roughly 500 metres across.",
      "Since 2013 Fuji has been a UNESCO World Heritage site as a source of artistic inspiration."
    ],
    "q": { "q": "When did Mount Fuji last erupt?", "a": "1707", "x": ["1854", "1923"] }
  }
}
```

The same entry in Russian (`ru/…`):

```json
{
  "Q39231": {
    "t": "Почти идеальный конус посреди равнины",
    "s": "С эшелона Фудзи будто начерчена циркулем: одинокий правильный конус над плоской равниной, большую часть года с белой шапкой. Это вулкан — последний раз он извергался в 1707 году, а его вершина (3 776 м) всё равно почти на семь километров ниже вас.",
    "w": "Одинокий конус с белой вершиной в стороне от холмов, к юго-западу от Токио.",
    "f": [
      "В 1707 году пепел последнего извержения засыпал Эдо — нынешний Токио — в сотне километров от вулкана.",
      "Кратер на вершине — около 500 метров в поперечнике.",
      "С 2013 года Фудзи — объект Всемирного наследия ЮНЕСКО как источник вдохновения для искусства."
    ],
    "q": { "q": "Когда Фудзи извергалась в последний раз?", "a": "В 1707 году", "x": ["В 1854 году", "В 1923 году"] }
  }
}
```

A city (Istanbul):

```json
{
  "Q406": {
    "t": "One city, two continents, one blue thread between them",
    "s": "Look for a thin blue line cutting a vast city in two: the Bosphorus, with Europe on one bank and Asia on the other. The Golden Horn curls into the old town on the European side. As Constantinople, this was an imperial capital for more than a thousand years.",
    "w": "A narrow strait running north–south between the Black Sea and the Sea of Marmara.",
    "f": [
      "The Bosphorus is about 30 km long and well under a kilometre wide at its narrowest.",
      "Three suspension bridges cross the strait; from cruise they show as fine pale lines.",
      "At night the two shores glow as one ribbon of light along the water."
    ],
    "q": { "q": "Which strait splits Istanbul between Europe and Asia?", "a": "The Bosphorus", "x": ["The Dardanelles", "The Strait of Messina"] }
  }
}
```

## Checking your work

`node content/validate.mjs` checks every file against these limits and the
format; it must print no errors.
