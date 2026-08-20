import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

const require = createRequire(import.meta.url);
await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));

const sourcePath = fileURLToPath(new URL("../../../public/aegis-mark.svg", import.meta.url));
const iconDirectory = fileURLToPath(new URL("../src-tauri/icons/", import.meta.url));
mkdirSync(iconDirectory, { recursive: true });

const source = readFileSync(sourcePath, "utf8")
  .replace('viewBox="0 0 160 190"', 'viewBox="-15 0 190 190"');
const renderer = new Resvg(source, {
  fitTo: { mode: "width", value: 256 },
  shapeRendering: 2,
});
const image = renderer.render();
const png = Buffer.from(image.asPng());
image.free();
renderer.free();

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(0, 6); // 256 px width
header.writeUInt8(0, 7); // 256 px height
header.writeUInt8(0, 8); // true colour
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);

writeFileSync(`${iconDirectory}icon.png`, png);
writeFileSync(`${iconDirectory}icon.ico`, Buffer.concat([header, png]));
console.log(`Generated original AEGIS Windows icon (${png.length} PNG bytes).`);
