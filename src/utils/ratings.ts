import { bookingsCollection } from "../config/db.js";
import { ServiceDoc } from "../types/index.js";

export interface ServiceWithRating extends ServiceDoc {
  averageRating: number;
  reviewCount: number;
}

export async function attachServiceRatings(
  services: ServiceDoc[]
): Promise<ServiceWithRating[]> {
  if (services.length === 0) return [];

  const serviceIds = services
    .map((s) => s._id?.toString())
    .filter((id): id is string => Boolean(id));

  const ratingsAgg = await bookingsCollection()
    .aggregate<{ _id: string; avgRating: number; count: number }>([
      {
        $match: {
          serviceId: { $in: serviceIds },
          rating: { $gte: 1, $lte: 5 },
        },
      },
      {
        $group: {
          _id: "$serviceId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const ratingMap = new Map(
    ratingsAgg.map((item) => [
      item._id,
      {
        averageRating: Number(item.avgRating.toFixed(1)),
        reviewCount: item.count,
      },
    ])
  );

  return services.map((service) => {
    const id = service._id?.toString() || "";
    const stats = ratingMap.get(id);
    return {
      ...service,
      averageRating: stats?.averageRating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  });
}
