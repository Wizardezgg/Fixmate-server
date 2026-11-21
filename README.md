# FixMate — Smart Device & Home Appliance Repair Platform (Server)

Backend REST API for **FixMate**, an on-demand Smart Device & Home Appliance Repair Service Booking Platform built with **Node.js**, **Express.js**, **TypeScript**, **MongoDB**, **JWT**, and **Stripe**.

## Live URLs
- **API Server:** https://fixmate-server-coral.vercel.app
- **Client App:** https://fixmatewz.vercel.app

## Purpose
FixMate provides a structured, transparent repair marketplace:
- **Customers** browse admin-approved services, submit repair requests, track job progress step by step, and pay via Stripe Checkout **only after** the job is marked completed.
- **Technicians** create and manage repair listings, accept or reject requests, move jobs through the repair pipeline, and set the final amount upon completion.
- **Admins** review and approve/reject service listings, manage user roles, monitor all bookings, and track Stripe revenue.

## Key Features
- **JWT & Role-Based Middlewares (`401` / `403`):** `verifyToken`, `verifyCustomer`, `verifyTechnician`, and `verifyAdmin` verify Bearer JWTs and validate live user roles directly against MongoDB.
- **Server-Side Search, Filter, Sort & Pagination:** MongoDB queries on `GET /api/services` supporting keyword search, category & service mode filters, price/newest sorting, `.skip()`/`.limit()` pagination, and aggregated customer ratings.
- **Server-Enforced Job Status Pipeline:** Enforces valid state transitions (`requested → accepted | rejected | cancelled`, `accepted → in-progress`, `in-progress → completed` requiring `finalAmount > 0`), ownership checks, self-booking prevention, and duplicate active booking guards.
- **Pay-After-Service Stripe Integration:** Checkout Sessions are gated strictly on `completed` + `unpaid` bookings with amounts loaded from MongoDB. Both `GET /api/payments/verify` and `POST /api/payments/webhook` (`checkout.session.completed`) record payments idempotently using a unique `stripeSessionId` index.
- **Admin Moderation & Revenue Analytics:** User role management (blocking self-role changes), service approval queue, platform-wide booking monitor, and total revenue aggregation.

## API Endpoints Overview
| Route | Method | Protection |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Public |
| `/api/services`, `/api/services/featured`, `/api/services/:id` | `GET` | Public |
| `/api/services/my`, `/api/services`, `/api/services/:id` | `GET`, `POST`, `PATCH`, `DELETE` | `verifyToken`, `verifyTechnician` |
| `/api/bookings`, `/api/bookings/my`, `/api/bookings/:id/cancel`, `/api/bookings/:id/review` | `POST`, `GET`, `PATCH` | `verifyToken`, `verifyCustomer` |
| `/api/bookings/technician`, `/api/bookings/:id/status` | `GET`, `PATCH` | `verifyToken`, `verifyTechnician` |
| `/api/payments/create-checkout-session`, `/api/payments/verify`, `/api/payments/my` | `POST`, `GET` | `verifyToken`, `verifyCustomer` |
| `/api/payments/webhook` | `POST` | Stripe Signature Verification |
| `/api/users/profile` | `GET`, `PATCH` | `verifyToken` |
| `/api/admin/users`, `/api/admin/users/:id/role`, `/api/admin/services`, `/api/admin/services/:id/approval`, `/api/admin/bookings`, `/api/admin/payments` | `GET`, `PATCH` | `verifyToken`, `verifyAdmin` |

## NPM Packages Used
- **Runtime & Framework:** `express`, `cors`, `dotenv`
- **Database:** `mongodb`
- **Auth & Payments:** `jsonwebtoken`, `stripe`
- **Tooling & Types:** `typescript`, `tsx`, `@types/express`, `@types/cors`, `@types/jsonwebtoken`, `@types/node`

## Environment Variables (`.env`)
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=fixmate
JWT_SECRET=your_shared_jwt_secret
CLIENT_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
IMGBB_API_KEY=your_imgbb_api_key
```

## Running Locally
```bash
npm install
npm run dev    # Starts development server on http://localhost:5000
```

## Build & Production
```bash
npm run build
npm start
```
