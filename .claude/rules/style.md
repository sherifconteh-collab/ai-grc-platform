# Coding style

- Backend: CommonJS (`require` / `module.exports`), 2-space indent, single quotes.
- Frontend: ES modules, TypeScript strict, single quotes, 2-space indent.
- Prefer `async/await` over raw promise chains.
- Prefer `Array.prototype.map/filter/reduce` over `for` loops when readable.
- Use `const` by default; `let` only when reassignment is required.
- Function names: `camelCase`. Constants: `SCREAMING_SNAKE_CASE`. Components: `PascalCase`.
- File names: backend uses `camelCase.js`; frontend uses `PascalCase.tsx` for components and `camelCase.ts` for utilities.
