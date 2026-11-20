import { Request, Response, Router } from "express";
import { Filter, ObjectId, Sort } from "mongodb";
import { bookingsCollection, servicesCollection, usersCollection } from "../config/db.js";
import { ServiceDoc } from "../types/index.js";
import { attachServiceRatings } from "../utils/ratings.js";

const router = Router();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/services/featured — Latest 6 approved & available services
router.get("/featured", async (_req: Request, res: Response, next) => {
  try {
    const services = await servicesCollection()
      .find({ approvalStatus: "approved", isAvailable: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    const enriched = await attachServiceRatings(services);
    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
});

// GET /api/services — Server-side search, filter, sort & pagination
router.get("/", async (req: Request, res: Response, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const serviceMode =
      typeof req.query.serviceMode === "string" ? req.query.serviceMode.trim() : "";
    const sortParam = typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 9));
    const skip = (page - 1) * limit;

    const filter: Filter<ServiceDoc> = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: regex }, { category: regex }, { serviceArea: regex }];
    }

    if (category && category !== "All") {
      filter.category = category as ServiceDoc["category"];
    }

    if (serviceMode && serviceMode !== "All") {
      filter.serviceMode = serviceMode as ServiceDoc["serviceMode"];
    }

    let sort: Sort = { createdAt: -1 };
    if (sortParam === "price_asc") {
      sort = { basePrice: 1, createdAt: -1 };
    } else if (sortParam === "price_desc") {
      sort = { basePrice: -1, createdAt: -1 };
    }

    const collection = servicesCollection();
    const [services, total] = await Promise.all([
      collection.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);

    const enriched = await attachServiceRatings(services);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      success: true,
      data: enriched,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/services/:id — Single approved & available service details
router.get("/:id", async (req: Request, res: Response, next) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    const service = await servicesCollection().findOne({
      _id: new ObjectId(id),
      approvalStatus: "approved",
      isAvailable: true,
    });

    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    const [enriched] = await attachServiceRatings([service]);
    const [technician, reviews] = await Promise.all([
      usersCollection().findOne(
        { email: service.technicianEmail },
        { projection: { name: 1, email: 1, image: 1, area: 1, bio: 1 } }
      ),
      bookingsCollection()
        .find(
          { serviceId: id, rating: { $gte: 1, $lte: 5 } },
          { projection: { customerName: 1, rating: 1, review: 1, reviewedAt: 1 } }
        )
        .sort({ reviewedAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    res.json({
      success: true,
      data: {
        ...enriched,
        technician: technician || {
          name: service.technicianName,
          email: service.technicianEmail,
          area: service.serviceArea,
        },
        reviews,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
