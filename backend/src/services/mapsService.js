import axios from "axios";
import sharp from "sharp";
import { config } from "../config.js";

// Nominatim (OpenStreetMap) – free, no API key required
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// ESRI World Imagery tile service – free, no API key required
const ESRI_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

// ── Geocoding ────────────────────────────────────────────────────────────────

export async function geocodeLocation(query) {
  const response = await axios.get(NOMINATIM_URL, {
    params: {
      q: query,
      format: "json",
      limit: 1,
    },
    headers: {
      // Nominatim requires a descriptive User-Agent
      "User-Agent": "UrbanScope/1.0 (satellite-building-analysis)",
    },
  });

  const result = response.data?.[0];
  if (!result) {
    throw new Error("Location could not be resolved");
  }

  return {
    formattedAddress: result.display_name,
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  };
}

// ── Tile math ────────────────────────────────────────────────────────────────

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n
  );
  return { x, y };
}

// ── Tile fetching & stitching ────────────────────────────────────────────────

async function fetchTile(zoom, y, x) {
  const url = `${ESRI_TILE_URL}/${zoom}/${y}/${x}`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "UrbanScope/1.0" },
  });
  return Buffer.from(response.data);
}

/**
 * Fetch a grid of ESRI satellite tiles centred on the given coordinates and
 * composite them into a single image matching config.maps.size.
 */
export async function fetchStaticMapImage({ latitude, longitude }) {
  const zoom = config.maps.zoom;
  const tileSize = 256; // ESRI tiles are 256 × 256 px
  const gridRadius = 1; // fetch a 3 × 3 grid → 768 × 768, then crop to target

  const centre = latLngToTile(latitude, longitude, zoom);

  // Collect tile promises in row-major order
  const tileRows = [];
  for (let dy = -gridRadius; dy <= gridRadius; dy++) {
    const row = [];
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
      row.push(fetchTile(zoom, centre.y + dy, centre.x + dx));
    }
    tileRows.push(row);
  }

  const gridSize = gridRadius * 2 + 1; // 3
  const canvasSize = gridSize * tileSize; // 768

  // Resolve all tiles in parallel
  const tiles = await Promise.all(tileRows.flat());

  // Build composite input list
  const compositeInputs = tiles.map((tile, index) => {
    const col = index % gridSize;
    const row = Math.floor(index / gridSize);
    return {
      input: tile,
      left: col * tileSize,
      top: row * tileSize,
    };
  });

  // Stitch, then crop to the configured output size centred in the canvas
  const targetW = config.maps.size.width;
  const targetH = config.maps.size.height;
  const cropLeft = Math.floor((canvasSize - targetW) / 2);
  const cropTop = Math.floor((canvasSize - targetH) / 2);

  const buffer = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(compositeInputs)
    .extract({ left: cropLeft, top: cropTop, width: targetW, height: targetH })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Build a human-readable source URL for reference (OpenStreetMap viewer)
  const sourceUrl = `https://www.openstreetmap.org/#map=${zoom}/${latitude.toFixed(5)}/${longitude.toFixed(5)}&layers=Y`;

  return { buffer, sourceUrl };
}
