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

export default function HomePage() {
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ location })
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
      setResult(null);
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
            UrbanScope resolves a place name, pulls satellite imagery through the
            Google Maps API, isolates likely buildings, classifies them with a
            deterministic rules engine, and estimates population from detected
            residential structures.
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
            placeholder="Enter a town, city, state, or country"
            required
          />
          <button className={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? "Analyzing..." : "Run Analysis"}
          </button>
          <p className={styles.helper}>
            This estimate is heuristic. Building footprints and occupancy are not
            authoritative census values.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </section>

      {result ? (
        <>
          <section className={styles.summaryGrid}>
            <article className={styles.metricCard}>
              <span>Residential Buildings</span>
              <strong>{result.summary.residentialCount}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Commercial Buildings</span>
              <strong>{result.summary.commercialCount}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Population Estimate</span>
              <strong>{result.summary.populationEstimate}</strong>
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
                <span>{result.location.formattedAddress}</span>
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
                  <dt>Residents Per Residential Building</dt>
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
                <a href={result.image.sourceUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              </div>
              <p className={styles.sourceText}>
                The backend fetches a satellite image centered on the resolved
                location and performs building candidate extraction on the raster.
              </p>
            </div>
          </section>

          <section className={styles.galleryPanel}>
            <div className={styles.sectionHeader}>
              <h2>Detected Buildings</h2>
              <span>{result.buildings.length} cropped candidates</span>
            </div>

            <div className={styles.gallery}>
              {result.buildings.map((building) => (
                <article className={styles.cropCard} key={building.id}>
                  <Image
                    alt={`Detected ${building.classification} building`}
                    src={building.cropDataUrl}
                    width={building.width}
                    height={building.height}
                    unoptimized
                  />
                  <div className={styles.cropMeta}>
                    <div>
                      <strong>{building.classification}</strong>
                      <span>{Math.round(building.confidence * 100)}% confidence</span>
                    </div>
                    <p>
                      {building.width}x{building.height}px | area {building.area}px
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
