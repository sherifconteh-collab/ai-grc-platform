# Dependencies

## Backend

- Pin transitive vulns via `overrides` in `backend/package.json`. Current overrides: `node-forge >= 1.4.0`, `apn → jsonwebtoken ^9.0.2`, `path-to-regexp` (express + router), `follow-redirects`, `@xmldom/xmldom`, `socket.io-parser`, `yauzl`.
- `apn` and `firebase-admin` are `optionalDependencies` (mobile push). Routes that import them should use `safeRequire`.
- Always check the GH advisory DB before adding a new dependency.
- After any package.json change, regenerate the lockfile and run `npm audit --audit-level=moderate` (must exit 0).

## Frontend

- TypeScript is at v6; openapi-typescript@7 has a peer-dep conflict resolved by `frontend/.npmrc` (`legacy-peer-deps=true`).
- ESLint cannot be upgraded past v9.7 because `eslint-plugin-react` (via `eslint-config-next`) caps at v9.
