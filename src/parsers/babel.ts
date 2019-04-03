import { parse as babelParse } from "@babel/parser";
import getBabelOptions, { Overrides } from "./_babel_options";

type BabelParser = { parse: typeof babelParse };

// Prefer the new @babel/parser package, but fall back to babylon if
// that's what's available.
export const parser = function (): BabelParser {
  try {
    return require("@babel/parser");
  } catch (e) {
    return require("babylon");
  }
}();

// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Babel:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/babel")
//   });
//
export function parse(source: string, options?: Overrides) {
  const babelOptions = getBabelOptions(options);
  babelOptions.plugins.push("jsx", "flow");
  return parser.parse(source, babelOptions);
};
