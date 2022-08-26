import { Options } from "./options";
import { parse as pureParse } from "./pure-parser";
import { normalize as normalizeOptions } from "./options";

export function parse(source: string, options?: Partial<Options>) {
  options = normalizeOptions({
    parser: require("../parsers/esprima"),
    ...options,
  });
  let original = options.parser.parse.bind(options.parser);
  options.parser.parse = (source: string, options: any) => {
    const ast = original(source, options);
    // Use ast.tokens if possible, and otherwise fall back to the Esprima
    // tokenizer. All the preconfigured ../parsers/* expose ast.tokens
    // automatically, but custom parsers might need additional configuration
    // to avoid this fallback.
    const tokens: any[] = Array.isArray(ast.tokens)
      ? ast.tokens
      : require("esprima").tokenize(source, {
          loc: true,
        });

    ast.tokens = tokens;

    return ast;
  };
  return pureParse(source, options);
}
