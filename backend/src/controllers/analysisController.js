import { config } from "../config.js";
import { AnalysisResult } from "../models/AnalysisResult.js";
import {
  fetchStaticMapImage,
  geocodeLocation,
} from "../services/mapsService.js";
import { analyzeSatelliteImage } from "../services/imageAnalysisService.js";

export async function createAnalysis(request, response, next) {
  try {
    const locationQuery = String(request.body?.location || "").trim();

    if (!locationQuery) {
      return response.status(400).json({ error: "A location value is required" });
    }

    const resolvedLocation = await geocodeLocation(locationQuery);
    const mapImage = await fetchStaticMapImage({
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
    });
    const analysis = await analyzeSatelliteImage(mapImage.buffer);

    const residentialCount = analysis.buildings.filter(
      (b) => b.classification === "residential"
    ).length;
    const commercialCount = analysis.buildings.length - residentialCount;
    const residentsPerResidentialBuilding =
      config.analysis.averageHouseholdSize * config.analysis.occupancyFactor;
    const populationEstimate = residentialCount * residentsPerResidentialBuilding;

    const savedResult = await AnalysisResult.create({
      location: {
        query: locationQuery,
        formattedAddress: resolvedLocation.formattedAddress,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
      },
      image: {
        width: analysis.imageWidth,
        height: analysis.imageHeight,
        zoom: config.maps.zoom,
        mapType: config.maps.mapType,
        sourceUrl: mapImage.sourceUrl,
      },
      summary: {
        totalDetectedBuildings: analysis.buildings.length,
        residentialCount,
        commercialCount,
        populationEstimate,
      },
      assumptions: {
        averageHouseholdSize: config.analysis.averageHouseholdSize,
        occupancyFactor: config.analysis.occupancyFactor,
        residentsPerResidentialBuilding,
      },
      buildings: analysis.buildings,
      debug: analysis.debug,
    });

    return response.status(201).json({
      id: savedResult.id,
      createdAt: savedResult.createdAt,
      location: savedResult.location,
      image: savedResult.image,
      summary: savedResult.summary,
      assumptions: savedResult.assumptions,
      buildings: savedResult.buildings,
      debug: savedResult.debug,
    });
  } catch (error) {
    return next(error);
  }
}

export async function listAnalyses(request, response, next) {
  try {
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const results = await AnalysisResult.find(
      {},
      { buildings: 0 } // omit heavy building array for list view
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return response.json(results);
  } catch (error) {
    return next(error);
  }
}

export async function getAnalysis(request, response, next) {
  try {
    const result = await AnalysisResult.findById(request.params.id).lean();
    if (!result) {
      return response.status(404).json({ error: "Analysis not found" });
    }
    return response.json(result);
  } catch (error) {
    return next(error);
  }
}
