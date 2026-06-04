import mongoose from "mongoose";

const analysisResultSchema = new mongoose.Schema(
  {
    // The raw query the user typed
    query: {
      type: String,
      required: true,
      index: true,
    },

    location: {
      displayName: {
        type: String,
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
      boundingBox: {
        south: Number,
        north: Number,
        west: Number,
        east: Number,
      },
      osmId: Number,
      osmType: String,
      placeType: String,
    },

    buildings: {
      total: {
        type: Number,
        default: 0,
      },
      residential: {
        type: Number,
        default: 0,
      },
      apartments: {
        type: Number,
        default: 0,
      },
      houses: {
        type: Number,
        default: 0,
      },
      commercial: {
        type: Number,
        default: 0,
      },
      industrial: {
        type: Number,
        default: 0,
      },
      other: {
        type: Number,
        default: 0,
      },
    },

    population: {
      estimated: {
        type: Number,
        default: 0,
      },
      density: {
        type: Number,
        default: 0,
      },
      source: {
        type: String,
        default: "building-heuristic",
      },
    },

    // ISO-2 country code if resolved
    countryIso2: {
      type: String,
      default: null,
    },

    // Cache expiry — results older than this are automatically removed
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index: MongoDB automatically deletes documents
// once expiresAt is reached
analysisResultSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const AnalysisResult =
  mongoose.models.AnalysisResult ||
  mongoose.model("AnalysisResult", analysisResultSchema);
