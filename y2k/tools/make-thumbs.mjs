/**
 * 把 ../image/verify1/*.webp 壓成網站用的尺寸。
 *   public/oc/full/NN.webp  最長邊 900px，拿來當桌布 / 大頭貼
 *   public/oc/icon/NN.png   96x96 置中裁切，拿來當視窗圖示
 * 執行： npm run thumbs
 */
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../image/verify1");
const FULL = path.resolve(here, "../public/oc/full");
const ICON = path.resolve(here, "../public/oc/icon");

await mkdir(FULL, { recursive: true });
await mkdir(ICON, { recursive: true });

const files = (await readdir(SRC)).filter((f) => f.endsWith(".webp"));
files.sort((a, b) => parseInt(a) - parseInt(b));

for (const file of files) {
  const n = path.basename(file, ".webp");
  const src = path.join(SRC, file);

  await sharp(src)
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(FULL, `${n}.webp`));

  await sharp(src)
    .resize(96, 96, { fit: "cover", position: "top" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ICON, `${n}.png`));
}

console.log(`done: ${files.length} images`);
