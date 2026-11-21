import { Request, Response, Router } from "express";
import { Filter, ObjectId } from "mongodb";
import {
  bookingsCollection,
  paymentsCollection,
  servicesCollection,
  usersCollection,
} from "../config/db.js";
import { verifyAdmin, verifyToken } from "../middleware/auth.js";
import { ApprovalStatus, BookingDoc, BookingStatus, ServiceDoc, UserRole } from "../types/index.js";

const router = Router();

router.use(verifyToken, verifyAdmin);

const VALID_ROLES: UserRole[] = ["customer", "technician", "admin"];

// GET /api/admin/users — List all users
router.get("/users", async (_req: Request, res: Response, next) => {
  try {
    const users = await usersCollection()
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            image: 1,
            role: 1,
            phone: 1,
            area: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/role — Change a user's role (cannot change own role)
router.patch("/users/:id/role", async (req: Request, res: Response, next) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const nextRole = req.body.role as UserRole;
    if (!VALID_ROLES.includes(nextRole)) {
      res.status(400).json({ success: false, message: "Invalid role" });
      return;
    }

    const targetUser = await usersCollection().findOne({ _id: new ObjectId(id) });
    if (!targetUser) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (targetUser.email === req.user!.email) {
      res.status(400).json({
        success: false,
        message: "You cannot change your own role",
      });
      return;
    }

    const updated = await usersCollection().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { role: nextRole, updatedAt: new Date() } },
      {
        returnDocument: "after",
        projection: { name: 1, email: 1, image: 1, role: 1, createdAt: 1 },
      }
    );

    res.json({
      success: true,
      message: `User role updated to '${nextRole}'`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/services — All services with optional approvalStatus filter
router.get("/services", async (req: Request, res: Response, next) => {
  try {
    const statusFilter =
      typeof req.query.approvalStatus === "string"
        ? req.query.approvalStatus.trim()
        : "";

    const filter: Filter<ServiceDoc> = {};
    if (statusFilter && statusFilter !== "All") {
      filter.approvalStatus = statusFilter as ApprovalStatus;
    }

    const services = await servicesCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Surface pending services first when showing All
    if (!statusFilter || statusFilter === "All") {
      services.sort((a, b) => {
        if (a.approvalStatus === "pending" && b.approvalStatus !== "pending") return -1;
        if (a.approvalStatus !== "pending" && b.approvalStatus === "pending") return 1;
        return 0;
      });
    }

    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/services/:id/approval — Approve or reject a service
router.patch("/services/:id/approval", async (req: Request, res: Response, next) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    const approvalStatus = req.body.approvalStatus as ApprovalStatus;
    if (approvalStatus !== "approved" && approvalStatus !== "rejected") {
      res.status(400).json({
        success: false,
        message: "approvalStatus must be 'approved' or 'rejected'",
      });
      return;
    }

    const updated = await servicesCollection().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!updated) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    res.json({
      success: true,
      message: `Service ${approvalStatus}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/bookings — All bookings with optional status filter
router.get("/bookings", async (req: Request, res: Response, next) => {
  try {
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim() : "";

    const filter: Filter<BookingDoc> = {};
    if (statusFilter && statusFilter !== "All") {
      filter.status = statusFilter as BookingStatus;
    }

    const bookings = await bookingsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/payments — All payment transactions + total revenue
router.get("/payments", async (_req: Request, res: Response, next) => {
  try {
    const payments = await paymentsCollection()
      .find({})
      .sort({ paidAt: -1 })
      .toArray();

    const totalRevenue = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    res.json({
      success: true,
      data: payments,
      totalRevenue: Number(totalRevenue.toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
