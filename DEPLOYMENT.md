# Deployment Guide

## Vercel Deployment

### Prerequisites

1. **Database**: PostgreSQL database (Neon, Supabase, Railway, etc.)
2. **Environment Variables**: Set in Vercel dashboard

### Steps

1. **Initialize Database**

   Run the schema initialization script:

   ```bash
   export DATABASE_URL="your_database_url"
   node scripts/init-db.js
   ```

   Or manually run:

   ```bash
   psql $DATABASE_URL < schema.sql
   ```

2. **Set Environment Variables in Vercel**

   Go to your Vercel project settings → Environment Variables and add:

   - `GROQ_API_KEY` — Your Groq API key
   - `DATABASE_URL` — Your PostgreSQL connection string

   **Important**: Make sure `DATABASE_URL` includes SSL parameters:
   ```
   postgresql://user:pass@host:port/db?sslmode=require
   ```

3. **Deploy**

   - Push to GitHub (if connected)
   - Or use `vercel` CLI: `vercel --prod`

### Troubleshooting

**Issue: 404 on deployed site**

- Check that environment variables are set correctly
- Verify database is accessible from Vercel's IP ranges (Neon/Supabase allow by default)
- Check build logs in Vercel dashboard for errors

**Issue: Database connection errors**

- Ensure `DATABASE_URL` includes `sslmode=require`
- Check that database allows connections from Vercel
- Verify database schema is initialized (run `schema.sql`)

**Issue: Build fails**

- Check `package.json` has all dependencies
- Verify Node.js version (Vercel uses Node 18+ by default)
- Check build logs for specific errors

### Environment Variables Checklist

- [ ] `GROQ_API_KEY` — Set in Vercel
- [ ] `DATABASE_URL` — Set in Vercel (with SSL params)
- [ ] Database schema initialized (`schema.sql` run)

### Testing Locally

Before deploying, test locally:

```bash
# Set environment variables
export GROQ_API_KEY="your_key"
export DATABASE_URL="your_db_url"

# Initialize database (first time only)
node scripts/init-db.js

# Run dev server
npm run dev
```

Visit `http://localhost:3000` and test:
- Login/create account
- Add food log entries
- View dashboard
