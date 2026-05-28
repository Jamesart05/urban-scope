import { config } from "../config.js";
import { AnalysisResult } from "../models/AnalysisResult.js";
import {
  fetchStaticMapImage,
  geocodeLocation
} from "../services/googleMapsService.js";
import { analyzeSatelliteImage } from "../services/imageAnalysisService.js";

export async function createAnalysis(request, response, next) {
  try {
    const locationQuery = String(request.body?.location || "").trim();

    if (!locationQuery) {
      return response.status(400).json({
        error: "A location value is required"
      });
    }

    const resolvedLocation = await geocodeLocation(locationQuery);
    const mapImage = await fetchStaticMapImage({
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude
    });
    const analysis = await analyzeSatelliteImage(mapImage.buffer);

    const residentialCount = analysis.buildings.filter(
      (building) => building.classification === "residential"
    ).length;
    const commercialCount = analysis.buildings.length - residentialCount;
    const residentsPerResidentialBuilding =
      config.analysis.averageHouseholdSize * config.analysis.occupancyFactor;
    const populationEstimate =
      residentialCount * residentsPerResidentialBuilding;

    const savedResult = await AnalysisResult.create({
      location: {
        query: locationQuery,
        formattedAddress: resolvedLocation.formattedAddress,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude
      },
      image: {
        width: analysis.imageWidth,
        height: analysis.imageHeight,
        zoom: config.maps.zoom,
        mapType: config.maps.mapType,
        sourceUrl: mapImage.sourceUrl
      },
      summary: {
        totalDetectedBuildings: analysis.buildings.length,
        residentialCount,
        commercialCount,
        populationEstimate
      },
      assumptions: {
        averageHouseholdSize: config.analysis.averageHouseholdSize,
        occupancyFactor: config.analysis.occupancyFactor,
        residentsPerResidentialBuilding
      },
      buildings: analysis.buildings,
      debug: analysis.debug
    });

    return response.status(201).json({
      id: savedResult.id,
      createdAt: savedResult.createdAt,
      location: savedResult.location,
      image: savedResult.image,
      summary: savedResult.summary,
      assumptions: savedResult.assumptions,
      buildings: savedResult.buildings,
      debug: savedResult.debug
    });
  } catch (error) {
    return next(error);
  }
}

