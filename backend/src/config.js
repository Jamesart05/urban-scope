export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI || "",
  maps: {
    zoom: 17,
    size: {
      width: 640,
      height: 640,
    },
    scale: 1,
    mapType: "satellite",
  },
  analysis: {
    segmentationThreshold: 155,
    minimumBuildingPixels: 200,
    maximumBuildings: 120,
    averageHouseholdSize: 4,
    occupancyFactor: 3,
  },
};
