"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import styles from "./page.module.css";

type Building = {
  id: string;
  classification: "residential" | "commercial";
  confidence: number;
  width: number;
  height: number;
  area: number;
  scoreBreakdown: {
    areaScore: number;
    ratioScore: number;
    compactnessScore: number;
    varianceScore: number;
    hueScore: number;
    textureScore: number;
    finalScore: number;
  };
  cropDataUrl: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

type AnalysisResponse = {
  id: string;
  createdAt: string;
  location: {
    query: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
  };
  image: {
    width: number;
    height: number;
    zoom: number;
    mapType: string;
    sourceUrl: string;
  };
  summary: {
    totalDetectedBuildings: number;
    residentialCount: number;
    commercialCount: number;
    populationEstimate: number;
  };
  assumptions: {
    averageHouseholdSize: number;
    occupancyFactor: number;
    residentsPerResidentialBuilding: number;
  };
  buildings: Building[];
  debug: {
    segmentationThreshold: number;
    minimumBuildingPixels: number;
  };
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scoreRow}>
      <span className={styles.scoreLabel}>{label}</span>
      <div className={styles.scoreTrack}>
        <div
          className={styles.scoreFill}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className={styles.scoreValue}>{(value * 100).toFixed(0)}</span>
    </div>
  );
}

export default function HomePage() {
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);
    setExpandedBuilding(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Analysis failed");
      }

      setResult(payload);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unexpected error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Satellite Settlement Analysis</span>
          <h1>Estimate urban activity from a single location query.</h1>
          <p>
            UrbanScope resolves a place name, pulls satellite imagery via ESRI
            World Imagery, isolates likely buildings, classifies them with a
            multi-feature rules engine (area, shape, colour, texture), and
            estimates population from detected residential structures.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="location">
            Location
          </label>
          <input
            id="location"
            className={styles.input}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Enter a town, city, neighbourhood…"
            required
            autoComplete="off"
          />
          <button className={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? (
              <span className={styles.buttonInner}>
                <span className={styles.spinner} />
                Analyzing…
              </span>
            ) : (
              "Run Analysis"
            )}
          </button>
          <p className={styles.helper}>
            Imagery from ESRI World Imagery · Geocoding by OpenStreetMap
            Nominatim · No API keys required.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </section>

      {result ? (
        <>
          <section className={styles.summaryGrid}>
            <article className={styles.metricCard}>
              <span>Residential</span>
              <strong>{result.summary.residentialCount}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Commercial</span>
              <strong>{result.summary.commercialCount}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Population Estimate</span>
              <strong>{result.summary.populationEstimate.toLocaleString()}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Total Detections</span>
              <strong>{result.summary.totalDetectedBuildings}</strong>
            </article>
          </section>

          <section className={styles.details}>
            <div className={styles.panel}>
              <div className={styles.sectionHeader}>
                <h2>Location</h2>
                <span className={styles.muted}>{result.location.formattedAddress}</span>
              </div>
              <dl className={styles.dataList}>
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    {result.location.latitude.toFixed(5)},{" "}
                    {result.location.longitude.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt>Map Zoom</dt>
                  <dd>{result.image.zoom}</dd>
                </div>
                <div>
                  <dt>Residents / Residential Building</dt>
                  <dd>{result.assumptions.residentsPerResidentialBuilding}</dd>
                </div>
                <div>
                  <dt>Segmentation Threshold</dt>
                  <dd>{result.debug.segmentationThreshold}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.panel}>
              <div className={styles.sectionHeader}>
                <h2>Source Image</h2>
                <a
                  href={result.image.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.link}
                >
                  View on OpenStreetMap ↗
                </a>
              </div>
              <p className={styles.sourceText}>
                A {result.image.width}×{result.image.height}px satellite tile
                centred on the resolved location is stitched from ESRI World
                Imagery and analysed pixel-by-pixel. Building candidates are
                found via luma threshold + Sobel edge detection, then classified
                using six features: footprint area, aspect ratio, pixel
                coverage, luma variance, roof hue, and texture roughness.
              </p>
            </div>
          </section>

          <section className={styles.galleryPanel}>
            <div className={styles.sectionHeader}>
              <h2>Detected Buildings</h2>
              <span className={styles.muted}>
                {result.buildings.length} cropped candidates · click any card
                for score breakdown
              </span>
            </div>

            <div className={styles.gallery}>
              {result.buildings.map((building) => (
                <article
                  className={`${styles.cropCard} ${
                    expandedBuilding === building.id ? styles.cropCardExpanded : ""
                  }`}
                  key={building.id}
                  onClick={() =>
                    setExpandedBuilding(
                      expandedBuilding === building.id ? null : building.id
                    )
                  }
                >
                  <div className={styles.cropImageWrap}>
                    <Image
                      alt={`Detected ${building.classification} building`}
                      src={building.cropDataUrl}
                      width={building.width}
                      height={building.height}
                      unoptimized
                    />
                    <span
                      className={`${styles.badge} ${
                        building.classification === "residential"
                          ? styles.badgeResidential
                          : styles.badgeCommercial
                      }`}
                    >
                      {building.classification === "residential" ? "R" : "C"}
                    </span>
                  </div>

                  <div className={styles.cropMeta}>
                    <div className={styles.cropMetaRow}>
                      <strong className={styles.cropType}>
                        {building.classification}
                      </strong>
                      <span className={styles.cropConf}>
                        {Math.round(building.confidence * 100)}%
                      </span>
                    </div>
                    <p className={styles.cropDims}>
                      {building.width}×{building.height}px
                    </p>
                  </div>

                  {expandedBuilding === building.id && (
                    <div className={styles.scoreBreakdown}>
                      <ScoreBar label="Area" value={building.scoreBreakdown.areaScore} />
                      <ScoreBar label="Ratio" value={building.scoreBreakdown.ratioScore} />
                      <ScoreBar label="Fill" value={building.scoreBreakdown.compactnessScore} />
                      <ScoreBar label="Variance" value={building.scoreBreakdown.varianceScore} />
                      <ScoreBar label="Hue" value={building.scoreBreakdown.hueScore} />
                      <ScoreBar label="Texture" value={building.scoreBreakdown.textureScore} />
                      <div className={styles.scoreFinalRow}>
                        <span>Final score</span>
                        <strong>{(building.scoreBreakdown.finalScore * 100).toFixed(1)}</strong>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
