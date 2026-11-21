import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { bookingsCollection, paymentsCollection } from "../config/db.js";
import { verifyCustomer, verifyToken } from "../middleware/auth.js";
import { recordPaidSession } from "../utils/paymentRecorder.js";

const router = Router();

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

// POST /api/payments/create-checkout-session — Customer pays for completed unpaid booking
router.post(
  "/create-checkout-session",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId || !ObjectId.isValid(String(bookingId))) {
        res.status(400).json({ success: false, message: "Valid bookingId is required" });
        return;
      }

      const booking = await bookingsCollection().findOne({
        _id: new ObjectId(String(bookingId)),
      });

      if (!booking) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }

      if (booking.customerEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: You can only pay for your own bookings",
        });
        return;
      }

      if (booking.status !== "completed") {
        res.status(400).json({
          success: false,
          message: "Payment is only allowed after the job is completed",
        });
        return;
      }

      if (booking.paymentStatus === "paid") {
        res.status(400).json({
          success: false,
          message: "This booking has already been paid",
        });
        return;
      }

      const unitAmount = Math.round(Number(booking.finalAmount) * 100);
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        res.status(400).json({
          success: false,
          message: "Invalid final amount on booking",
        });
        return;
      }

      const stripe = getStripeClient();
      const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(
        /\/+$/,
        ""
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: req.user!.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: booking.serviceTitle,
                description: `Repair service by ${booking.technicianName}`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId: String(bookingId),
          customerEmail: req.user!.email,
        },
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel?booking_id=${String(bookingId)}`,
      });

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/payments/verify?session_id=... — Verify Checkout session and record payment
router.get(
  "/verify",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const sessionId =
        typeof req.query.session_id === "string" ? req.query.session_id.trim() : "";

      if (!sessionId) {
        res.status(400).json({ success: false, message: "session_id is required" });
        return;
      }

      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        res.status(400).json({
          success: false,
          message: "Payment has not been completed",
        });
        return;
      }

      if (session.metadata?.customerEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: Session does not belong to this customer",
        });
        return;
      }

      const payment = await recordPaidSession(session);
      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Associated booking not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Payment verified and recorded",
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/payments/my — Customer's payment history
router.get(
  "/my",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const payments = await paymentsCollection()
        .find({ customerEmail: req.user!.email })
        .sort({ paidAt: -1 })
        .toArray();

      res.json({ success: true, data: payments });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/payments/webhook — Idempotent Stripe webhook handler
router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || typeof sig !== "string" || !webhookSecret) {
    res.status(400).send("Webhook Error: Missing signature or secret");
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        await recordPaidSession(session);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    res.status(500).json({ received: false });
  }
});

export default router;
