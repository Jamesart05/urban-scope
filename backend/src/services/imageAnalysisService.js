import sharp from "sharp";
import { config } from "../config.js";

// ── Math helpers ─────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── Segmentation mask ─────────────────────────────────────────────────────────
// Pixels that are bright AND sit on a strong edge are building candidates.
// We also reject pixels that look like deep vegetation (strongly green channels)
// to reduce false positives on tree canopies.

function createMaskFromImage(data, width, height, threshold) {
  const mask = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 3;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      // Suppress obvious vegetation (green-dominant pixels)
      const isVegetation = g > r * 1.15 && g > b * 1.1 && g > 60;
      if (isVegetation) continue;

      const luma = computeLuma(r, g, b);

      // Sobel-style edge detection using all three channels
      const edgeStrength = computeEdgeStrength(data, index, width);

      const isCandidate = luma > threshold && edgeStrength > 25;
      mask[y * width + x] = isCandidate ? 1 : 0;
    }
  }

  return mask;
}

function computeEdgeStrength(data, index, width) {
  const stride = width * 3;
  let totalEdge = 0;
  for (let ch = 0; ch < 3; ch++) {
    const left = data[index - 3 + ch];
    const right = data[index + 3 + ch];
    const up = data[index - stride + ch];
    const down = data[index + stride + ch];
    totalEdge += Math.abs(right - left) + Math.abs(down - up);
  }
  return totalEdge / 3;
}

// ── Connected components (flood fill) ────────────────────────────────────────

function connectedComponents(mask, width, height, minimumPixels, limit) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let startY = 0; startY < height; startY += 1) {
    for (let startX = 0; startX < width; startX += 1) {
      const startIndex = startY * width + startX;
      if (!mask[startIndex] || visited[startIndex]) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = startX;
      queueY[tail] = startY;
      tail += 1;
      visited[startIndex] = 1;

      let minX = startX, minY = startY, maxX = startX, maxY = startY;
      let pixels = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;
        pixels += 1;

        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail += 1;
        }
      }

      if (pixels < minimumPixels) continue;

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (boxWidth < 12 || boxHeight < 12) continue;

      components.push({ left: minX, top: minY, width: boxWidth, height: boxHeight, pixels });

      if (components.length >= limit) return components;
    }
  }

  return components;
}

// ── Per-crop feature extraction ───────────────────────────────────────────────

/**
 * Compute variance and mean luma from raw RGB buffer.
 */
function lumaStats(data) {
  let sum = 0;
  let sumSq = 0;
  const total = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const luma = computeLuma(data[i], data[i + 1], data[i + 2]);
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / total;
  return { mean, variance: sumSq / total - mean * mean };
}

/**
 * Compute mean hue (0-360) and saturation (0-1) for the crop.
 * Used to distinguish roof material and type.
 */
function hueStats(data) {
  let hueSum = 0;
  let satSum = 0;
  const total = data.length / 3;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    const sat = max === 0 ? 0 : delta / max;
    satSum += sat;

    let hue = 0;
    if (delta > 0.01) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }
    hueSum += hue;
  }

  return { meanHue: hueSum / total, meanSat: satSum / total };
}

/**
 * Measure texture roughness as the mean absolute deviation of edge strengths
 * across the crop. Commercial rooftops (flat concrete, metal) are smoother;
 * residential rooftops (pitched tiles, shingles) are more textured.
 */
function textureRoughness(data, width) {
  const stride = width * 3;
  let total = 0;
  let count = 0;
  const pixelCount = data.length / 3;
  const h = Math.floor(pixelCount / width);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 3;
      const edge = computeEdgeStrength(data, idx, width);
      total += edge;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ── Classifier ────────────────────────────────────────────────────────────────
//
// Residential buildings in satellite imagery tend to be:
//   - Smaller footprint (< ~3 000 px²)
//   - More square / compact aspect ratio (< 2:1)
//   - Higher pixel coverage inside the bounding box (pitched roof fill)
//   - Moderate luma variance (not uniform flat concrete, not chaotic)
//   - Warmer hue (terracotta / red / brown tiles) or neutral grey
//   - More textured (shingles, tiles, ridges)
//
// Commercial buildings tend to be:
//   - Larger footprint
//   - More elongated (warehouses, shopping centres)
//   - Lower pixel coverage (complex outlines)
//   - Low luma variance (flat white/grey membrane roofs)
//   - Cooler hue (white, silver, green)
//   - Smoother texture

function classifyBuilding({ width, height, area, pixelCoverage, variance, mean, meanHue, meanSat, roughness }) {
  // 1. Area score — small buildings → residential
  const normalizedArea = clamp(area / 6000, 0, 1);
  const areaScore = 1 - normalizedArea;

  // 2. Aspect ratio — square → residential
  const aspectRatio = width > height ? width / height : height / width;
  const ratioScore = 1 - clamp((aspectRatio - 1) / 2.0, 0, 1);

  // 3. Compactness — denser fill → residential (pitched roofs fill box)
  const compactnessScore = clamp(pixelCoverage / 0.68, 0, 1);

  // 4. Luma variance — moderate variance is residential;
  //    very low = flat commercial roof, very high = complex commercial
  const normVariance = clamp(variance / 2000, 0, 1);
  const varianceScore = normVariance < 0.15
    ? normVariance / 0.15               // penalise very flat roofs
    : 1 - clamp((normVariance - 0.15) / 0.85, 0, 1);

  // 5. Hue score — warm hues (0-50°, 330-360°) indicate terracotta/red tiles
  //    → residential bonus; cool hues (180-270°) → commercial
  const hueScore = computeHueScore(meanHue, meanSat);

  // 6. Texture roughness — pitched/tiled roofs are rougher
  const normRoughness = clamp(roughness / 25, 0, 1);
  const textureScore = normRoughness;

  // Weighted combination
  const finalScore =
    areaScore       * 0.28 +
    ratioScore      * 0.18 +
    compactnessScore * 0.18 +
    varianceScore   * 0.14 +
    hueScore        * 0.12 +
    textureScore    * 0.10;

  const classification = finalScore >= 0.52 ? "residential" : "commercial";
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

function computeHueScore(meanHue, meanSat) {
  // Low saturation → neutral grey/white → slight commercial lean, score 0.4
  if (meanSat < 0.08) return 0.4;

  // Warm: red/orange/brown (0-50° and 320-360°) → residential
  const isWarm =
    (meanHue >= 0 && meanHue <= 50) || (meanHue >= 320 && meanHue <= 360);
  if (isWarm) return 0.8;

  // Yellow-green (50-90°) → could be vegetation bleed or older tiles → neutral
  if (meanHue > 50 && meanHue <= 90) return 0.5;

  // Cool / blue-green (90-270°) → commercial metal / membrane roofs
  if (meanHue > 90 && meanHue <= 270) return 0.2;

  // Purple/magenta (270-320°) → unusual, neutral
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

  const mask = createMaskFromImage(
    data,
    info.width,
    info.height,
    config.analysis.segmentationThreshold
  );

  const components = connectedComponents(
    mask,
    info.width,
    info.height,
    config.analysis.minimumBuildingPixels,
    config.analysis.maximumBuildings
  );

  const buildings = [];

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const extraction = {
      left: component.left,
      top: component.top,
      width: component.width,
      height: component.height,
    };

    const crop = await sharp(imageBuffer).extract(extraction).png().toBuffer();
    const cropRaw = await sharp(crop)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const area = component.width * component.height;
    const pixelCoverage = component.pixels / area;
    const { mean, variance } = lumaStats(cropRaw.data);
    const { meanHue, meanSat } = hueStats(cropRaw.data);
    const roughness = textureRoughness(cropRaw.data, component.width);

    const classification = classifyBuilding({
      width: component.width,
      height: component.height,
      area,
      pixelCoverage,
      variance,
      mean,
      meanHue,
      meanSat,
      roughness,
    });

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
