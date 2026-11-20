import { Request, Response, Router } from "express";
import { Filter, ObjectId, Sort } from "mongodb";
import { bookingsCollection, servicesCollection, usersCollection } from "../config/db.js";
import { verifyTechnician, verifyToken } from "../middleware/auth.js";
import { ServiceCategory, ServiceDoc, ServiceMode } from "../types/index.js";
import { attachServiceRatings } from "../utils/ratings.js";

const router = Router();

const VALID_CATEGORIES: ServiceCategory[] = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
];

const VALID_MODES: ServiceMode[] = ["Home Visit", "Shop Drop-off"];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/services/my — Technician's own services
router.get(
  "/my",
  verifyToken,
  verifyTechnician,
  async (req: Request, res: Response, next) => {
    try {
      const services = await servicesCollection()
        .find({ technicianEmail: req.user!.email })
        .sort({ createdAt: -1 })
        .toArray();

      const enriched = await attachServiceRatings(services);
      res.json({ success: true, data: enriched });
    } catch (error) {
      next(error);
    }
  }
);

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

// POST /api/services — Technician creates a service (pending approval)
router.post(
  "/",
  verifyToken,
  verifyTechnician,
  async (req: Request, res: Response, next) => {
    try {
      const {
        title,
        category,
        description,
        image,
        basePrice,
        estimatedDuration,
        serviceMode,
        serviceArea,
      } = req.body;

      if (
        !title?.trim() ||
        !description?.trim() ||
        !image?.trim() ||
        !estimatedDuration?.trim() ||
        !serviceArea?.trim()
      ) {
        res.status(400).json({
          success: false,
          message: "All service fields are required",
        });
        return;
      }

      if (!VALID_CATEGORIES.includes(category)) {
        res.status(400).json({ success: false, message: "Invalid service category" });
        return;
      }

      if (!VALID_MODES.includes(serviceMode)) {
        res.status(400).json({ success: false, message: "Invalid service mode" });
        return;
      }

      const parsedPrice = Number(basePrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        res.status(400).json({
          success: false,
          message: "Base price must be a positive number",
        });
        return;
      }

      const newService: ServiceDoc = {
        title: title.trim(),
        category,
        description: description.trim(),
        image: image.trim(),
        basePrice: parsedPrice,
        estimatedDuration: estimatedDuration.trim(),
        serviceMode,
        serviceArea: serviceArea.trim(),
        technicianName: req.user!.name,
        technicianEmail: req.user!.email,
        approvalStatus: "pending",
        isAvailable: true,
        createdAt: new Date(),
      };

      const result = await servicesCollection().insertOne(newService);
      res.status(201).json({
        success: true,
        message: "Service created and waiting for admin approval",
        data: { ...newService, _id: result.insertedId },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/services/:id — Technician updates own service or toggles availability
router.patch(
  "/:id",
  verifyToken,
  verifyTechnician,
  async (req: Request, res: Response, next) => {
    try {
      const id = String(req.params.id);
      if (!ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Service not found" });
        return;
      }

      const existing = await servicesCollection().findOne({ _id: new ObjectId(id) });
      if (!existing) {
        res.status(404).json({ success: false, message: "Service not found" });
        return;
      }

      if (existing.technicianEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: You can only edit your own services",
        });
        return;
      }

      const {
        title,
        category,
        description,
        image,
        basePrice,
        estimatedDuration,
        serviceMode,
        serviceArea,
        isAvailable,
      } = req.body;

      const updateFields: Partial<ServiceDoc> = { updatedAt: new Date() };
      let contentEdited = false;

      if (typeof title === "string" && title.trim()) {
        updateFields.title = title.trim();
        contentEdited = true;
      }
      if (category !== undefined) {
        if (!VALID_CATEGORIES.includes(category)) {
          res.status(400).json({ success: false, message: "Invalid service category" });
          return;
        }
        updateFields.category = category;
        contentEdited = true;
      }
      if (typeof description === "string" && description.trim()) {
        updateFields.description = description.trim();
        contentEdited = true;
      }
      if (typeof image === "string" && image.trim()) {
        updateFields.image = image.trim();
        contentEdited = true;
      }
      if (basePrice !== undefined) {
        const parsedPrice = Number(basePrice);
        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
          res.status(400).json({
            success: false,
            message: "Base price must be a positive number",
          });
          return;
        }
        updateFields.basePrice = parsedPrice;
        contentEdited = true;
      }
      if (typeof estimatedDuration === "string" && estimatedDuration.trim()) {
        updateFields.estimatedDuration = estimatedDuration.trim();
        contentEdited = true;
      }
      if (serviceMode !== undefined) {
        if (!VALID_MODES.includes(serviceMode)) {
          res.status(400).json({ success: false, message: "Invalid service mode" });
          return;
        }
        updateFields.serviceMode = serviceMode;
        contentEdited = true;
      }
      if (typeof serviceArea === "string" && serviceArea.trim()) {
        updateFields.serviceArea = serviceArea.trim();
        contentEdited = true;
      }
      if (typeof isAvailable === "boolean") {
        updateFields.isAvailable = isAvailable;
      }

      // Per spec: editing a service resets approvalStatus back to 'pending'
      if (contentEdited) {
        updateFields.approvalStatus = "pending";
      }

      const updated = await servicesCollection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateFields },
        { returnDocument: "after" }
      );

      res.json({
        success: true,
        message: contentEdited
          ? "Service updated and sent for admin re-approval"
          : "Service availability updated",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/services/:id — Technician deletes own service
router.delete(
  "/:id",
  verifyToken,
  verifyTechnician,
  async (req: Request, res: Response, next) => {
    try {
      const id = String(req.params.id);
      if (!ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Service not found" });
        return;
      }

      const existing = await servicesCollection().findOne({ _id: new ObjectId(id) });
      if (!existing) {
        res.status(404).json({ success: false, message: "Service not found" });
        return;
      }

      if (existing.technicianEmail !== req.user!.email) {
        res.status(403).json({
          success: false,
          message: "Forbidden: You can only delete your own services",
        });
        return;
      }

      await servicesCollection().deleteOne({ _id: new ObjectId(id) });
      res.json({
        success: true,
        message: "Service deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
