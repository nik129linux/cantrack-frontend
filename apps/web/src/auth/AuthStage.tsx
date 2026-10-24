import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AuthMood } from "./AuthMood.js";

/** Natural size in px of every sprite, so each pose keeps the same scale. */
const DOG_POSES = {
  front: [147, 207],
  sit: [138, 207],
  lie: [182, 147],
  jump: [153, 182],
  tilt: [142, 192],
  happy: [148, 199],
  lick: [154, 184],
  surprised: [146, 191],
  sad: [146, 172],
  sleep: [197, 117],
  yawn: [184, 182],
  listen: [127, 181],
} as const;

const WALKER_POSES = {
  stand: [124, 344],
  wave: [150, 353],
  open: [223, 349],
  scratch: [150, 349],
  cheer: [173, 297],
  thumbs: [138, 353],
  point: [173, 349],
  think: [108, 345],
  surprised: [169, 347],
  walk: [123, 355],
  sit: [193, 269],
  yawn: [113, 344],
} as const;

type DogPose = keyof typeof DOG_POSES;
type WalkerPose = keyof typeof WALKER_POSES;

type Speaker = "dog" | "walker";

type Scene = { dog: DogPose; walker: WalkerPose; line: string; from: Speaker };

const MOOD_SCENES: Record<AuthMood, Scene> = {
  idle: { dog: "front", walker: "wave", line: "¡Hola! Bienvenido a CanTrack", from: "walker" },
  email: { dog: "tilt", walker: "think", line: "¿Cuál es tu correo?", from: "walker" },
  password: { dog: "sleep", walker: "stand", line: "Shh… yo no miro", from: "dog" },
  owner: { dog: "happy", walker: "thumbs", line: "¡Guau! ¡Mi humano favorito!", from: "dog" },
  walker: { dog: "jump", walker: "cheer", line: "¡Vamos de paseo!", from: "walker" },
  reset: { dog: "sit", walker: "open", line: "Tranquilo, te ayudamos", from: "walker" },
  submitting: { dog: "listen", walker: "walk", line: "Un momento…", from: "walker" },
  error: { dog: "sad", walker: "surprised", line: "Uy, revisa tus datos", from: "walker" },
  success: { dog: "happy", walker: "cheer", line: "¡Listo!", from: "dog" },
};

/** Calm poses the pair drifts through while the user is not doing anything. */
const IDLE_SCENES: Scene[] = [
  MOOD_SCENES.idle,
  { dog: "happy", walker: "stand", line: "Paseos seguros para tu peludo", from: "walker" },
  { dog: "tilt", walker: "thumbs", line: "Cada paseo cuenta", from: "walker" },
  { dog: "lick", walker: "open", line: "¿Listo para pasear?", from: "dog" },
];

const DOG_TAPS: Array<{ pose: DogPose; line: string }> = [
  { pose: "happy", line: "¡Guau!" },
  { pose: "lick", line: "¡Ñam!" },
  { pose: "jump", line: "¡Guau guau!" },
  { pose: "yawn", line: "Aaaah… ¡guau!" },
  { pose: "surprised", line: "¿Eh? ¿Paseo?" },
  { pose: "lie", line: "Me acuesto aquí" },
];

const WALKER_TAPS: Array<{ pose: WalkerPose; line: string }> = [
  { pose: "wave", line: "¡Hola, hola!" },
  { pose: "thumbs", line: "¡Todo bajo control!" },
  { pose: "point", line: "El formulario está ahí" },
  { pose: "cheer", line: "¡Vamos!" },
  { pose: "scratch", line: "Mmm… ¿dónde dejé la correa?" },
];

const IDLE_STEP_MS = 5200;
const NUDGE_MS = 2600;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function spriteStyle([width, height]: readonly [number, number]): CSSProperties {
  return { "--nw": width, "--nh": height } as CSSProperties;
}

type AuthStageProps = {
  mood: AuthMood;
};

/**
 * The welcome illustration: a walker and a white dog that follow the pointer,
 * react to what the user is doing in the form (`mood`) and answer to taps.
 * Purely decorative: the speech bubble is hidden from assistive technology.
 */
export function AuthStage({ mood }: AuthStageProps) {
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [idleStep, setIdleStep] = useState(0);
  const [nudge, setNudge] = useState<Partial<Scene> | null>(null);
  const nudgeTimer = useRef<number | undefined>(undefined);
  const dogTaps = useRef(0);
  const walkerTaps = useRef(0);

  // Preload every sprite so a pose swap never flashes an empty frame.
  useEffect(() => {
    for (const pose of Object.keys(DOG_POSES)) {
      new Image().src = `/art/characters/dog-${pose}.webp`;
    }
    for (const pose of Object.keys(WALKER_POSES)) {
      new Image().src = `/art/characters/walker-${pose}.webp`;
    }
  }, []);

  // Idle: drift through calm poses while nothing else is going on.
  useEffect(() => {
    if (mood !== "idle" || reducedMotion || nudge !== null) {
      return;
    }
    const id = window.setInterval(() => {
      setIdleStep((step) => (step + 1) % IDLE_SCENES.length);
    }, IDLE_STEP_MS);
    return () => window.clearInterval(id);
  }, [mood, reducedMotion, nudge]);

  // Pointer parallax: the pair leans toward the cursor.
  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null || reducedMotion) {
      return;
    }
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = (event.clientY / window.innerHeight) * 2 - 1;
        stage.style.setProperty("--px", x.toFixed(3));
        stage.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

  const holdNudge = useCallback((next: Partial<Scene>) => {
    window.clearTimeout(nudgeTimer.current);
    setNudge(next);
    nudgeTimer.current = window.setTimeout(() => setNudge(null), NUDGE_MS);
  }, []);

  function petDog() {
    const tap = DOG_TAPS[dogTaps.current % DOG_TAPS.length];
    dogTaps.current += 1;
    if (tap !== undefined) {
      holdNudge({ dog: tap.pose, line: tap.line, from: "dog" });
    }
  }

  function greetWalker() {
    const tap = WALKER_TAPS[walkerTaps.current % WALKER_TAPS.length];
    walkerTaps.current += 1;
    if (tap !== undefined) {
      holdNudge({ walker: tap.pose, line: tap.line, from: "walker" });
    }
  }

  const base = mood === "idle" ? (IDLE_SCENES[idleStep] ?? MOOD_SCENES.idle) : MOOD_SCENES[mood];
  const dogPose = nudge?.dog ?? base.dog;
  const walkerPose = nudge?.walker ?? base.walker;
  const line = nudge?.line ?? base.line;
  const from = nudge?.from ?? base.from;

  return (
    <div ref={stageRef} className="auth-stage" data-mood={mood}>
      <p className="auth-stage__bubble" data-from={from} aria-hidden="true" key={line}>
        {line}
      </p>
      <div className="auth-stage__cast">
        <button
          type="button"
          className="auth-char auth-char--walker"
          aria-label="Saludar al cuidador"
          onClick={greetWalker}
        >
          <span className="auth-char__shadow" aria-hidden="true" />
          <span className="auth-char__body">
            <img
              key={walkerPose}
              className="auth-char__sprite"
              style={spriteStyle(WALKER_POSES[walkerPose])}
              src={`/art/characters/walker-${walkerPose}.webp`}
              alt=""
              draggable={false}
            />
          </span>
        </button>
        <button
          type="button"
          className="auth-char auth-char--dog"
          aria-label="Acariciar al perro"
          onClick={petDog}
        >
          <span className="auth-char__shadow" aria-hidden="true" />
          <span className="auth-char__body">
            <img
              key={dogPose}
              className="auth-char__sprite"
              style={spriteStyle(DOG_POSES[dogPose])}
              src={`/art/characters/dog-${dogPose}.webp`}
              alt=""
              draggable={false}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
