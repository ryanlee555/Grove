# Grove: PRD

## 1. Overview

Grove is a personal finance dashboard that connects real bank accounts to a unified web interface, giving users a clear view of spending, budgets, and account activity in one place. It combines live transaction data from Plaid with an AI assistant, Hamilton AI, that helps users understand their financial habits in plain language.

## 2. Problem Statement

Most people's financial data is scattered across multiple banking apps with inconsistent categorization, limited budgeting tools, and no way to ask questions about their own spending. Existing finance apps either oversimplify (basic balance checking) or overwhelm (enterprise-grade dashboards built for accountants, not individuals). Grove fills that gap by combining real account data, flexible budget tracking, and conversational AI in a lightweight, fast interface built for individual use.

## 3. Goals and Non-Goals

**Goals**
- Provide a single dashboard view across multiple bank accounts and cards
- Let users set and track category-level budgets with clear visual feedback
- Allow natural-language questions about spending through Hamilton AI
- Maintain accurate, persistent transaction data even as raw bank data changes
- Serve as a polished, production-quality portfolio project demonstrating full-stack development skills

**Non-Goals**
- Grove is not a replacement for full accounting or tax software
- Grove does not support investment tracking, bill pay, or money movement
- Grove is not built for multi-user households or shared finances in its current scope
- Grove does not aim to support every financial institution; it currently scopes to Plaid-supported accounts

## 4. User Personas

**Maya Chen, 24, Marketing Coordinator**
Maya has three credit cards she uses for different reasons: one for everyday purchases, one for travel rewards, and one she's slowly paying down. She loses track of which card she used for what and regularly overspends in categories like dining and shopping without realizing it until her statement arrives. She wants a single view of all her cards with budgets that warn her before she overspends, not after.

**David Okafor, 31, Software Engineer**
David is financially organized but curious. He doesn't need help building a budget; he wants to understand patterns, like how his spending shifts month to month or what changed since he moved apartments. Rather than digging through transaction lists himself, he wants to ask direct questions and get fast, conversational answers about his own data.

## 5. Core Features

### Dashboard and Transactions (Shipped)
- Unified transaction feed across all connected accounts (SoFi, Chase)
- Category and card-based views with a toggle between the two
- Persistent edits to transaction categories and deletions, preserved across sessions using stable Plaid transaction IDs
- Custom account naming, hide/show controls, and drag-to-reorder for accounts
- Color-coded card and category system using a 12-color palette with no repeats

### Budgets (Shipped)
- Monthly, category-level budget limits
- Interactive arc-style slider for setting and editing budget amounts
- Visual progress indicators with amber warnings above 80% of a limit

### Hamilton AI (Shipped)
- Conversational assistant with access to full transaction history and monthly category breakdowns
- Adjustable personality styles: Default, Concise, Detailed, Hype, and Roast
- Available as a slide-in panel from both the dashboard and budgets pages

### Settings and Personalization (Shipped)
- Profile photo upload with crop and zoom
- Display name and Hamilton AI style preferences saved per user

## 6. Technical Architecture

**Frontend:** React with JSX, built on Vite, styled with inline styles, routed with React Router

**Backend:** Supabase, using Postgres for data storage and Deno-based Edge Functions for serverless logic, deployed via the Supabase CLI

**Integrations:**
- Plaid (Development tier) for live bank account and transaction data, currently connected to SoFi and Chase
- Anthropic API (Claude Haiku) powering Hamilton AI through a dedicated edge function

**Deployment:** Vercel, with automatic deployment on push to the main branch and SPA routing configured through a rewrite rule

## 7. Data Model

Grove's Supabase schema centers on a small set of user-scoped tables, all protected by row-level security:

- `plaid_tokens`: stores one or more access tokens per user for connected institutions
- `transaction_overrides`: persists user edits to transaction categories, keyed by stable transaction ID
- `deleted_transactions`: persists user-deleted transactions
- `budgets`: stores category and monthly limit per user
- `account_settings`: stores account renames, visibility, and sort order
- `user_profile`: stores display name, avatar URL, and Hamilton AI style preference

## 8. Security and Privacy

- Row-level security is enabled on all user-scoped tables to prevent cross-user data access
- The Anthropic API key is held server-side within the `hamilton-chat` edge function and never exposed to the client
- The `hamilton-chat` function should validate the `Authorization` JWT header on every request
- Git history should be periodically audited to confirm no secrets or `.env` values have been committed
- Avatar storage uses a public bucket with RLS policies scoped to permitted operations

## 9. Roadmap (Prioritized)

1. Over-budget popover with limit and overage detail
2. Donut chart default center state showing total spend
3. Scoped drag-to-reorder interaction
4. Hamilton AI persistent chat memory
5. Shared time period state between Dashboard and Budgets
6. Explicit SoFi account detection
7. CSV import
8. Spending breakdown by institution

## 10. Success Metrics

Since Grove serves both as a personal tool and a portfolio centerpiece, success is measured across two dimensions:

**Personal utility**
- Reduction in time spent manually reconciling spending across accounts
- Consistent use of budgets to catch overspending before it occurs
- Reliance on Hamilton AI for quick financial questions instead of manual transaction review

**Engineering quality**
- Clean separation of concerns across frontend, backend, and integrations
- Resilience to real-world data quirks (duplicate transactions, shifting IDs, multi-account complexity)
- Demonstrable security practices (RLS, server-side key handling, authenticated edge functions)
- A feature set substantial enough to communicate full-stack capability in a job or internship context
