Macrofactor — AROMI AI Wellness
================================

Macrofactor is a small, opinionated fitness app that grew out of a hackathon project and is now being shaped into something you could actually ship.

The idea is simple:

- **One place** to log food, see trends, and get workout guidance.
- **One AI brain** (AROMI) that understands your meals, context, and goals instead of a bunch of disconnected features.
- **Honest numbers** that use free nutrition data and rough ranges instead of pretending everything is perfectly accurate.

The stack is plain Next.js + TypeScript + Tailwind, wired to Groq and Open Food Facts. No paid APIs, no heavy infrastructure.

---

## What the app does

- **Food logging with AI help**
  - Type real-world food like *“2 rotis with paneer butter masala”*.
  - AROMI estimates calories and macros using Open Food Facts where possible, then fills in the gaps with the model.
  - Results always include uncertainty (ranges, not fake precision) and you decide what actually gets logged.

- **Daily dashboard**
  - 7‑day calorie trend line.
  - Macro breakdown chart (protein / carbs / fat) based on your food log.
  - Today’s summary cards so you can quickly see how the day is going.

- **Workout guidance**
  - Plans are generated based on age, activity level, goal, injuries, and available equipment.
  - Focus is on safe, realistic routines with warm‑ups and reasonable volume.

- **Dark, phone‑first UI**
  - Layout and visuals are inspired by apps like MacroFactor.
  - Everything is designed to look good in a quick demo but still feel like a real product.

---

## Tech stack

- **Framework**: Next.js (App Router), React, TypeScript
- **Styling**: Tailwind CSS with a custom dark theme
- **AI**: Groq `llama-3.3-70b-versatile`
- **Nutrition data**: Open Food Facts (free, no auth)
- **Storage**: `localStorage` for demo auth and food logs

---

## Getting started

1. **Install dependencies**

```bash
npm install
```

2. **Create your env file**

```bash
cp .env.example .env
```

Then set `GROQ_API_KEY` in `.env` (you can generate a free key from the Groq console).

3. **Run the dev server**

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## How AROMI works (high level)

- The frontend sends a single JSON payload to `/api/aromi` with:
  - `intent` (e.g. `food_estimation`, `food_log`, `workout_plan`, `general_chat`)
  - optional food text, meal type, and user context (age, goal, activity level, equipment, etc.)
- The backend:
  - Enriches food queries with Open Food Facts data when possible.
  - Calls Groq with a unified system prompt that covers food, logging, workouts, and general chat.
  - Returns structured JSON that the UI can render (estimates, logs, or plans) plus a `ui_hint` for what to show.

All of this is designed so you can iterate quickly on the prompt and UI without touching a lot of infrastructure.

---

## Production notes

This repo is intentionally minimal:

- Auth is a simple `localStorage` demo, not real authentication.
- Food logs are stored locally in the browser.
- There’s no backend database or user accounts.

If you want to take this beyond a demo, the next steps would be:

- Swap `localStorage` for a real database (Supabase, Postgres, etc.).
- Replace the demo login with proper auth.
- Add server‑side persistence for food logs and workout history.
- Tighten up validation and rate‑limiting around the AI endpoint.

Until then, it’s a solid, realistic demo you can show to judges, teammates, or investors without having to explain away fake data or complicated setup.
