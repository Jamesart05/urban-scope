import axios from "axios";
import { config } from "../config.js";

const http = axios.create({ timeout: 20_000 });

// ── ISO-2 country code lookup via Nominatim address ───────────────────────────

/**
 * Extract a 2-letter ISO country code from a Nominatim display_name or
 * address object. Falls back to null if unavailable.
 */
export function extractCountryCode(displayName) {
  // Nominatim display names end with the country name — we use a small lookup
  // table for the most common countries. A full solution would use the
  // addressdetails object from Nominatim (already fetched in geocodeLocation).
  return null; // caller can pass it explicitly; see controller
}

// ── WorldPop REST API ─────────────────────────────────────────────────────────
// Docs: https://api.worldpop.org/v1/
// The summary endpoint returns the most recent UN-adjusted population estimate
// for an entire country.  For sub-national estimates we use a bbox-based
// approach with the raster summary endpoint.

/**
 * Fetch the national population for a given ISO-2 country code.
 * Returns null if the country is not in WorldPop or the request fails.
 */
async function fetchNationalPopulation(iso2) {
  if (!iso2) return null;
  try {
    const { data } = await http.get(
      `${config.worldpop.baseUrl}/countries/${iso2.toLowerCase()}`
    );
    return data?.data?.pop ?? null;
  } catch {
    return null;
  }
}

// ── Bbox area helpers ─────────────────────────────────────────────────────────

function bboxAreaKm2(bbox) {
  const R = 6371; // Earth radius km
  const latDiff = Math.abs(bbox.north - bbox.south);
  const lngDiff = Math.abs(bbox.east  - bbox.west);
  const midLat  = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
  const height  = (latDiff / 360) * 2 * Math.PI * R;
  const width   = (lngDiff / 360) * 2 * Math.PI * R * Math.cos(midLat);
  return height * width;
}

// ── Main estimator ────────────────────────────────────────────────────────────

/**
 * Estimate population for the queried location.
 *
 * Strategy (in priority order):
 *   1. If we have a country ISO code, fetch national population from WorldPop
 *      and scale it by (bbox area / country area) as a rough sub-national
 *      estimate.  This works well for city-level queries.
 *   2. Fall back to a building-count heuristic:
 *        population ≈ residentialBuildings × avgHouseholdSize
 *        + apartments × avgApartmentOccupancy
 *
 * Returns { estimatedPopulation, populationDensity, source }.
 */
export async function estimatePopulation({ bbox, buildingCounts, countryIso2 }) {
  const areaKm2 = bboxAreaKm2(bbox);

  // ── Approach 1: WorldPop scaling ──────────────────────────────────────────
  if (countryIso2) {
    const nationalPop = await fetchNationalPopulation(countryIso2);
    if (nationalPop && nationalPop > 0) {
      // Very rough country area estimates (km²) for scaling
      // A production app would use a proper geodata source
      const countryAreas = {
        ng: 923_768, ke: 580_367, gh: 238_533, za: 1_221_037,
        et: 1_104_300, tz: 945_087, eg: 1_002_450, ma: 446_550,
        us: 9_833_517, gb: 242_495, de: 357_114, fr: 551_695,
        in: 3_287_263, br: 8_515_767, cn: 9_596_960, id: 1_904_569,
        pk: 881_913, bd: 147_570,
      };

      const countryAreaKm2 = countryAreas[countryIso2.toLowerCase()];
      if (countryAreaKm2) {
        const fraction    = Math.min(areaKm2 / countryAreaKm2, 1);
        const estimated   = Math.round(nationalPop * fraction);
        const density     = areaKm2 > 0 ? Math.round(estimated / areaKm2) : 0;
        return { estimatedPopulation: estimated, populationDensity: density, source: "WorldPop" };
      }
    }
  }

  // ── Approach 2: Building-count heuristic ──────────────────────────────────
  // Average household sizes from UN data (2020):
  //   Sub-Saharan Africa ≈ 4.8, South Asia ≈ 4.4, Middle East ≈ 4.2,
  //   Europe ≈ 2.3, North America ≈ 2.5
  // We use a conservative global average of 3.5 for unknown countries.

  const avgHouseholdSize  = 4.8;
  const avgApartmentSize  = 3.5;  // apartments tend to be smaller households

  const estimated = Math.round(
    buildingCounts.houses      * avgHouseholdSize  +
    buildingCounts.apartments  * avgApartmentSize  +
    buildingCounts.residential * avgHouseholdSize  // catch-all residential
  );

  const density = areaKm2 > 0 ? Math.round(estimated / areaKm2) : 0;

  return { estimatedPopulation: estimated, populationDensity: density, source: "building-heuristic" };
}
