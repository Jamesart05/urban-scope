export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  mongoUri: process.env.MONGODB_URI || "",
  maps: {
    zoom: 18,
    size: {
      width: 640,
      height: 640
    },
    scale: 2,
    mapType: "satellite"
  },
  analysis: {
    segmentationThreshold: 168,
    minimumBuildingPixels: 220,
    maximumBuildings: 120,
    averageHouseholdSize: 4,
    occupancyFactor: 3
  }
};

