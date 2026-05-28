import mongoose from "mongoose";
import { config } from "./config.js";

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(config.mongoUri);
  isConnected = true;
  return mongoose.connection;
}

