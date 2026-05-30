"use client";

import dynamic from "next/dynamic";
import { FormEvent, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import type { AnalysisResult } from "./types/analysis";
import styles from "./page.module.css";

// Leaflet must render client-side only
const MapView = dynamic(() => import("./components/MapView"), {
  ssr: false,
  loading: () => (
    <div className={styles.mapPlaceholder}><span>Loading map…</span></div>
  ),
});

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

// ── Palette (matches CSS vars) ────────────────────────────────────────────────
const C = {
  teal:   "#14d9b4",
  amber:  "#f59e0b",
  rose:   "#f43f5e",
  blue:   "#3b82f6",
  violet: "#8b5cf6",
  dim:    "#3d5068",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString(); }

function StatCard({
  label, value, accent, sub,
}: {
  label: string; value: string | number; accent?: string; sub?: string;
}) {
  return (
    <div
      className={styles.statCard}
      style={{ "--accent": accent ?? C.teal } as React.CSSProperties}
    >
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>
        {typeof value === "number" ? fmt(value) : value}
      </strong>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [query, setQuery]     = useState("");
  const [result, setResult]   = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [phase, setPhase]     = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const phases = [
      "Resolving location via Nominatim…",
      "Querying OpenStreetMap buildings…",
      "Estimating population…",
    ];
    let p = 0;
    setPhase(phases[0]);
    const ticker = setInterval(() => {
      p = Math.min(p + 1, phases.length - 1);
      setPhase(phases[p]);
    }, 4000);

    try {
      const res = await fetch(`${API}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      clearInterval(ticker);
      setLoading(false);
      setPhase("");
    }
  }

  // ── Chart data ────────────────────────────────────────────────────────────
  const barData = result
    ? [
        { name: "Residential", count: result.residentialBuildings, fill: C.teal   },
        { name: "Commercial",  count: result.commercialBuildings,  fill: C.amber  },
        { name: "Industrial",  count: result.industrialBuildings,  fill: C.rose   },
        { name: "Other",       count: result.otherBuildings,       fill: C.dim    },
      ]
    : [];

  const pieData = result
    ? [
        { name: "Residential", value: result.distribution.residentialPct, color: C.teal   },
        { name: "Commercial",  value: result.distribution.commercialPct,  color: C.amber  },
        { name: "Industrial",  value: result.distribution.industrialPct,  color: C.rose   },
        { name: "Other",       value: result.distribution.otherPct,       color: C.dim    },
      ].filter((d) => d.value > 0)
    : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>

          {/* Brand */}
          <div className={styles.brand}>
            <span className={styles.brandMark}>US</span>
            <div>
              <p className={styles.brandName}>UrbanScope</p>
              <p className={styles.brandSub}>Geospatial Intelligence</p>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSubmit} className={styles.searchForm}>
            <label className={styles.searchLabel} htmlFor="q">Location</label>
            <div className={styles.searchRow}>
              <input
                id="q"
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lagos, Abuja, London…"
                autoComplete="off"
                required
              />
              <button className={styles.searchBtn} type="submit" disabled={loading}>
                {loading ? <span className={styles.dot} /> : "→"}
              </button>
            </div>
            {loading && <p className={styles.phase}>{phase}</p>}
            {error   && <p className={styles.errMsg}>{error}</p>}
          </form>

          {/* Data credit */}
          <p className={styles.dataCredit}>
            Buildings via <strong>OpenStreetMap</strong> + Overpass API<br />
            Population via <strong>WorldPop</strong> + heuristics<br />
            Geocoding via <strong>Nominatim</strong>
          </p>
        </div>

        {/* Stats — only visible after a result */}
        {result && (
          <div className={styles.sidebarStats}>
            <p className={styles.locName}>{result.location.displayName}</p>

            <div className={styles.statGrid}>
              <StatCard label="Total Buildings"  value={result.totalBuildings}       accent={C.teal}   />
              <StatCard label="Residential"      value={result.residentialBuildings} accent={C.teal}   />
              <StatCard label="Commercial"       value={result.commercialBuildings}  accent={C.amber}  />
              <StatCard label="Industrial"       value={result.industrialBuildings}  accent={C.rose}   />
              <StatCard label="Apartments"       value={result.apartments}           accent={C.blue}   />
              <StatCard label="Houses"           value={result.houses}               accent={C.violet} />
            </div>

            <div className={styles.popBlock}>
              <div className={styles.popRow}>
                <div>
                  <span className={styles.popLabel}>Est. Population</span>
                  <strong className={styles.popValue}>{fmt(result.estimatedPopulation)}</strong>
                </div>
                <div>
                  <span className={styles.popLabel}>Density</span>
                  <strong className={styles.popValue}>
                    {fmt(result.populationDensity)}<small> /km²</small>
                  </strong>
                </div>
              </div>
              <p className={styles.popSource}>Source: {result.populationSource}</p>
            </div>

            {result.fromCache && (
              <p className={styles.cacheNote}>
                ⚡ Cached · {new Date(result.cachedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className={styles.main}>

        {/* Map */}
        <div className={styles.mapWrap}>
          {result ? (
            <MapView
              latitude={result.location.coordinates.latitude}
              longitude={result.location.coordinates.longitude}
              boundingBox={result.location.boundingBox}
              displayName={result.location.displayName}
            />
          ) : (
            <div className={styles.mapEmpty}>
              <div className={styles.mapEmptyInner}>
                <p className={styles.mapEmptyEyebrow}>Geospatial Analysis</p>
                <h1 className={styles.mapEmptyHeading}>
                  Urban Intelligence<br /><em>from Open Data</em>
                </h1>
                <p className={styles.mapEmptyBody}>
                  Enter any city, town, or region to retrieve building counts,
                  type distributions, and population estimates — powered entirely
                  by OpenStreetMap, Overpass API, and WorldPop.
                </p>
              </div>
              <div className={styles.gridOverlay} aria-hidden />
            </div>
          )}
        </div>

        {/* Charts */}
        {result && (
          <div className={styles.chartsRow}>

            {/* Bar chart — building counts */}
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Building Counts</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={barData}
                  margin={{ top: 4, right: 4, left: -14, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fill: C.dim, fontSize: 10, fontFamily: "JetBrains Mono" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: C.dim, fontSize: 10, fontFamily: "JetBrains Mono" }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111927",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontFamily: "JetBrains Mono",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#dde4f0" }}
                    itemStyle={{ color: C.teal }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart — distribution */}
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Distribution</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={78}
                    paddingAngle={3}
                    label={({ value }) => `${value}%`}
                    labelLine={false}
                  >
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Legend
                    iconType="circle" iconSize={7}
                    wrapperStyle={{
                      fontSize: 10,
                      fontFamily: "JetBrains Mono",
                      color: C.dim,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111927",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontFamily: "JetBrains Mono",
                      fontSize: 11,
                    }}
                    formatter={(v) => [`${v}%`, ""]}
                    itemStyle={{ color: "#dde4f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Breakdown bars + metadata */}
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Breakdown</h2>
              <div className={styles.breakdown}>
                {[
                  { label: "Residential", pct: result.distribution.residentialPct, color: C.teal   },
                  { label: "Commercial",  pct: result.distribution.commercialPct,  color: C.amber  },
                  { label: "Industrial",  pct: result.distribution.industrialPct,  color: C.rose   },
                  { label: "Other",       pct: result.distribution.otherPct,       color: C.dim    },
                ].map((row) => (
                  <div key={row.label} className={styles.breakdownRow}>
                    <span className={styles.breakdownLabel}>{row.label}</span>
                    <div className={styles.breakdownTrack}>
                      <div
                        className={styles.breakdownFill}
                        style={{ width: `${row.pct}%`, background: row.color }}
                      />
                    </div>
                    <span className={styles.breakdownPct}>{row.pct}%</span>
                  </div>
                ))}

                <div className={styles.breakdownMeta}>
                  <div>
                    <span>Place type</span>
                    <strong>{result.location.placeType}</strong>
                  </div>
                  <div>
                    <span>Lat / Lng</span>
                    <strong>
                      {result.location.coordinates.latitude.toFixed(4)},&nbsp;
                      {result.location.coordinates.longitude.toFixed(4)}
                    </strong>
                  </div>
                  <div>
                    <span>OSM type</span>
                    <strong>{result.location.osmType ?? "—"}</strong>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
