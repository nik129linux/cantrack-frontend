import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MAP_ZOOM,
  PASTO_BOUNDS,
  PASTO_CENTER,
  isInsidePasto,
  parsePin,
  roundCoordinate,
} from "./pasto.js";
import "./map.css";

type PickupMapProps = {
  /** Current pin as the form's text fields (empty = no pin yet). */
  lat: string;
  lng: string;
  onPick: (lat: number, lng: number) => void;
  /** Where Leaflet comes from; defaults to the installed package. */
  loadLeaflet?: () => Promise<LeafletModule>;
};

type LeafletModule = typeof import("leaflet");

/** Leaflet is heavy, so it loads on demand; tests inject a fake instead. */
async function loadLeafletFromPackage(): Promise<LeafletModule> {
  return ((await import("leaflet")) as unknown as { default: LeafletModule }).default;
}

/**
 * Real map of Pasto (OpenStreetMap tiles). Click it or drag the pin to choose
 * where the walker picks the dog up; the pin follows the form fields too.
 */
export function PickupMap({ lat, lng, onPick, loadLeaflet = loadLeafletFromPackage }: PickupMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const onPickRef = useRef(onPick);
  const pickRef = useRef<(lat: number, lng: number) => void>(() => undefined);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  onPickRef.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const L = await loadLeaflet();
        if (cancelled || container === null) {
          return;
        }
        leafletRef.current = L;

        const map = L.map(container, {
          center: [PASTO_CENTER.lat, PASTO_CENTER.lng],
          zoom: MAP_ZOOM.start,
          minZoom: MAP_ZOOM.min,
          maxZoom: MAP_ZOOM.max,
          maxBounds: [
            [PASTO_BOUNDS.south, PASTO_BOUNDS.west],
            [PASTO_BOUNDS.north, PASTO_BOUNDS.east],
          ],
          maxBoundsViscosity: 0.9,
          zoomControl: true,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: MAP_ZOOM.max,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        map.on("click", (event) => {
          pick(event.latlng.lat, event.latlng.lng);
        });

        mapRef.current = map;
        setReady(true);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    }

    function pick(nextLat: number, nextLng: number) {
      if (!isInsidePasto(nextLat, nextLng)) {
        setNotice("Ese punto queda fuera de Pasto.");
        return;
      }
      setNotice(null);
      onPickRef.current(roundCoordinate(nextLat), roundCoordinate(nextLng));
    }

    void setup();

    // The marker's drag handler (second effect) reaches `pick` through this ref.
    pickRef.current = pick;

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // The pin follows the form fields (typed numbers, a click or a drag).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || L === null || map === null) {
      return;
    }

    const pin = parsePin(lat, lng);
    if (pin === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current === null) {
      const marker = L.marker([pin.lat, pin.lng], {
        draggable: true,
        keyboard: true,
        title: "Punto de recogida",
        icon: L.divIcon({
          className: "pickup-pin",
          html: '<span class="pickup-pin__dot"></span>',
          iconSize: [34, 44],
          iconAnchor: [17, 42],
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        pickRef.current(position.lat, position.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    }
  }, [lat, lng, ready]);

  function recenter() {
    mapRef.current?.setView([PASTO_CENTER.lat, PASTO_CENTER.lng], MAP_ZOOM.start);
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setNotice("Tu navegador no permite ubicarte.");
      return;
    }
    setNotice("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!isInsidePasto(latitude, longitude)) {
          setNotice("Estás fuera de Pasto: toca el mapa para elegir el punto.");
          return;
        }
        setNotice(null);
        onPickRef.current(roundCoordinate(latitude), roundCoordinate(longitude));
        mapRef.current?.setView([latitude, longitude], 16);
      },
      () => setNotice("No pudimos obtener tu ubicación. Toca el mapa para elegir el punto."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <section className="pickup-map glass-map" aria-label="Mapa de Pasto">
      <div className="pickup-map__bar">
        <p className="pickup-map__hint">Toca el mapa para marcar dónde recogen a tu perro.</p>
        <div className="pickup-map__actions">
          <button type="button" className="pickup-map__button" onClick={useMyLocation}>
            Usar mi ubicación
          </button>
          <button type="button" className="pickup-map__button" onClick={recenter}>
            Centrar en Pasto
          </button>
        </div>
      </div>
      {failed ? (
        <p className="pickup-map__fallback" role="alert">
          No pudimos cargar el mapa. Escribe la latitud y la longitud a mano.
        </p>
      ) : (
        <div ref={containerRef} className="pickup-map__canvas" />
      )}
      {notice !== null ? (
        <p className="pickup-map__notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
