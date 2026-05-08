import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = process.env.NAVRAS_SOURCE ?? "/Users/ay/Downloads/Navras.mp3";
const output = resolve("public/generated/navras-trust-substrate-mix.mp3");
const crossfadeSeconds = 0.45;

mkdirSync(dirname(output), { recursive: true });

const filter = [
  "[0:a]atrim=start=45:end=80,asetpts=PTS-STARTPTS,afade=t=out:st=34.55:d=0.45[a0]",
  "[0:a]atrim=start=480:end=501,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.45[a1]",
  `[a0][a1]acrossfade=d=${crossfadeSeconds}:c1=tri:c2=tri,alimiter=limit=0.96,volume=0.95[a]`,
].join(";");

const result = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-filter_complex",
    filter,
    "-map",
    "[a]",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    output,
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Prepared audio mix: ${output}`);
