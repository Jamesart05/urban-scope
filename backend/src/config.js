export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI || "",
  maps: {
    zoom: 16,           // zoom 16 = ~600m across at equator — good neighbourhood coverage
    size: {
      width: 1280,      // larger canvas = more buildings captured
      height: 1280,
    },
    scale: 1,
    mapType: "satellite",
  },
  analysis: {
    segmentationThreshold: 90,    // low: ESRI tiles are JPEG-compressed and darker
    minimumBuildingPixels: 60,    // low: catch smaller rooftops
    maximumBuildings: 200,
    averageHouseholdSize: 5,      // Nigerian average household size ~5
    occupancyFactor: 1,           // 1 household per residential building detected
  },
};
