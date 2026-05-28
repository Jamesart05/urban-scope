import sharp from "sharp";
import { config } from "../config.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function createMaskFromImage(data, width, height, threshold) {
  const mask = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 3;
      const left = index - 3;
      const right = index + 3;
      const up = index - width * 3;
      const down = index + width * 3;

      const luma = computeLuma(data[index], data[index + 1], data[index + 2]);
      const lumaRight = computeLuma(
        data[right],
        data[right + 1],
        data[right + 2]
      );
      const lumaLeft = computeLuma(
        data[left],
        data[left + 1],
        data[left + 2]
      );
      const lumaUp = computeLuma(data[up], data[up + 1], data[up + 2]);
      const lumaDown = computeLuma(data[down], data[down + 1], data[down + 2]);

      const horizontal = Math.abs(lumaRight - lumaLeft);
      const vertical = Math.abs(lumaDown - lumaUp);
      const edgeStrength = horizontal + vertical;

      const isCandidate = luma > threshold && edgeStrength > 30;
      mask[y * width + x] = isCandidate ? 1 : 0;
    }
  }

  return mask;
}

function connectedComponents(mask, width, height, minimumPixels, limit) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let startY = 0; startY < height; startY += 1) {
    for (let startX = 0; startX < width; startX += 1) {
      const startIndex = startY * width + startX;
      if (!mask[startIndex] || visited[startIndex]) {
        continue;
      }

      let head = 0;
      let tail = 0;
      queueX[tail] = startX;
      queueY[tail] = startY;
      tail += 1;
      visited[startIndex] = 1;

      let minX = startX;
      let minY = startY;
      let maxX = startX;
      let maxY = startY;
      let pixels = 0;

      while (head < tail) {
        const x = queueX[head];
        const y = queueY[head];
        head += 1;
        pixels += 1;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const neighborIndex = ny * width + nx;
          if (!mask[neighborIndex] || visited[neighborIndex]) {
            continue;
          }

          visited[neighborIndex] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail += 1;
        }
      }

      if (pixels < minimumPixels) {
        continue;
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;

      if (boxWidth < 12 || boxHeight < 12) {
        continue;
      }

      components.push({
        left: minX,
        top: minY,
        width: boxWidth,
        height: boxHeight,
        pixels
      });

      if (components.length >= limit) {
        return components;
      }
    }
  }

  return components;
}

function varianceFromRaw(data) {
  let sum = 0;
  let sumSquares = 0;
  const total = data.length / 3;

  for (let index = 0; index < data.length; index += 3) {
    const luma = computeLuma(data[index], data[index + 1], data[index + 2]);
    sum += luma;
    sumSquares += luma * luma;
  }

  const mean = sum / total;
  return sumSquares / total - mean * mean;
}

function classifyBuilding({ width, height, area, pixelCoverage, variance }) {
  const aspectRatio = width > height ? width / height : height / width;
  const normalizedArea = clamp(area / 9000, 0, 1);
  const areaScore = 1 - normalizedArea;
  const ratioScore = 1 - clamp((aspectRatio - 1) / 2.4, 0, 1);
  const compactnessScore = clamp(pixelCoverage / 0.72, 0, 1);
  const varianceScore = 1 - clamp(variance / 1800, 0, 1);
  const finalScore =
    areaScore * 0.35 +
    ratioScore * 0.2 +
    compactnessScore * 0.25 +
    varianceScore * 0.2;

  const classification = finalScore >= 0.56 ? "residential" : "commercial";
  const confidence =
    classification === "residential" ? finalScore : 1 - finalScore;

  return {
    classification,
    confidence: clamp(confidence, 0.5, 0.99),
    scoreBreakdown: {
      areaScore: Number(areaScore.toFixed(3)),
      ratioScore: Number(ratioScore.toFixed(3)),
      compactnessScore: Number(compactnessScore.toFixed(3)),
      varianceScore: Number(varianceScore.toFixed(3)),
      finalScore: Number(finalScore.toFixed(3))
    }
  };
}

export async function analyzeSatelliteImage(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize({
      width: config.maps.size.width,
      height: config.maps.size.height,
      fit: "fill"
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
      height: component.height
    };

    const crop = await sharp(imageBuffer).extract(extraction).png().toBuffer();
    const cropRaw = await sharp(crop)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const area = component.width * component.height;
    const variance = varianceFromRaw(cropRaw.data);
    const pixelCoverage = component.pixels / area;
    const classification = classifyBuilding({
      width: component.width,
      height: component.height,
      area,
      pixelCoverage,
      variance
    });

    buildings.push({
      id: `building-${index + 1}`,
      width: component.width,
      height: component.height,
      area,
      bounds: extraction,
      cropDataUrl: `data:image/png;base64,${crop.toString("base64")}`,
      ...classification
    });
  }

  return {
    imageWidth: info.width,
    imageHeight: info.height,
    buildings,
    debug: {
      segmentationThreshold: config.analysis.segmentationThreshold,
      minimumBuildingPixels: config.analysis.minimumBuildingPixels
    }
  };
}

