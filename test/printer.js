var assert = require("assert");
var recast = require("..");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var n = require("../lib/types").namedTypes;
var b = require("../lib/types").builders;
var fromString = require("../lib/lines").fromString;
var eol = require("os").EOL;

describe("printer", function() {
  it("Printer", function testPrinter(done) {
    var code = testPrinter + "";
    var ast = parse(code);
    var printer = new Printer;

    assert.strictEqual(typeof printer.print, "function");
    assert.strictEqual(printer.print(null).code, "");

    var string = printer.printGenerically(ast).code;
    assert.ok(string.indexOf("done();") > 0);

    string = printer.print(ast).code;

    // TODO

    assert.ok(string.indexOf("// TODO") > 0);

    done();
  });

  var uselessSemicolons = [
    'function a() {',
    '  return "a";',
    '};',
    '',
    'function b() {',
    '  return "b";',
    '};'
  ].join(eol);

  it("EmptyStatements", function() {
    var ast = parse(uselessSemicolons);
    var printer = new Printer({ tabWidth: 2 });

    var reprinted = printer.print(ast).code;
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, uselessSemicolons);

    var generic = printer.printGenerically(ast).code;
    var withoutTrailingSemicolons = uselessSemicolons.replace(/\};/g, "}");
    assert.strictEqual(typeof generic, "string");
    assert.strictEqual(generic, withoutTrailingSemicolons);
  });

  var importantSemicolons = [
    "var a = {};", // <--- this trailing semi-colon is very important
    "(function() {})();"
  ].join(eol);

  it("IffeAfterVariableDeclarationEndingInObjectLiteral", function() {
    var ast = parse(importantSemicolons);
    var printer = new Printer({ tabWidth: 2 });

    var reprinted = printer.printGenerically(ast).code;
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, importantSemicolons);
  });

  var arrayExprWithTrailingComma = '[1, 2,];';
  var arrayExprWithoutTrailingComma = '[1, 2];';

  it("ArrayExpressionWithTrailingComma", function() {
    var ast = parse(arrayExprWithTrailingComma);
    var printer = new Printer({ tabWidth: 2 });

    var body = ast.program.body;
    var arrayExpr = body[0].expression;
    n.ArrayExpression.assert(arrayExpr);

    // This causes the array expression to be reprinted.
    var arrayExprOrig = arrayExpr.original;
    arrayExpr.original = null;

    assert.strictEqual(
      printer.print(ast).code,
      arrayExprWithoutTrailingComma
    );

    arrayExpr.original = arrayExprOrig;

    assert.strictEqual(
      printer.print(ast).code,
      arrayExprWithTrailingComma
    );
  });

  var arrayExprWithHoles = '[,,];';

  it("ArrayExpressionWithHoles", function() {
    var ast = parse(arrayExprWithHoles);
    var printer = new Printer({ tabWidth: 2 });

    var body = ast.program.body;
    var arrayExpr = body[0].expression;
    n.ArrayExpression.assert(arrayExpr);

    // This causes the array expression to be reprinted.
    var arrayExprOrig = arrayExpr.original;
    arrayExpr.original = null;

    assert.strictEqual(
      printer.print(ast).code,
      arrayExprWithHoles
    );

    arrayExpr.original = arrayExprOrig;

    assert.strictEqual(
      printer.print(ast).code,
      arrayExprWithHoles
    );
  });

  var objectExprWithTrailingComma = '({x: 1, y: 2,});';
  var objectExprWithoutTrailingComma = '({' + eol + '  x: 1,' + eol + '  y: 2' + eol + '});';

  it("ArrayExpressionWithTrailingComma", function() {
    var ast = parse(objectExprWithTrailingComma);
    var printer = new Printer({ tabWidth: 2 });

    var body = ast.program.body;
    var objectExpr = body[0].expression;
    n.ObjectExpression.assert(objectExpr);

    // This causes the array expression to be reprinted.
    var objectExprOrig = objectExpr.original;
    objectExpr.original = null;

    assert.strictEqual(
      printer.print(ast).code,
      objectExprWithoutTrailingComma
    );

    objectExpr.original = objectExprOrig;

    assert.strictEqual(
      printer.print(ast).code,
      objectExprWithTrailingComma
    );
  });

  var switchCase = [
    "switch (test) {",
    "  default:",
    "  case a: break",
    "",
    "  case b:",
    "    break;",
    "}",
  ].join(eol);

  var switchCaseReprinted = [
    "if (test) {",
    "  switch (test) {",
    "  default:",
    "  case a: break",
    "  case b:",
    "    break;",
    "  }",
    "}"
  ].join(eol);

  var switchCaseGeneric = [
    "if (test) {",
    "  switch (test) {",
    "  default:",
    "  case a:",
    "    break;",
    "  case b:",
    "    break;",
    "  }",
    "}"
  ].join(eol);

  it("SwitchCase", function() {
    var ast = parse(switchCase);
    var printer = new Printer({ tabWidth: 2 });

    var body = ast.program.body;
    var switchStmt = body[0];
    n.SwitchStatement.assert(switchStmt);

    // This causes the switch statement to be reprinted.
    switchStmt.original = null;

    body[0] = b.ifStatement(
      b.identifier("test"),
      b.blockStatement([
        switchStmt
      ])
    );

    assert.strictEqual(
      printer.print(ast).code,
      switchCaseReprinted
    );

    assert.strictEqual(
      printer.printGenerically(ast).code,
      switchCaseGeneric
    );
  });

  var tryCatch = [
    "try {",
    "  a();",
    "} catch (e) {",
    "  b(e);",
    "}"
  ].join(eol);

  it("IndentTryCatch", function() {
    var ast = parse(tryCatch);
    var printer = new Printer({ tabWidth: 2 });
    var body = ast.program.body;
    var tryStmt = body[0];
    n.TryStatement.assert(tryStmt);

    // Force reprinting.
    assert.strictEqual(printer.printGenerically(ast).code, tryCatch);
  });

  var classBody = [
    "class A {",
    "  foo(x) { return x }",
    "  bar(y) { this.foo(y); }",
    "  baz(x, y) {",
    "    this.foo(x);",
    "    this.bar(y);",
    "  }",
    "}"
  ];

  var classBodyExpected = [
    "class A {",
    "  foo(x) { return x }",
    "  bar(y) { this.foo(y); }",
    "  baz(x, y) {",
    "    this.foo(x);",
    "    this.bar(y);",
    "  }",
    "  foo(x) { return x }",
    "}"
  ];

  it("MethodPrinting", function() {
    var code = classBody.join(eol);
    try {
      var ast = parse(code);
    } catch (e) {
      // ES6 not supported, silently finish
      return;
    }
    var printer = new Printer({ tabWidth: 2 });
    var cb = ast.program.body[0].body;
    n.ClassBody.assert(cb);

    // Trigger reprinting of the class body.
    cb.body.push(cb.body[0]);

    assert.strictEqual(
      printer.print(ast).code,
      classBodyExpected.join(eol)
    );
  });

  var multiLineParams = [
    "function f(/* first",
    "              xxx",
    "              param */ a,",
    "  // other params",
    "  b, c, // see?",
    "  d",
    ") {",
    "  return a + b + c + d;",
    "}"
  ];

  var multiLineParamsExpected = [
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
    "}"
  ];

  it("MultiLineParams", function() {
    var code = multiLineParams.join(eol);
    var ast = parse(code);
    var printer = new Printer({ tabWidth: 2 });

    recast.visit(ast, {
      visitNode: function(path) {
        path.value.original = null;
        this.traverse(path);
      }
    });

    assert.strictEqual(
      printer.print(ast).code,
      multiLineParamsExpected.join(eol)
    );
  });

  it("SimpleVarPrinting", function() {
    var printer = new Printer({ tabWidth: 2 });
    var varDecl = b.variableDeclaration("var", [
      b.variableDeclarator(b.identifier("x"), null),
      b.variableDeclarator(b.identifier("y"), null),
      b.variableDeclarator(b.identifier("z"), null)
    ]);

    assert.strictEqual(
      printer.print(b.program([varDecl])).code,
      "var x, y, z;"
    );

    var z = varDecl.declarations.pop();
    varDecl.declarations.pop();
    varDecl.declarations.push(z);

    assert.strictEqual(
      printer.print(b.program([varDecl])).code,
      "var x, z;"
    );
  });

  it("MultiLineVarPrinting", function() {
    var printer = new Printer({ tabWidth: 2 });
    var varDecl = b.variableDeclaration("var", [
      b.variableDeclarator(b.identifier("x"), null),
      b.variableDeclarator(
        b.identifier("y"),
        b.objectExpression([
          b.property("init", b.identifier("why"), b.literal("not"))
        ])
      ),
      b.variableDeclarator(b.identifier("z"), null)
    ]);

    assert.strictEqual(printer.print(b.program([varDecl])).code, [
      "var x,",
      "    y = {",
      "      why: \"not\"",
      "    },",
      "    z;"
    ].join(eol));
  });

  it("ForLoopPrinting", function() {
    var printer = new Printer({ tabWidth: 2 });
    var loop = b.forStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("i"), b.literal(0))
      ]),
      b.binaryExpression("<", b.identifier("i"), b.literal(3)),
      b.updateExpression("++", b.identifier("i"), /* prefix: */ false),
      b.expressionStatement(
        b.callExpression(b.identifier("log"), [b.identifier("i")])
      )
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var i = 0; i < 3; i++)" + eol +
        "  log(i);"
    );
  });

  it("EmptyForLoopPrinting", function() {
    var printer = new Printer({ tabWidth: 2 });
    var loop = b.forStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("i"), b.literal(0))
      ]),
      b.binaryExpression("<", b.identifier("i"), b.literal(3)),
      b.updateExpression("++", b.identifier("i"), /* prefix: */ false),
      b.emptyStatement()
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var i = 0; i < 3; i++)" + eol +
        "  ;"
    );
  });

  it("ForInLoopPrinting", function() {
    var printer = new Printer({ tabWidth: 2 });
    var loop = b.forInStatement(
      b.variableDeclaration("var", [
        b.variableDeclarator(b.identifier("key"), null)
      ]),
      b.identifier("obj"),
      b.expressionStatement(
        b.callExpression(b.identifier("log"), [b.identifier("key")])
      ),
      /* each: */ false
    );

    assert.strictEqual(
      printer.print(loop).code,
      "for (var key in obj)" + eol +
        "  log(key);"
    );
  });

  it("GuessTabWidth", function() {
    var code = [
      "function identity(x) {",
      "  return x;",
      "}"
    ].join(eol);

    var guessedTwo = [
      "function identity(x) {",
      "  log(x);",
      "  return x;",
      "}"
    ].join(eol);

    var explicitFour = [
      "function identity(x) {",
      "    log(x);",
      "    return x;",
      "}"
    ].join(eol);

    var ast = parse(code);

    var funDecl = ast.program.body[0];
    n.FunctionDeclaration.assert(funDecl);

    var funBody = funDecl.body.body;

    funBody.unshift(
      b.expressionStatement(
        b.callExpression(
          b.identifier("log"),
          funDecl.params
        )
      )
    );

    assert.strictEqual(
      new Printer().print(ast).code,
      guessedTwo
    );

    assert.strictEqual(
      new Printer({
        tabWidth: 4
      }).print(ast).code,
      explicitFour
    );
  });

  it("FunctionDefaultsAndRest", function() {
    var printer = new Printer();
    var funExpr = b.functionExpression(
      b.identifier('a'),
      [b.identifier('b'), b.identifier('c')],
      b.blockStatement([]),
      false,
      false,
      false,
      undefined
    );

    funExpr.defaults = [undefined, b.literal(1)];
    funExpr.rest = b.identifier('d');

    assert.strictEqual(
      printer.print(funExpr).code,
      "function a(b, c = 1, ...d) {}"
    );

    var arrowFunExpr = b.arrowFunctionExpression(
      [b.identifier('b'), b.identifier('c')],
      b.blockStatement([]),
      false,
      false,
      false,
      undefined);

    arrowFunExpr.defaults = [undefined, b.literal(1)];
    arrowFunExpr.rest = b.identifier('d');

    assert.strictEqual(
      printer.print(arrowFunExpr).code,
      "(b, c = 1, ...d) => {}"
    );
  });

  it("generically prints parsed code and generated code the same way", function() {
    var printer = new Printer();
    var ast = b.program([
      b.expressionStatement(b.literal(1)),
      b.expressionStatement(b.literal(2))
    ]);

    assert.strictEqual(
      printer.printGenerically(parse("1; 2;")).code,
      printer.printGenerically(ast).code
    );
  });

  it("ExportDeclaration semicolons", function() {
    var printer = new Printer();
    var code = "export var foo = 42;";
    var ast = parse(code);

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
  });

  var stmtListSpaces = [
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
    ""
  ].join(eol);

  var stmtListSpacesExpected = [
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
    ""
  ].join(eol);

  it("Statement list whitespace reuse", function() {
    var ast = parse(stmtListSpaces);
    var printer = new Printer({ tabWidth: 2 });
    var debugStmt = b.expressionStatement(b.identifier("debugger"));

    ast.program.body.splice(2, 0, debugStmt);
    ast.program.body.unshift(debugStmt);
    ast.program.body.push(debugStmt);

    assert.strictEqual(
      printer.print(ast).code,
      stmtListSpacesExpected
    );

    var funDecl = b.functionDeclaration(
      b.identifier("foo"),
      [],
      b.blockStatement(ast.program.body)
    );

    var linesModule = require("../lib/lines");

    assert.strictEqual(
      printer.print(funDecl).code,
      linesModule.concat([
        "function foo() {" + eol,
        linesModule.fromString(
          stmtListSpacesExpected.replace(/^\s+|\s+$/g, "")
        ).indent(2),
        eol + "}"
      ]).toString()
    );
  });

  it("should print static methods with the static keyword", function() {
    var printer = new Printer({ tabWidth: 4 });
    var ast = parse([
      "class A {",
      "  static foo() {}",
      "}"
    ].join(eol));

    var classBody = ast.program.body[0].body;
    n.ClassBody.assert(classBody);

    var foo = classBody.body[0];
    n.MethodDefinition.assert(foo);

    classBody.body.push(foo);

    foo.key.name = "formerlyFoo";

    assert.strictEqual(printer.print(ast).code, [
      "class A {",
      "    static formerlyFoo() {}",
      "    static formerlyFoo() {}",
      "}"
    ].join(eol));
  });

  it("should print string literals with the specified delimiter", function() {
    var ast = parse([
      "var obj = {",
      "    \"foo's\": 'bar',",
      "    '\"bar\\'s\"': /regex/m",
      "};"
    ].join(eol));

    var variableDeclaration = ast.program.body[0];
    n.VariableDeclaration.assert(variableDeclaration);

    var printer = new Printer({ quote: "single" });
    assert.strictEqual(printer.printGenerically(ast).code, [
      "var obj = {",
      "    'foo\\'s': 'bar',",
      "    '\"bar\\'s\"': /regex/m",
      "};"
    ].join(eol));

    var printer2 = new Printer({ quote: "double" });
    assert.strictEqual(printer2.printGenerically(ast).code, [
      "var obj = {",
      "    \"foo's\": \"bar\",",
      '    "\\"bar\'s\\"": /regex/m',
      "};"
    ].join(eol));

    var printer3 = new Printer({ quote: "auto" });
    assert.strictEqual(printer3.printGenerically(ast).code, [
      "var obj = {",
      '    "foo\'s": "bar",',
      '    \'"bar\\\'s"\': /regex/m',
      "};"
    ].join(eol));
  });

  it("should print block comments at head of class once", function() {
    // Given.
    var ast = parse([
      "/**",
      " * This class was in an IIFE and returned an instance of itself.",
      " */",
      "function SimpleClass() {",
      "};"
    ].join(eol));

    var classIdentifier = b.identifier('SimpleClass');
    var exportsExpression = b.memberExpression(b.identifier('module'), b.identifier('exports'), false);
    var assignmentExpression = b.assignmentExpression('=', exportsExpression, classIdentifier);
    var exportStatement = b.expressionStatement(assignmentExpression);

    ast.program.body.push(exportStatement);

    // When.
    var printedClass = new Printer().print(ast).code;

    // Then.
    assert.strictEqual(printedClass, [
      "/**",
      " * This class was in an IIFE and returned an instance of itself.",
      " */",
      "function SimpleClass() {",
      "}",
      "module.exports = SimpleClass;"
    ].join(eol));
  });

  it("should support computed properties", function() {
    var code = [
      'class A {',
      '  ["a"]() {}',
      '  [ID("b")]() {}',
      '  [0]() {}',
      '  [ID(1)]() {}',
      '  get ["a"]() {}',
      '  get [ID("b")]() {}',
      '  get [0]() {}',
      '  get [ID(1)]() {}',
      '  set ["a"](x) {}',
      '  set [ID("b")](x) {}',
      '  set [0](x) {}',
      '  set [ID(1)](x) {}',
      '  static ["a"]() {}',
      '  static [ID("b")]() {}',
      '  static [0]() {}',
      '  static [ID(1)]() {}',
      '  static get ["a"]() {}',
      '  static get [ID("b")]() {}',
      '  static get [0]() {}',
      '  static get [ID(1)]() {}',
      '  static set ["a"](x) {}',
      '  static set [ID("b")](x) {}',
      '  static set [0](x) {}',
      '  static set [ID(1)](x) {}',
      '}'
    ].join(eol);

    var ast = parse(code);

    var printer = new Printer({
      tabWidth: 2
    });

    assert.strictEqual(
      printer.printGenerically(ast).code,
      code
    );

    var code = [
      'var obj = {',
      '  ["a"]: 1,',
      '  [ID("b")]: 2,',
      '  [0]: 3,',
      '  [ID(1)]: 4,',
      '  ["a"]() {},',
      '  [ID("b")]() {},',
      '  [0]() {},',
      '  [ID(1)]() {},',
      '  get ["a"]() {},',
      '  get [ID("b")]() {},',
      '  get [0]() {},',
      '  get [ID(1)]() {},',
      '  set ["a"](x) {},',
      '  set [ID("b")](x) {},',
      '  set [0](x) {},',
      '  set [ID(1)](x) {}',
      '};'
    ].join(eol);

    ast = parse(code);

    assert.strictEqual(
      printer.printGenerically(ast).code,
      code
    );

    ast = parse([
      "var o = {",
      "  // This foo will become a computed method name.",
      "  foo() { return bar }",
      "};"
    ].join(eol));

    var objExpr = ast.program.body[0].declarations[0].init;
    n.ObjectExpression.assert(objExpr);

    assert.strictEqual(objExpr.properties[0].computed, false);
    objExpr.properties[0].computed = true;
    objExpr.properties[0].kind = "get";

    assert.strictEqual(recast.print(ast).code, [
      "var o = {",
      "  // This foo will become a computed method name.",
      "  get [foo]() { return bar }",
      "};"
    ].join(eol));
  });

  it("prints trailing commas in object literals", function() {
    var code = [
      "({",
      "  foo: bar,",
      "  bar: foo,",
      "});"
    ].join(eol);

    var ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb")
    });

    var printer = new Printer({
      tabWidth: 2,
      trailingComma: true,
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // It should also work when using the `trailingComma` option as an object.
    printer = new Printer({
      tabWidth: 2,
      trailingComma: { objects: true },
    });

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints trailing commas in function calls", function() {
    var code = [
      "call(",
      "  1,",
      "  2,",
      ");"
    ].join(eol);

    var ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb")
    });

    var printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    var pretty = printer.printGenerically(ast).code;
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

  it("prints trailing commas in array expressions", function() {
    var code = [
      "[",
      "  1,",
      "  2,",
      "];"
    ].join(eol);

    var ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb")
    });

    var printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    var pretty = printer.printGenerically(ast).code;
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

  it("prints trailing commas in function definitions", function() {
    var code = [
      "function foo(",
      "  a,",
      "  b,",
      ") {}"
    ].join(eol);

    var ast = parse(code, {
      // Supports trailing commas whereas plain esprima does not.
      parser: require("esprima-fb")
    });

    var printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    var pretty = printer.printGenerically(ast).code;
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

  it("shouldn't print a trailing comma for a RestElement", function() {
    var code = [
      "function foo(",
      "  a,",
      "  b,",
      "  ...rest",
      ") {}"
    ].join(eol);

    var ast = parse(code, {
      // The flow parser and Babylon recognize `...rest` as a `RestElement`
      parser: require("babylon")
    });

    var printer = new Printer({
      tabWidth: 2,
      wrapColumn: 1,
      trailingComma: true,
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("should support AssignmentPattern and RestElement", function() {
    var code = [
      "function foo(a, [b, c] = d(a), ...[e, f, ...rest]) {",
      "  return [a, b, c, e, f, rest];",
      "}"
    ].join(eol);

    var ast = parse(code, {
      // Supports rest parameter destructuring whereas plain esprima
      // does not.
      parser: require("esprima-fb")
    });

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around spread patterns", function() {
    var code = "(...rest) => rest;";

    var ast = b.program([
      b.expressionStatement(b.arrowFunctionExpression(
        [b.spreadElementPattern(b.identifier('rest'))],
        b.identifier('rest'),
        false
      ))
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Print RestElement the same way
    ast = b.program([
      b.expressionStatement(b.arrowFunctionExpression(
        [b.restElement(b.identifier('rest'))],
        b.identifier('rest'),
        false
      ))
    ]);

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Do the same for the `rest` field.
    var arrowFunction = b.arrowFunctionExpression(
      [],
      b.identifier('rest'),
      false
    );
    arrowFunction.rest = b.identifier('rest');
    ast = b.program([
      b.expressionStatement(arrowFunction)
    ]);

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around single arrow function arg when options.arrowParensAlways is true", function() {
    var code = "(a) => {};";

    var fn = b.arrowFunctionExpression(
      [b.identifier('a')],
      b.blockStatement([]),
      false
    );

    var ast = b.program([
      b.expressionStatement(fn)
    ]);

    var printer = new Printer({
      arrowParensAlways: true
    });
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow function when binding", function() {
    var code = "var a = (x => y).bind(z);";

    var fn = b.arrowFunctionExpression(
      [b.identifier("x")],
      b.identifier("y")
    );

    var declaration = b.variableDeclaration("var", [
      b.variableDeclarator(
        b.identifier("a"),
        b.callExpression(
          b.memberExpression(fn, b.identifier("bind"), false),
          [b.identifier("z")]
        )
      )
    ]);

    var ast = b.program([declaration]);

    var printer = new Printer();
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around async arrow functions with args", function() {
    var code = "async () => {};";

    var fn = b.arrowFunctionExpression(
      [],
      b.blockStatement([]),
      false
    );
    fn.async = true;

    var ast = b.program([
      b.expressionStatement(fn)
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // No parenthesis for single params if they are identifiers
    code = "async foo => {};";
    fn.params = [b.identifier('foo')];

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    // Add parenthesis for destructuring
    code = "async ([a, b]) => {};";
    fn.params = [b.arrayPattern([b.identifier('a'), b.identifier('b')])];

    pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow functions with single arg and a type", function() {
    var code = "(a: b) => {};";

    var arg = b.identifier('a');
    arg.typeAnnotation = b.typeAnnotation(
      b.genericTypeAnnotation(b.identifier('b'), null)
    );

    var fn = b.arrowFunctionExpression(
      [arg],
      b.blockStatement([]),
      false
    );

    var ast = b.program([
      b.expressionStatement(fn)
    ]);

    var printer = new Printer();
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("adds parenthesis around arrow functions with single arg and a return type", function() {
    var code = "(a): void => {};";

    var arg = b.identifier('a');

    var fn = b.arrowFunctionExpression(
      [arg],
      b.blockStatement([]),
      false
    );

    fn.returnType = b.typeAnnotation(
      b.voidTypeAnnotation()
    );

    var ast = b.program([
      b.expressionStatement(fn)
    ]);

    var printer = new Printer();
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints class property initializers with type annotations correctly", function() {
    var code = [
      "class A {",
      "  foo = (a: b): void => {};",
      "}",
    ].join(eol);

    var arg = b.identifier('a');
    arg.typeAnnotation = b.typeAnnotation(
      b.genericTypeAnnotation(b.identifier('b'), null)
    );

    var fn = b.arrowFunctionExpression(
      [arg],
      b.blockStatement([]),
      false
    );
    fn.returnType = b.typeAnnotation(
      b.voidTypeAnnotation()
    );

    var ast = b.program([
      b.classDeclaration(
        b.identifier('A'),
        b.classBody([
          b.classProperty(
            b.identifier('foo'),
            fn,
            null,
            false
          )
        ])
      )
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints ClassProperty correctly", function() {
    var code = [
      "class A {",
      "  foo: Type = Bar;",
      "}",
    ].join(eol);

    var ast = b.program([
      b.classDeclaration(
        b.identifier('A'),
        b.classBody([
          b.classProperty(
            b.identifier('foo'),
            b.identifier('Bar'),
            b.typeAnnotation(
              b.genericTypeAnnotation(b.identifier('Type'), null)
            )
          )
        ])
      )
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints static ClassProperty correctly", function() {
    var code = [
      "class A {",
      "  static foo = Bar;",
      "}",
    ].join(eol);

    var ast = b.program([
      b.classDeclaration(
        b.identifier('A'),
        b.classBody([
          b.classProperty(
            b.identifier('foo'),
            b.identifier('Bar'),
            null,
            true
          )
        ])
      )
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints template expressions correctly", function() {
    var code = [
      "graphql`query`;",
    ].join(eol);

    var ast = b.program([
      b.taggedTemplateStatement(
        b.identifier('graphql'),
        b.templateLiteral(
          [b.templateElement({cooked: 'query', raw: 'query'}, false)],
          []
        )
      )
    ]);

    var printer = new Printer({
      tabWidth: 2
    });

    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);

    code = [
      "graphql`query${foo.getQuery()}field${bar}`;",
    ].join(eol);

    ast = b.program([
      b.taggedTemplateStatement(
        b.identifier('graphql'),
        b.templateLiteral(
          [
            b.templateElement(
              {cooked: 'query', raw: 'query'},
              false
            ),
            b.templateElement(
              {cooked: 'field', raw: 'field'},
              false
            ),
            b.templateElement(
              {cooked: '', raw: ''},
              true
            ),
          ],
          [
            b.callExpression(
              b.memberExpression(
                b.identifier('foo'),
                b.identifier('getQuery'),
                false
              ),
              []
            ),
            b.identifier('bar')
          ]
        )
      )
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

  it("preserves newlines at the beginning/end of files", function() {
    var code = [
      "",
      "f();",
      ""
    ].join(eol);

    var lines = fromString(code);
    var ast = parse(code, {
      esprima: {
        parse: function(source, options) {
          var program = require("esprima").parse(source, options);
          n.Program.assert(program);
          // Expand ast.program.loc to include any
          // leading/trailing whitespace, to simulate the
          // behavior of some parsers, e.g. babel-core.
          lines.skipSpaces(program.loc.start, true, true);
          lines.skipSpaces(program.loc.end, false, true);
          return program;
        }
      }
    });

    ast.program.body.unshift(b.debuggerStatement());

    var printer = new Printer({
      tabWidth: 2
    });

    assert.strictEqual(printer.print(ast).code, [
      "",
      "debugger;",
      "f();",
      ""
    ].join(eol));
  });

  it("respects options.lineTerminator", function() {
    var lines = [
      "var first = 1;",
      "var second = 2;"
    ];
    var code = lines.join("\n");
    var ast = parse(code);

    assert.strictEqual(
      new Printer({
        lineTerminator: "\r\n"
      }).print(ast).code,
      lines.join("\r\n")
    );
  });

  it("preserves indentation in unmodified template expressions", function() {
    var printer = new Printer({
      tabWidth: 2
    });

    var code = [
      "var x = {",
      "  y: () => Relay.QL`",
      "    query {",
      "      ${foo},",
      "      field,",
      "    }",
      "  `",
      "};",
    ].join(eol);

    var ast = parse(code);
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("preserves indentation in modified template expressions", function() {
    var code = [
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
      "};"
    ].join(eol);

    var ast = parse(code);
    var printer = new Printer({
      tabWidth: 2
    });

    recast.visit(ast, {
      visitTaggedTemplateExpression: function (path) {
        function replaceIdWithNodeId(path) {
          path.replace(path.value.replace(/\bid\b/g, "nodeID"));
        }

        path.get("quasi", "quasis").each(function (quasiPath) {
          replaceIdWithNodeId(quasiPath.get("value", "cooked"));
          replaceIdWithNodeId(quasiPath.get("value", "raw"));
        });

        this.traverse(path);
      }
    });

    var actual = printer.print(ast).code;
    var expected = code.replace(/\bid\b/g, "nodeID");

    assert.strictEqual(actual, expected);
  });

  it("prints commas for flow object types by default", function() {
    var code = [
      "type MyType = {",
      "    message: string,",
      "    isAwesome: boolean,",
      "};"
    ].join(eol);

    var ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false
        ),
        b.objectTypeProperty(
          b.identifier("isAwesome"),
          b.booleanTypeAnnotation(),
          false
        )
      ])
    );

    var printer = new Printer();
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("shouldn't print a trailing comma for single-line flow object types", function() {
    var code1 = "type MyType = { message: string };";
    var code2 = "type MyType = { [key: string]: string };";

    var ast1 = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false
        )
      ])
    );

    var ast2 = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([], [
        b.objectTypeIndexer(
          b.identifier('key'),
          b.stringTypeAnnotation(),
          b.stringTypeAnnotation(),
          false
        )
      ])
    );

    var printer = new Printer({trailingComma: true});
    var pretty1 = printer.printGenerically(ast1).code;
    var pretty2 = printer.printGenerically(ast2).code;
    assert.strictEqual(pretty1, code1);
    assert.strictEqual(pretty2, code2);
  });

  it("prints semicolons for flow object types when options.flowObjectCommas is falsy", function() {
    var code = [
      "type MyType = {",
      "    message: string;",
      "    isAwesome: boolean;",
      "};"
    ].join(eol);

    var ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.objectTypeAnnotation([
        b.objectTypeProperty(
          b.identifier("message"),
          b.stringTypeAnnotation(),
          false
        ),
        b.objectTypeProperty(
          b.identifier("isAwesome"),
          b.booleanTypeAnnotation(),
          false
        )
      ])
    );

    var printer = new Printer({ flowObjectCommas: false });
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("prints parens for nullable union/intersection types", function() {
    var code = "type MyType = ?(string | number);";

    var ast = b.typeAlias(
      b.identifier("MyType"),
      null,
      b.nullableTypeAnnotation(
        b.unionTypeAnnotation(
          [b.stringTypeAnnotation(), b.numberTypeAnnotation()]
        )
      )
    );

    var printer = new Printer({});
    var pretty = printer.printGenerically(ast).code;
    assert.strictEqual(pretty, code);
  });

  it("uses the `arrayBracketSpacing` and the `objectCurlySpacing` option", function() {
    var babylon = require("babylon");
    var parseOptions = {
      parser: {
        parse: function (source) {
          return babylon.parse(source, {
            sourceType: 'module',
            plugins: ['flow'],
          });
        }
      }
    };

    var testCaseList = [{
      printerConfig: {arrayBracketSpacing: false, objectCurlySpacing: false},
      code: [
        'import {java, script} from "javascript";',
        '',
        'function foo(a) {',
        '    type MyType = {message: string};',
        '    return [1, 2, 3];',
        '}',
        '',
        'export {foo};'
      ].join(eol)
    }, {
      printerConfig: {arrayBracketSpacing: true, objectCurlySpacing: false},
      code: [
        'import {java, script} from "javascript";',
        '',
        'function foo(a) {',
        '    type MyType = {message: string};',
        '    return [ 1, 2, 3 ];',
        '}',
        '',
        'export {foo};'
      ].join(eol)
    }, {
      printerConfig: {arrayBracketSpacing: false, objectCurlySpacing: true},
      code: [
        'import { java, script } from "javascript";',
        '',
        'function foo(a) {',
        '    type MyType = { message: string };',
        '    return [1, 2, 3];',
        '}',
        '',
        'export { foo };'
      ].join(eol)
    }, {
      printerConfig: {arrayBracketSpacing: true, objectCurlySpacing: true},
      code: [
        'import { java, script } from "javascript";',
        '',
        'function foo(a) {',
        '    type MyType = { message: string };',
        '    return [ 1, 2, 3 ];',
        '}',
        '',
        'export { foo };'
      ].join(eol)
    }];

    testCaseList.forEach(function(testCase) {
      var code = testCase.code;
      var printer = new Printer(testCase.printerConfig);

      var ast = parse(code, parseOptions);
      var pretty = printer.printGenerically(ast).code;

      assert.strictEqual(pretty, code);
    });
  });

  it("prints no extra semicolons in for-loop heads (#377)", function () {
    function check(head, parser) {
      var source = "for (" + head + ") console.log(i);";
      var ast = recast.parse(source, { parser: parser });
      var loop = ast.program.body[0];
      assert.strictEqual(loop.type, "ForStatement");
      loop.body = b.blockStatement([]);

      var reprinted = recast.print(ast).code;

      var openParenIndex = reprinted.indexOf("(");
      assert.notStrictEqual(openParenIndex, -1);

      var closeParenIndex = reprinted.indexOf(")", openParenIndex);
      assert.notStrictEqual(closeParenIndex, -1);

      var newHead = reprinted.slice(
        openParenIndex + 1,
        closeParenIndex
      );

      assert.strictEqual(newHead.split(";").length, 3);
    }

    function checkWith(parser) {
      check("let i = 0; i < 1; i++", parser);
      check("let i = 0 ; i < 1; i++", parser);
      check("let i = 0; ; i++", parser);
      check("let i = 0 ; ; i++", parser);
      check("let i = 0; i < 1; ", parser);
      check("let i = 0 ; i < 1; ", parser);
      check("let i = 0; ; ", parser);
      check("let i = 0 ; ; ", parser);
    }

    checkWith(require("esprima"));

    try {
      checkWith(require("reify/lib/parsers/acorn.js"));
      checkWith(require("reify/lib/parsers/babylon.js"));
    } catch (e) {
      if (require("semver").gte(process.version, "4.0.0")) {
        throw e;
      }
    }
  });

  it("parenthesizes NumericLiteral MemberExpression objects", function () {
    var nonBabelNode = b.memberExpression(
      b.literal(1),
      b.identifier('foo')
    );

    var babelNode = b.memberExpression(
      b.numericLiteral(1),
      b.identifier('foo')
    );

    assert.strictEqual(
      recast.print(nonBabelNode).code,
      "(1).foo"
    );

    assert.strictEqual(
      recast.print(babelNode).code,
      "(1).foo"
    );
  });

  it("prints numbers in bases other than 10 without converting them", function() {
    var code = [
      'let decimal = 6;',
      'let hex = 0xf00d;',
      'let binary = 0b1010;',
      'let octal = 0o744;'
    ].join(eol);
    var ast = parse(code);
    var printer = new Printer({});
    var pretty = printer.printGenerically(ast).code;

    assert.strictEqual(pretty, code);
  });
});
