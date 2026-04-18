# Tier markers

Every backend source file declares its tier in the first line:

```js
// @tier: community
```

or

```js
// @tier: pro
```

## Rules

- The Community fork (this repo) **must not** require a `@tier: pro` file at runtime.
- Optional Pro features must use `safeRequire('./routes/foo')` so a missing module returns `null` instead of throwing.
- Frontend Pro pages live under `app/(pro)/...` and must be excluded from this fork's build.
- New AI providers, mobile push, and CMDB are Community-safe; RevenueCat IAP, AdMob, native iOS/Android source, and the four Pro dashboard pages are Pro-only.
