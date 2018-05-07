"use strict";

// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Acorn:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/acorn")
//   });
//
const getOption = require("../lib/util.js").getOption;

exports.parse = function parse(source, options) {
  const comments = [];
  const tokens = [];
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
