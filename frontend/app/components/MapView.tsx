"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
// import "leaflet/dist/"

export default function MapView({ lat, lng }: any) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={18}
      style={{ height: "300px", width: "100%" }}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      <Marker position={[lat, lng]}>
        <Popup>Analysis Center</Popup>"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  latitude: number;
  longitude: number;
}

export default function ResultMap({ latitude, longitude }: Props) {
  return (
    <div style={{ height: "400px", width: "100%" }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={18}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <Marker position={[latitude, longitude]}>
          <Popup>Location Center</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
      </Marker>
    </MapContainer>
  );
}