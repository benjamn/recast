// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Acorn:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/acorn")
//   });
//
import { getOption } from "../lib/util.js";
import * as acorn from "acorn";

export function parse(source: string, options?: any) {
  const comments: any[] = [];
  const tokens: any[] = [];
  const ast = acorn.parse(source, {
    allowHashBang: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    ecmaVersion: getOption(options, "ecmaVersion", 8),
    sourceType: getOption(options, "sourceType", "module"),
    locations: true,
    onComment: comments,
    onToken: tokens,
  });

  // @ts-expect-error
  if (!ast.comments) {
    // @ts-expect-error
    ast.comments = comments;
  }

  // @ts-expect-error
  if (!ast.tokens) {
    // @ts-expect-error
    ast.tokens = tokens;
  }

  return ast;
}
