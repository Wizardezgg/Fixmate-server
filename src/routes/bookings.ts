import { Request, Response, Router } from "express";
import { ObjectId } from "mongodb";
import { bookingsCollection, servicesCollection } from "../config/db.js";
import { verifyCustomer, verifyToken } from "../middleware/auth.js";
import { BookingDoc } from "../types/index.js";

const router = Router();

// POST /api/bookings — Customer creates a repair request
router.post(
  "/",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const { serviceId, customerPhone, address, preferredDate, problemDescription } =
        req.body;

      if (!serviceId || !ObjectId.isValid(String(serviceId))) {
        res.status(400).json({ success: false, message: "Valid serviceId is required" });
        return;
      }

      if (!customerPhone?.trim() || !address?.trim() || !preferredDate) {
        res.status(400).json({
          success: false,
          message: "Phone, address, and preferred date are required",
        });
        return;
      }

      const description = typeof problemDescription === "string" ? problemDescription.trim() : "";
      if (description.length < 20) {
        res.status(400).json({
          success: false,
          message: "Problem description must be at least 20 characters",
        });
        return;
      }

      const parsedDate = new Date(preferredDate);
      if (Number.isNaN(parsedDate.getTime())) {
        res.status(400).json({ success: false, message: "Invalid preferred date" });
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (parsedDate < todayStart) {
        res.status(400).json({
          success: false,
          message: "Preferred date must be today or a future date",
        });
        return;
      }

      const service = await servicesCollection().findOne({
        _id: new ObjectId(String(serviceId)),
        approvalStatus: "approved",
        isAvailable: true,
      });

      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found or currently unavailable",
        });
        return;
      }

      if (service.technicianEmail === req.user!.email) {
        res.status(403).json({
          success: false,
          message: "You cannot request your own service",
        });
        return;
      }

      const existingActive = await bookingsCollection().findOne({
        serviceId: String(serviceId),
        customerEmail: req.user!.email,
        status: { $in: ["requested", "accepted", "in-progress"] },
      });

      if (existingActive) {
        res.status(409).json({
          success: false,
          message: "You already have an active request for this service",
        });
        return;
      }

      const now = new Date();
      const booking: BookingDoc = {
        serviceId: String(serviceId),
        serviceTitle: service.title,
        serviceImage: service.image,
        category: service.category,
        basePrice: service.basePrice,
        technicianName: service.technicianName,
        technicianEmail: service.technicianEmail,
        customerName: req.user!.name,
        customerEmail: req.user!.email,
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        preferredDate: parsedDate,
        problemDescription: description,
        status: "requested",
        finalAmount: service.basePrice,
        paymentStatus: "unpaid",
        statusHistory: [{ status: "requested", changedAt: now }],
        createdAt: now,
      };

      const result = await bookingsCollection().insertOne(booking);
      res.status(201).json({
        success: true,
        message: "Repair request submitted successfully",
        data: { ...booking, _id: result.insertedId },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/bookings/my — Customer's own bookings
router.get(
  "/my",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const bookings = await bookingsCollection()
        .find({ customerEmail: req.user!.email })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({ success: true, data: bookings });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/bookings/:id/cancel — Customer cancels a 'requested' booking
router.patch(
  "/:id/cancel",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const id = String(req.params.id);
      if (!ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }

      const booking = await bookingsCollection().findOne({ _id: new ObjectId(id) });
      if (!booking) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }

      if (booking.customerEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: You can only cancel your own bookings",
        });
        return;
      }

      if (booking.status !== "requested") {
        res.status(400).json({
          success: false,
          message: `Cannot cancel a booking with status '${booking.status}'`,
        });
        return;
      }

      const now = new Date();
      const updated = await bookingsCollection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: { status: "cancelled", updatedAt: now },
          $push: { statusHistory: { status: "cancelled", changedAt: now } },
        },
        { returnDocument: "after" }
      );

      res.json({
        success: true,
        message: "Booking cancelled successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/bookings/:id/review — Customer submits rating & review after payment
router.patch(
  "/:id/review",
  verifyToken,
  verifyCustomer,
  async (req: Request, res: Response, next) => {
    try {
      const id = String(req.params.id);
      if (!ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }

      const booking = await bookingsCollection().findOne({ _id: new ObjectId(id) });
      if (!booking) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }

      if (booking.customerEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: You can only review your own bookings",
        });
        return;
      }

      if (booking.paymentStatus !== "paid") {
        res.status(400).json({
          success: false,
          message: "You can only review a booking after payment is completed",
        });
        return;
      }

      if (booking.rating) {
        res.status(400).json({
          success: false,
          message: "You have already reviewed this booking",
        });
        return;
      }

      const rating = Number(req.body.rating);
      const review = typeof req.body.review === "string" ? req.body.review.trim() : "";

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res.status(400).json({
          success: false,
          message: "Rating must be an integer between 1 and 5",
        });
        return;
      }

      if (review.length < 5) {
        res.status(400).json({
          success: false,
          message: "Review must be at least 5 characters",
        });
        return;
      }

      const now = new Date();
      const updated = await bookingsCollection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            rating,
            review,
            reviewedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: "after" }
      );

      res.json({
        success: true,
        message: "Thank you for your review",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
