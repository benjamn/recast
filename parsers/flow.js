"use strict";

// This module is suitable for passing as options.parser when calling
// recast.parse to process Flow code:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/flow")
//   });
//
exports.parse = function parse(source, options) {
  options = require("./_babylon_options.js")(options);
  options.plugins.push("jsx", "flow");
  return require("babylon").parse(source, options);
};
