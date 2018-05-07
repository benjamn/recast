"use strict";

var babylon = require("babylon");

// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Babel:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/babylon")
//   });
//
exports.parse = function (source, options) {
  options = require("./_babylon_options.js")(options);
  options.plugins.push("*", "jsx", "flow");
  return babylon.parse(source, options);
};
