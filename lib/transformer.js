var recast = require('../main');
var assert = require('assert');

function Transformer(visitors) {
  assert.ok(this instanceof Transformer);
  this.visitors = visitors;
}

var Tp = Transformer.prototype;

Tp.transform = function(ast) {
  return recast.visit(ast, this.visitors);
};

Tp.parse = function(source, recastOptions) {
  recastOptions = recastOptions || {};
  var ast = recast.parse(source, recastOptions);
  return this.transform(ast);
};

Tp.compile = function(source, recastOptions) {
  return recast.print(this.parse(source, recastOptions), recastOptions);
};


module.exports = Transformer;
