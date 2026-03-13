#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Creates placeholder build/icon.png and build/icon.ico when the real brand
 * assets are not yet present. The GitHub Actions release workflow calls this
 * script before running electron-builder so the build never fails due to a
 * missing icon file.
 *
 * For production builds, replace build/icon.png and build/icon.ico with the
 * official ControlWeave brand assets before running npm run dist:*.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BUILD_DIR = path.join(__dirname, '..', 'build');

// Minimal 1×1 white PNG (valid PNG, 67 bytes)
const PNG_1X1_WHITE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Minimal valid .ico (1×1 px, 32-bit BGRA, with correct AND mask)
// Structure: ICONDIR (6) + ICONDIRENTRY (16) + BITMAPINFOHEADER (40)
//            + XOR pixel data (4) + AND mask row (4) = 70 bytes total
const ICO_BYTES = Buffer.from([
  // ICONDIR header (6 bytes)
  0x00, 0x00,             // reserved = 0
  0x01, 0x00,             // type: 1 = ICO
  0x01, 0x00,             // image count: 1
  // ICONDIRENTRY (16 bytes)
  0x01,                   // width  = 1 px
  0x01,                   // height = 1 px
  0x00,                   // colorCount = 0 (true color)
  0x00,                   // reserved
  0x01, 0x00,             // planes = 1
  0x20, 0x00,             // bitCount = 32
  0x30, 0x00, 0x00, 0x00, // bytesInRes = 48 (40 header + 4 pixel + 4 mask)
  0x16, 0x00, 0x00, 0x00, // imageOffset = 22 (6 header + 16 entry)
  // BITMAPINFOHEADER (40 bytes)
  0x28, 0x00, 0x00, 0x00, // biSize = 40
  0x01, 0x00, 0x00, 0x00, // biWidth = 1
  0x02, 0x00, 0x00, 0x00, // biHeight = 2 (height × 2 per ICO spec: XOR + AND)
  0x01, 0x00,             // biPlanes = 1
  0x20, 0x00,             // biBitCount = 32
  0x00, 0x00, 0x00, 0x00, // biCompression = BI_RGB (none)
  0x08, 0x00, 0x00, 0x00, // biSizeImage = 8 (4 pixel + 4 mask)
  0x00, 0x00, 0x00, 0x00, // biXPelsPerMeter
  0x00, 0x00, 0x00, 0x00, // biYPelsPerMeter
  0x00, 0x00, 0x00, 0x00, // biClrUsed
  0x00, 0x00, 0x00, 0x00, // biClrImportant
  // XOR pixel data: 1 pixel BGRA (white, fully opaque) — 4 bytes
  0xFF, 0xFF, 0xFF, 0xFF,
  // AND mask: 1 row padded to DWORD boundary (0 = opaque) — 4 bytes
  0x00, 0x00, 0x00, 0x00,
]);

function ensureIcon(filename, data) {
  const dest = path.join(BUILD_DIR, filename);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, data);
    console.log(`Created placeholder: ${dest}`);
  } else {
    console.log(`Icon already exists, skipping: ${dest}`);
  }
}

fs.mkdirSync(BUILD_DIR, { recursive: true });
ensureIcon('icon.png', Buffer.from(PNG_1X1_WHITE_B64, 'base64'));
ensureIcon('icon.ico', ICO_BYTES);
