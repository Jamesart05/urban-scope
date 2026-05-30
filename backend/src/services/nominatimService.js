import axios from "axios";
import { config } from "../config.js";

const http = axios.create({
  baseURL: config.nominatim.baseUrl,
  headers: { "User-Agent": config.nominatim.userAgent },
  timeout: 15_000,
});

/**
 * Resolve a free-text location query into coordinates, a bounding box,
 * and an OSM relation ID that can be used for Overpass area queries.
 *
 * @param {string} query  e.g. "Lagos", "Ikeja", "New York"
 * @returns {{
 *   displayName: string,
 *   latitude: number,
 *   longitude: number,
 *   boundingBox: { south: number, west: number, north: number, east: number },
 *   osmId: number | null,
 *   osmType: string | null,
 *   placeType: string,
 * }}
 */
export async function geocodeLocation(query) {
  const { data } = await http.get("/search", {
    params: {
      q: query,
      format: "jsonv2",
      limit: 1,
      addressdetails: 1,
      extratags: 1,
    },
  });

  if (!data?.length) {
    throw new Error(`Location "${query}" could not be resolved by Nominatim.`);
  }

  const place = data[0];
  const bb = place.boundingbox; // [south, north, west, east]  ← Nominatim order

  return {
    displayName: place.display_name,
    latitude: parseFloat(place.lat),
    longitude: parseFloat(place.lon),
    boundingBox: {
      south: parseFloat(bb[0]),
      north: parseFloat(bb[1]),
      west:  parseFloat(bb[2]),
      east:  parseFloat(bb[3]),
    },
    osmId:   place.osm_id   ? parseInt(place.osm_id, 10) : null,
    osmType: place.osm_type ?? null,
    placeType: place.type ?? place.category ?? "unknown",
  };
}
