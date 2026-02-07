# Macrofactor

Fitness app with an AI coach (we call it AROMI) that handles food estimates, logging, and workout plans in one place. You type what you ate, get rough calories and macros, and can generate routines based on your age, activity level, and equipment. No fake precision—we use free nutrition data and show ranges where it makes sense.

Started as a hackathon project; the codebase is set up so you can actually run and extend it without fighting a ton of infra.

---

## What you can do

**Food** — Enter stuff like "2 rotis, paneer butter masala" or "eggs 100g". If you set a CalorieNinjas API key, we use that first for reliable nutrition; otherwise Open Food Facts, then the model. You get an estimate, then you choose whether to add it to your log. Indian food and free-text work fine.

**Dashboard** — Your last 7 days as a simple calorie line, plus a day-by-day macro breakdown (protein, carbs, fat). Today’s total and a short recent list so you can see how the day is going.

**Workouts** — You set age, activity (sedentary / moderate / active), and gender. Hit “Generate workout plan” and you get a 3–5 day plan with warm-ups and exercises. There’s an “Adjust” box if you want to say things like “no gym tomorrow” and get a tweaked plan.

**AROMI tab** — Same AI: estimate food, add to log, or just chat. One endpoint, one prompt, different intents.

UI is dark, mobile-friendly, and inspired by apps like MacroFactor. Nothing fancy, but it’s coherent and usable.

---

## Stack

- Next.js (App Router), React, TypeScript, Tailwind
- Groq (Llama 3.3 70B) for the AI
- CalorieNinjas API for nutrition when `CALORIE_NINJAS_API_KEY` is set (recommended); otherwise Open Food Facts (no key)
- PostgreSQL for users and food logs (we use Neon; any Postgres works)

---

## Run it locally

Clone, then:

```bash
npm install
cp .env.example .env
```

In `.env` you need:

- `GROQ_API_KEY` — free at [Groq Console](https://console.groq.com)
- `DATABASE_URL` — Postgres connection string (e.g. from Neon or Supabase)
- `CALORIE_NINJAS_API_KEY` — optional; get a key at [CalorieNinjas](https://calorieninjas.com/api) for better food estimates (natural-language queries, quantities like "3 eggs" or "1lb chicken"). **Never commit API keys**—use `.env` locally (see `.env.example`) and set env vars in Vercel for production.

Create the DB schema once:

```bash
node scripts/init-db.js
```

(or run `schema.sql` yourself if you have `psql`).

Then:

```bash
npm run dev
```

Open `http://localhost:3000`. You’ll land on the homepage; “Get started” takes you to login, then the dashboard. Sign in with any email (and a password of 4+ chars); the app will create the user in Postgres if needed.

---

## Deploy (e.g. Vercel)

Push to GitHub, hook the repo up in Vercel, and set `GROQ_API_KEY`, `DATABASE_URL`, and optionally `CALORIE_NINJAS_API_KEY` in the project env. Build should just work. Make sure your DB allows connections from Vercel (Neon/Supabase do by default). There’s a `DEPLOYMENT.md` in the repo if you want a bit more detail.

---

## DB and API (for devs)

Tables: `users`, `food_logs`, `workout_plans`. See `schema.sql`.

AROMI is a single POST to `/api/aromi` with a JSON body: `intent` (e.g. `food_estimation`, `workout_plan`), optional `food_text`, `meal_type`, `grams`, and `user_context`. The backend can inject CalorieNinjas or Open Food Facts data into the prompt when it’s a food query, then returns JSON the UI knows how to render. Auth for food logs is Bearer token (user id from login); login and food-logs APIs are in `app/api/auth/*` and `app/api/food-logs`.

---

## If you want to go further

Right now there’s no password hashing (we accept any email + short password and create/find the user). Adding bcrypt and proper sessions would be the next step for “real” auth. Same idea: rate-limit the AI route, add migrations (e.g. Prisma/Drizzle) if the schema grows. For a demo or a side project, the current setup is enough to use and ship.
