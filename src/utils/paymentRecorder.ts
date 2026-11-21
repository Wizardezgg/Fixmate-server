import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { bookingsCollection, paymentsCollection } from "../config/db.js";
import { PaymentDoc } from "../types/index.js";

export async function recordPaidSession(
  session: Stripe.Checkout.Session
): Promise<PaymentDoc | null> {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || !ObjectId.isValid(bookingId)) {
    return null;
  }

  const existingPayment = await paymentsCollection().findOne({
    $or: [{ stripeSessionId: session.id }, { bookingId }],
  });

  if (existingPayment) {
    // Ensure booking is marked paid even if a previous attempt crashed mid-way
    await bookingsCollection().updateOne(
      { _id: new ObjectId(bookingId), paymentStatus: { $ne: "paid" } },
      {
        $set: { paymentStatus: "paid", updatedAt: new Date() },
        $push: { statusHistory: { status: "paid", changedAt: new Date() } },
      }
    );
    return existingPayment;
  }

  const booking = await bookingsCollection().findOne({
    _id: new ObjectId(bookingId),
  });

  if (!booking) {
    return null;
  }

  const transactionId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || session.id;

  const now = new Date();
  const paymentDoc: PaymentDoc = {
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: booking.finalAmount,
    currency: "usd",
    transactionId,
    stripeSessionId: session.id,
    paymentStatus: "paid",
    paidAt: now,
  };

  try {
    const insertResult = await paymentsCollection().insertOne(paymentDoc);
    await bookingsCollection().updateOne(
      { _id: new ObjectId(bookingId), paymentStatus: { $ne: "paid" } },
      {
        $set: { paymentStatus: "paid", updatedAt: now },
        $push: { statusHistory: { status: "paid", changedAt: now } },
      }
    );
    return { ...paymentDoc, _id: insertResult.insertedId };
  } catch (err: unknown) {
    // Handle concurrent webhook + verify race condition (Mongo E11000 duplicate key)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      return paymentsCollection().findOne({ stripeSessionId: session.id });
    }
    throw err;
  }
}
