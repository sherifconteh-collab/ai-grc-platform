// @tier: community
const path = require('path');

// Where uploaded files are stored. Defaults to backend/uploads. The desktop
// app sets UPLOADS_DIR to the user's data folder: its install directory is
// read-only (AppImage, signed macOS bundle, Program Files) and is replaced by
// every update.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

module.exports = { UPLOADS_DIR };
