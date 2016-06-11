var assert = require("assert");
var recast = require("../main.js");
var n = recast.types.namedTypes;
var b = recast.types.builders;
var eol = require("os").EOL;

describe("decorators", function () {
  var babylon = require("babylon");
  var babylonOptions = {
    sourceType: 'module',
    allowImportExportEverywhere: false,
    allowReturnOutsideFunction: false,
    plugins: [
      'asyncFunctions',
      'asyncGenerators',
      'classConstructorCall',
      'classProperties',
      'decorators',
      'doExpressions',
      'exponentiationOperator',
      'exportExtensions',
      'flow',
      'functionSent',
      'functionBind',
      'jsx',
      'objectRestSpread',
      'trailingFunctionCommas'
    ]
  };

  var parseOptions = {
    parser: {
      parse: function (source) {
        return babylon.parse(source, babylonOptions);
      }
    }
  };

  it("should not disappear when surrounding code changes", function () {
    var code = [
      'import foo from "foo";',
      'import React from "react";',
      '',
      '@component',
      '@callExpression({foo: "bar"})',
      'class DebugPanel extends React.Component {',
      '  render() {',
      '    return (',
      '      <div> test </div>',
      '    );',
      '  }',
      '}',
      '',
      'export default DebugPanel;',
    ].join(eol);

    var ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    var root = new recast.types.NodePath(ast);
    var reactImportPath = root.get("program", "body", 1);
    n.ImportDeclaration.assert(reactImportPath.value);

    // Remove the second import statement.
    reactImportPath.prune();

    var reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      code.split(eol).filter(function (line) {
        return ! line.match(/^import React from/);
      }).join(eol)
    );
  });

  it("should not disappear when an import is added and `export` is used inline", function () {
    var code = [
      'import foo from "foo";',
      'import React from "react";',
      '',
      '@component',
      '@callExpression({foo: "bar"})',
      '@callExpressionMultiLine({',
      '  foo: "bar",',
      '})',
      'export class DebugPanel extends React.Component {',
      '  render() {',
      '    return (',
      '      <div> test </div>',
      '    );',
      '  }',
      '}',
    ].join(eol);

    var ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    var root = new recast.types.NodePath(ast);
    var body = root.get("program", "body");

    // add a new import statement
    body.unshift(b.importDeclaration([
      b.importDefaultSpecifier(b.identifier('x')),
    ], b.literal('x')));

    var reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      ['import x from "x";'].concat(code.split(eol)).join(eol)
    );
  });

  it("should not disappear when an import is added and `export default` is used inline", function () {
    var code = [
      'import foo from "foo";',
      'import React from "react";',
      '',
      '@component',
      '@callExpression({foo: "bar"})',
      '@callExpressionMultiLine({',
      '  foo: "bar",',
      '})',
      'export default class DebugPanel extends React.Component {',
      '  render() {',
      '    return (',
      '      <div> test </div>',
      '    );',
      '  }',
      '}',
    ].join(eol);

    var ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    var root = new recast.types.NodePath(ast);
    var body = root.get("program", "body");

    // add a new import statement
    body.unshift(b.importDeclaration([
      b.importDefaultSpecifier(b.identifier('x')),
    ], b.literal('x')));

    var reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      ['import x from "x";'].concat(code.split(eol)).join(eol)
    );
  });

  it("should not print delimiters with type annotations", function () {
    var code = [
      'type X = {',
      '  a: number,',
      '  b: number,',
      '};',
    ].join('\n');

    var parseOptions = {
      parser: {
        parse: function (source) {
          return babylon.parse(source, {plugins: ['flow']});
        }
      },
    };

    var ast = recast.parse(code, parseOptions)
    var root = new recast.types.NodePath(ast);

    root.get('program', 'body', 0, 'right', 'properties', 0).prune();

    assert.strictEqual(
      recast.print(ast).code,
      "type X = {b: number};"
    );
  });

  function parseExpression(code) {
    return recast.parse(code, parseOptions).program.body[0].expression;
  }

  it("should parenthesize ** operator arguments when lower precedence", function () {
    var ast = recast.parse('a ** b;', parseOptions);

    ast.program.body[0].expression.left = parseExpression('x + y');
    ast.program.body[0].expression.right = parseExpression('x || y');

    assert.strictEqual(
      recast.print(ast).code,
      '(x + y) ** (x || y);'
    );
  });

  it("should parenthesize ** operator arguments as needed when same precedence", function () {
    var ast = recast.parse('a ** b;', parseOptions);

    ast.program.body[0].expression.left = parseExpression('x * y');
    ast.program.body[0].expression.right = parseExpression('x / y');

    assert.strictEqual(
      recast.print(ast).code,
      'x * y ** (x / y);'
    );
  });
});
