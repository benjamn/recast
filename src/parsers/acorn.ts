// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Acorn:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/acorn")
//   });
//
import { getOption } from "../lib/util";

export function parse(source: string, options?: any) {
  const comments: any[] = [];
  const tokens: any[] = [];
  const ast = require("acorn").parse(source, {
    allowHashBang: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    ecmaVersion: getOption(options, "ecmaVersion", 8),
    sourceType: getOption(options, "sourceType", "module"),
    locations: true,
    onComment: comments,
    onToken: tokens,
  });

  if (! ast.comments) {
    ast.comments = comments;
  }

  if (! ast.tokens) {
    ast.tokens = tokens;
  }

  return ast;
};
