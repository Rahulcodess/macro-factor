# Macrofactor

One app for logging food, seeing calories/macros, and getting workout plans. The AI bit is called AROMI—same brain for estimates, logging, and routines. You type what you ate (e.g. "2 rotis, paneer butter masala"), get a rough calorie estimate, then add it to your log. Dashboard shows today and the last 7 days. Workouts are generated from your age, activity, and equipment; you can say things like "no gym tomorrow" and get a tweaked plan.

No fake precision: we use free nutrition data and show ranges where it makes sense. Dark UI, works on mobile.

---

## What’s in the app

**Food** — Meal + food text + optional grams. Hit "Log foods" to get an estimate, then "Add to log" to save it. Your dashboard and 7-day stats update from this. If nothing shows up after adding, hit Refresh or log out and back in (and make sure `DATABASE_URL` is set in your deploy).

**Dashboard** — Intake last 7 days (line chart), daily P/F/C bars, and today’s total. Empty state has a "Log your first meal" and a Refresh button.

**Workouts** — Set age, activity, gender, goal, equipment. "Generate workout plan" gives a 4–5 day plan with warm-up and exercises. The "Adjust" box is for stuff like "travelling, no gym".

**AROMI** — Same AI in a chat-style tab: estimate food, add to log, or general chat. One API, one prompt, different intents.

---

## Stack

Next.js (App Router), React, TypeScript, Tailwind. Groq (Llama 3.3 70B) for AROMI. Open Food Facts when we can. Postgres (Neon or any) for users and food logs.

---

## Run locally

```bash
npm install
cp .env.example .env
```

`.env` needs:

- `GROQ_API_KEY` — from [Groq Console](https://console.groq.com)
- `DATABASE_URL` — Postgres URL (e.g. Neon, Supabase)

Create the schema once:

```bash
node scripts/init-db.js
```

(or run `schema.sql` with `psql`). Then:

```bash
npm run dev
```

Open `http://localhost:3000`. "Get started" → login (any email, password 4+ chars) → dashboard. New users are created in Postgres on first login.

---

## Deploy (Vercel)

Connect the repo in Vercel and set `GROQ_API_KEY` and `DATABASE_URL` in project env. Build and deploy. If the dashboard stays at zero after logging food, check that `DATABASE_URL` is set and that the DB allows connections from Vercel.

---

## For devs

Tables: `users`, `food_logs`, `workout_plans` (see `schema.sql`). AROMI: POST `/api/aromi` with `intent`, optional `food_text`, `meal_type`, `grams`, `user_context`. Food logs: Bearer token (user id) in `Authorization`; APIs under `app/api/auth/*` and `app/api/food-logs`. No password hashing yet—next step for production would be bcrypt + proper sessions and rate-limiting the AI route.
