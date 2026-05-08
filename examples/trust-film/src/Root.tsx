import React from "react";
import { Composition } from "remotion";
import { ManifestoFilm, FILM_FPS, FILM_HEIGHT, FILM_WIDTH, TOTAL_FRAMES } from "./TrustSubstrateManifesto";
import "./style.css";

export function RemotionRoot() {
  return (
    <Composition
      id="TrustSubstrateManifesto"
      component={ManifestoFilm}
      durationInFrames={TOTAL_FRAMES}
      fps={FILM_FPS}
      width={FILM_WIDTH}
      height={FILM_HEIGHT}
    />
  );
}
