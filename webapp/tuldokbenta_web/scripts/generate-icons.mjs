// scripts/generate-icons.mjs
//
// Rasterises public/multipos-icon.svg into the PNG fallbacks. The SVG is the
// only source of truth for the mark — edit it, then run `npm run icons`.
//
// The PNGs are committed so neither the Vite build nor the Vercel deploy needs
// sharp; it is a devDependency for this script alone.

import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public"
);
const source = path.join(publicDir, "multipos-icon.svg");

const targets = [
  { file: "favicon-32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "multipos-icon-512.png", size: 512 },
];

for (const { file, size } of targets) {
  await sharp(source, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, file));
  console.log(`wrote public/${file} (${size}x${size})`);
}
