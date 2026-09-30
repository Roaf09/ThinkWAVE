/* FILE GUIDE:
 * server/src/utils/imageStore.js
 * Purpose: Shrink images before they touch DB/memory, store on local disk.
 * Free single-service: sharp + server/uploads, no R2 keys needed.
 * Long-run: same saveImage() name works later for R2/S3 — only this file changes.
 * Callers pass a dataURL (from builder/profile). We return a small URL string
 * like /uploads/abc123.jpg instead of a multi-MB base64 blob.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

export function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.warn("[uploads] could not create dir:", err?.message || err);
  }
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

export function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

/**
 * Compress a dataURL in place (no disk): PNG/camera photo -> small JPEG dataURL.
 * Safe for DB columns today: same shape (dataURL string), ~5-20x smaller.
 * Returns original string if tiny / not an image / sharp unavailable.
 */
export async function compressDataUrlImage(dataUrl, { maxWidth = 800, quality = 70 } = {}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  const originalBytes = Buffer.byteLength(parsed.base64, "base64");
  if (originalBytes < 20 * 1024) return dataUrl;
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(Buffer.from(parsed.base64, "base64"))
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (out.length >= originalBytes) return dataUrl;
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return dataUrl;
  }
}

/**
 * Compress a dataURL image to JPEG <=800px, save to uploads/, return URL.
 * Returns { url, bytesSaved } or { url: original } if not an image / sharp missing.
 */
export async function saveDataUrlImage(dataUrl, { prefix = "img", maxWidth = 800, quality = 70 } = {}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { url: dataUrl, bytesSaved: 0 };
  const originalBytes = Buffer.byteLength(parsed.base64, "base64");
  // Skip tiny icons — not worth re-encoding.
  if (originalBytes < 20 * 1024) return { url: dataUrl, bytesSaved: 0 };
  try {
    const { default: sharp } = await import("sharp");
    const input = Buffer.from(parsed.base64, "base64");
    const out = await sharp(input)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    ensureUploadDir();
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.jpg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), out);
    return { url: `/uploads/${name}`, bytesSaved: originalBytes - out.length };
  } catch (err) {
    console.warn("[uploads] sharp compress failed, keeping original:", err?.message || err);
    return { url: dataUrl, bytesSaved: 0 };
  }
}
