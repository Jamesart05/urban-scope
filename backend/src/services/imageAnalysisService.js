import sharp from "sharp";
import { config } from "../config.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── Multi-channel Sobel edge strength ─────────────────────────────────────────

function computeEdgeStrength(data, index, width) {
  const stride = width * 3;
  let total = 0;
  for (let ch = 0; ch < 3; ch++) {
    const l = data[index - 3 + ch];
    const r = data[index + 3 + ch];
    const u = data[index - stride + ch];
    const d = data[index + stride + ch];
    total += Math.abs(r - l) + Math.abs(d - u);
  }
  return total / 3;
}

// ── Segmentation mask ─────────────────────────────────────────────────────────
// Tuned for tropical/West African urban satellite imagery:
//   - Mixed rooftop materials: corrugated iron (bright/reflective), concrete
//     (grey), terracotta tiles (warm), painted zinc (various colours)
//   - Dense informal settlements with small irregular structures
//   - Heavy vegetation mixed into urban fabric
//   - ESRI JPEG tiles with compression artifacts softening edges

function createMaskFromImage(data, width, height, threshold) {
  const mask = new Uint8Array(width * height);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = (y * width + x) * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = computeLuma(r, g, b);

      // Suppress very dark pixels (deep shadow, water, tarmac)
      if (luma < 35) continue;

      // Suppress deep vegetation — but less aggressively than before since
      // many Nigerian rooftops are painted green or sit under light tree cover
      const isDeepVeg = g > r * 1.20 && g > b * 1.15 && g > 65 && luma < 120;
      if (isDeepVeg) continue;

      // Suppress pixels that look like bare earth / laterite roads
      // (very warm orange-brown with low luma)
      const isLaterite = r > g * 1.3 && r > b * 1.5 && luma < 80;
      if (isLaterite) continue;

      const edgeStrength = computeEdgeStrength(data, idx, width);

      // Three detection tiers:
      // 1. Bright pixels (corrugated iron, painted roofs) with any edge
      // 2. Mid-brightness (concrete, unpainted roofs) with moderate edge
      // 3. Any brightness with very strong edge (roof outline regardless of material)
      const isBright  = luma > threshold       && edgeStrength > 10;
      const isMid     = luma > threshold * 0.55 && edgeStrength > 22;
      const isEdgey   = luma > 45              && edgeStrength > 45;

      mask[y * width + x] = (isBright || isMid || isEdgey) ? 1 : 0;
    }
  }

  return mask;
}

// ── Morphological operations ──────────────────────────────────────────────────
// Dilate once to bridge JPEG compression gaps, then erode to clean noise.

function dilateMask(mask, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] || mask[i-1] || mask[i+1] || mask[i-width] || mask[i+width]) {
        out[i] = 1;
      }
    }
  }
  return out;
}

function erodeMask(mask, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] && mask[i-1] && mask[i+1] && mask[i-width] && mask[i+width]) {
        out[i] = 1;
      }
    }
  }
  return out;
}

// ── Connected components ──────────────────────────────────────────────────────

function connectedComponents(mask, width, height, minimumPixels, limit) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const startIndex = startY * width + startX;
      if (!mask[startIndex] || visited[startIndex]) continue;

      let head = 0, tail = 0;
      queueX[tail] = startX; queueY[tail] = startY; tail++;
      visited[startIndex] = 1;

      let minX = startX, minY = startY, maxX = startX, maxY = startY, pixels = 0;

      while (head < tail) {
        const cx = queueX[head], cy = queueY[head]; head++; pixels++;
        if (cx < minX) minX = cx; if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx; if (cy > maxY) maxY = cy;

        for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queueX[tail] = nx; queueY[tail] = ny; tail++;
        }
      }

      if (pixels < minimumPixels) continue;

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;

      // Minimum 8×8px box
      if (bw < 8 || bh < 8) continue;

      // Reject huge blobs spanning >35% of image (roads, fields, sky)
      if (bw > width * 0.35 || bh > height * 0.35) continue;

      components.push({ left: minX, top: minY, width: bw, height: bh, pixels });
      if (components.length >= limit) return components;
    }
  }

  return components;
}

// ── Feature extraction ────────────────────────────────────────────────────────

function lumaStats(data) {
  let sum = 0, sumSq = 0;
  const total = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const luma = computeLuma(data[i], data[i+1], data[i+2]);
    sum += luma; sumSq += luma * luma;
  }
  const mean = sum / total;
  return { mean, variance: sumSq / total - mean * mean };
}

function hueStats(data) {
  let hueSum = 0, satSum = 0;
  const total = data.length / 3;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    satSum += max === 0 ? 0 : delta / max;

    let hue = 0;
    if (delta > 0.01) {
      if (max === r)      hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else                hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }
    hueSum += hue;
  }

  return { meanHue: hueSum / total, meanSat: satSum / total };
}

function textureRoughness(data, width) {
  const h = Math.floor((data.length / 3) / width);
  let total = 0, count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      total += computeEdgeStrength(data, (y * width + x) * 3, width);
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ── Classifier ────────────────────────────────────────────────────────────────
//
// Calibrated for Nigerian/West African urban satellite imagery:
//
// Residential signals:
//   - Smaller footprint (compound houses, bungalows)
//   - Square-ish shape (typical Nigerian residential plot)
//   - Higher pixel coverage (pitched/hip roofs fill the box)
//   - Moderate luma variance (varied roof surfaces)
//   - Warm hue: terracotta, red/orange zinc sheets common in residential areas
//   - Moderate texture (ribbed zinc, tiled roofs)
//
// Commercial signals:
//   - Larger footprint (plazas, warehouses, markets)
//   - More elongated shape
//   - Flat grey/white concrete roof (low variance, low saturation)
//   - Smoother texture (flat membrane or poured concrete)

function classifyBuilding({ width, height, area, pixelCoverage, variance, mean, meanHue, meanSat, roughness }) {
  // 1. Area — smaller → residential. Scaled for zoom 16 (pixels represent ~1.5m)
  const areaScore = 1 - clamp(area / 8000, 0, 1);

  // 2. Aspect ratio — square → residential
  const ar = width > height ? width / height : height / width;
  const ratioScore = 1 - clamp((ar - 1) / 2.5, 0, 1);

  // 3. Compactness
  const compactnessScore = clamp(pixelCoverage / 0.65, 0, 1);

  // 4. Luma variance — bell curve peaking at moderate variance
  const normVar = clamp(variance / 1800, 0, 1);
  const varianceScore = normVar < 0.12
    ? normVar / 0.12
    : 1 - clamp((normVar - 0.12) / 0.88, 0, 1);

  // 5. Hue — Nigerian residential roofs: terracotta, orange/red zinc, brown
  //          Commercial: grey concrete, white painted, occasional blue/green
  const hueScore = computeHueScore(meanHue, meanSat, mean);

  // 6. Texture — zinc roofing sheets create strong parallel ridges
  const textureScore = clamp(roughness / 20, 0, 1);

  const finalScore =
    areaScore        * 0.27 +
    ratioScore       * 0.18 +
    compactnessScore * 0.17 +
    varianceScore    * 0.13 +
    hueScore         * 0.14 +
    textureScore     * 0.11;

  const classification = finalScore >= 0.50 ? "residential" : "commercial";
  const confidence = classification === "residential" ? finalScore : 1 - finalScore;

  return {
    classification,
    confidence: clamp(confidence, 0.50, 0.97),
    scoreBreakdown: {
      areaScore:        Number(areaScore.toFixed(3)),
      ratioScore:       Number(ratioScore.toFixed(3)),
      compactnessScore: Number(compactnessScore.toFixed(3)),
      varianceScore:    Number(varianceScore.toFixed(3)),
      hueScore:         Number(hueScore.toFixed(3)),
      textureScore:     Number(textureScore.toFixed(3)),
      finalScore:       Number(finalScore.toFixed(3)),
    },
  };
}

function computeHueScore(meanHue, meanSat, meanLuma) {
  // Low saturation: grey/white roofs
  // High luma + low sat = white/light grey → commercial (concrete, painted)
  // Low luma + low sat = dark grey → could go either way, lean commercial
  if (meanSat < 0.10) {
    return meanLuma > 160 ? 0.25 : 0.40;
  }

  // Warm red/orange/brown (0–55°, 330–360°): terracotta, red zinc, rust
  // → very strong residential signal in Nigerian context
  if ((meanHue >= 0 && meanHue <= 55) || (meanHue >= 330 && meanHue <= 360)) {
    return 0.85;
  }

  // Yellow (55–75°): old painted zinc, sand-coloured roofs → neutral-residential
  if (meanHue > 55 && meanHue <= 75) return 0.60;

  // Yellow-green (75–110°): painted roofs common in Nigeria → neutral
  if (meanHue > 75 && meanHue <= 110) return 0.50;

  // Green (110–160°): painted green roofs (common in Nigerian residential) → slight residential
  if (meanHue > 110 && meanHue <= 160) return 0.55;

  // Cyan/teal (160–210°): less common, commercial lean
  if (meanHue > 160 && meanHue <= 210) return 0.35;

  // Blue (210–270°): commercial/industrial metal roofs
  if (meanHue > 210 && meanHue <= 270) return 0.20;

  // Purple/magenta (270–330°): rare, neutral
  return 0.45;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzeSatelliteImage(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize({
      width: config.maps.size.width,
      height: config.maps.size.height,
      fit: "fill",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let mask = createMaskFromImage(data, info.width, info.height, config.analysis.segmentationThreshold);

  // Dilate → erode (close small gaps, remove isolated noise pixels)
  mask = dilateMask(mask, info.width, info.height);
  mask = dilateMask(mask, info.width, info.height); // second pass bridges larger JPEG gaps
  mask = erodeMask(mask, info.width, info.height);

  const components = connectedComponents(
    mask,
    info.width,
    info.height,
    config.analysis.minimumBuildingPixels,
    config.analysis.maximumBuildings
  );

  const buildings = [];

  for (let index = 0; index < components.length; index++) {
    const component = components[index];
    const extraction = { left: component.left, top: component.top, width: component.width, height: component.height };

    const crop = await sharp(imageBuffer).extract(extraction).png().toBuffer();
    const cropRaw = await sharp(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const area = component.width * component.height;
    const pixelCoverage = component.pixels / area;
    const { mean, variance } = lumaStats(cropRaw.data);
    const { meanHue, meanSat } = hueStats(cropRaw.data);
    const roughness = textureRoughness(cropRaw.data, component.width);

    const classification = classifyBuilding({ width: component.width, height: component.height, area, pixelCoverage, variance, mean, meanHue, meanSat, roughness });

    buildings.push({
      id: `building-${index + 1}`,
      width: component.width,
      height: component.height,
      area,
      bounds: extraction,
      cropDataUrl: `data:image/png;base64,${crop.toString("base64")}`,
      ...classification,
    });
  }

  return {
    imageWidth: info.width,
    imageHeight: info.height,
    buildings,
    debug: {
      segmentationThreshold: config.analysis.segmentationThreshold,
      minimumBuildingPixels: config.analysis.minimumBuildingPixels,
    },
  };
}
