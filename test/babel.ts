import assert from "assert";
import * as recast from "../main";
const n = recast.types.namedTypes;
const b = recast.types.builders;
import { EOL as eol } from "os";
import traverse, {NodePath, Node} from '@babel/traverse';
import template from '@babel/template';

const nodeMajorVersion = parseInt(process.versions.node, 10);

describe("Babel", function () {
  // Babel no longer supports Node 4 or 5.
  if (nodeMajorVersion < 6) {
    return;
  }

  const babelTransform = require("@babel/core").transform;
  const babelPresetEnv = require("@babel/preset-env");
  const parseOptions = {
    parser: require("../parsers/babel"),
  };

  it("basic printing", function () {
    function check(lines: any) {
      const code = lines.join(eol);
      const ast = recast.parse(code, parseOptions);
      const output = recast.prettyPrint(ast, {
        tabWidth: 2,
        wrapColumn: 60,
      }).code;
      assert.strictEqual(output, code);
    }

    check([
      '"use strict";', // Directive, DirectiveLiteral in Program
      '"use strict";', // Directive, DirectiveLiteral in BlockStatement
      "function a() {",
      '  "use strict";',
      "}",
    ]);

    check(["function a() {", '  "use strict";', "  b;", "}"]);

    check(["() => {", '  "use strict";', "};"]);

    check(["() => {", '  "use strict";', "  b;", "};"]);

    check(["var a = function a() {", '  "use strict";', "};"]);

    check(["var a = function a() {", '  "use strict";', "  b;", "};"]);

    check([
      "null;", // NullLiteral
      '"asdf";', // StringLiteral
      "/a/;", // RegExpLiteral
      "false;", // BooleanLiteral
      "1;", // NumericLiteral
      "const find2 = <X>() => {};", // typeParameters
    ]);

    check([
      "class A<T> {",
      "  a;",
      "  a = 1;",
      "  [a] = 1;", // computed in ClassProperty
      "}",
    ]);

    check([
      "function f<T>(x: empty): T {", // EmptyTypeAnnotation
      "  return x;",
      "}",
    ]);

    check([
      "var a: {| numVal: number |};", // exact
      "const bar1 = (x: number): string => {};",
      "declare module.exports: { foo: string }", // DeclareModuleExports
      "type Maybe<T> = _Maybe<T, *>;", // ExistentialTypeParam
      // 'declare class B { foo: () => number }', // interesting failure ref https://github.com/babel/babel/pull/3663
      "declare function foo(): number;",
      "var A: (a: B) => void;",
    ]);

    check([
      "async function* a() {", // async in Function
      "  for await (let x of y) {", // ForAwaitStatement
      "    x;",
      "  }",
      "}",
    ]);

    check([
      "class C2<+T, -U> {", // variance
      "  +p: T = e;",
      "}",
    ]);

    check(["type T = { -p: T };", "type U = { +[k: K]: V };"]);

    check([
      "class A {",
      "  static async *z(a, b): number {", // ClassMethod
      "    b;",
      "  }",
      "",
      "  static get y(): number {",
      "    return 1;",
      "  }",
      "",
      "  static set x(a): void {",
      "    return 1;",
      "  }",
      "",
      "  static async *[d](a, b): number {",
      "    return 1;",
      "  }",
      "}",
    ]);

    check([
      "({",
      "  async *a() {", // ObjectMethod
      "    b;",
      "  },",
      "",
      "  get a() {",
      "    return 1;",
      "  },",
      "",
      "  set a(b) {",
      "    return 1;",
      "  },",
      "",
      "  async *[d](c) {",
      "    return 1;",
      "  },",
      "",
      "  a: 3,",
      "  [a]: 3,",
      "  1: 3,",
      '  "1": 3,',
      "  1() {},",
      '  "1"() {}',
      "});",
    ]);

    check([
      "console.log(",
      "  100m,",
      "  9223372036854775807m,",
      "  0.m,",
      "  3.1415926535897932m,",
      "  100.000m,",
      "  123456.789m",
      ");",
    ]);

    // V8IntrinsicIdentifier
    check(["%DebugPrint('hello');", "%DebugPrint(%StringParseInt('42', 10));"]);
  });

  it("babel 6: should not wrap IIFE when reusing nodes", function () {
    const code = ["(function(...c) {", "  c();", "})();"].join(eol);

    const ast = recast.parse(code, parseOptions);
    const output = recast.print(ast, { tabWidth: 2 }).code;
    assert.strictEqual(output, code);
  });

  it("should not disappear when surrounding code changes", function () {
    const code = [
      'import foo from "foo";',
      'import React from "react";',
      "",
      "@component",
      '@callExpression({foo: "bar"})',
      "class DebugPanel extends React.Component {",
      "  render() {",
      "    return (",
      "      <div> test </div>",
      "    );",
      "  }",
      "}",
      "",
      "export default DebugPanel;",
    ].join(eol);

    const ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    const root = new recast.types.NodePath(ast);
    const reactImportPath = root.get("program", "body", 1);
    n.ImportDeclaration.assert(reactImportPath.value);

    // Remove the second import statement.
    reactImportPath.prune();

    const reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      code
        .split(eol)
        .filter((line) => !line.match(/^import React from/))
        .join(eol),
    );
  });

  it("should not disappear when an import is added and `export` is used inline", function () {
    const code = [
      'import foo from "foo";',
      'import React from "react";',
      "",
      "@component",
      '@callExpression({foo: "bar"})',
      "@callExpressionMultiLine({",
      '  foo: "bar",',
      "})",
      "export class DebugPanel extends React.Component {",
      "  render() {",
      "    return (",
      "      <div> test </div>",
      "    );",
      "  }",
      "}",
    ].join(eol);

    const ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    const root = new recast.types.NodePath(ast);
    const body = root.get("program", "body");

    // add a new import statement
    body.unshift(
      b.importDeclaration(
        [b.importDefaultSpecifier(b.identifier("x"))],
        b.literal("x"),
      ),
    );

    const reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      ['import x from "x";'].concat(code.split(eol)).join(eol),
    );
  });

  it("should not disappear when an import is added and `export default` is used inline", function () {
    const code = [
      'import foo from "foo";',
      'import React from "react";',
      "",
      "@component",
      '@callExpression({foo: "bar"})',
      "@callExpressionMultiLine({",
      '  foo: "bar",',
      "})",
      "export default class DebugPanel extends React.Component {",
      "  render() {",
      "    return (",
      "      <div> test </div>",
      "    );",
      "  }",
      "}",
    ].join(eol);

    const ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    const root = new recast.types.NodePath(ast);
    const body = root.get("program", "body");

    // add a new import statement
    body.unshift(
      b.importDeclaration(
        [b.importDefaultSpecifier(b.identifier("x"))],
        b.literal("x"),
      ),
    );

    const reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      ['import x from "x";'].concat(code.split(eol)).join(eol),
    );
  });

  it("should not print delimiters with type annotations", function () {
    const code = ["type X = {", "  a: number,", "  b: number,", "};"].join(
      "\n",
    );

    const ast = recast.parse(code, parseOptions);
    const root = new recast.types.NodePath(ast);

    root.get("program", "body", 0, "right", "properties", 0).prune();

    assert.strictEqual(recast.print(ast).code, "type X = { b: number };");
  });

  function parseExpression(code: any) {
    return recast.parse(code, parseOptions).program.body[0].expression;
  }

  it("should parenthesize ** operator arguments when lower precedence", function () {
    const ast = recast.parse("a ** b;", parseOptions);

    ast.program.body[0].expression.left = parseExpression("x + y");
    ast.program.body[0].expression.right = parseExpression("x || y");

    assert.strictEqual(recast.print(ast).code, "(x + y) ** (x || y);");
  });

  it("should parenthesize ** operator arguments as needed when same precedence", function () {
    const ast = recast.parse("a ** b;", parseOptions);

    ast.program.body[0].expression.left = parseExpression("x * y");
    ast.program.body[0].expression.right = parseExpression("x / y");

    assert.strictEqual(recast.print(ast).code, "(x * y) ** (x / y);");
  });

  it("should be able to replace top-level statements with leading empty lines", function () {
    const code = ["", "if (test) {", "  console.log(test);", "}"].join("\n");

    const ast = recast.parse(code, parseOptions);

    const replacement = b.expressionStatement(
      b.callExpression(b.identifier("fn"), [
        b.identifier("test"),
        b.literal(true),
      ]),
    );

    ast.program.body[0] = replacement;

    assert.strictEqual(recast.print(ast).code, "\nfn(test, true);");

    recast.types.visit(ast, {
      visitIfStatement: function (path: any) {
        path.replace(replacement);
        return false;
      },
    });

    assert.strictEqual(recast.print(ast).code, "\nfn(test, true);");
  });

  it("should parse and print dynamic import(...)", function () {
    const code = 'wait(import("oyez"));';
    const ast = recast.parse(code, parseOptions);
    assert.strictEqual(recast.prettyPrint(ast).code, code);
  });

  it("tolerates circular references", function () {
    const code = "function foo(bar = true) {}";
    recast.parse(code, {
      parser: {
        parse: (source: any) =>
          babelTransform(source, {
            code: false,
            ast: true,
            sourceMap: false,
            presets: [babelPresetEnv],
          }).ast,
      },
    });
  });

  it("prints numbers in bases other than 10 without converting them", function () {
    const code = [
      "let base10 = 6;",
      "let hex = 0xf00d;",
      "let binary = 0b1010;",
      "let octal = 0o744;",
      "let decimal = 123.456m;",
    ].join(eol);

    const ast = recast.parse(code, parseOptions);
    const output = recast.print(ast, { tabWidth: 2 }).code;
    assert.strictEqual(output, code);
  });

  it("prints the export-default-from syntax", function () {
    const code = [
      'export { default as foo, bar } from "foo";',
      'export { default as veryLongIdentifier1, veryLongIdentifier2, veryLongIdentifier3, veryLongIdentifier4, veryLongIdentifier5 } from "long-identifiers";',
    ].join(eol);
    const ast = recast.parse(code, parseOptions);

    const replacement1 = b.exportDefaultSpecifier(b.identifier("foo"));
    const replacement2 = b.exportDefaultSpecifier(
      b.identifier("veryLongIdentifier1"),
    );
    ast.program.body[0].specifiers[0] = replacement1;
    ast.program.body[1].specifiers[0] = replacement2;
    assert.strictEqual(
      recast.print(ast).code,
      [
        'export foo, { bar } from "foo";',
        "export veryLongIdentifier1, {",
        "  veryLongIdentifier2,",
        "  veryLongIdentifier3,",
        "  veryLongIdentifier4,",
        "  veryLongIdentifier5,",
        '} from "long-identifiers";',
      ].join(eol),
    );
  });

  // https://github.com/codemod-js/codemod/issues/157
  it("avoids extra semicolons on mutated blocks containing a 'use strict' directive", function () {
    const code = [
      "(function () {",
      '  "use strict";',
      "  hello;",
      "})();",
    ].join(eol);
    const ast = recast.parse(code, parseOptions);

    // delete "hello;"
    ast.program.body[0].expression.callee.body.body.splice(0);

    assert.strictEqual(
      recast.print(ast).code,
      ["(function () {", '  "use strict";', "})();"].join(eol),
    );
  });

  it("should print typescript class elements modifiers", function () {
    const code = ["class A {", "  x;", "}"].join(eol);

    const ast = recast.parse(code, parseOptions);

    ast.program.body[0].body.body[0].readonly = true;
    ast.program.body[0].body.body[0].declare = true;
    ast.program.body[0].body.body[0].accessibility = "public";

    assert.strictEqual(
      recast.print(ast).code,
      ["class A {", "  declare public readonly x;", "}"].join(eol),
    );
  });

  it("should not add curly braces in ExportNamedDeclaration used with ExportNamespaceSpecifier", function () {
    const code = 'export * as fs2 from "fs/promises"';
    const ast = recast.parse(code, parseOptions);

    traverse(ast, {
      ExportNamedDeclaration(path: NodePath) {
        path.replaceWith(template.ast('export * as fs from "xx"') as Node);
        path.stop();
      }
    })

    assert.strictEqual(
      recast.print(ast).code,
      'export * as fs from "xx";'
    );
  });

  it("should not add curly braces in ExportNamedDeclaration used with ExportNamespaceSpecifier: couple specifiers", function () {
    const code = 'export * as fs2, {x, y} from "fs/promises"';
    const ast = recast.parse(code, parseOptions);

    traverse(ast, {
      ExportNamedDeclaration(path: NodePath) {
        path.replaceWith(template.ast('export * as fs, {x, y} from "xx"') as Node);
        path.stop();
      }
    })

    assert.strictEqual(
      recast.print(ast).code,
      'export * as fs, { x, y } from "xx";'
    );
  });
});
