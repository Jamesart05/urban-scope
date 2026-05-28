import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectToDatabase } from "./db.js";

async function startServer() {
  await connectToDatabase();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`UrbanScope backend listening on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
