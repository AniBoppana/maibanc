# Finance Backend

Personal finance app backend — Clerk auth, Plaid bank connections, Postgres via Prisma, and a simple forecasting engine. $0/month to run for personal use.

## Quick start

```bash
npm install
cp .env.example .env        # fill in all values (see below)
npx prisma generate
npx prisma migrate dev --name init
npm run dev                 # → http://localhost:4000
```

## Environment variables

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | dashboard.clerk.com → API Keys |
| `CLERK_PUBLISHABLE_KEY` | dashboard.clerk.com → API Keys |
| `PLAID_CLIENT_ID` | dashboard.plaid.com → Team Settings → Keys |
| `PLAID_SECRET` | dashboard.plaid.com → use Sandbox secret to start |
| `PLAID_ENV` | `sandbox` to start, `production` when ready for real data |
| `DATABASE_URL` | Neon project → Connect → connection string |
| `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Server status check |
| POST | /api/plaid/link-token | Get token to open Plaid Link |
| POST | /api/plaid/exchange-public-token | Exchange after Plaid Link completes |
| GET | /api/plaid/items | List connected bank items |
| DELETE | /api/plaid/items/:id | Disconnect a bank |
| POST | /api/plaid/webhook | Plaid webhook receiver |
| GET | /api/accounts | All accounts + net worth |
| GET | /api/transactions | List transactions (filter: category, from, to, limit, cursor) |
| GET | /api/transactions/categories | All distinct categories |
| GET | /api/transactions/monthly-summary | Month-over-month spending by category |
| POST | /api/transactions/sync | Manually re-sync all connected items |
| GET | /api/budgets | List budgets |
| POST | /api/budgets | Create/update a budget |
| DELETE | /api/budgets/:id | Delete a budget |
| GET | /api/forecast | All forecast data in one response |

## Testing with Plaid sandbox

Use these credentials when Plaid Link asks you to log in to a bank:

- **Username:** user_good
- **Password:** pass_good
- **MFA (if prompted):** 1234

## Before going to production

1. Implement Plaid webhook signature verification (see https://plaid.com/docs/api/webhooks/webhook-verification/)
2. Apply for Plaid's free Trial plan at dashboard.plaid.com/trial-plan
3. Set `PLAID_ENV=production` and update `PLAID_SECRET` to your Production secret
4. Store `ENCRYPTION_KEY` in a password manager — losing it means losing all stored bank connections

## Project structure

```
src/
  server.ts                 Express app, middleware, route mounting
  db/
    client.ts               Prisma client singleton
  middleware/
    auth.ts                 Clerk session verification + user provisioning
  routes/
    plaid.ts                Link token, public token exchange, webhook, item management
    transactions.ts         List, filter, monthly summary, manual sync
    accounts.ts             Account list + net worth
    budgets.ts              CRUD budgets
    forecast.ts             Combined forecast endpoint
  services/
    plaidClient.ts          Configured Plaid SDK instance
    encryption.ts           AES-256-GCM encrypt/decrypt for access tokens
    transactionSync.ts      Cursor-based incremental transaction sync
    forecastService.ts      Category trends, recurring detection, budget pacing, projections
prisma/
  schema.prisma             User, PlaidItem, Account, Transaction, Budget models
```
