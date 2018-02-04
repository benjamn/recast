var assert = require("assert");
var recast = require("../main.js");
var n = recast.types.namedTypes;
var b = recast.types.builders;
var eol = require("os").EOL;

describe("Babel", function () {
  var babelTransform = require("babel-core").transform;
  var babelPresetES2015 = require("babel-preset-es2015");
  var parseOptions = {};

  try {
    parseOptions.parser = require("reify/lib/parsers/babylon.js");
  } catch (e) {
    if (require("semver").gte(process.version, "4.0.0")) {
      throw e;
    }
    return;
  }

  it("basic printing", function () {
    function check(lines) {
      var code = lines.join(eol);
      var ast = recast.parse(code, parseOptions);
      var output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
      assert.strictEqual(output, code);
    }

    check([
      '"use strict";', // Directive, DirectiveLiteral in Program
      '"use strict";', // Directive, DirectiveLiteral in BlockStatement
      'function a() {',
      '  "use strict";',
      '}',
    ]);

    check([
      'function a() {',
      '  "use strict";',
      '  b;',
      '}',
    ]);

    check([
      '() => {',
      '  "use strict";',
      '};',
    ]);

    check([
      '() => {',
      '  "use strict";',
      '  b;',
      '};',
    ]);

    check([
      'var a = function a() {',
      '  "use strict";',
      '};',
    ]);

    check([
      'var a = function a() {',
      '  "use strict";',
      '  b;',
      '};',
    ]);

    check([
      'null;', // NullLiteral
      '"asdf";', // StringLiteral
      '/a/;', // RegExpLiteral
      'false;', // BooleanLiteral
      '1;', // NumericLiteral
      'const find2 = <X>() => {};', // typeParameters
    ]);

    check([
      'class A<T> {',
      '  a;',
      '  a = 1;',
      '  [a] = 1;', // computed in ClassProperty
      '}',
    ]);

    check([
      'function f<T>(x: empty): T {', // EmptyTypeAnnotation
      '  return x;',
      '}',
    ]);

    check([
      'var a: {| numVal: number |};', // exact
      'const bar1 = (x: number): string => {};',
      'declare module.exports: { foo: string }', // DeclareModuleExports
      'type Maybe<T> = _Maybe<T, *>;', // ExistentialTypeParam
      // 'declare class B { foo: () => number }', // interesting failure ref https://github.com/babel/babel/pull/3663
      'declare function foo(): number;',
      'var A: (a: B) => void;',
    ]);

    check([
      'async function* a() {', // async in Function
      '  for await (let x of y) {', // ForAwaitStatement
      '    x;',
      '  }',
      '}',
    ]);

    check([
      'class C2<+T, -U> {', // variance
      '  +p: T = e;',
      '}',
    ]);

    check([
      'type T = { -p: T };',
      'type T = { +[k: K]: V };',
    ]);

    check([
      'class A {',
      '  static async *z(a, b): number {', // ClassMethod
      '    b;',
      '  }',
      '',
      '  static get y(): number {',
      '    return 1;',
      '  }',
      '',
      '  static set x(a): void {',
      '    return 1;',
      '  }',
      '',
      '  static async *[d](a, b): number {',
      '    return 1;',
      '  }',
      '}',
    ]);

    check([
      '({',
      '  async *a() {', // ObjectMethod
      '    b;',
      '  },',
      '',
      '  get a() {',
      '    return 1;',
      '  },',
      '',
      '  set a(b) {',
      '    return 1;',
      '  },',
      '',
      '  async *[d](c) {',
      '    return 1;',
      '  },',
      '',
      '  a: 3,',
      '  [a]: 3,',
      '  1: 3,',
      '  "1": 3,',
      '  1() {},',
      '  "1"() {}',
      '});',
    ]);
  });

  it("babel 6: should not wrap IIFE when reusing nodes", function () {
    var code = [
      '(function(...c) {',
      '  c();',
      '})();',
    ].join(eol);

    var ast = recast.parse(code, parseOptions);
    var output = recast.print(ast, { tabWidth: 2 }).code;
    assert.strictEqual(output, code);
  });

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

    var ast = recast.parse(code, parseOptions)
    var root = new recast.types.NodePath(ast);

    root.get('program', 'body', 0, 'right', 'properties', 0).prune();

    assert.strictEqual(
      recast.print(ast).code,
      "type X = { b: number };"
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

  it("should be able to replace top-level statements with leading empty lines", function () {
    var code = [
      '',
      'if (test) {',
      '  console.log(test);',
      '}',
    ].join('\n');

    var ast = recast.parse(code, parseOptions);

    var replacement = b.expressionStatement(
      b.callExpression(
        b.identifier('fn'),
        [b.identifier('test'), b.literal(true)]
      )
    );

    recast.types.visit(ast, {
      visitIfStatement: function(path) {
        path.replace(replacement);
        return false;
      }
    });

    // This also doesn't work:
    // ast.program.body[0] = replacement;

    // The `ast` contains the correct replacement nodes but the printed code
    // is still the same as the original.
    assert.strictEqual(
      recast.print(ast).code,
      'fn(test, true);'
    );
  });

  it("should parse and print dynamic import(...)", function () {
    var code = 'wait(import("oyez"));';
  var ast = recast.parse(code, parseOptions);
    assert.strictEqual(
      recast.prettyPrint(ast).code,
      code
    );
  });

  it("tolerates circular references", function () {
    var code = "function foo(bar = true) {}";
    var ast = recast.parse(code, {
      parser: {
        parse: function (source) {
          return babelTransform(source, {
            code: false,
            ast: true,
            sourceMap: false,
            presets: [babelPresetES2015]
          }).ast;
        }
      }
    });
  });

  it("prints numbers in bases other than 10 without converting them", function() {
    var code = [
      'let decimal = 6;',
      'let hex = 0xf00d;',
      'let binary = 0b1010;',
      'let octal = 0o744;'
    ].join(eol);

    var ast = recast.parse(code, parseOptions);
    var output = recast.print(ast, { tabWidth: 2 }).code;
    assert.strictEqual(output, code);
  });
});
