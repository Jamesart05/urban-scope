import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

// Dynamic imports AFTER dotenv has loaded the env vars
const { createApp } = await import("./app.js");
const { config } = await import("./config.js");
const { connectToDatabase } = await import("./db.js");

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