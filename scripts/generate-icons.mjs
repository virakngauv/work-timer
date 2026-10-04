import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

// Use the image tooling shipped with the locked Next.js install.
const require = createRequire(import.meta.url);
const sharp = require(
  require.resolve("sharp", { paths: [require.resolve("next")] }),
);
const master = await readFile(new URL("../app/icon.svg", import.meta.url));
const sizes = [16, 32];
const images = await Promise.all(
  sizes.map((size) => sharp(master).resize(size, size).png().toBuffer()),
);

// ICO directory followed by two PNG image entries (not a renamed PNG).
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(
  new URL("../app/favicon.ico", import.meta.url),
  Buffer.concat([header, ...images]),
);
await sharp(master, { density: 576 })
  .resize(180, 180)
  .flatten({ background: "#fff" })
  .png()
  .toFile(new URL("../app/apple-icon.png", import.meta.url).pathname);

// Review board: actual raster sizes and enlarged master on both chrome colors.
const embedded = master.toString("base64");
const panels = ["#f4f8f5", "#202124"].map((background, index) => {
  const x = index * 320;
  const foreground = index === 0 ? "#102019" : "#fff";
  return `<rect x="${x}" width="320" height="230" fill="${background}"/>
    <g fill="${foreground}" font-family="sans-serif" font-size="14">
      <text x="${x + 24}" y="28">${index === 0 ? "Light" : "Dark"} browser chrome</text>
      <text x="${x + 24}" y="204">16px</text><text x="${x + 80}" y="204">32px</text>
      <text x="${x + 162}" y="204">128px preview</text>
    </g>
    <image x="${x + 24}" y="100" width="16" height="16" href="data:image/png;base64,${images[0].toString("base64")}"/>
    <image x="${x + 80}" y="92" width="32" height="32" href="data:image/png;base64,${images[1].toString("base64")}"/>
    <image x="${x + 162}" y="44" width="128" height="128" href="data:image/svg+xml;base64,${embedded}"/>`;
});
await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="230">${panels.join("")}</svg>`,
  ),
)
  .png()
  .toFile(new URL("../docs/favicon-preview.png", import.meta.url).pathname);
