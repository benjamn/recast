"use strict";

// This module is suitable for passing as options.parser when calling
// recast.parse to process ECMAScript code with Esprima:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/esprima")
//   });
//
import { getOption } from "../lib/util.js";
import * as esprima from "esprima";

export function parse(source: string, options?: any) {
  const comments: any[] = [];
  const ast = esprima.parse(source, {
    loc: true,
    // @ts-expect-error
    locations: true,
    comment: true,
    onComment: comments,
    range: getOption(options, "range", false),
    tolerant: getOption(options, "tolerant", true),
    tokens: true,
    jsx: getOption(options, "jsx", false),
    sourceType: getOption(options, "sourceType", "module"),
  });

  if (!Array.isArray(ast.comments)) {
    ast.comments = comments;
  }

  return ast;
}
