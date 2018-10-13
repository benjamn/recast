"use strict";

const parser = require("./babel.js").parser;

// This module is suitable for passing as options.parser when calling
// recast.parse to process Flow code:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/flow")
//   });
//
exports.parse = function parse(source, options) {
  options = require("./_babel_options.js")(options);
  options.plugins.push("jsx", "flow");
  return parser.parse(source, options);
};
