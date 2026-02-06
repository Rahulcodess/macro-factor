# Macrofactor — AROMI AI Wellness

One unified fitness app: food logging, calorie estimation (with free APIs + AI), and workout plans. Built for hackathon demos and production-ready shipping.

## Features

- **AROMI** — Single AI brain for food estimation, logging, workouts, and context-aware advice
- **Food** — Free-text input (e.g. "2 rotis with paneer butter masala"); estimates use Open Food Facts API when available, then AI with confidence ranges
- **Workouts** — Generated from goals, age, activity, equipment; adjustable (e.g. "I'm travelling, no gym")
- **Dark theme** — Simple, ship-ready UI

## Setup

```bash
npm install
cp .env.example .env
# Add your GROQ_API_KEY (free at https://console.groq.com)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

- `POST /api/aromi` — Single endpoint; body: `{ intent, food_text?, meal_type?, user_context }`. Returns `{ response_type, message, data, ui_hint }`.
- `GET /api/food/nutrition?q=...` — Open Food Facts search (no key).

## Demo script (2–3 min)

1. **Hook**: "Most fitness apps force manual logging. Macrofactor uses one AI that understands how people eat and live."
2. **Food**: Type "2 rotis with paneer butter masala" → Estimate → show uncertainty → Confirm log.
3. **Workout**: Generate Workout → show warm-up + exercises.
4. **AROMI**: Type "I'm travelling tomorrow, no gym" → Adjust.
5. **Close**: "Free data, honest estimation, one AI — hackathon-ready and ship-ready."

## Stack

- Next.js 14, React 18, TypeScript, Tailwind
- Groq (Llama 3.3 70B), Open Food Facts (free, no key)
# macro-factor
