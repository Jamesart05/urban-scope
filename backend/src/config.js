export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI || "",

  nominatim: {
    baseUrl: "https://nominatim.openstreetmap.org",
    userAgent: "UrbanScope/2.0 (geospatial-analysis)",
  },

  overpass: {
    baseUrl: "https://overpass-api.de/api/interpreter",
    // Timeout for the Overpass query itself (seconds, sent in the QL)
    queryTimeout: 60,
    // Max HTTP wait (ms)
    httpTimeout: 90_000,
  },

  worldpop: {
    // REST API for country-level population summaries
    baseUrl: "https://api.worldpop.org/v1",
  },

  cache: {
    // Results cached in MongoDB for this many milliseconds (1 hour)
    ttlMs: 60 * 60 * 1000,
  },
};
