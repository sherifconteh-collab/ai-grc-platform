#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Creates placeholder build/icon.png and build/icon.ico when the real brand
 * assets are not yet present. The GitHub Actions release workflow calls this
 * script before running electron-builder so the build never fails due to a
 * missing icon file.
 *
 * electron-builder requires icons to be at least 256×256. This script
 * generates 512×512 placeholders using only Node.js built-ins (no native
 * image dependencies). The brand color is ControlWeave navy (#0D1B2A).
 *
 * For production builds, replace build/icon.png and build/icon.ico with the
 * official ControlWeave brand assets before running npm run dist:*.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const ICON_SIZE = 512;
const ICO_SIZE = 256; // ICO directory entry byte: 0 means exactly 256

// ControlWeave brand palette
const BG_R = 0x0D, BG_G = 0x1B, BG_B = 0x2A; // navy background
const FG_R = 0x2E, FG_G = 0x75, FG_B = 0xB6; // accent blue

// ── CRC-32 (required by the PNG spec) ────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG helpers ──────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generatePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit-depth 8, color-type 2 (RGB)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;

  // Build raw scanlines: filter byte 0 + RGB pixels per row.
  // Draw a centered hollow square accent on the navy background.
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  const center = size / 2;
  const blockSize = Math.floor(size / 8);

  for (let y = 0; y < size; y++) {
    const rowOff = y * rowBytes;
    raw[rowOff] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = rowOff + 1 + x * 3;
      // Draw a simple centered square as an accent mark
      const inSquare =
        x >= center - blockSize * 2 && x < center + blockSize * 2 &&
        y >= center - blockSize * 2 && y < center + blockSize * 2 &&
        !(x >= center - blockSize && x < center + blockSize &&
          y >= center - blockSize && y < center + blockSize);
      if (inSquare) {
        raw[px] = FG_R; raw[px + 1] = FG_G; raw[px + 2] = FG_B;
      } else {
        raw[px] = BG_R; raw[px + 1] = BG_G; raw[px + 2] = BG_B;
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── ICO helper (PNG-in-ICO, Vista+ format) ───────────────────────────────────
function generateIco(pngData256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1 = ICO
  header.writeUInt16LE(1, 4);   // image count

  const entry = Buffer.alloc(16);
  entry[0] = 0;                 // width: 0 means 256
  entry[1] = 0;                 // height: 0 means 256
  entry[2] = 0;                 // palette
  entry[3] = 0;                 // reserved
  entry.writeUInt16LE(1, 4);    // planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(pngData256.length, 8);  // image data size
  entry.writeUInt32LE(22, 12);  // offset (6 header + 16 entry)

  return Buffer.concat([header, entry, pngData256]);
}

// ── Validation helpers ────────────────────────────────────────────────────────
function readPngDimensions(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    // PNG signature: 137 80 78 71 13 10 26 10
    if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) return null;
    // IHDR chunk: 4-byte length + 4-byte type ('IHDR') + width(4) + height(4)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function isValidPng(filePath, minSize) {
  const dims = readPngDimensions(filePath);
  return dims !== null && dims.width >= minSize && dims.height >= minSize;
}

function isValidIco(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 22) return false;
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(6);
    fs.readSync(fd, buf, 0, 6, 0);
    // ICO header: reserved=0, type=1, image count≥1
    return buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1 && buf.readUInt16LE(4) >= 1;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
fs.mkdirSync(BUILD_DIR, { recursive: true });

const pngPath = path.join(BUILD_DIR, 'icon.png');
const icoPath = path.join(BUILD_DIR, 'icon.ico');

const pngNeeded = !isValidPng(pngPath, 256);
const icoNeeded = !isValidIco(icoPath);

if (pngNeeded) {
  const png = generatePng(ICON_SIZE);
  fs.writeFileSync(pngPath, png);
  console.log(`Created placeholder (${ICON_SIZE}×${ICON_SIZE}): ${pngPath}`);
} else {
  console.log(`Valid icon already exists, skipping: ${pngPath}`);
}

if (icoNeeded) {
  const icoPng = generatePng(ICO_SIZE);
  fs.writeFileSync(icoPath, generateIco(icoPng));
  console.log(`Created placeholder ICO (${ICO_SIZE}×${ICO_SIZE}): ${icoPath}`);
} else {
  console.log(`Valid icon already exists, skipping: ${icoPath}`);
}
