# UrbanScope

UrbanScope is a full-stack web application that accepts a location name, fetches satellite imagery through the **ESRI World Imagery** tile service (free, no API key), heuristically segments likely buildings from the image, classifies each detected building as residential or commercial using a multi-feature rule-based scorer, and estimates population from the residential building count.

## Important limitations

- ESRI World Imagery tiles are 256 × 256 px; a 3 × 3 grid is stitched and cropped to 640 × 640.
- Building extraction is image-processing-based and therefore heuristic.
- Classification uses six features (area, aspect ratio, compactness, luma variance, roof hue, texture roughness) but is not ML-backed ground truth.
- Population is an estimate derived from the detected residential building count and configurable occupancy assumptions.

For production-grade building footprints, pair this UI with OpenStreetMap building polygons, licensed GIS datasets, or a dedicated geospatial imagery model.

## Stack

- **Frontend**: Next.js 15 + TypeScript
- **Backend**: Express + Node.js + Mongoose
- **Database**: MongoDB
- **Image processing**: Sharp
- **Geocoding**: Nominatim (OpenStreetMap) — free, no key
- **Satellite imagery**: ESRI World Imagery tiles — free, no key

## Setup

No API keys required. Just set up MongoDB.

Copy the env templates before running:

- `frontend/.env.local.example` → `frontend/.env.local`
- `backend/.env.example` → `backend/.env`

Required variable:

- `MONGODB_URI`

Install:

```bash
npm install
```

Run backend:

```bash
npm run dev:backend
```

Run frontend:

```bash
npm run dev:frontend
```

If MongoDB is not installed locally:

```bash
docker compose up -d
```

## Pipeline

1. **Geocode** the input location with Nominatim (OpenStreetMap).
2. **Fetch** a 3 × 3 grid of ESRI World Imagery satellite tiles and stitch to 640 × 640.
3. **Segment** likely rooftops using luma threshold + Sobel edge detection; suppress vegetation.
4. **Flood-fill** connected components to find building candidate bounding boxes.
5. **Crop** each building candidate.
6. **Score** each crop across six features:
   - Footprint area (small → residential)
   - Aspect ratio (square → residential)
   - Pixel coverage / compactness (dense fill → residential)
   - Luma variance (moderate variance → residential)
   - Roof hue (warm terracotta/red → residential; cool white/metal → commercial)
   - Texture roughness (rough pitched tiles → residential; smooth membrane → commercial)
7. **Estimate population** from residential building count × occupancy assumptions.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analyze` | Run analysis for a location |
| `GET`  | `/api/analyses` | List past analyses (no building crops) |
| `GET`  | `/api/analyses/:id` | Fetch a single past analysis |
