import { Collection, Db, MongoClient } from "mongodb";
import dotenv from "dotenv";
import { BookingDoc, PaymentDoc, ServiceDoc, UserDoc } from "../types/index.js";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "fixmate";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  client = new MongoClient(uri);
  await client.connect();
  dbInstance = client.db(dbName);

  await ensureIndexes(dbInstance);
  console.log(`Connected to MongoDB database: ${dbName}`);
  return dbInstance;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("payments").createIndex({ stripeSessionId: 1 }, { unique: true }),
    db.collection("payments").createIndex({ bookingId: 1 }, { unique: true }),
    db.collection("services").createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
    db.collection("services").createIndex({ technicianEmail: 1 }),
    db.collection("bookings").createIndex({ customerEmail: 1, createdAt: -1 }),
    db.collection("bookings").createIndex({ technicianEmail: 1, createdAt: -1 }),
    db.collection("bookings").createIndex({ serviceId: 1, customerEmail: 1, status: 1 }),
  ]);
}

export function getDB(): Db {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return dbInstance;
}

export function usersCollection(): Collection<UserDoc> {
  return getDB().collection<UserDoc>("user");
}

export function servicesCollection(): Collection<ServiceDoc> {
  return getDB().collection<ServiceDoc>("services");
}

export function bookingsCollection(): Collection<BookingDoc> {
  return getDB().collection<BookingDoc>("bookings");
}

export function paymentsCollection(): Collection<PaymentDoc> {
  return getDB().collection<PaymentDoc>("payments");
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
  }
}
