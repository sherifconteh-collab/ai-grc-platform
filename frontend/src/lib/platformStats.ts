/**
 * Single source of truth for the platform-scale numbers shown on the
 * marketing site (frameworks/controls/crosswalks/stack versions).
 *
 * README.md states the same numbers in prose. `scripts/check-readme-website-sync.js`
 * parses both this file and README.md and fails CI if they diverge — so
 * update both together, or intentionally update one and let the check tell
 * you what else moved.
 */

export const FRAMEWORKS_COUNT = 39;
export const CONTROLS_COUNT_LABEL = '2,800+';
export const CROSSWALKS_COUNT_LABEL = '3,100+';

export const NODE_VERSION_LABEL = '24+';
export const POSTGRES_VERSION_LABEL = '17+';

export const ROUTE_MODULES_COUNT = 85;
export const MIGRATIONS_COUNT = 172;
export const MCP_TOOLS_COUNT = 21;
