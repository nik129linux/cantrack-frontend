import { useEffect, useMemo, useRef } from "react";
import {
  AVENUE_JUNCTION,
  AVENUE_NORTHWEST,
  ISLAND_SIZE,
  STREET_EAST_JOIN,
  STREET_NORTHEAST,
  chain,
  headingSprite,
  makePolyline,
  offset,
  sampleAt,
  type Polyline,
} from "./paths.js";
import "./city.css";

type CarSpec = {
  color: "taxi" | "white" | "blue" | "green";
  route: "avenue" | "turn" | "east";
  speed: number;
  phase: number;
};

const CARS: CarSpec[] = [
  { color: "taxi", route: "avenue", speed: 62, phase: 0 },
  { color: "white", route: "turn", speed: 54, phase: 190 },
  { color: "blue", route: "east", speed: 58, phase: 40 },
  { color: "green", route: "avenue", speed: 50, phase: 330 },
  { color: "taxi", route: "turn", speed: 66, phase: 420 },
  { color: "white", route: "east", speed: 52, phase: 260 },
];

type PedestrianSpec = {
  row: number;
  side: "left" | "right";
  route: "avenue" | "turn";
  speed: number;
  phase: number;
};

const PEDESTRIANS: PedestrianSpec[] = [
  { row: 0, side: "right", route: "avenue", speed: 17, phase: 20 },
  { row: 2, side: "left", route: "avenue", speed: 15, phase: 300 },
  { row: 5, side: "right", route: "turn", speed: 16, phase: 120 },
  { row: 3, side: "left", route: "turn", speed: 14, phase: 380 },
  { row: 4, side: "right", route: "avenue", speed: 12, phase: 210 },
  { row: 7, side: "left", route: "turn", speed: 18, phase: 40 },
];

/** Up-right-facing and up-left-facing walking frames of every pedestrian row. */
const PEDESTRIAN_FRAMES = { ne: [0, 2], nw: [4, 6] } as const;

const CAR_WIDTH = 82;
const PEDESTRIAN_WIDTH = 27;
const WALKER_WIDTH = 123 * 0.23;
const DOG_WIDTH = 189 * 0.17;

const FADE_PX = 46;
const GAP_PX = 220;

function useRoutes() {
  return useMemo(() => {
    const turnPoints = chain(AVENUE_NORTHWEST.slice(0, AVENUE_JUNCTION + 1), STREET_NORTHEAST);
    const cars: Record<CarSpec["route"], Polyline> = {
      avenue: makePolyline(AVENUE_NORTHWEST),
      turn: makePolyline(turnPoints),
      east: makePolyline(chain(STREET_EAST_JOIN, STREET_NORTHEAST.slice(3))),
    };
    const sidewalks: Record<PedestrianSpec["route"], Record<PedestrianSpec["side"], Polyline>> = {
      avenue: {
        right: makePolyline(offset(AVENUE_NORTHWEST, 30, -18)),
        left: makePolyline(offset(AVENUE_NORTHWEST, -30, 18)),
      },
      turn: {
        right: makePolyline(offset(turnPoints, 30, -18)),
        left: makePolyline(offset(turnPoints, -30, 18)),
      },
    };
    return { cars, sidewalks, stroll: makePolyline(offset(STREET_NORTHEAST, 26, -16)) };
  }, []);
}

function fadeFor(distance: number, total: number): number {
  return Math.min(1, distance / FADE_PX, (total - distance) / FADE_PX);
}

/**
 * The animated city of Pasto: an isometric island with cars driving the
 * one-way streets, neighbours walking the sidewalks and the walker strolling
 * with the dog. Every entity is a positioned <img>; positions are written
 * straight to the DOM on each frame, so React never re-renders while it plays.
 */
export function CityScene({ label = "Mapa animado de Pasto" }: { label?: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const routes = useRoutes();
  const entityRefs = useRef<Array<HTMLElement | null>>([]);
  const imageRefs = useRef<Array<HTMLImageElement | null>>([]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) {
      return;
    }

    let scale = scene.clientWidth / ISLAND_SIZE.width || 1;
    const applyScale = () => {
      scale = scene.clientWidth / ISLAND_SIZE.width || 1;
      scene.style.setProperty("--scale", String(scale));
    };
    applyScale();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(applyScale);
    observer?.observe(scene);

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function place(index: number, x: number, y: number, opacity: number, flip = false) {
      const element = entityRefs.current[index];
      if (element === null || element === undefined) {
        return;
      }
      element.style.transform = `translate3d(${(x * scale).toFixed(1)}px, ${(y * scale).toFixed(1)}px, 0)`;
      element.style.zIndex = String(Math.round(y));
      element.style.opacity = opacity.toFixed(2);
      element.dataset.flip = flip ? "true" : "false";
    }

    function setImage(index: number, src: string) {
      const image = imageRefs.current[index];
      if (image !== null && image !== undefined && !image.src.endsWith(src)) {
        image.src = src;
      }
    }

    function frame(seconds: number) {
      let slot = 0;

      for (const car of CARS) {
        const line = routes.cars[car.route];
        const distance = (seconds * car.speed + car.phase) % (line.total + GAP_PX);
        if (distance > line.total) {
          place(slot, -300, -300, 0);
        } else {
          const at = sampleAt(line, distance);
          const facing = headingSprite(at.dx) === "ne" ? 0 : 1;
          const variant = facing + (Math.floor(distance / 90) % 2) * 2;
          setImage(slot, `/art/city/cars/${car.color}-${variant}.webp`);
          place(slot, at.x, at.y, fadeFor(distance, line.total));
        }
        slot += 1;
      }

      for (const person of PEDESTRIANS) {
        const line = routes.sidewalks[person.route][person.side];
        const distance = (seconds * person.speed + person.phase) % (line.total + GAP_PX);
        if (distance > line.total) {
          place(slot, -300, -300, 0);
        } else {
          const at = sampleAt(line, distance);
          const frames = PEDESTRIAN_FRAMES[headingSprite(at.dx)];
          const stride = Math.floor(seconds * 4 + person.phase) % 2;
          setImage(slot, `/art/city/people/p${person.row}-${frames[stride]}.webp`);
          const bob = Math.abs(Math.sin(seconds * 8 + person.phase)) * 1.6;
          place(slot, at.x, at.y - bob, fadeFor(distance, line.total));
        }
        slot += 1;
      }

      // The walker and the dog stroll up the cross street, pause, and come back.
      const stroll = routes.stroll;
      const pause = 80;
      const lap = (stroll.total + pause) * 2;
      const travelled = (seconds * 24 + 60) % lap;
      const outbound = travelled < stroll.total + pause;
      const along = outbound
        ? Math.min(travelled, stroll.total)
        : Math.max(stroll.total - (travelled - (stroll.total + pause)), 0);
      const resting = outbound ? travelled > stroll.total : along <= 0;
      const at = sampleAt(stroll, along);
      const legs = resting ? 0 : Math.floor(seconds * 3.2) % 2;
      const bounce = resting ? 0 : Math.abs(Math.sin(seconds * 6.4)) * 2.2;

      setImage(slot, "/art/characters/walker-walk.webp");
      place(slot, at.x, at.y - bounce, 1, !outbound);
      slot += 1;
      setImage(slot, `/art/characters/dog-walk-${legs === 0 ? "a" : "b"}.webp`);
      place(slot, at.x + (outbound ? 44 : -44), at.y + 6 - bounce * 0.6, 1, !outbound);
    }

    if (reduced) {
      frame(6);
      return () => observer?.disconnect();
    }

    let animationFrame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frame((now - start) / 1000);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
    };
  }, [routes]);

  const entities: Array<{ key: string; className: string; src: string; width: number; ring?: boolean }> = [
    ...CARS.map((car, index) => ({
      key: `car-${index}`,
      className: "city__entity--car",
      src: `/art/city/cars/${car.color}-0.webp`,
      width: CAR_WIDTH,
    })),
    ...PEDESTRIANS.map((person, index) => ({
      key: `person-${index}`,
      className: "city__entity--person",
      src: `/art/city/people/p${person.row}-0.webp`,
      width: PEDESTRIAN_WIDTH,
    })),
    {
      key: "walker",
      className: "city__entity--walker",
      src: "/art/characters/walker-walk.webp",
      width: WALKER_WIDTH,
      ring: true,
    },
    {
      key: "dog",
      className: "city__entity--dog",
      src: "/art/characters/dog-walk-a.webp",
      width: DOG_WIDTH,
    },
  ];

  return (
    <div ref={sceneRef} className="city" role="img" aria-label={label}>
      <img className="city__island" src="/art/city/island.webp" alt="" draggable={false} />
      {entities.map((entity, index) => (
        <span
          key={entity.key}
          ref={(element) => {
            entityRefs.current[index] = element;
          }}
          className={`city__entity ${entity.className}`}
        >
          {entity.ring === true ? <span className="city__ring" aria-hidden="true" /> : null}
          <img
            ref={(element) => {
              imageRefs.current[index] = element;
            }}
            className="city__sprite"
            style={{ ["--w" as string]: entity.width }}
            src={entity.src}
            alt=""
            draggable={false}
          />
        </span>
      ))}
    </div>
  );
}
