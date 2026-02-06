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
  - Type real-world food like *"2 rotis with paneer butter masala"*.
  - AROMI estimates calories and macros using Open Food Facts where possible, then fills in the gaps with the model.
  - Results always include uncertainty (ranges, not fake precision) and you decide what actually gets logged.

- **Daily dashboard**
  - 7‑day calorie trend line.
  - Macro breakdown chart (protein / carbs / fat) based on your food log.
  - Today's summary cards so you can quickly see how the day is going.

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
- **Database**: PostgreSQL (Neon, Supabase, or any Postgres provider)
- **Storage**: PostgreSQL for food logs and user data

---

## Getting started

1. **Install dependencies**

```bash
npm install
```

2. **Set up your database**

Create a PostgreSQL database (Neon, Supabase, Railway, etc.) and run the schema:

```bash
psql $DATABASE_URL < schema.sql
```

Or connect manually and paste the contents of `schema.sql`.

3. **Create your env file**

```bash
cp .env.example .env
```

Then set:
- `GROQ_API_KEY` — Get a free key from [Groq Console](https://console.groq.com)
- `DATABASE_URL` — Your PostgreSQL connection string (e.g., from Neon or Supabase)

4. **Run the dev server**

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Database schema

The app uses PostgreSQL with three main tables:

- `users` — User accounts (email, name, timestamps)
- `food_logs` — Food entries with calories, macros, and metadata
- `workout_plans` — Generated workout plans (optional, for future use)

See `schema.sql` for the full schema definition.

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

## API routes

- `POST /api/auth/login` — Login/create user account
- `GET /api/auth/user` — Get current user (requires Authorization header)
- `GET /api/food-logs` — Get user's food logs (requires Authorization header)
- `POST /api/food-logs` — Create a food log entry (requires Authorization header)
- `DELETE /api/food-logs?id=...` — Delete a food log entry (requires Authorization header)
- `POST /api/aromi` — Main AROMI AI endpoint
- `GET /api/food/nutrition?q=...` — Open Food Facts search (no auth)

---

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables:
   - `GROQ_API_KEY`
   - `DATABASE_URL`
4. Deploy

The app will automatically build and deploy. Make sure your database is accessible from Vercel's IP ranges (Neon and Supabase allow this by default).

---

## Production notes

This repo is intentionally minimal but production-ready:

- Auth uses PostgreSQL-backed user accounts (no password hashing yet — add bcrypt if needed).
- Food logs are stored in PostgreSQL with proper user isolation.
- API routes use Bearer token auth (user ID from localStorage).

If you want to take this further:

- Add password hashing (bcrypt) for real auth.
- Add rate limiting around the AI endpoint.
- Add server-side session management (JWT or cookies).
- Tighten up validation and error handling.
- Add database migrations (Prisma, Drizzle, etc.).

Until then, it's a solid, realistic demo you can show to judges, teammates, or investors without having to explain away fake data or complicated setup.
