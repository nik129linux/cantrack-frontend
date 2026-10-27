import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ZOOM, PASTO_CENTER } from "./pasto.js";
import "./map.css";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  /** Accessible name and tooltip of the pin ("Tú", "1 · Luna"). */
  label: string;
  /** "live" is the moving walker; "me" is the viewer; the rest are stops. */
  kind?: "stop" | "live" | "me" | "done" | "next";
};

type LeafletModule = typeof import("leaflet");

type MarkersMapProps = {
  markers: MapMarker[];
  /** Join the markers with a line in the given order (a route). */
  connect?: boolean;
  label: string;
  loadLeaflet?: () => Promise<LeafletModule>;
};

async function loadLeafletFromPackage(): Promise<LeafletModule> {
  return ((await import("leaflet")) as unknown as { default: LeafletModule }).default;
}

/**
 * Read-only OpenStreetMap view (Leaflet) with labelled pins: the walker's live
 * position, or the stops of a day route. Leaflet loads on demand.
 */
export function MarkersMap({ markers, connect = false, label, loadLeaflet = loadLeafletFromPackage }: MarkersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let cancelled = false;

    void loadLeaflet()
      .then((L) => {
        if (cancelled) {
          return;
        }
        leafletRef.current = L;
        const map = L.map(container, {
          center: [PASTO_CENTER.lat, PASTO_CENTER.lng],
          zoom: MAP_ZOOM.start,
          maxZoom: MAP_ZOOM.max,
          zoomControl: true,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: MAP_ZOOM.max,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || L === null || map === null || layer === null) {
      return;
    }
    layer.clearLayers();
    const points: [number, number][] = [];
    for (const marker of markers) {
      points.push([marker.lat, marker.lng]);
      L.marker([marker.lat, marker.lng], {
        title: marker.label,
        keyboard: true,
        icon: L.divIcon({
          className: `markers-pin markers-pin--${marker.kind ?? "stop"}`,
          html: '<span class="markers-pin__dot"></span>',
          iconSize: [30, 40],
          iconAnchor: [15, 38],
        }),
      })
        .bindTooltip(marker.label)
        .addTo(layer);
    }
    if (connect && points.length > 1) {
      L.polyline(points, { color: "#2f7d4f", weight: 4, opacity: 0.7 }).addTo(layer);
    }
    if (points.length === 1) {
      map.setView(points[0]!, 16);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
    }
  }, [markers, connect, ready]);

  return (
    <section className="pickup-map glass-map" aria-label={label}>
      {failed ? (
        <p className="pickup-map__fallback" role="alert">No pudimos cargar el mapa.</p>
      ) : (
        <div ref={containerRef} className="pickup-map__canvas" />
      )}
    </section>
  );
}
