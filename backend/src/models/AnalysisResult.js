import mongoose from "mongoose";

const buildingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    classification: {
      type: String,
      enum: ["residential", "commercial"],
      required: true
    },
    confidence: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    area: { type: Number, required: true },
    scoreBreakdown: {
      areaScore: Number,
      ratioScore: Number,
      compactnessScore: Number,
      varianceScore: Number,
      finalScore: Number
    },
    bounds: {
      left: Number,
      top: Number,
      width: Number,
      height: Number
    },
    cropDataUrl: { type: String, required: true }
  },
  { _id: false }
);

const analysisResultSchema = new mongoose.Schema(
  {
    location: {
      query: { type: String, required: true },
      formattedAddress: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    },
    image: {
      width: Number,
      height: Number,
      zoom: Number,
      mapType: String,
      sourceUrl: String
    },
    summary: {
      totalDetectedBuildings: Number,
      residentialCount: Number,
      commercialCount: Number,
      populationEstimate: Number
    },
    assumptions: {
      averageHouseholdSize: Number,
      occupancyFactor: Number,
      residentsPerResidentialBuilding: Number
    },
    buildings: [buildingSchema],
    debug: {
      segmentationThreshold: Number,
      minimumBuildingPixels: Number
    }
  },
  { timestamps: true }
);

export const AnalysisResult =
  mongoose.models.AnalysisResult ||
  mongoose.model("AnalysisResult", analysisResultSchema);

