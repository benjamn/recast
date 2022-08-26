import getBabelOptions, { Overrides } from "./_babel_options";

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
  return require("babylon").parse(source, babelOptions);
}
