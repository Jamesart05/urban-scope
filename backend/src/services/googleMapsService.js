import axios from "axios";
import { config } from "../config.js";

const geocodeBaseUrl =
  "https://maps.googleapis.com/maps/api/geocode/json";
const staticMapBaseUrl =
  "https://maps.googleapis.com/maps/api/staticmap";

function assertGoogleApiKey() {
  if (!config.googleMapsApiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is missing");
  }
}

export async function geocodeLocation(query) {
  assertGoogleApiKey();

  const response = await axios.get(geocodeBaseUrl, {
    params: {
      address: query,
      key: config.googleMapsApiKey
    }
  });

  const result = response.data?.results?.[0];
  if (!result) {
    throw new Error("Location could not be resolved");
  }

  return {
    formattedAddress: result.formatted_address,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng
  };
}

export function buildStaticMapUrl({ latitude, longitude }) {
  assertGoogleApiKey();

  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: String(config.maps.zoom),
    size: `${config.maps.size.width}x${config.maps.size.height}`,
    scale: String(config.maps.scale),
    maptype: config.maps.mapType,
    key: config.googleMapsApiKey
  });

  return `${staticMapBaseUrl}?${params.toString()}`;
}

export async function fetchStaticMapImage(coords) {
  const sourceUrl = buildStaticMapUrl(coords);

  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer"
  });

  return {
    buffer: Buffer.from(response.data),
    sourceUrl
  };
}

