# Changelog

## [0.24.3](https://github.com/benjamn/recast/compare/v0.24.2...v0.24.3) (2026-11-09)


### Bug Fixes

* preserve dangling comments when reprinting containers ([#1450](https://github.com/benjamn/recast/issues/1450)) ([f993267](https://github.com/benjamn/recast/commit/f99326787f7959c8ce497dca324fe8c0c2c0a054))
* preserve multiline template values when reprinting changed blocks ([#1449](https://github.com/benjamn/recast/issues/1449)) ([813e822](https://github.com/benjamn/recast/commit/813e8221136a8b93ddbf364639288c7bc12bb70d))

## [0.24.2](https://github.com/benjamn/recast/compare/v0.24.1...v0.24.2) (2026-11-08)


### Bug Fixes

* don't parenthesize comments on object destructuring assignments ([#1129](https://github.com/benjamn/recast/issues/1129)) ([1947cde](https://github.com/benjamn/recast/commit/1947cde07915d7f699faa8a7508d02aaebadcdca))
* don't stack source indentation before JSX closing tags ([#1454](https://github.com/benjamn/recast/issues/1454)) ([96747ce](https://github.com/benjamn/recast/commit/96747cec11fc44c02b149f1e7412ab2faecb8b6f))
* print newline after "&lt;" when first type parameter has a leading line comment ([#1453](https://github.com/benjamn/recast/issues/1453)) ([9535a21](https://github.com/benjamn/recast/commit/9535a218e358cc6f2bcab605e39ffb59e38bfa3a))

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
