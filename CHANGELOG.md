# Changelog

## [0.24.1](https://github.com/benjamn/recast/compare/v0.24.0...v0.24.1) (2026-11-08)


### Bug Fixes

* parenthesize ?? when it is combined with || or && ([202d1b7](https://github.com/benjamn/recast/commit/202d1b74061154126234964e2c5205cf0f413931))
* parenthesize `??` when it is combined with `||` or `&&` ([ed67bcf](https://github.com/benjamn/recast/commit/ed67bcfcd1f3c009b2836751038ba0ce4fd88818))
* preserve import alias changes when reprinting ([3ebb7af](https://github.com/benjamn/recast/commit/3ebb7af4112164b705dcfd384fff8139f8b6527b))
* **printer:** preserve significant JSX whitespace around expressions when reprinting elements ([ea0e976](https://github.com/benjamn/recast/commit/ea0e97676b15de6e8ef3dd65ec1aabb6f0a0dff2))
* **printer:** preserve significant JSX whitespace around expressions when reprinting elements ([acb8883](https://github.com/benjamn/recast/commit/acb88837bfd4dd62c8df1b462b79e92a180b1234))
* reprint import specifiers when alias syntax changes ([2ea5abb](https://github.com/benjamn/recast/commit/2ea5abb09d4ba054078cccc45241cda5232e1f26))
* reprint nodes whose children share source ranges ([647f792](https://github.com/benjamn/recast/commit/647f792163bc0baf7bd459ef2cf44d638aba0908))
* respect the ecmaVersion option instead of hardcoding ES6 ([a8c182a](https://github.com/benjamn/recast/commit/a8c182a0c9285daa735ff02637efc0430571d1f6))
* respect the ecmaVersion option instead of hardcoding ES6 ([cc71e00](https://github.com/benjamn/recast/commit/cc71e00cd8142a1801ae4c6d46f989977c78231f))
