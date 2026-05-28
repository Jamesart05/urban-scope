# UrbanScope

UrbanScope is a full-stack web application that accepts a location name, fetches satellite imagery through the Google Maps API, heuristically segments likely buildings from the image, classifies each detected building as residential or commercial using a rule-based scorer, and estimates population from the residential building count.

## Important limitations

- Google Static Maps does not return authoritative per-building polygons.
- The building extraction in this project is image-processing based and therefore heuristic.
- Residential/commercial classification is rule based, not ML-backed ground truth.
- Population is an estimate derived from the detected residential building count and configurable occupancy assumptions.

For production-grade building footprints, pair this UI with OpenStreetMap building polygons, licensed GIS datasets, or a dedicated geospatial imagery model.

## Stack

- Frontend: Next.js 15 + TypeScript
- Backend: Express + Node.js + Mongoose
- Database: MongoDB
- Image processing: Sharp

## Setup

Copy the env templates before running:

- `frontend/.env.local.example` -> `frontend/.env.local`
- `backend/.env.example` -> `backend/.env`

Required variables:

- `GOOGLE_MAPS_API_KEY`
- `MONGODB_URI`

Install:

```bash
cmd /c npm install
```

Run backend:

```bash
cmd /c npm run dev:backend
```

Run frontend:

```bash
cmd /c npm run dev:frontend
```

If MongoDB is not installed locally:

```bash
docker compose up -d
```

## Pipeline

1. Geocode the input location with Google Geocoding API.
2. Fetch a satellite image from Google Static Maps.
3. Segment likely rooftops from the raster.
4. Crop each building candidate.
5. Score each crop with a rule-based residential/commercial classifier.
6. Estimate population from residential building count.
