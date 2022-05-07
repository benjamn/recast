// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Meriyah:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/meriyah")
//   });
//
import { getOption } from "../lib/util";

function convertComment(comment: any): any {
  let { type } = comment;
  type = type[0] === "S" ? "Line" : "Block"; // SingleLine/MultiLine
  return { ...comment, type };
}

export function parse(source: string, options?: any) {
  const comments: any[] = [];
  const tokens: any[] = [];
  const ast = require("meriyah").parse(source, {
    module: getOption(options, "sourceType", "module") === "module",
    specDeviation: getOption(options, "tolerant", true),
    jsx: getOption(options, "jsx", false),
    ranges: getOption(options, "range", false),
    loc: true,
    raw: true,
    next: true,
    globalReturn: true,
    onComment: comments,
    onToken: tokens,
  });

  ast.comments = comments.map(convertComment);
  ast.tokens = tokens;

  return ast;
}
