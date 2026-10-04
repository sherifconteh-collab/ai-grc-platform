# Dependencies

## Backend

- Pin transitive vulns via `overrides` in `backend/package.json`. Current overrides include `path-to-regexp` (express + router), `follow-redirects`, `@xmldom/xmldom`, `socket.io-parser`, `yauzl`.
- `firebase-admin` is an `optionalDependency` (Android push); routes that import it should use `safeRequire`. iOS push uses Node `http2` plus `jsonwebtoken` in `services/pushService.js`, not the `apn` package (its `node-forge` dependency has an unpatched high-severity advisory).
- Always check the GH advisory DB before adding a new dependency.
- After any package.json change, regenerate the lockfile and run `npm audit --audit-level=moderate` (must exit 0).

## Frontend

- TypeScript is at v6; openapi-typescript@7 has a peer-dep conflict resolved by `frontend/.npmrc` (`legacy-peer-deps=true`).
- ESLint is at v10; `eslint-config-next@^16.2.4` (Next.js 16) supports ESLint 10. `legacy-peer-deps=true` in `.npmrc` handles any residual peer-dep conflicts.
