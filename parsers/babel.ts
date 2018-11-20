"use strict";

// Prefer the new @babel/parser package, but fall back to babylon if
// that's what's available.
const parser = exports.parser = function () {
  try {
    return require("@babel/parser");
  } catch (e) {
    return require("babylon");
  }
}();

// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript code with Babel:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/babel")
//   });
//
exports.parse = function (source, options) {
  options = require("./_babel_options.js")(options);
  options.plugins.push("jsx", "flow");
  return parser.parse(source, options);
};
