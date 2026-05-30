import axios from "axios";
import { config } from "../config.js";

const http = axios.create({
  timeout: config.overpass.httpTimeout,
});

// ── Overpass QL builder ───────────────────────────────────────────────────────

/**
 * Build an Overpass QL query that counts buildings inside a bounding box.
 * We use a bbox filter rather than an area filter to avoid the Overpass
 * area-lookup overhead and the 3 600-second area ID caching lag.
 *
 * Returns counts for every building tag value we care about, plus a catch-all
 * for anything else that has building=*.
 */
function buildQuery(bbox, timeoutSecs) {
  const { south, west, north, east } = bbox;
  const bb = `${south},${west},${north},${east}`;

  // Tags we want to count individually
  const residentialTags = ["residential", "house", "detached", "semidetached_house", "apartments", "bungalow", "cabin", "dormitory", "farm", "terrace"];
  const commercialTags  = ["commercial", "retail", "office", "supermarket", "hotel", "warehouse", "industrial", "garage", "garages", "service"];

  const lines = [
    `[out:json][timeout:${timeoutSecs}];`,
    `(`,
  ];

  // All buildings in bbox (way + relation)
  lines.push(`  way["building"](${bb});`);
  lines.push(`  relation["building"](${bb});`);
  lines.push(`);`);
  lines.push(`out count;`);

  return lines.join("\n");
}

/**
 * Build a detailed query that breaks down by building type.
 * Runs as a union of tagged subsets so we can count each category.
 */
function buildDetailedQuery(bbox, timeoutSecs) {
  const { south, west, north, east } = bbox;
  const bb = `${south},${west},${north},${east}`;
  const t  = timeoutSecs;

  return `
[out:json][timeout:${t}];

// ── residential ──────────────────────────────────────────────────────────────
(
  way["building"~"^(residential|house|detached|semidetached_house|bungalow|cabin|farm|terrace|dormitory)$"](${bb});
  relation["building"~"^(residential|house|detached|semidetached_house|bungalow|cabin|farm|terrace|dormitory)$"](${bb});
)->.residential;

// ── apartments ───────────────────────────────────────────────────────────────
(
  way["building"~"^(apartments|flats)$"](${bb});
  relation["building"~"^(apartments|flats)$"](${bb});
)->.apartments;

// ── commercial ───────────────────────────────────────────────────────────────
(
  way["building"~"^(commercial|retail|office|supermarket|hotel|bank|hospital|school|university|church|mosque|cathedral|synagogue|temple|government|civic)$"](${bb});
  relation["building"~"^(commercial|retail|office|supermarket|hotel|bank|hospital|school|university|church|mosque|cathedral|synagogue|temple|government|civic)$"](${bb});
)->.commercial;

// ── industrial / warehouse ───────────────────────────────────────────────────
(
  way["building"~"^(industrial|warehouse|factory|storage_tank|garage|garages|service)$"](${bb});
  relation["building"~"^(industrial|warehouse|factory|storage_tank|garage|garages|service)$"](${bb});
)->.industrial;

// ── ALL buildings (for total) ─────────────────────────────────────────────────
(
  way["building"](${bb});
  relation["building"](${bb});
)->.all;

// Output counts for each named set
.residential out count;
.apartments  out count;
.commercial  out count;
.industrial  out count;
.all         out count;
`.trim();
}

// ── Query executor ────────────────────────────────────────────────────────────

async function runQuery(ql) {
  const { data } = await http.post(
    config.overpass.baseUrl,
    `data=${encodeURIComponent(ql)}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

// ── Result parser ─────────────────────────────────────────────────────────────

function extractCount(overpassResponse) {
  // Overpass returns { elements: [{ type:"count", tags: { total, ways, relations, nodes } }] }
  const el = overpassResponse?.elements?.[0];
  if (!el?.tags) return 0;
  return parseInt(el.tags.total ?? el.tags.ways ?? "0", 10) || 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Query Overpass for building statistics within a bounding box.
 * Returns structured counts.
 */
export async function queryBuildings(bbox) {
  const t = config.overpass.queryTimeout;

  // Run the detailed query which returns 5 count blocks in sequence
  const ql = buildDetailedQuery(bbox, t);
  const raw = await runQuery(ql);

  // Overpass returns multiple "count" elements in the elements array
  const elements = raw?.elements ?? [];
  const counts = elements
    .filter((e) => e.type === "count")
    .map((e) => parseInt(e.tags?.total ?? "0", 10) || 0);

  // Order matches the query: residential, apartments, commercial, industrial, all
  const [residential, apartments, commercial, industrial, total] = [
    counts[0] ?? 0,
    counts[1] ?? 0,
    counts[2] ?? 0,
    counts[3] ?? 0,
    counts[4] ?? 0,
  ];

  // "houses" = residential minus apartments
  const houses = Math.max(0, residential - apartments);

  // Anything not tagged residential/apartment/commercial/industrial
  const other = Math.max(0, total - residential - apartments - commercial - industrial);

  return {
    total,
    residential,
    apartments,
    houses,
    commercial,
    industrial,
    other,
  };
}
