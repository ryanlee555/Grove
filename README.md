# 🌿 Grove

A personal finance dashboard that connects real bank accounts and gives you an AI assistant to make sense of your spending.

**Live app:** [grovee.vercel.app](https://grovee.vercel.app)

---

## What is Grove?

Grove links directly to your real bank and credit card accounts (currently SoFi + Chase via Plaid) and turns your raw transaction data into a clean, interactive dashboard. You can track spending by category or by card, set monthly budgets with a visual arc-based editor, rename and reorder accounts, and chat with **Hamilton AI**, a built-in assistant that knows your transaction history and can answer questions about your spending in whatever tone you prefer: concise, detailed, hype, or even a roast.

This is a solo-built, full-stack project, from bank integration to backend infrastructure to UI/UX design.

---

## Features

- **Real bank account sync** - Plaid integration pulls live transactions from connected SoFi and Chase accounts
- **Spending breakdown** - view transactions by category or by card, with a 12-color palette and interactive donut chart
- **Budgets** - set monthly limits per category with a custom SVG arc-slider editor (drag-to-set, snap-to-$50, amber warning past 80%)
- **Account management** - rename accounts, hide/show them, and drag-and-drop to reorder
- **Persistent edits** - manually re-categorize or delete transactions, with changes saved permanently (keyed to Plaid's stable transaction IDs, so they survive future syncs)
- **Hamilton AI** - a slide-in AI chat assistant with full context on your transaction history and monthly spending, with selectable personality styles (Default / Concise / Detailed / Hype / Roast)
- **User profiles** - upload and crop a profile photo, set a display name, and choose your Hamilton AI style
- **Landing page** - feature showcase with an interactive budget demo and live spending breakdown visualization

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (JSX) + Vite, React Router, inline styles (no Tailwind) |
| Backend | Supabase (Postgres + Edge Functions on Deno/TypeScript + Storage) |
| Bank data | [Plaid API](https://plaid.com/) (Development tier) |
| AI assistant | Anthropic API (Claude Haiku) via a Supabase Edge Function |
| Hosting | Vercel (auto-deploys on push to `main`) |
| Fonts | Playfair Display (headings), DM Sans (body) |

---

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   React UI   │ ───▶ │ Supabase Edge Fns │ ───▶ │  Plaid API   │
│ (Vite/JSX)   │      │   (Deno/TS)       │      │ (bank data)  │
└─────────────┘      └──────────────────┘      └─────────────┘
       │                       │
       │                       ▼
       │              ┌──────────────────┐      ┌─────────────┐
       └────────────▶ │ hamilton-chat fn  │ ───▶ │ Anthropic API│
                       └──────────────────┘      └─────────────┘
                               │
                               ▼
                       ┌──────────────────┐
                       │ Supabase Postgres │
                       │  (RLS-protected)  │
                       └──────────────────┘
```

### Database (Supabase / Postgres, RLS enabled on all tables)

| Table | Purpose |
|---|---|
| `plaid_tokens` | Stores Plaid access tokens (multi-row per user, one per linked institution) |
| `transaction_overrides` | Persists manual category edits, keyed by Plaid's stable `transaction_id` |
| `deleted_transactions` | Persists user-deleted transactions |
| `budgets` | Monthly spending limits per category (`user_id`, `category`, `monthly_limit`) |
| `account_settings` | Account renames, hide/show state, and sort order |
| `user_profile` | Display name, avatar URL, and selected Hamilton AI style |

A public Supabase Storage bucket (`avatars`) holds uploaded profile photos.

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- A [Supabase](https://supabase.com) project
- A [Plaid](https://plaid.com) developer account (Development tier)
- An [Anthropic API](https://console.anthropic.com) key
- [Supabase CLI](https://supabase.com/docs/guides/cli) for deploying Edge Functions

### Installation

```bash
git clone https://github.com/ryanlee555/Grove.git
cd Grove
npm install
```

### Environment Setup

Create a `.env` file in the project root with your Supabase and Plaid credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PLAID_CLIENT_ID=your_plaid_client_id
```

Your Anthropic API key is stored **server-side only**, inside the `hamilton-chat` Supabase Edge Function — never exposed to the client.

### Running locally

```bash
npm run dev
```

### Deploying Edge Functions

```bash
supabase functions deploy hamilton-chat
supabase functions deploy get-transactions
```

### Deployment

Grove auto-deploys to Vercel on every push to `main`. Plaid's OAuth redirect URI is registered at `https://grovee.vercel.app/oauth-callback`.

---

## Project Structure

```
Grove/
├── public/                # static assets
├── src/
│   ├── assets/             # images/icons (e.g. hamilton-icon.png)
│   ├── pages/               # Dashboard, BudgetsPage, LandingPage, LoginPage, etc.
│   ├── components/         # HamiltonAI, ArcSlider, settings modal, etc.
│   └── App.jsx              # routes, shared state
├── supabase/
│   └── functions/           # hamilton-chat, get-transactions, etc.
├── vercel.json              # SPA routing rewrite rules
└── vite.config.js
```

---

## Roadmap

- [ ] Hover popover on over-budget categories showing limit + overage
- [ ] Donut chart shows total spend by default (not blank) when nothing is hovered
- [ ] Restrict account drag-to-reorder to the name/text area instead of the full row
- [ ] Persistent Hamilton AI chat history (`hamilton_messages` table)
- [ ] Shared time-period state between Dashboard and Budgets pages
- [ ] Explicit SoFi account-type detection (currently falls back to "Other")
- [ ] CSV import
- [ ] Spending breakdown by institution

---

## Security Notes

- Row-Level Security (RLS) is enabled on every table; this is the most common source of silent failures (e.g. storage/table 400 errors), so policies are checked carefully whenever new tables are added.
- The `hamilton-chat` function should validate the `Authorization` JWT header before processing requests.
- No secrets are committed to the repository — Plaid and Anthropic keys live in environment variables and Edge Function secrets only.
