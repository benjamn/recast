import assert from "assert";
import * as types from "ast-types";
import { EOL as eol } from "os";
import { fromString } from "../lib/lines";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import * as recast from "../main";
const n = types.namedTypes;
const b = types.builders;
const linesModule = require("../lib/lines");
const nodeMajorVersion = parseInt(process.versions.node, 10);

import * as tsParser from "../parsers/typescript";

describe("printer", function () {
  it("Printer", function testPrinter(done) {
    const code = testPrinter + "";
    const ast = parse(code);
    const printer = new Printer();

    assert.strictEqual(typeof printer.print, "function");
    assert.strictEqual(printer.print(null).code, "");

    let string = printer.printGenerically(ast).code;
    assert.ok(string.indexOf("done();") > 0);

    string = printer.print(ast).code;

    // TODO

    assert.ok(string.indexOf("// TODO") > 0);

    done();
  });

  const uselessSemicolons = [
    "function a() {",
    '  return "a";',
    "};",
    "",
    "function b() {",
    '  return "b";',
    "};",
  ].join(eol);

  it("EmptyStatements", function () {
    const ast = parse(uselessSemicolons);
    const printer = new Printer({ tabWidth: 2 });

    const reprinted = printer.print(ast).code;
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, uselessSemicolons);

    const generic = printer.printGenerically(ast).code;
    const withoutTrailingSemicolons = uselessSemicolons.replace(/\};/g, "}");
    assert.strictEqual(typeof generic, "string");
    assert.strictEqual(generic, withoutTrailingSemicolons);
  });

  const importantSemicolons = [
    "var a = {};", // <--- this trailing semi-colon is very important
    "(function() {})();",
  ].join(eol);

  it("IffeAfterVariableDeclarationEndingInObjectLiteral", function () {
    const ast = parse(importantSemicolons);
    const printer = new Printer({ tabWidth: 2 });

    const reprinted = printer.printGenerically(ast).code;
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, importantSemicolons);
  });

  const arrayExprWithTrailingComma = "[1, 2,];";
  const arrayExprWithoutTrailingComma = "[1, 2];";

  it("ArrayExpressionWithTrailingComma", function () {
    const ast = parse(arrayExprWithTrailingComma);
    const printer = new Printer({ tabWidth: 2 });

    const body = ast.program.body;
    const arrayExpr = body[0].expression;
    n.ArrayExpression.assert(arrayExpr);

    // This causes the array expression to be reprinted.
    const arrayExprOrig = arrayExpr.original;
    arrayExpr.original = null;

    assert.strictEqual(printer.print(ast).code, arrayExprWithoutTrailingComma);

    arrayExpr.original = arrayExprOrig;

    assert.strictEqual(printer.print(ast).code, arrayExprWithTrailingComma);
  });

  const arrayExprWithHoles = "[,,];";

  it("ArrayExpressionWithHoles", function () {
    const ast = parse(arrayExprWithHoles);
    const printer = new Printer({ tabWidth: 2 });

    const body = ast.program.body;
    const arrayExpr = body[0].expression;
    n.ArrayExpression.assert(arrayExpr);

    // This causes the array expression to be reprinted.
    const arrayExprOrig = arrayExpr.original;
    arrayExpr.original = null;

    assert.strictEqual(printer.print(ast).code, arrayExprWithHoles);

    arrayExpr.original = arrayExprOrig;

    assert.strictEqual(printer.print(ast).code, arrayExprWithHoles);
  });

  const objectExprWithTrailingComma = "({x: 1, y: 2,});";
  const objectExprWithoutTrailingComma =
    "({" + eol + "  x: 1," + eol + "  y: 2" + eol + "});";

  it("ArrayExpressionWithTrailingComma", function () {
    const ast = parse(objectExprWithTrailingComma);
    const printer = new Printer({ tabWidth: 2 });

    const body = ast.program.body;
    const objectExpr = body[0].expression;
    n.ObjectExpression.assert(objectExpr);

    // This causes the array expression to be reprinted.
    const objectExprOrig = objectExpr.original;
    objectExpr.original = null;

    assert.strictEqual(printer.print(ast).code, objectExprWithoutTrailingComma);

    objectExpr.original = objectExprOrig;

    assert.strictEqual(printer.print(ast).code, objectExprWithTrailingComma);
  });

  const switchCase = [
    "switch (test) {",
    "  default:",
    "  case a: break",
    "",
    "  case b:",
    "    break;",
    "}",
  ].join(eol);

  const switchCaseReprinted = [
    "if (test) {",
    "  switch (test) {",
    "  default:",
    "  case a: break",
    "  case b:",
    "    break;",
    "  }",
    "}",
  ].join(eol);

  const switchCaseGeneric = [
    "if (test) {",
    "  switch (test) {",
    "  default:",
    "  case a:",
    "    break;",
    "  case b:",
    "    break;",
    "  }",
    "}",
  ].join(eol);

  it("SwitchCase", function () {
    const ast = parse(switchCase);
    const printer = new Printer({ tabWidth: 2 });

    const body = ast.program.body;
    const switchStmt = body[0];
    n.SwitchStatement.assert(switchStmt);

    // This causes the switch statement to be reprinted.
    switchStmt.original = null;

    body[0] = b.ifStatement(
      b.identifier("test"),
      b.blockStatement([switchStmt]),
    );

    assert.strictEqual(printer.print(ast).code, switchCaseReprinted);

    assert.strictEqual(printer.printGenerically(ast).code, switchCaseGeneric);
  });

  const tryCatch = ["try {", "  a();", "} catch (e) {", "  b(e);", "}"].join(
    eol,
  );

  it("IndentTryCatch", function () {
    const ast = parse(tryCatch);
    const printer = new Printer({ tabWidth: 2 });
    const body = ast.program.body;
    const tryStmt = body[0];
    n.TryStatement.assert(tryStmt);

    // Force reprinting.
    assert.strictEqual(printer.printGenerically(ast).code, tryCatch);
  });

  const classBody = [
    "class A {",
    "  foo(x) { return x }",
    "  bar(y) { this.foo(y); }",
    "  baz(x, y) {",
    "    this.foo(x);",
    "    this.bar(y);",
    "  }",
    "}",
  ];

  const classBodyExpected = [
    "class A {",
    "  foo(x) { return x }",
    "  bar(y) { this.foo(y); }",
    "  baz(x, y) {",
    "    this.foo(x);",
    "    this.bar(y);",
    "  }",
    "  foo(x) { return x }",
    "}",
  ];

  it("MethodPrinting", function () {
    const code = classBody.join(eol);
    let ast;
    try {
      ast = parse(code);
    } catch (e) {
      // ES6 not supported, silently finish
      return;
    }
    const printer = new Printer({ tabWidth: 2 });
    const cb = ast.program.body[0].body;
    n.ClassBody.assert(cb);

    // Trigger reprinting of the class body.
    cb.body.push(cb.body[0]);

    assert.strictEqual(printer.print(ast).code, classBodyExpected.join(eol));
  });

  const multiLineParams = [
    "function f(/* first",
    "              xxx",
    "              param */ a,",
    "  // other params",
    "  b, c, // see?",
    "  d",
    ") {",
    "  return a + b + c + d;",
    "}",
  ];

  const multiLineParamsExpected = [
    "function f(",
    "  /* first",
    "     xxx",
    "     param */ a,",
    "  // other params",
    "  b,",
    "  // see?",
    "  c,",
    "  d",
    ") {",
    "  return a + b + c + d;",
    "}",
  ];

  it("MultiLineParams", function () {
    const code = multiLineParams.join(eol);
    const ast = parse(code);
    const printer = new Printer({ tabWidth: 2 });

    recast.visit(ast, {
      visitNode: function (path) {
        path.value.original = null;
        this.traverse(path);
      },
    });

    assert.strictEqual(
      printer.print(ast).code,
      multiLineParamsExpected.join(eol),
    );
  });

  it("SimpleVarPrinting", function () {
    const printer = new Printer({ tabWidth: 2 });
    const varDecl = b.variableDeclaration("var", [
      b.variableDeclarator(b.identifier("x"), null),
      b.variableDeclarator(b.identifier("y"), null),
      b.variableDeclarator(b.identifier("z"), null),
    ]);

    assert.strictEqual(
      printer.print(b.program([varDecl])).code,
      "var x, y, z;",
    );

    const z: any = varDecl.declarations.pop();
    varDecl.declarations.pop();
    varDecl.declarations.push(z);

    assert.strictEqual(printer.print(b.program([varDecl])).code, "var x, z;");
  });

  it("MultiLineVarPrinting", function () {
    const printer = new Printer({ tabWidth: 2 });
    const varDecl = b.variableDeclaration("var", [
      b.variableDeclarator(b.identifier("x"), null),
      b.variableDeclarator(
        b.identifier("y"),
        b.objectExpression([
          b.property("init", b.identifier("why"), b.literal("not")),
        ]),
      ),
      b.variableDeclarator(b.identifier("z"), null),
    ]);

    assert.strictEqual(
      printer.print(b.program([varDecl])).code,
      ["var x,", "    y = {", '      why: "not"', "    },", "    z;"].join(eol),
    );
  });

  it("ForLoopPrinting", function () {
    const printer = new Printer({ tabWidth: 2 });
    const loop = b.forStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("i"), b.literal(0)),
      ]),
      b.binaryExpression("<", b.identifier("i"), b.literal(3)),
      b.updateExpression("++", b.identifier("i"), /* prefix: */ false),
      b.expressionStatement(
        b.callExpression(b.identifier("log"), [b.identifier("i")]),
      ),
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var i = 0; i < 3; i++)" + eol + "  log(i);",
    );
  });

  it("EmptyForLoopPrinting", function () {
    const printer = new Printer({ tabWidth: 2 });
    const loop = b.forStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("i"), b.literal(0)),
      ]),
      b.binaryExpression("<", b.identifier("i"), b.literal(3)),
      b.updateExpression("++", b.identifier("i"), /* prefix: */ false),
      b.emptyStatement(),
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var i = 0; i < 3; i++)" + eol + "  ;",
    );
  });

  it("ForInLoopPrinting", function () {
    const printer = new Printer({ tabWidth: 2 });
    const loop = b.forInStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("key"), null),
      ]),
      b.identifier("obj"),
      b.expressionStatement(
        b.callExpression(b.identifier("log"), [b.identifier("key")]),
      ),
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var key in obj)" + eol + "  log(key);",
    );
  });

  it("GuessTabWidth", function () {
    const code = ["function identity(x) {", "  return x;", "}"].join(eol);

    const guessedTwo = [
      "function identity(x) {",
      "  log(x);",
      "  return x;",
      "}",
    ].join(eol);

    const explicitFour = [
      "function identity(x) {",
      "    log(x);",
      "    return x;",
      "}",
    ].join(eol);

    const ast = parse(code);

    const funDecl = ast.program.body[0];
    n.FunctionDeclaration.assert(funDecl);

    const funBody = funDecl.body.body;

    funBody.unshift(
      b.expressionStatement(
        b.callExpression(b.identifier("log"), funDecl.params),
      ),
    );

    assert.strictEqual(new Printer().print(ast).code, guessedTwo);

    assert.strictEqual(
      new Printer({
        tabWidth: 4,
      }).print(ast).code,
      explicitFour,
    );
  });

  it("FunctionDefaultsAndRest", function () {
    const printer = new Printer();
    const funExpr = b.functionExpression(
      b.identifier("a"),
      [b.identifier("b"), b.identifier("c")],
      b.blockStatement([]),
      false,
      false,
    );

    funExpr.defaults = [null, b.literal(1)];
    funExpr.rest = b.identifier("d");

    assert.strictEqual(
      printer.print(funExpr).code,
      "function a(b, c = 1, ...d) {}",
    );

    const arrowFunExpr = b.arrowFunctionExpression(
      [b.identifier("b"), b.identifier("c")],
      b.blockStatement([]),
      false,
    );

    arrowFunExpr.defaults = [null, b.literal(1)];
    arrowFunExpr.rest = b.identifier("d");

    assert.strictEqual(
      printer.print(arrowFunExpr).code,
      "(b, c = 1, ...d) => {}",
    );
  });

  it("generically prints parsed code and generated code the same way", function () {
    const printer = new Printer();
    const ast = b.program([
      b.expressionStatement(b.literal(1)),
      b.expressionStatement(b.literal(2)),
    ]);

    assert.strictEqual(
      printer.printGenerically(parse("1; 2;")).code,
      printer.printGenerically(ast).code,
    );
  });

  it("ExportDeclaration semicolons", function () {
    const printer = new Printer();
    let code = "export var foo = 42;";
    let ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code);

    code = "export var foo = 42";
    ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code + ";");

    code = "export function foo() {}";
    ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code);

    code = 'export * from "./lib";';
    ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code);
  });

  it("empty ExportDeclaration", function () {
    const printer = new Printer();
    const code = "export {};";
    const ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code);
  });

  it("export namespace", function () {
    const printer = new Printer();

    assert.strictEqual(
      printer.print({
        type: "ExportNamedDeclaration",
        exportKind: "value",
        specifiers: [
          {
            type: "ExportNamespaceSpecifier",
            exported: {
              type: "Identifier",
              name: "Foobar",
            },
          },
        ],
        source: {
          type: "StringLiteral",
          value: "./foo",
        },
      }).code,
      `export * as Foobar from "./foo";`,
    );
  });

  it("export type namespace", function () {
    const printer = new Printer();

    assert.strictEqual(
      printer.print({
        type: "ExportNamedDeclaration",
        exportKind: "type",
        specifiers: [
          {
            type: "ExportNamespaceSpecifier",
            exported: {
              type: "Identifier",
              name: "Foobar",
            },
          },
        ],
        source: {
          type: "StringLiteral",
          value: "./foo",
        },
      }).code,
      `export type * as Foobar from "./foo";`,
    );
  });

  it("export default of IIFE", function () {
    const printer = new Printer();
    let ast = b.exportDefaultDeclaration(
      b.callExpression(
        b.functionExpression(null, [], b.blockStatement([])),
        [],
      ),
    );
    const code = printer.print(ast).code;
    ast = parse(code);

    assert.strictEqual(printer.print(ast).code, code);
    assert.strictEqual(printer.printGenerically(ast).code, code);
  });

  const stmtListSpaces = [
    "",
    "var x = 1;",
    "",
    "",
    "// y summation",
    "var y = x + 1;",
    "var z = x + y;",
    "// after z",
    "",
    "console.log(x, y, z);",
    "",
    "",
  ].join(eol);

  const stmtListSpacesExpected = [
    "",
    "debugger;",
    "var x = 1;",
    "",
    "",
    "// y summation",
    "var y = x + 1;",
    "debugger;",
    "var z = x + y;",
    "// after z",
    "",
    "console.log(x, y, z);",
    "",
    "debugger;",
    "",
    "",
  ].join(eol);

  it("Statement list whitespace reuse", function () {
    const ast = parse(stmtListSpaces);
    const printer = new Printer({ tabWidth: 2 });
    const debugStmt = b.expressionStatement(b.identifier("debugger"));

    ast.program.body.splice(2, 0, debugStmt);
    ast.program.body.unshift(debugStmt);
    ast.program.body.push(debugStmt);

    assert.strictEqual(printer.print(ast).code, stmtListSpacesExpected);

    const funDecl = b.functionDeclaration(
      b.identifier("foo"),
      [],
      b.blockStatement(ast.program.body),
    );

    assert.strictEqual(
      printer.print(funDecl).code,
      linesModule
        .concat([
          "function foo() {" + eol,
          linesModule
            .fromString(stmtListSpacesExpected.replace(/^\s+|\s+$/g, ""))
            .indent(2),
          eol + "}",
        ])
        .toString(),
    );
  });

  it("should print static methods with the static keyword", function () {
    const printer = new Printer({ tabWidth: 4 });
    const ast = parse(["class A {", "  static foo() {}", "}"].join(eol));

    const classBody = ast.program.body[0].body;
    n.ClassBody.assert(classBody);

    const foo = classBody.body[0];
    n.MethodDefinition.assert(foo);

    classBody.body.push(foo);

    foo.key.name = "formerlyFoo";

    assert.strictEqual(
      printer.print(ast).code,
      [
        "class A {",
        "    static formerlyFoo() {}",
        "    static formerlyFoo() {}",
        "}",
      ].join(eol),
    );
  });

  it("should print string literals with the specified delimiter", function () {
    const ast = parse(
      [
        "var obj = {",
        "    \"foo's\": 'bar',",
        "    '\"bar\\'s\"': /regex/m",
        "};",
      ].join(eol),
    );

    const variableDeclaration = ast.program.body[0];
    n.VariableDeclaration.assert(variableDeclaration);

    const printer = new Printer({ quote: "single" });
    assert.strictEqual(
      printer.printGenerically(ast).code,
      [
        "var obj = {",
        "    'foo\\'s': 'bar',",
        "    '\"bar\\'s\"': /regex/m",
        "};",
      ].join(eol),
    );

    const printer2 = new Printer({ quote: "double" });
    assert.strictEqual(
      printer2.printGenerically(ast).code,
      [
        "var obj = {",
        '    "foo\'s": "bar",',
        '    "\\"bar\'s\\"": /regex/m',
        "};",
      ].join(eol),
    );

    const printer3 = new Printer({ quote: "auto" });
    assert.strictEqual(
      printer3.printGenerically(ast).code,
      [
        "var obj = {",
        '    "foo\'s": "bar",',
        "    '\"bar\\'s\"': /regex/m",
        "};",
      ].join(eol),
    );
  });

  it("pretty-prints U+2028 and U+2029 as Unicode escapes", function () {
    const ast = parse('"\\u2028";');
    const printer = new Printer();
    assert.strictEqual(printer.printGenerically(ast).code, '"\\u2028";');

    const ast2 = parse('"\\u2029";');
    const printer2 = new Printer();
    assert.strictEqual(printer2.printGenerically(ast2).code, '"\\u2029";');
  });

  it("should print block comments at head of class once", function () {
    // Given.
    const ast = parse(
      [
        "/**",
        " * This class was in an IIFE and returned an instance of itself.",
        " */",
        "function SimpleClass() {",
        "};",
      ].join(eol),
    );

    const classIdentifier = b.identifier("SimpleClass");
    const exportsExpression = b.memberExpression(
      b.identifier("module"),
      b.identifier("exports"),
      false,
    );
    const assignmentExpression = b.assignmentExpression(
      "=",
      exportsExpression,
      classIdentifier,
    );
    const exportStatement = b.expressionStatement(assignmentExpression);

    ast.program.body.push(exportStatement);

    // When.
    const printedClass = new Printer().print(ast).code;

    // Then.
    assert.strictEqual(
      printedClass,
      [
        "/**",
        " * This class was in an IIFE and returned an instance of itself.",
        " */",
        "function SimpleClass() {",
        "}",
        "module.exports = SimpleClass;",
      ].join(eol),
    );
  });

  it("should support computed properties", function () {
    let code = [
      "class A {",
      '  ["a"]() {}',
      '  [ID("b")]() {}',
      "  [0]() {}",
      "  [ID(1)]() {}",
      '  get ["a"]() {}',
      '  get [ID("b")]() {}',
      "  get [0]() {}",
      "  get [ID(1)]() {}",
      '  set ["a"](x) {}',
      '  set [ID("b")](x) {}',
      "  set [0](x) {}",
      "  set [ID(1)](x) {}",
      '  static ["a"]() {}',
      '  static [ID("b")]() {}',
      "  static [0]() {}",
      "  static [ID(1)]() {}",
      '  static get ["a"]() {}',
      '  static get [ID("b")]() {}',
      "  static get [0]() {}",
      "  static get [ID(1)]() {}",
      '  static set ["a"](x) {}',
      '  static set [ID("b")](x) {}',
      "  static set [0](x) {}",
      "  static set [ID(1)](x) {}",
      "}",
    ].join(eol);

    let ast = parse(code);

    const printer = new Printer({
      tabWidth: 2,
    });

    assert.strictEqual(printer.printGenerically(ast).code, code);

    code = [
      "var obj = {",
      '  ["a"]: 1,',
      '  [ID("b")]: 2,',
      "  [0]: 3,",
      "  [ID(1)]: 4,",
      '  ["a"]() {},',
      '  [ID("b")]() {},',
      "  [0]() {},",
      "  [ID(1)]() {},",
      '  get ["a"]() {},',
      '  get [ID("b")]() {},',
      "  get [0]() {},",
      "  get [ID(1)]() {},",
      '  set ["a"](x) {},',
      '  set [ID("b")](x) {},',
      "  set [0](x) {},",
      "  set [ID(1)](x) {}",
      "};",
    ].join(eol);

    ast = parse(code);

    assert.strictEqual(printer.printGenerically(ast).code, code);

    ast = parse(
      [
        "var o = {",
        "  // This foo will become a computed method name.",
        "  foo() { return bar }",
        "};",
      ].join(eol),
    );

    const objExpr = ast.program.body[0].declarations[0].init;
    n.ObjectExpression.assert(objExpr);

    assert.strictEqual(objExpr.properties[0].computed, false);
    objExpr.properties[0].computed = true;
    objExpr.properties[0].kind = "get";

    assert.strictEqual(
      recast.print(ast).code,
      [
        "var o = {",
        "  // This foo will become a computed method name.",
        "  get [foo]() { return bar }",
        "};",
      ].join(eol),
    );
  });

  it("prints trailing commas in object literals", function () {
    const code = ["({", "  foo: bar,", "  bar: foo,", "});"].join(eol);

    const ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb"),
    });

    let printer = new Printer({
      tabWidth: 2,
      trailingComma: true,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // It should also work when using the `trailingComma` option as an object.
    printer = new Printer({
      tabWidth: 2,
      trailingComma: { objects: true },
    });

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints trailing commas in function calls", function () {
    const code = ["call(", "  1,", "  2,", ");"].join(eol);

    const ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb"),
    });

    let printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // It should also work when using the `trailingComma` option as an object.
    printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: { parameters: true },
    });

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints trailing commas in array expressions", function () {
    const code = ["[", "  1,", "  2,", "];"].join(eol);

    const ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb"),
    });

    let printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // It should also work when using the `trailingComma` option as an object.
    printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: { arrays: true },
    });

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints trailing commas in function definitions", function () {
    const code = ["function foo(", "  a,", "  b,", ") {}"].join(eol);

    const ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb"),
    });

    let printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // It should also work when using the `trailingComma` option as an object.
    printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: { parameters: true },
    });

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  (nodeMajorVersion >= 6 ? it : xit)(
    "shouldn't print a trailing comma for a RestElement",
    function () {
      const code = ["function foo(", "  a,", "  b,", "  ...rest", ") {}"].join(
        eol,
      );

      const ast = parse(code, {
        // The flow parser and Babylon recognize `...rest` as a `RestElement`
        parser: require("@babel/parser"),
      });

      const printer = new Printer({
        tabWidth: 2,
        wrapColumn: 1,
        trailingComma: true,
      });

      const pretty = printer.printGenerically(ast).code;
      assert.strictEqual(pretty, code);
    },
  );

  it("shouldn't print a trailing comma for a RestElement in destructuring", function () {
    const code = [
      "const {",
      "  foo,",
      "  bar,",
      "  ...rest",
      "} = input;",
    ].join(eol);

    const ast = parse(code, {
      parser: require("@babel/parser"),
    });

    const printer = new Printer({
      tabWidth: 2,
      trailingComma: true,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("should support AssignmentPattern and RestElement", function () {
    const code = [
      "function foo(a, [b, c] = d(a), ...[e, f, ...rest]) {",
      "  return [a, b, c, e, f, rest];",
      "}",
    ].join(eol);

    const ast = parse(code, {
      // Supports rest parameter destructuring whereas plain esprima
      // does not.
      parser: require("esprima-fb"),
    });

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around spread patterns", function () {
    const code = "(...rest) => rest;";

    let ast = b.program([
      b.expressionStatement(
        b.arrowFunctionExpression(
          [b.spreadElementPattern(b.identifier("rest"))],
          b.identifier("rest"),
          false,
        ),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Print RestElement the same way
    ast = b.program([
      b.expressionStatement(
        b.arrowFunctionExpression(
          [b.restElement(b.identifier("rest"))],
          b.identifier("rest"),
          false,
        ),
      ),
    ]);

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Do the same for the `rest` field.
    const arrowFunction = b.arrowFunctionExpression(
      [],
      b.identifier("rest"),
      false,
    );
    arrowFunction.rest = b.identifier("rest");
    ast = b.program([b.expressionStatement(arrowFunction)]);

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around single arrow function arg when options.arrowParensAlways is true", function () {
    const code = "(a) => {};";

    const fn = b.arrowFunctionExpression(
      [b.identifier("a")],
      b.blockStatement([]),
      false,
    );

    const ast = b.program([b.expressionStatement(fn)]);

    const printer = new Printer({
      arrowParensAlways: true,
    });
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow function when binding", function () {
    const code = "var a = (x => y).bind(z);";

    const fn = b.arrowFunctionExpression(
      [b.identifier("x")],
      b.identifier("y"),
    );

    const declaration = b.variableDeclaration("var", [
      b.variableDeclarator(
        b.identifier("a"),
        b.callExpression(b.memberExpression(fn, b.identifier("bind"), false), [
          b.identifier("z"),
        ]),
      ),
    ]);

    const ast = b.program([declaration]);

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around async arrow functions with args", function () {
    let code = "async () => {};";

    const fn = b.arrowFunctionExpression([], b.blockStatement([]), false);
    fn.async = true;

    const ast = b.program([b.expressionStatement(fn)]);

    const printer = new Printer({
      tabWidth: 2,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // No parenthesis for single params if they are identifiers
    code = "async foo => {};";
    fn.params = [b.identifier("foo")];

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Add parenthesis for destructuring
    code = "async ([a, b]) => {};";
    fn.params = [b.arrayPattern([b.identifier("a"), b.identifier("b")])];

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow functions with single arg and a type", function () {
    const code = "(a: b) => {};";

    const arg = b.identifier("a");
    arg.typeAnnotation = b.typeAnnotation(
      b.genericTypeAnnotation(b.identifier("b"), null),
    );

    const fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);

    const ast = b.program([b.expressionStatement(fn)]);

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow functions with single arg and a return type", function () {
    const code = "(a): void => {};";

    const arg = b.identifier("a");

    const fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);

    fn.returnType = b.typeAnnotation(b.voidTypeAnnotation());

    const ast = b.program([b.expressionStatement(fn)]);

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow function body when returning object literal with typescript typecast", function () {
    const code = "() => ({} as object);";

    const fn = b.arrowFunctionExpression(
      [],
      b.tsAsExpression(b.objectExpression([]), b.tsObjectKeyword()),
      false,
    );

    const ast = b.program([b.expressionStatement(fn)]);

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around nullish expression, when nullish expression is BinaryExpression's child", function () {
    const code = "let a = (c?.b ?? 1) + 1;";

    const b = recast.types.builders;

    const ast = b.variableDeclaration("let", [
      b.variableDeclarator(
        b.identifier("a"),
        b.binaryExpression(
          "+",
          b.logicalExpression(
            "??",
            b.optionalMemberExpression(b.identifier("c"), b.identifier("b")),
            b.numericLiteral(1),
          ),
          b.numericLiteral(1),
        ),
      ),
    ]);

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints class property initializers with type annotations correctly", function () {
    const code = ["class A {", "  foo = (a: b): void => {};", "}"].join(eol);

    const arg = b.identifier("a");
    arg.typeAnnotation = b.typeAnnotation(
      b.genericTypeAnnotation(b.identifier("b"), null),
    );

    const fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);
    fn.returnType = b.typeAnnotation(b.voidTypeAnnotation());

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([b.classProperty(b.identifier("foo"), fn, null, false)]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints ClassProperty correctly", function () {
    const code = ["class A {", "  foo: Type = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classProperty(
            b.identifier("foo"),
            b.identifier("Bar"),
            b.typeAnnotation(
              b.genericTypeAnnotation(b.identifier("Type"), null),
            ),
          ),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints 'definite' ClassProperty correctly", function () {
    const code = ["class A {", "  foo!: string;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          Object.assign(
            b.classProperty(
              b.identifier("foo"),
              null,
              b.typeAnnotation(b.stringTypeAnnotation()),
            ),
            { definite: true },
          ),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints static ClassProperty correctly", function () {
    const code = ["class A {", "  static foo = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classProperty(b.identifier("foo"), b.identifier("Bar"), null, true),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints ClassAccessorProperty correctly", function () {
    const code = ["class A {", "  accessor foo: Type = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classAccessorProperty.from({
            key: b.identifier("foo"),
            value: b.identifier("Bar"),
            typeAnnotation: b.tsTypeAnnotation(
              b.tsTypeReference(b.identifier("Type")),
            ),
          }),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints 'definite' ClassAccessorProperty correctly", function () {
    const code = ["class A {", "  accessor foo!: string;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classAccessorProperty.from({
            key: b.identifier("foo"),
            typeAnnotation: b.tsTypeAnnotation(b.tsStringKeyword()),
            definite: true,
          }),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints static ClassAccessorProperty correctly", function () {
    const code = ["class A {", "  static accessor foo = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classAccessorProperty.from({
            key: b.identifier("foo"),
            value: b.identifier("Bar"),
            static: true,
          }),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints abstract ClassAccessorProperty correctly", function () {
    const code = ["class A {", "  abstract accessor foo = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classAccessorProperty.from({
            key: b.identifier("foo"),
            value: b.identifier("Bar"),
            abstract: true,
          }),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints override ClassAccessorProperty correctly", function () {
    const code = ["class A {", "  override accessor foo = Bar;", "}"].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("A"),
        b.classBody([
          b.classAccessorProperty.from({
            key: b.identifier("foo"),
            value: b.identifier("Bar"),
            override: true,
          }),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints template expressions correctly", function () {
    let code = ["graphql`query`;"].join(eol);

    let ast = b.program([
      b.taggedTemplateStatement(
        b.identifier("graphql"),
        b.templateLiteral(
          [b.templateElement({ cooked: "query", raw: "query" }, false)],
          [],
        ),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
    });

    let pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    code = ["graphql`query${foo.getQuery()}field${bar}`;"].join(eol);

    ast = b.program([
      b.taggedTemplateStatement(
        b.identifier("graphql"),
        b.templateLiteral(
          [
            b.templateElement({ cooked: "query", raw: "query" }, false),
            b.templateElement({ cooked: "field", raw: "field" }, false),
            b.templateElement({ cooked: "", raw: "" }, true),
          ],
          [
            b.callExpression(
              b.memberExpression(
                b.identifier("foo"),
                b.identifier("getQuery"),
                false,
              ),
              [],
            ),
            b.identifier("bar"),
          ],
        ),
      ),
    ]);

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    code = [
      "graphql`",
      "  query {",
      "    ${foo.getQuery()},",
      "    field,",
      "    ${bar},",
      "  }",
      "`;",
    ].join(eol);

    ast = parse(code);
    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("preserves newlines at the beginning/end of files", function () {
    const code = ["", "f();", ""].join(eol);

    const lines = fromString(code);
    const ast = parse(code, {
      esprima: {
        parse: function (source: string, options?: any) {
          const program = require("esprima").parse(source, options);
          n.Program.assert(program);
          // Expand ast.program.loc to include any
          // leading/trailing whitespace, to simulate the
          // behavior of some parsers, e.g. babel-core.
          lines.skipSpaces(program.loc.start, true, true);
          lines.skipSpaces(program.loc.end, false, true);
          return program;
        },
      },
    });

    ast.program.body.unshift(b.debuggerStatement());

    const printer = new Printer({
      tabWidth: 2,
    });

    assert.strictEqual(
      printer.print(ast).code,
      ["", "debugger;", "f();", ""].join(eol),
    );
  });

  it("respects options.lineTerminator", function () {
    const lines = ["var first = 1;", "var second = 2;"];
    const code = lines.join("\n");
    const ast = parse(code);

    assert.strictEqual(
      new Printer({
        lineTerminator: "\r\n",
      }).print(ast).code,
      lines.join("\r\n"),
    );
  });

  it("preserves indentation in unmodified template expressions", function () {
    const printer = new Printer({
      tabWidth: 2,
    });

    const code = [
      "var x = {",
      "  y: () => Relay.QL`",
      "    query {",
      "      ${foo},",
      "      field,",
      "    }",
      "  `",
      "};",
    ].join(eol);

    const ast = parse(code);
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("preserves indentation in modified template expressions", function () {
    const code = [
      "const fragments = {",
      "  viewer: Relay.QL`",
      "    fragment on Viewer {   // 2 extraneous spaces.",
      "      actor {              // 2 extraneous spaces.",
      "        id,            // 2 extraneous spaces.",
      "        ${ foo},           // 3 extraneous spaces.",
      "        ${bar },              // Correct!",
      "        name,                // Correct!",
      "        ${baz},              // Correct!",
      "        address {          // 2 extraneous spaces.",
      "          id,          // 2 extraneous spaces.",
      "        },                 // 2 extraneous spaces.",
      "      }                    // 2 extraneous spaces.",
      "    }                      // 2 extraneous spaces.",
      "<~ This line should not be indented.",
      "  `,                       // 2 extraneous spaces.",
      "};",
    ].join(eol);

    const ast = parse(code);
    const printer = new Printer({
      tabWidth: 2,
    });

    recast.visit(ast, {
      visitTaggedTemplateExpression: function (path) {
        function replaceIdWithNodeId(path: any) {
          path.replace(path.value.replace(/\bid\b/g, "nodeID"));
        }

        path.get("quasi", "quasis").each(function (quasiPath: any) {
          replaceIdWithNodeId(quasiPath.get("value", "cooked"));
          replaceIdWithNodeId(quasiPath.get("value", "raw"));
        });

        this.traverse(path);
      },
    });

    const actual = printer.print(ast).code;
    const expected = code.replace(/\bid\b/g, "nodeID");

    assert.strictEqual(actual, expected);
  });

  it("prints commas for flow object types by default", function () {
    const code = [
      "type MyType = {",
      "    message: string,",
      "    isAwesome: boolean,",
      "};",
    ].join(eol);

    const ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false,
        ),
        b.objectTypeProperty(
          b.identifier("isAwesome"),
          b.booleanTypeAnnotation(),
          false,
        ),
      ]),
    );

    const printer = new Printer();
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("shouldn't print a trailing comma for single-line flow object types", function () {
    const code1 = "type MyType = { message: string };";
    const code2 = "type MyType = { [key: string]: string };";

    const ast1 = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false,
        ),
      ]),
    );

    const ast2 = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation(
        [],
        [
          b.objectTypeIndexer(
            b.identifier("key"),
            b.stringTypeAnnotation(),
            b.stringTypeAnnotation(),
          ),
        ],
      ),
    );

    const printer = new Printer({ trailingComma: true });
    const pretty1 = printer.printGenerically(ast1).code;
    const pretty2 = printer.printGenerically(ast2).code;
    assert.strictEqual(pretty1, code1);
    assert.strictEqual(pretty2, code2);
  });

  it("prints semicolons for flow object types when options.flowObjectCommas is falsy", function () {
    const code = [
      "type MyType = {",
      "    message: string;",
      "    isAwesome: boolean;",
      "};",
    ].join(eol);

    const ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false,
        ),
        b.objectTypeProperty(
          b.identifier("isAwesome"),
          b.booleanTypeAnnotation(),
          false,
        ),
      ]),
    );

    const printer = new Printer({ flowObjectCommas: false });
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints parens for nullable union/intersection types", function () {
    const code = "type MyType = ?(string | number);";

    const ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.nullableTypeAnnotation(
        b.unionTypeAnnotation([
          b.stringTypeAnnotation(),
          b.numberTypeAnnotation(),
        ]),
      ),
    );

    const printer = new Printer({});
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  (nodeMajorVersion >= 6 ? it : xit)(
    "uses the `arrayBracketSpacing` and the `objectCurlySpacing` option",
    function () {
      const babelParser = require("@babel/parser");
      const parseOptions = {
        parser: {
          parse: (source: string) =>
            babelParser.parse(source, {
              sourceType: "module",
              plugins: ["flow"],
            }),
        },
      };

      const testCaseList = [
        {
          printerConfig: {
            arrayBracketSpacing: false,
            objectCurlySpacing: false,
          },
          code: [
            'import {java, script} from "javascript";',
            "",
            "function foo(a) {",
            "    type MyType = {message: string};",
            "    return [1, 2, 3];",
            "}",
            "",
            "export {foo};",
          ].join(eol),
        },
        {
          printerConfig: {
            arrayBracketSpacing: true,
            objectCurlySpacing: false,
          },
          code: [
            'import {java, script} from "javascript";',
            "",
            "function foo(a) {",
            "    type MyType = {message: string};",
            "    return [ 1, 2, 3 ];",
            "}",
            "",
            "export {foo};",
          ].join(eol),
        },
        {
          printerConfig: {
            arrayBracketSpacing: false,
            objectCurlySpacing: true,
          },
          code: [
            'import { java, script } from "javascript";',
            "",
            "function foo(a) {",
            "    type MyType = { message: string };",
            "    return [1, 2, 3];",
            "}",
            "",
            "export { foo };",
          ].join(eol),
        },
        {
          printerConfig: {
            arrayBracketSpacing: true,
            objectCurlySpacing: true,
          },
          code: [
            'import { java, script } from "javascript";',
            "",
            "function foo(a) {",
            "    type MyType = { message: string };",
            "    return [ 1, 2, 3 ];",
            "}",
            "",
            "export { foo };",
          ].join(eol),
        },
      ];

      testCaseList.forEach(function (testCase) {
        const code = testCase.code;
        const printer = new Printer(testCase.printerConfig);

        const ast = parse(code, parseOptions);
        const pretty = printer.printGenerically(ast).code;

        assert.strictEqual(pretty, code);
      });
    },
  );

  it("prints no extra semicolons in for-loop heads (#377)", function () {
    function check(head: any, parser: any) {
      const source = "for (" + head + ") console.log(i);";
      const ast = recast.parse(source, { parser: parser });
      const loop = ast.program.body[0];
      assert.strictEqual(loop.type, "ForStatement");
      loop.body = b.blockStatement([]);

      const reprinted = recast.print(ast).code;

      const openParenIndex = reprinted.indexOf("(");
      assert.notStrictEqual(openParenIndex, -1);

      const closeParenIndex = reprinted.indexOf(")", openParenIndex);
      assert.notStrictEqual(closeParenIndex, -1);

      const newHead = reprinted.slice(openParenIndex + 1, closeParenIndex);

      assert.strictEqual(newHead.split(";").length, 3);
    }

    function checkWith(parser: any) {
      check("let i = 0; i < 1; i++", parser);
      check("let i = 0 ; i < 1; i++", parser);
      check("let i = 0; ; i++", parser);
      check("let i = 0 ; ; i++", parser);
      check("let i = 0; i < 1; ", parser);
      check("let i = 0 ; i < 1; ", parser);
      check("let i = 0; ; ", parser);
      check("let i = 0 ; ; ", parser);
    }

    checkWith(require("../parsers/esprima"));
    checkWith(require("../parsers/acorn"));

    if (nodeMajorVersion >= 6) {
      checkWith(require("../parsers/babel"));
      checkWith(require("../parsers/typescript"));
      checkWith(require("../parsers/flow"));
    }
  });

  it("parenthesizes NumericLiteral MemberExpression objects", function () {
    const nonBabelNode = b.memberExpression(b.literal(1), b.identifier("foo"));

    const babelNode = b.memberExpression(
      b.numericLiteral(1),
      b.identifier("foo"),
    );

    assert.strictEqual(recast.print(nonBabelNode).code, "(1).foo");

    assert.strictEqual(recast.print(babelNode).code, "(1).foo");
  });

  it("obeys 'optional' property of OptionalMemberExpression", function () {
    const node = b.optionalMemberExpression(
      b.identifier("foo"),
      b.identifier("bar"),
    );

    assert.strictEqual(recast.print(node).code, "foo?.bar");

    const nonOptionalNode = b.optionalMemberExpression(
      b.identifier("foo"),
      b.identifier("bar"),
      false,
      false,
    );

    assert.strictEqual(recast.print(nonOptionalNode).code, "foo.bar");
  });

  it("prints chained expression elements", function () {
    const node = b.chainExpression(
      b.memberExpression(b.identifier("foo"), b.identifier("bar"), false),
    );

    assert.strictEqual(recast.print(node).code, "foo.bar");
  });

  it("prints optional ChainExpressions", function () {
    const node = b.chainExpression(
      b.optionalMemberExpression(
        b.identifier("foo"),
        b.identifier("bar"),
        false,
        true,
      ),
    );

    assert.strictEqual(recast.print(node).code, "foo?.bar");
  });

  it("reprints various optional member/call expressions", function () {
    const parser = require("../parsers/babel");

    function check(code: string) {
      const ast = recast.parse(code, { parser });
      const exprStmt = ast.program.body[0];
      n.ExpressionStatement.assert(exprStmt);
      const expr = exprStmt.expression;
      const output = recast.prettyPrint(expr, { tabWidth: 2 }).code;
      assert.strictEqual(code, output);
    }

    check("a.b");
    check("a?.b");
    check("a?.b.c");
    check("a.b?.c");
    check("a?.b?.c");
    check("a?.(b)");
    check("a?.b(c)");
    check("a?.b?.(c)");
    check("a.b?.(c)");
    check("a.b?.(c)?.d");
    check("a.b?.(c)?.d(e)");
    check("a.b?.(c)?.d?.(e)");
    check("a?.b?.(c).d?.(e)");
    check("a?.b?.(c)?.d?.(e)");
    check("(a?.b)?.(c)?.d?.(e)");
    check("(a?.b?.(c)?.d)?.(e)");
  });

  it("prints numbers in bases other than 10 without converting them", function () {
    const code = [
      "let base10 = 6;",
      "let hex = 0xf00d;",
      "let binary = 0b1010;",
      "let octal = 0o744;",
    ].join(eol);
    const ast = parse(code);
    const printer = new Printer({});
    const pretty = printer.printGenerically(ast).code;

    assert.strictEqual(pretty, code);
  });

  it("reprints modified numeric literals", function () {
    const code = "3 + 4;";
    const ast = parse(code);
    const expr = ast.program.body[0].expression;
    const left = expr.left;
    const right = expr.right;

    left.value++;
    right.value++;

    assert.strictEqual(recast.print(ast).code, "4 + 5;");
  });

  it("prints flow tuple type annotations correctly, respecting array options", function () {
    const code = [
      "type MyTupleType = [",
      '  "tuple element 1",',
      '  "tuple element 2",',
      '  "tuple element 3",',
      "];",
    ].join(eol);

    const ast = b.program([
      b.typeAlias(
        b.identifier("MyTupleType"),
        null,
        b.tupleTypeAnnotation([
          b.stringLiteralTypeAnnotation("tuple element 1", "tuple element 1"),
          b.stringLiteralTypeAnnotation("tuple element 2", "tuple element 2"),
          b.stringLiteralTypeAnnotation("tuple element 3", "tuple element 3"),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 40,
      trailingComma: true,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around object expression", function () {
    const code = "({}).x = 1;";

    const assignment = b.assignmentExpression(
      "=",
      b.memberExpression(b.objectExpression([]), b.identifier("x"), false),
      b.literal(1),
    );

    const ast = b.program([b.expressionStatement(assignment)]);

    const printer = new Printer({
      arrowParensAlways: true,
    });
    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around conditional", function () {
    const code = "new (typeof a ? b : c)();";
    const callee = recast.parse("typeof a ? b : c").program.body[0].expression;

    const newExpression = b.newExpression(callee, []);

    const ast = b.program([b.expressionStatement(newExpression)]);

    const printer = new Printer({
      arrowParensAlways: true,
    });
    const pretty = printer.print(ast).code;
    assert.strictEqual(pretty, code);
  });

  for (const operator of ["-", "+", "~", "!", "typeof", "void"] as const) {
    it(`adds parenthesis around '${operator}' unary expression in exponentiation expression`, function () {
      const code = `(${
        /[a-z]/.test(operator) ? `${operator} ` : operator
      }a) ** 2;`;
      const ast = b.program([
        b.expressionStatement(
          b.binaryExpression(
            "**",
            b.unaryExpression(operator, b.identifier("a"), true),
            b.literal(2),
          ),
        ),
      ]);

      const printer = new Printer();
      const pretty = printer.print(ast).code;
      assert.strictEqual(pretty, code);
    });
  }

  it("prints flow object type internal slots correctly", function () {
    const code = [
      "type MyObjectType = {",
      "  [myIndexer: string]: any,",
      "  (myParameter: any): any,",
      "  (myOptionalParameter?: any): any,",
      "  (myParameterWithRest: any, ...rest: any[]): any,",
      "  [[myInternalSlot]]: any,",
      "  static [[myStaticOptionalInternalSlot]]?: (arg: any) => any,",
      "  static [[myStaticMethodOptionalInternalSlot]]?(arg: any): any,",
      "  myProperty: any,",
      "};",
    ].join(eol);

    const ast = b.program([
      b.typeAlias(
        b.identifier("MyObjectType"),
        null,
        b.objectTypeAnnotation.from({
          properties: [
            b.objectTypeProperty(
              b.identifier("myProperty"),
              b.anyTypeAnnotation(),
              false,
            ),
          ],
          indexers: [
            b.objectTypeIndexer(
              b.identifier("myIndexer"),
              b.stringTypeAnnotation(),
              b.anyTypeAnnotation(),
            ),
          ],
          callProperties: [
            b.objectTypeCallProperty(
              b.functionTypeAnnotation(
                [
                  b.functionTypeParam(
                    b.identifier("myParameter"),
                    b.anyTypeAnnotation(),
                    false,
                  ),
                ],
                b.anyTypeAnnotation(),
                null,
                null,
              ),
            ),
            b.objectTypeCallProperty(
              b.functionTypeAnnotation(
                [
                  b.functionTypeParam(
                    b.identifier("myOptionalParameter"),
                    b.anyTypeAnnotation(),
                    true,
                  ),
                ],
                b.anyTypeAnnotation(),
                null,
                null,
              ),
            ),
            b.objectTypeCallProperty(
              b.functionTypeAnnotation(
                [
                  b.functionTypeParam(
                    b.identifier("myParameterWithRest"),
                    b.anyTypeAnnotation(),
                    false,
                  ),
                ],
                b.anyTypeAnnotation(),
                b.functionTypeParam(
                  b.identifier("rest"),
                  b.arrayTypeAnnotation(b.anyTypeAnnotation()),
                  false,
                ),
                null,
              ),
            ),
          ],
          internalSlots: [
            b.objectTypeInternalSlot.from({
              id: b.identifier("myInternalSlot"),
              value: b.anyTypeAnnotation(),
              static: false,
              method: false,
              optional: false,
            }),
            b.objectTypeInternalSlot.from({
              id: b.identifier("myStaticOptionalInternalSlot"),
              value: b.functionTypeAnnotation(
                [
                  b.functionTypeParam(
                    b.identifier("arg"),
                    b.anyTypeAnnotation(),
                    false,
                  ),
                ],
                b.anyTypeAnnotation(),
                null,
                null,
              ),
              static: true,
              method: false,
              optional: true,
            }),
            b.objectTypeInternalSlot.from({
              id: b.identifier("myStaticMethodOptionalInternalSlot"),
              value: b.functionTypeAnnotation(
                [
                  b.functionTypeParam(
                    b.identifier("arg"),
                    b.anyTypeAnnotation(),
                    false,
                  ),
                ],
                b.anyTypeAnnotation(),
                null,
                null,
              ),
              static: true,
              method: true,
              optional: true,
            }),
          ],
        }),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 40,
      trailingComma: true,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints flow type alias to function correctly", function () {
    const code = ["type MyTypeAlias = (x?: ?number) => string;"].join(eol);

    const ast = b.program([
      b.typeAlias(
        b.identifier("MyTypeAlias"),
        null,
        b.functionTypeAnnotation(
          [
            b.functionTypeParam(
              b.identifier("x"),
              b.nullableTypeAnnotation(b.numberTypeAnnotation()),
              true,
            ),
          ],
          b.stringTypeAnnotation(),
          null,
          null,
        ),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 40,
      trailingComma: true,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints class private methods and properties correctly", function () {
    const code = [
      "class MyClassWithPrivate {",
      "  #myPrivateProperty: any;",
      "  #myPrivatePropertyWithValue: any = value;",
      "  #myPrivateMethod() {}",
      "}",
    ].join(eol);

    const ast = b.program([
      b.classDeclaration(
        b.identifier("MyClassWithPrivate"),
        b.classBody([
          b.classPrivateProperty.from({
            key: b.privateName(b.identifier("myPrivateProperty")),
            typeAnnotation: b.typeAnnotation(b.anyTypeAnnotation()),
            value: null,
          }),
          b.classPrivateProperty.from({
            key: b.privateName(b.identifier("myPrivatePropertyWithValue")),
            typeAnnotation: b.typeAnnotation(b.anyTypeAnnotation()),
            value: b.identifier("value"),
          }),
          b.classPrivateMethod(
            b.privateName(b.identifier("myPrivateMethod")),
            [],
            b.blockStatement([]),
          ),
        ]),
      ),
    ]);

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 40,
      trailingComma: true,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints an interpreter directive correctly", function () {
    const code = ["#!/usr/bin/env node", 'console.log("Hello, world!");'].join(
      eol,
    );

    const ast = b.program.from({
      interpreter: b.interpreterDirective("/usr/bin/env node"),
      body: [
        b.expressionStatement(
          b.callExpression(
            b.memberExpression(b.identifier("console"), b.identifier("log")),
            [b.stringLiteral("Hello, world!")],
          ),
        ),
      ],
    });

    const pretty = new Printer().printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints an interface type annotation correctly", function () {
    const code = [
      "let myVar: interface extends MyOtherInterface { myProperty: any };",
    ].join(eol);

    const ast = b.program([
      b.variableDeclaration("let", [
        b.variableDeclarator(
          b.identifier.from({
            name: "myVar",
            typeAnnotation: b.typeAnnotation(
              b.interfaceTypeAnnotation(
                b.objectTypeAnnotation([
                  b.objectTypeProperty(
                    b.identifier("myProperty"),
                    b.anyTypeAnnotation(),
                    false,
                  ),
                ]),
                [b.interfaceExtends(b.identifier("MyOtherInterface"))],
              ),
            ),
          }),
        ),
      ]),
    ]);

    const pretty = new Printer().printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("object destructuring for function parameters", function () {
    const code = [
      "function myFunction(",
      "    {",
      '        yes = "y",',
      '        no: no = "n",',
      "        short,",
      "        long: longHand",
      "    }",
      ") {}",
    ].join(eol);

    const simplifiedDefaultArgProperty = b.property(
      "init",
      b.identifier("yes"),
      b.assignmentPattern(b.identifier("yes"), b.literal("y")),
    );
    simplifiedDefaultArgProperty.shorthand = true;

    const notSimplifiedDefaultArgProperty = b.property(
      "init",
      b.identifier("no"),
      b.assignmentPattern(b.identifier("no"), b.literal("n")),
    );

    const simplifiedProperty = b.property(
      "init",
      b.identifier("short"),
      b.identifier("short"),
    );
    simplifiedProperty.shorthand = true;

    const notSimplifiedProperty = b.property(
      "init",
      b.identifier("long"),
      b.identifier("longHand"),
    );

    const ast = b.program([
      b.functionDeclaration(
        b.identifier("myFunction"),
        [
          b.objectPattern([
            simplifiedDefaultArgProperty,
            notSimplifiedDefaultArgProperty,
            simplifiedProperty,
            notSimplifiedProperty,
          ]),
        ],
        b.blockStatement([]),
      ),
    ]);

    const pretty = new Printer().printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("does not print shorthand properties if key != value", function () {
    const code = ["var o = {", "    value: value0", "};"].join(eol);

    const ast = b.program([
      b.variableDeclaration("var", [
        b.variableDeclarator(
          b.identifier("o"),
          b.objectExpression([
            b.property.from({
              kind: "init",
              key: b.identifier("value"),
              value: b.identifier("value0"),
              shorthand: true,
            }),
          ]),
        ),
      ]),
    ]);

    const pretty = new Printer().printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("can pretty-print StaticBlock nodes in class bodies", function () {
    const code = [
      "class A {",
      "  static a = 1;",
      "  static #b = 2;",
      "",
      "  static {",
      "    ++this.a;",
      "    this.#b++;",
      "  }",
      "}",
    ].join(eol);

    const printer = new Printer({ tabWidth: 2 });
    const ast = parse(code, {
      parser: tsParser,
    });
    const pretty = printer.printGenerically(ast).code;

    assert.strictEqual(pretty, code);

    types.visit(ast, {
      visitStaticBlock(path) {
        assert.strictEqual(path.get("body", "length").value, 2);
        while (path.get("body").shift()) {}
        assert.strictEqual(path.get("body", "length").value, 0);
        return false;
      },
    });

    const emptyBlockReprinted = printer.print(ast).code;
    assert.strictEqual(
      emptyBlockReprinted,
      [
        "class A {",
        "  static a = 1;",
        "  static #b = 2;",
        "", // Empty line preserved because of conservative printer.print reprinting.
        "  static {}",
        "}",
      ].join(eol),
    );

    const emptyBlockPrettyPrinted = printer.printGenerically(ast).code;
    assert.strictEqual(
      emptyBlockPrettyPrinted,
      [
        "class A {",
        "  static a = 1;",
        "  static #b = 2;",
        "  static {}",
        "}",
      ].join(eol),
    );
  });

  it("can pretty-print ImportAttribute syntax", function () {
    const code = [
      'import * as noAssertions from "./module";',
      'import * as emptyAssert from "./module" assert {};',
      'import json from "./module" assert { type: "json" };',
      'import * as ns from "./module" assert { type: "reallyLongStringLiteralThatShouldTriggerReflowOntoMultipleLines" }',
    ].join(eol);

    const expectedPretty = [
      'import * as noAssertions from "./module";',
      'import * as emptyAssert from "./module";',
      'import json from "./module" assert { type: "json" };',
      "",
      'import * as ns from "./module" assert {',
      '  type: "reallyLongStringLiteralThatShouldTriggerReflowOntoMultipleLines"',
      "};",
    ].join(eol);

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 60,
    });

    const ast = parse(code, {
      parser: tsParser,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, expectedPretty);

    types.visit(ast, {
      visitImportAttribute(path) {
        this.traverse(path);
        const valuePath = path.get("value");
        const strLit = valuePath.value;
        types.namedTypes.StringLiteral.assert(strLit);
        if (strLit.value.startsWith("reallyLong")) {
          valuePath.replace(b.stringLiteral("shorter"));
        }
      },
    });

    const reprinted = printer.print(ast).code;
    assert.strictEqual(
      reprinted,
      [
        'import * as noAssertions from "./module";',
        'import * as emptyAssert from "./module" assert {};',
        'import json from "./module" assert { type: "json" };',
        'import * as ns from "./module" assert { type: "shorter" }',
      ].join(eol),
    );
  });

  it("can pretty-print RecordExpression syntax", function () {
    const code = [
      "const rec = #{",
      "  a: #{",
      "    b: 1234",
      "  },",
      "",
      "  c: #{",
      '    d: "dee"',
      "  }",
      "};",
    ].join(eol);

    const ast = parse(code, {
      parser: tsParser,
    });

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 60,
    });

    const pretty = printer.printGenerically(ast).code;

    assert.strictEqual(pretty, code);
  });

  it("can pretty-print TupleExpression syntax", function () {
    const code = [
      "const keyArgs = #[",
      '  "query",',
      '  "type",',
      '  "@connection",',
      '  #["key", "filter"]',
      "];",
    ].join(eol);

    const ast = parse(code, {
      parser: tsParser,
    });

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 20,
    });

    const pretty = printer.printGenerically(ast).code;

    assert.strictEqual(pretty, code);
  });

  it("can pretty-print ModuleExpression syntax", function () {
    const code = [
      'import { log } from "logger";',
      "export const url = import.meta.url;",
      "log(url);",
    ].join(eol);

    const ast = parse(code, {
      parser: tsParser,
    });

    const printer = new Printer({
      tabWidth: 2,
      wrapColumn: 20,
    });

    const pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    const reprinted = printer.print(b.moduleExpression(ast.program)).code;
    assert.strictEqual(
      reprinted,
      ["module {", ...code.split(eol).map((line) => "  " + line), "}"].join(
        eol,
      ),
    );
  });
});
