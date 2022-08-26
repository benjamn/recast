import { parse as babelParse } from "@babel/parser";
import getBabelOptions, { Overrides } from "./_babel_options";

export function parse(source: string, options?: Overrides) {
  const babelOptions = getBabelOptions(options);
  babelOptions.plugins.push("jsx", "typescript");
  return babelParse(source, babelOptions);
}
