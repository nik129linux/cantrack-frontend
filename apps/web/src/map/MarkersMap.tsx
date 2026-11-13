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
  /** Fly to this point whenever `key` changes ("Centrar en mí"). */
  focus?: { lat: number; lng: number; key: number; zoom?: number } | null;
  /**
   * Frame every marker whenever they change (the default). Navigation turns it
   * off: a position arriving each second would keep yanking the map around.
   */
  autoFit?: boolean;
  /** Draw the joining line as a dashed trail instead of a solid route. */
  dashed?: boolean;
  /** `[[lat, lng], ...]` drawn as the way to follow, instead of joining the pins. */
  path?: [number, number][] | null;
};

async function loadLeafletFromPackage(): Promise<LeafletModule> {
  return ((await import("leaflet")) as unknown as { default: LeafletModule }).default;
}

/**
 * Read-only OpenStreetMap view (Leaflet) with labelled pins: the walker's live
 * position, or the stops of a day route. Leaflet loads on demand.
 */
export function MarkersMap({
  markers,
  connect = false,
  label,
  loadLeaflet = loadLeafletFromPackage,
  focus = null,
  autoFit = true,
  dashed = false,
  path = null,
}: MarkersMapProps) {
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
    // A routed path wins over joining the pins: it is the way he must walk.
    let line: [number, number][] | null = null;
    if (path !== null && path.length > 1) {
      line = path;
    } else if (connect && points.length > 1) {
      line = points;
    }
    if (line !== null) {
      L.polyline(line, {
        color: "#2f7d4f",
        weight: 5,
        opacity: 0.8,
        ...(dashed && path === null ? { dashArray: "10 10" } : {}),
      }).addTo(layer);
    }
    if (!autoFit) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0]!, 16);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
    }
  }, [markers, connect, ready, autoFit, dashed, path]);

  const focusKey = focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null || focus === null) {
      return;
    }
    map.setView([focus.lat, focus.lng], focus.zoom ?? 16);
    // Only a new request to center moves the map, not every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

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
