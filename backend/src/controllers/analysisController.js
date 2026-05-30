import { config } from "../config.js";
import { AnalysisResult } from "../models/AnalysisResult.js";
import { geocodeLocation } from "../services/nominatimService.js";
import { queryBuildings } from "../services/overpassService.js";
import { estimatePopulation } from "../services/populationService.js";

// ── Country ISO-2 extraction ──────────────────────────────────────────────────
// Nominatim's addressdetails includes country_code — pull it from display_name
// as a last resort using a small country-name → ISO-2 map.

const COUNTRY_NAME_MAP = {
  nigeria: "ng", kenya: "ke", ghana: "gh", "south africa": "za",
  ethiopia: "et", tanzania: "tz", egypt: "eg", morocco: "ma",
  "united states": "us", "united states of america": "us",
  "united kingdom": "gb", germany: "de", france: "fr",
  india: "in", brazil: "br", china: "cn", indonesia: "id",
  pakistan: "pk", bangladesh: "bd",
};

function guessCountryIso2(displayName) {
  const lower = displayName.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_MAP)) {
    if (lower.includes(name)) return code;
  }
  return null;
}

// ── Shape response ────────────────────────────────────────────────────────────

function shapeResponse(doc) {
  const b = doc.buildings;
  const totalTagged = b.residential + b.apartments + b.commercial + b.industrial;
  const residentialTotal = b.residential + b.apartments;

  return {
    id: doc._id,
    cachedAt: doc.createdAt,
    query: doc.query,
    location: {
      displayName: doc.location.displayName,
      coordinates: {
        latitude:  doc.location.latitude,
        longitude: doc.location.longitude,
      },
      boundingBox:  doc.location.boundingBox,
      osmId:        doc.location.osmId,
      osmType:      doc.location.osmType,
      placeType:    doc.location.placeType,
    },
    totalBuildings:       b.total,
    residentialBuildings: residentialTotal,
    commercialBuildings:  b.commercial,
    industrialBuildings:  b.industrial,
    apartments:           b.apartments,
    houses:               b.houses,
    otherBuildings:       b.other,
    distribution: {
      residentialPct: b.total > 0 ? +((residentialTotal / b.total) * 100).toFixed(1) : 0,
      commercialPct:  b.total > 0 ? +((b.commercial     / b.total) * 100).toFixed(1) : 0,
      industrialPct:  b.total > 0 ? +((b.industrial     / b.total) * 100).toFixed(1) : 0,
      otherPct:       b.total > 0 ? +((b.other          / b.total) * 100).toFixed(1) : 0,
    },
    estimatedPopulation: doc.population.estimated,
    populationDensity:   doc.population.density,
    populationSource:    doc.population.source,
  };
}

// ── POST /api/analyze ─────────────────────────────────────────────────────────

export async function createAnalysis(req, res, next) {
  try {
    const query = String(req.body?.location ?? "").trim();
    if (!query) return res.status(400).json({ error: "location is required" });

    const normalised = query.toLowerCase();

    // ── Cache check ──────────────────────────────────────────────────────────
    const cached = await AnalysisResult.findOne({
      query: normalised,
      expiresAt: { $gt: new Date() },
    });

    if (cached) {
      return res.json({ ...shapeResponse(cached), fromCache: true });
    }

    // ── Geocode ──────────────────────────────────────────────────────────────
    const geo = await geocodeLocation(query);

    const countryIso2 = guessCountryIso2(geo.displayName);

    // ── Overpass ─────────────────────────────────────────────────────────────
    const buildings = await queryBuildings(geo.boundingBox);

    // ── Population ───────────────────────────────────────────────────────────
    const pop = await estimatePopulation({
      bbox:          geo.boundingBox,
      buildingCounts: buildings,
      countryIso2,
    });

    // ── Persist ──────────────────────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + config.cache.ttlMs);

    const doc = await AnalysisResult.findOneAndUpdate(
      { query: normalised },
      {
        query: normalised,
        location: {
          displayName: geo.displayName,
          latitude:    geo.latitude,
          longitude:   geo.longitude,
          boundingBox: geo.boundingBox,
          osmId:       geo.osmId,
          osmType:     geo.osmType,
          placeType:   geo.placeType,
        },
        buildings,
        population: {
          estimated: pop.estimatedPopulation,
          density:   pop.populationDensity,
          source:    pop.source,
        },
        countryIso2,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({ ...shapeResponse(doc), fromCache: false });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/analyses ─────────────────────────────────────────────────────────

export async function listAnalyses(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const docs = await AnalysisResult.find({}, {
      query: 1, "location.displayName": 1, "location.latitude": 1,
      "location.longitude": 1, "buildings.total": 1,
      "population.estimated": 1, createdAt: 1,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json(docs);
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/analyses/:id ─────────────────────────────────────────────────────

export async function getAnalysis(req, res, next) {
  try {
    const doc = await AnalysisResult.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(shapeResponse(doc));
  } catch (err) {
    return next(err);
  }
}
