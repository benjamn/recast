# Changelog

## [0.24.1](https://github.com/benjamn/recast/compare/v0.24.0...v0.24.1) (2026-11-08)

### Bug Fixes

- keep `type` and `typeof` on Flow import specifiers when reprinting ([#1447](https://github.com/benjamn/recast/pull/1447))
- parenthesize `??` when it is combined with `||` or `&&` ([#1442](https://github.com/benjamn/recast/pull/1442))
- parenthesize update expressions in optional chains ([#1448](https://github.com/benjamn/recast/pull/1448))
- preserve import alias changes when reprinting ([#1445](https://github.com/benjamn/recast/pull/1445))
- reprint nodes whose children share source ranges ([#1445](https://github.com/benjamn/recast/pull/1445))
- respect the `ecmaVersion` option instead of hardcoding ES6 ([#1441](https://github.com/benjamn/recast/pull/1441))
- wrap dangling if consequents in braces when printing an outer else ([#1446](https://github.com/benjamn/recast/pull/1446))
- **printer:** preserve significant JSX whitespace around expressions when reprinting elements ([#1440](https://github.com/benjamn/recast/pull/1440))
- **types:** correct TypeScript declarations for per-context trailing comma options ([#1444](https://github.com/benjamn/recast/pull/1444))
