import { parser } from "./babel.js";
import getBabelOptions, { Overrides } from "./_babel_options.js";

export { parser };

export function parse(source: string, options?: Overrides) {
  const babelOptions = getBabelOptions(options);
  babelOptions.plugins.push("jsx", "typescript");
  return parser.parse(source, babelOptions);
}
