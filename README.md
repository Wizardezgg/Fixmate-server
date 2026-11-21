# FixMate — API Server

Backend REST API for **FixMate**, an on-demand Smart Device & Home Appliance Repair Service Booking Platform. Built with Express.js, TypeScript, MongoDB, JWT role-based authentication, and Stripe.

## Purpose
FixMate solves two sides of the repair market:
1. **Customers** can browse admin-approved repair services, submit requests, track every step of the job (`requested → accepted → in-progress → completed`), and pay online **only after** the repair is completed.
2. **Technicians** can list repair services, manage incoming requests, and update job progress, while **Admins** moderate service listings, manage user roles, and monitor platform revenue.

## Live URLs
- **API Server:** `<Add your deployed Server URL here>`
- **Client App:** `<Add your deployed Vercel Client URL here>`

## Admin & Test Account Credentials
- **Admin:** `admin@fixmate.com` / `Admin123!`
- **Technician:** `arafat@fixmate.com` / `Arafat123!` (also `easin@fixmate.com` / `Easin123!`)
- **Customer:** `sumon@fixmate.com` / `Sumon123!` (also `rifat@fixmate.com` / `Rifat123!`)

## Key Features
- **JWT & Role-Based Middlewares (`401` / `403`):** `verifyToken`, `verifyCustomer`, `verifyTechnician`, and `verifyAdmin` verify Bearer JWTs and check live user roles in MongoDB.
- **Server-Side Search, Filter, Sort & Pagination:** MongoDB queries on `GET /api/services` supporting keyword search, category & service mode filters, price/date sorting, `.skip()`/`.limit()` pagination, and aggregated review ratings.
- **Server-Enforced Job Status Pipeline:** Validates strict state transitions (`requested → accepted | rejected | cancelled`, `accepted → in-progress`, `in-progress → completed` with `finalAmount > 0`), ownership checks, and duplicate active request prevention.
- **Pay-After-Service Stripe Integration:** Checkout Sessions are gated on `completed` + `unpaid` bookings (pricing loaded strictly from MongoDB). Both `GET /api/payments/verify` and `POST /api/payments/webhook` (`checkout.session.completed`) record payments idempotently using a unique `stripeSessionId` index.
- **Admin Moderation & Revenue Tracking:** User role management (prevents self-role modification), service approval/rejection queue, platform-wide booking monitor, and total revenue aggregation.

## API Endpoints Overview
| Route | Method | Access |
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
