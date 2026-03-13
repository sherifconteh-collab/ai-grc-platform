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

// Minimal valid .ico (1×1 px, 32-bit)
// ICO file header + directory + 1×1 BMP image data
const ICO_BYTES = Buffer.from([
  // ICO header
  0x00, 0x00, // reserved
  0x01, 0x00, // type: 1 = ICO
  0x01, 0x00, // image count: 1
  // ICONDIRENTRY
  0x01,       // width  = 1
  0x01,       // height = 1
  0x00,       // color count (0 = true color)
  0x00,       // reserved
  0x01, 0x00, // planes
  0x20, 0x00, // bits per pixel = 32
  0x28, 0x00, 0x00, 0x00, // size of image data = 40 bytes (BITMAPINFOHEADER only)
  0x16, 0x00, 0x00, 0x00, // offset of image data = 22 (6 header + 16 entry)
  // BITMAPINFOHEADER
  0x28, 0x00, 0x00, 0x00, // header size = 40
  0x01, 0x00, 0x00, 0x00, // width  = 1
  0x02, 0x00, 0x00, 0x00, // height = 2 (doubled for ICO: image + mask)
  0x01, 0x00,             // color planes = 1
  0x20, 0x00,             // bits per pixel = 32
  0x00, 0x00, 0x00, 0x00, // compression = none
  0x00, 0x00, 0x00, 0x00, // image size (0 = uncompressed)
  0x00, 0x00, 0x00, 0x00, // x pixels per meter
  0x00, 0x00, 0x00, 0x00, // y pixels per meter
  0x00, 0x00, 0x00, 0x00, // colors in table
  0x00, 0x00, 0x00, 0x00, // important colors
  // Pixel data: 1 RGBA pixel (white, fully opaque)
  0xFF, 0xFF, 0xFF, 0xFF,
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
