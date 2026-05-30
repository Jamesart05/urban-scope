import axios from "axios";
import sharp from "sharp";
import { config } from "../config.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const ESRI_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

// ── Geocoding ─────────────────────────────────────────────────────────────────

export async function geocodeLocation(query) {
  const response = await axios.get(NOMINATIM_URL, {
    params: { q: query, format: "json", limit: 1 },
    headers: { "User-Agent": "UrbanScope/1.0 (satellite-building-analysis)" },
  });

  const result = response.data?.[0];
  if (!result) throw new Error("Location could not be resolved");

  return {
    formattedAddress: result.display_name,
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  };
}

// ── Tile math ─────────────────────────────────────────────────────────────────

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

async function fetchTile(zoom, y, x) {
  const url = `${ESRI_TILE_URL}/${zoom}/${y}/${x}`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "UrbanScope/1.0" },
    timeout: 10000,
  });
  return Buffer.from(response.data);
}

// ── Tile stitching ────────────────────────────────────────────────────────────
// Fetches a grid of tiles large enough to fill config.maps.size, then crops
// to exact dimensions centred on the target coordinates.

export async function fetchStaticMapImage({ latitude, longitude }) {
  const zoom = config.maps.zoom;
  const tileSize = 256;
  const targetW = config.maps.size.width;
  const targetH = config.maps.size.height;

  // How many tiles needed to cover the target size, plus 1 extra on each side
  const tilesNeeded = Math.ceil(targetW / tileSize) + 2; // e.g. 1280/256=5 → 7
  const gridRadius = Math.floor(tilesNeeded / 2);        // e.g. 3

  const centre = latLngToTile(latitude, longitude, zoom);
  const gridSize = gridRadius * 2 + 1;
  const canvasSize = gridSize * tileSize;

  // Fetch all tiles in parallel
  const tilePromises = [];
  for (let dy = -gridRadius; dy <= gridRadius; dy++) {
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
      tilePromises.push(fetchTile(zoom, centre.y + dy, centre.x + dx));
    }
  }

  const tiles = await Promise.all(tilePromises);

  const compositeInputs = tiles.map((tile, index) => ({
    input: tile,
    left: (index % gridSize) * tileSize,
    top: Math.floor(index / gridSize) * tileSize,
  }));

  const cropLeft = Math.floor((canvasSize - targetW) / 2);
  const cropTop = Math.floor((canvasSize - targetH) / 2);

  const buffer = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: { r: 30, g: 30, b: 30 },
    },
  })
    .composite(compositeInputs)
    .extract({ left: cropLeft, top: cropTop, width: targetW, height: targetH })
    .jpeg({ quality: 92 })
    .toBuffer();

  const sourceUrl = `https://www.openstreetmap.org/#map=${zoom}/${latitude.toFixed(5)}/${longitude.toFixed(5)}&layers=Y`;

  return { buffer, sourceUrl };
}
