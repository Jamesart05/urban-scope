import axios from "axios";
import { config } from "../config.js";

const http = axios.create({
  baseURL: config.nominatim.baseUrl,
  timeout: 25_000,
  headers: {
    // "User-Agent":    config.nominatim.userAgent,
    "User-Agent": "UrbanScope/1.0 (chukwukachukwuebuka4@gmail.com)",
    "Accept":        "application/json",
    "Accept-Language": "en",
  },
});

export async function geocodeLocation(query) {
  const { data } = await http.get("/search", {
    params: {
      q:              query,
      format:         "jsonv2",
      limit:          1,
      addressdetails: 1,
    },
  });

  if (!data?.length) {
    throw new Error(`Location "${query}" could not be resolved by Nominatim.`);
  }

  const place = data[0];
  const bb    = place.boundingbox; // [south, north, west, east]

  return {
    displayName: place.display_name,
    latitude:    parseFloat(place.lat),
    longitude:   parseFloat(place.lon),
    boundingBox: {
      south: parseFloat(bb[0]),
      north: parseFloat(bb[1]),
      west:  parseFloat(bb[2]),
      east:  parseFloat(bb[3]),
    },
    osmId:     place.osm_id   ? parseInt(place.osm_id, 10) : null,
    osmType:   place.osm_type ?? null,
    placeType: place.type     ?? place.category ?? "unknown",
  };
}
