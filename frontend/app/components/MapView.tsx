"use client";

import { useEffect } from "react";
import {
  MapContainer, TileLayer, Marker, Popup,
  Rectangle, useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { BoundingBox } from "../types/analysis";

// Fix Leaflet default icon in Next.js
const markerIcon = L.icon({
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
});

// Fly to new bounds whenever result changes
function FlyTo({ lat, lng, bbox }: { lat: number; lng: number; bbox: BoundingBox }) {
  const map = useMap();
  useEffect(() => {
    map.flyToBounds(
      [[bbox.south, bbox.west], [bbox.north, bbox.east]],
      { padding: [48, 48], duration: 1.4, easeLinearity: 0.2 }
    );
  }, [lat, lng, bbox, map]);
  return null;
}

interface Props {
  latitude:    number;
  longitude:   number;
  boundingBox: BoundingBox;
  displayName: string;
}

export default function MapView({ latitude, longitude, boundingBox, displayName }: Props) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={12}
      style={{ height: "100%", width: "100%", background: "#0d1420" }}
      zoomControl
      scrollWheelZoom
    >
      {/* CartoDB Dark Matter — matches app dark theme */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      {/* Bounding box */}
      <Rectangle
        bounds={[[boundingBox.south, boundingBox.west], [boundingBox.north, boundingBox.east]]}
        pathOptions={{
          color: "#14d9b4",
          weight: 2,
          fillOpacity: 0.06,
          dashArray: "6 5",
        }}
      />

      {/* Centre pin */}
      <Marker position={[latitude, longitude]} icon={markerIcon}>
        <Popup>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 11 }}>
            {displayName}
          </span>
        </Popup>
      </Marker>

      <FlyTo lat={latitude} lng={longitude} bbox={boundingBox} />
    </MapContainer>
  );
}
