import { parser } from "./babel.js";
import getBabelOptions, { Overrides } from "./_babel_options.js";

// This module is suitable for passing as options.parser when calling
// recast.parse to process TypeScript code:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/typescript")
//   });
//
export function parse(source: string, options?: Overrides) {
  const babelOptions = getBabelOptions(options);
  babelOptions.plugins.push("typescript");
  return parser.parse(source, babelOptions);
}
