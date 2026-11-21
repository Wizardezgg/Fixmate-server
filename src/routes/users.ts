import { Request, Response, Router } from "express";
import { usersCollection } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";
import { UserDoc } from "../types/index.js";

const router = Router();

// GET /api/users/profile — Current authenticated user's profile
router.get("/profile", verifyToken, async (req: Request, res: Response, next) => {
  try {
    const user = await usersCollection().findOne(
      { email: req.user!.email },
      { projection: { name: 1, email: 1, image: 1, role: 1, phone: 1, area: 1, bio: 1 } }
    );

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/profile — Update own profile (Name, Phone, Area, Bio, Image)
router.patch("/profile", verifyToken, async (req: Request, res: Response, next) => {
  try {
    const { name, phone, area, bio, image } = req.body;

    const updateFields: Partial<UserDoc> = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) {
      updateFields.name = name.trim();
    }
    if (typeof phone === "string") {
      updateFields.phone = phone.trim();
    }
    if (typeof area === "string") {
      updateFields.area = area.trim();
    }
    if (typeof bio === "string") {
      updateFields.bio = bio.trim();
    }
    if (typeof image === "string" && image.trim()) {
      updateFields.image = image.trim();
    }

    const updated = await usersCollection().findOneAndUpdate(
      { email: req.user!.email },
      { $set: updateFields },
      {
        returnDocument: "after",
        projection: { name: 1, email: 1, image: 1, role: 1, phone: 1, area: 1, bio: 1 },
      }
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
