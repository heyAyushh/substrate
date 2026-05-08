import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  HtmlInCanvas,
  type HtmlInCanvasOnPaint,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FILM_WIDTH = 1920;
export const FILM_HEIGHT = 1080;
export const FILM_FPS = 30;
export const TOTAL_FRAMES = 1667;

const FRAME_SAFE_X = 250;
const FRAME_SAFE_TOP = 170;
const FRAME_SAFE_BOTTOM = 160;
const MATRIX_COLUMN_COUNT = 42;
const MATRIX_GLYPH_COUNT = 32;
const BEAT_FRAMES = 15;
const FAST_BEAT_FRAMES = 8;
const GLITCH_WINDOW_FRAMES = 3;
const SCENE_FADE_FRAMES = 30;
const SHADOW_STRENGTH = 0.94;
const GATE_WIDTH = 560;
const GATE_HEIGHT = 760;
const DIGITAL_ALPHABET = "01{}[]<>/|#*$trustsubstrateagentreceiptstakeproofscope";

type Scene = {
  readonly start: number;
  readonly duration: number;
  readonly marker: string;
  readonly headline: string;
  readonly lower: string;
  readonly mode: "problem" | "protocol" | "builder" | "network" | "final";
};

const scenes: readonly Scene[] = [
  {
    start: 0,
    duration: 330,
    marker: "00 / WAKE",
    headline: "AI agents are becoming economic actors.",
    lower: "They call tools, sign messages, and move value while humans are offline.",
    mode: "problem",
  },
  {
    start: 330,
    duration: 315,
    marker: "01 / BREAK",
    headline: "A wallet proves a key. It does not prove the job.",
    lower: "Developers need scoped authority and receipts that survive the app.",
    mode: "problem",
  },
  {
    start: 645,
    duration: 340,
    marker: "02 / SUBSTRATE",
    headline: "Trust Substrate turns every agent action into evidence.",
    lower: "Identity, delegation, receipts, reputation, stake, and disputes on Solana.",
    mode: "protocol",
  },
  {
    start: 985,
    duration: 320,
    marker: "03 / BUILD",
    headline: "For builders, blind keys become bounded programs.",
    lower: "Grant a scope. Execute the task. Replay the receipt. Challenge the history.",
    mode: "builder",
  },
  {
    start: 1305,
    duration: 362,
    marker: "04 / MAINNET READY",
    headline: "When agents cross apps, trust can follow.",
    lower: "Trust Substrate is a production-ready trust layer for autonomous agents.",
    mode: "final",
  },
];

const rainColumns = Array.from({ length: MATRIX_COLUMN_COUNT }, (_, column) => {
  const glyphs = Array.from({ length: MATRIX_GLYPH_COUNT }, (_, glyph) => {
    const index = (column * 13 + glyph * 17) % DIGITAL_ALPHABET.length;
    return DIGITAL_ALPHABET[index];
  });

  return {
    glyphs,
    left: `${(column / MATRIX_COLUMN_COUNT) * 100}%`,
    speed: 0.34 + (column % 8) * 0.055,
    delay: column * 29,
    opacity: 0.12 + (column % 6) * 0.035,
  };
});

const canvasPaint: HtmlInCanvasOnPaint = ({ canvas, element, elementImage }) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D context for film canvas");
  }

  ctx.reset?.();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "blur(18px) saturate(1.3) contrast(1.18)";
  const transform = ctx.drawElementImage(elementImage, -16, -12, canvas.width + 32, canvas.height + 24);

  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.42;
  ctx.filter = "blur(1px) brightness(1.14)";
  ctx.drawElementImage(elementImage, 0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.16;
  ctx.filter = "contrast(1.8)";
  ctx.drawElementImage(elementImage, 12, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.1;
  ctx.drawElementImage(elementImage, -10, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.13;
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = "none";
  for (let y = 0; y < canvas.height; y += 6) {
    ctx.fillStyle = y % 18 === 0 ? "rgba(245,255,246,0.15)" : "rgba(80,255,110,0.055)";
    ctx.fillRect(0, y, canvas.width, 1);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  element.style.transform = transform.toString();
};

export function ManifestoFilm() {
  return (
    <AbsoluteFill className="film">
      <Audio src={staticFile("generated/navras-trust-substrate-mix.mp3")} volume={0.92} />
      <Atmosphere />
      <CanvasSignal />
      <PracticalLight />
      <ProofGate />
      {scenes.map((scene) => (
        <Sequence durationInFrames={scene.duration} from={scene.start} key={scene.marker}>
          <SceneFrame scene={scene} />
        </Sequence>
      ))}
      <FilmGrain />
      <Timecode />
    </AbsoluteFill>
  );
}

function CanvasSignal() {
  return (
    <AbsoluteFill className="canvas-signal">
      <HtmlInCanvas width={FILM_WIDTH} height={FILM_HEIGHT} onPaint={canvasPaint} style={{ height: FILM_HEIGHT, width: FILM_WIDTH }}>
        <MatrixRain />
      </HtmlInCanvas>
    </AbsoluteFill>
  );
}

function MatrixRain() {
  const frame = useCurrentFrame();
  const beat = getBeat(frame);
  const surge = interpolate(frame, [1245, 1420], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div className="matrix-rain-stage" style={{ "--beat": beat, "--surge": surge } as React.CSSProperties}>
      {rainColumns.map((column, index) => (
        <div
          className="rain-column"
          key={index}
          style={
            {
              "--column-left": column.left,
              "--column-opacity": column.opacity,
              transform: `translate3d(0, ${((frame * column.speed + column.delay) % 1240) - 1120}px, 0)`,
            } as React.CSSProperties
          }
        >
          {column.glyphs.map((glyph, glyphIndex) => (
            <span key={`${glyph}-${glyphIndex}`}>{glyph}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Atmosphere() {
  const frame = useCurrentFrame();
  const beat = getBeat(frame);
  const slow = Math.sin(frame / 70) * 0.5 + 0.5;
  const fault = frame % 113 < GLITCH_WINDOW_FRAMES ? 1 : 0;

  return (
    <AbsoluteFill className="atmosphere" style={{ "--beat": beat, "--fault": fault, "--slow": slow } as React.CSSProperties}>
      <div className="deep-black" />
      <div className="green-fog" />
      <div className="screen-vignette" />
      <div className="scanlines" />
      <div className="chromatic-split split-a" />
      <div className="chromatic-split split-b" />
    </AbsoluteFill>
  );
}

function PracticalLight() {
  const frame = useCurrentFrame();
  const beat = getBeat(frame);
  const drift = Math.sin(frame / 48) * 26;
  const lift = Math.cos(frame / 61) * 12;

  return (
    <AbsoluteFill className="practical-light">
      <div className="back-beam" style={{ opacity: 0.32 + beat * 0.08, transform: `translate3d(${drift}px, ${lift}px, 0)` }} />
      <div className="floor-reflection" style={{ opacity: 0.34 + beat * 0.08 }} />
      <div className="shadow-bowl" />
    </AbsoluteFill>
  );
}

function ProofGate() {
  const frame = useCurrentFrame();
  const beat = getBeat(frame);
  const push = interpolate(frame, [0, TOTAL_FRAMES], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const open = interpolate(frame, [560, 725, 1280, 1465], [0.18, 0.72, 0.72, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill className="proof-gate-layer">
      <div
        className="proof-gate"
        style={
          {
            "--beat": beat,
            "--open": open,
            height: GATE_HEIGHT,
            transform: `translate3d(-50%, -50%, 0) scale(${push})`,
            width: GATE_WIDTH,
          } as React.CSSProperties
        }
      >
        <div className="gate-edge edge-left" />
        <div className="gate-edge edge-right" />
        <div className="gate-core" />
        <div className="gate-horizon" />
      </div>
    </AbsoluteFill>
  );
}

function SceneFrame({ scene }: { readonly scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = interpolate(frame, [0, SCENE_FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const outro = interpolate(frame, [scene.duration - SCENE_FADE_FRAMES, scene.duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = intro * outro;
  const settle = interpolate(frame, [0, fps * 1.4], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const scale = interpolate(frame, [0, scene.duration], [0.985, 1.015], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <section
      className={`scene scene-${scene.mode}`}
      style={
        {
          "--safe-x": `${FRAME_SAFE_X}px`,
          "--safe-top": `${FRAME_SAFE_TOP}px`,
          "--safe-bottom": `${FRAME_SAFE_BOTTOM}px`,
          opacity,
          transform: `translate3d(0, ${settle}px, 0) scale(${scale})`,
        } as React.CSSProperties
      }
    >
      <div className="scene-marker">{scene.marker}</div>
      <div className="copy-stack">
        <h1>{scene.headline}</h1>
        <p>{scene.lower}</p>
      </div>
    </section>
  );
}

function FilmGrain() {
  const frame = useCurrentFrame();
  const offset = (frame % 6) * 17;

  return (
    <AbsoluteFill className="film-grain-layer">
      <div className="grain-noise" style={{ transform: `translate3d(${-offset}px, ${offset * 0.6}px, 0)` }} />
      <div className="accessibility-scrim" style={{ opacity: SHADOW_STRENGTH }} />
    </AbsoluteFill>
  );
}

function Timecode() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = Math.floor(frame / fps);

  return (
    <div className="timecode">
      <span>TRUST SUBSTRATE</span>
      <span>{String(seconds).padStart(2, "0")}</span>
    </div>
  );
}

function getBeat(frame: number) {
  const pulse = 1 - Math.min(1, (frame % BEAT_FRAMES) / FAST_BEAT_FRAMES);
  return Math.pow(pulse, 2);
}
