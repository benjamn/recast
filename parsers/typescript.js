"use strict";

// This module is suitable for passing as options.parser when calling
// recast.parse to process TypeScript code:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/typescript")
//   });
//
exports.parse = function parse(source, options) {
  options = require("./_babylon_options.js")(options);
  options.plugins.push("typescript");
  return require("babylon").parse(source, options);
};
