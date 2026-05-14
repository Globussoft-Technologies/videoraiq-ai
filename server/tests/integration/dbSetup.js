/**
 * Shared MongoDB lifecycle for integration tests.
 * Spins up an in-process mongo (mongodb-memory-server) once per test file
 * and tears it down after.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), {});
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (mongo) await mongo.stop();
}

export async function clearCollections() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
