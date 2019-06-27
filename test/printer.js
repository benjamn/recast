"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var recast = __importStar(require("../main"));
var parser_1 = require("../lib/parser");
var printer_1 = require("../lib/printer");
var types = __importStar(require("ast-types"));
var n = types.namedTypes;
var b = types.builders;
var lines_1 = require("../lib/lines");
var os_1 = require("os");
var linesModule = require("../lib/lines");
var nodeMajorVersion = parseInt(process.versions.node, 10);
describe("printer", function () {
    it("Printer", function testPrinter(done) {
        var code = testPrinter + "";
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer;
        assert_1.default.strictEqual(typeof printer.print, "function");
        assert_1.default.strictEqual(printer.print(null).code, "");
        var string = printer.printGenerically(ast).code;
        assert_1.default.ok(string.indexOf("done();") > 0);
        string = printer.print(ast).code;
        // TODO
        assert_1.default.ok(string.indexOf("// TODO") > 0);
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
    ].join(os_1.EOL);
    it("EmptyStatements", function () {
        var ast = parser_1.parse(uselessSemicolons);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var reprinted = printer.print(ast).code;
        assert_1.default.strictEqual(typeof reprinted, "string");
        assert_1.default.strictEqual(reprinted, uselessSemicolons);
        var generic = printer.printGenerically(ast).code;
        var withoutTrailingSemicolons = uselessSemicolons.replace(/\};/g, "}");
        assert_1.default.strictEqual(typeof generic, "string");
        assert_1.default.strictEqual(generic, withoutTrailingSemicolons);
    });
    var importantSemicolons = [
        "var a = {};",
        "(function() {})();"
    ].join(os_1.EOL);
    it("IffeAfterVariableDeclarationEndingInObjectLiteral", function () {
        var ast = parser_1.parse(importantSemicolons);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var reprinted = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(typeof reprinted, "string");
        assert_1.default.strictEqual(reprinted, importantSemicolons);
    });
    var arrayExprWithTrailingComma = '[1, 2,];';
    var arrayExprWithoutTrailingComma = '[1, 2];';
    it("ArrayExpressionWithTrailingComma", function () {
        var ast = parser_1.parse(arrayExprWithTrailingComma);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var body = ast.program.body;
        var arrayExpr = body[0].expression;
        n.ArrayExpression.assert(arrayExpr);
        // This causes the array expression to be reprinted.
        var arrayExprOrig = arrayExpr.original;
        arrayExpr.original = null;
        assert_1.default.strictEqual(printer.print(ast).code, arrayExprWithoutTrailingComma);
        arrayExpr.original = arrayExprOrig;
        assert_1.default.strictEqual(printer.print(ast).code, arrayExprWithTrailingComma);
    });
    var arrayExprWithHoles = '[,,];';
    it("ArrayExpressionWithHoles", function () {
        var ast = parser_1.parse(arrayExprWithHoles);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var body = ast.program.body;
        var arrayExpr = body[0].expression;
        n.ArrayExpression.assert(arrayExpr);
        // This causes the array expression to be reprinted.
        var arrayExprOrig = arrayExpr.original;
        arrayExpr.original = null;
        assert_1.default.strictEqual(printer.print(ast).code, arrayExprWithHoles);
        arrayExpr.original = arrayExprOrig;
        assert_1.default.strictEqual(printer.print(ast).code, arrayExprWithHoles);
    });
    var objectExprWithTrailingComma = '({x: 1, y: 2,});';
    var objectExprWithoutTrailingComma = '({' + os_1.EOL + '  x: 1,' + os_1.EOL + '  y: 2' + os_1.EOL + '});';
    it("ArrayExpressionWithTrailingComma", function () {
        var ast = parser_1.parse(objectExprWithTrailingComma);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var body = ast.program.body;
        var objectExpr = body[0].expression;
        n.ObjectExpression.assert(objectExpr);
        // This causes the array expression to be reprinted.
        var objectExprOrig = objectExpr.original;
        objectExpr.original = null;
        assert_1.default.strictEqual(printer.print(ast).code, objectExprWithoutTrailingComma);
        objectExpr.original = objectExprOrig;
        assert_1.default.strictEqual(printer.print(ast).code, objectExprWithTrailingComma);
    });
    var switchCase = [
        "switch (test) {",
        "  default:",
        "  case a: break",
        "",
        "  case b:",
        "    break;",
        "}",
    ].join(os_1.EOL);
    var switchCaseReprinted = [
        "if (test) {",
        "  switch (test) {",
        "  default:",
        "  case a: break",
        "  case b:",
        "    break;",
        "  }",
        "}"
    ].join(os_1.EOL);
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
    ].join(os_1.EOL);
    it("SwitchCase", function () {
        var ast = parser_1.parse(switchCase);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var body = ast.program.body;
        var switchStmt = body[0];
        n.SwitchStatement.assert(switchStmt);
        // This causes the switch statement to be reprinted.
        switchStmt.original = null;
        body[0] = b.ifStatement(b.identifier("test"), b.blockStatement([
            switchStmt
        ]));
        assert_1.default.strictEqual(printer.print(ast).code, switchCaseReprinted);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, switchCaseGeneric);
    });
    var tryCatch = [
        "try {",
        "  a();",
        "} catch (e) {",
        "  b(e);",
        "}"
    ].join(os_1.EOL);
    it("IndentTryCatch", function () {
        var ast = parser_1.parse(tryCatch);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var body = ast.program.body;
        var tryStmt = body[0];
        n.TryStatement.assert(tryStmt);
        // Force reprinting.
        assert_1.default.strictEqual(printer.printGenerically(ast).code, tryCatch);
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
    it("MethodPrinting", function () {
        var code = classBody.join(os_1.EOL);
        try {
            var ast = parser_1.parse(code);
        }
        catch (e) {
            // ES6 not supported, silently finish
            return;
        }
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var cb = ast.program.body[0].body;
        n.ClassBody.assert(cb);
        // Trigger reprinting of the class body.
        cb.body.push(cb.body[0]);
        assert_1.default.strictEqual(printer.print(ast).code, classBodyExpected.join(os_1.EOL));
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
    it("MultiLineParams", function () {
        var code = multiLineParams.join(os_1.EOL);
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        recast.visit(ast, {
            visitNode: function (path) {
                path.value.original = null;
                this.traverse(path);
            }
        });
        assert_1.default.strictEqual(printer.print(ast).code, multiLineParamsExpected.join(os_1.EOL));
    });
    it("SimpleVarPrinting", function () {
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var varDecl = b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("x"), null),
            b.variableDeclarator(b.identifier("y"), null),
            b.variableDeclarator(b.identifier("z"), null)
        ]);
        assert_1.default.strictEqual(printer.print(b.program([varDecl])).code, "var x, y, z;");
        var z = varDecl.declarations.pop();
        varDecl.declarations.pop();
        varDecl.declarations.push(z);
        assert_1.default.strictEqual(printer.print(b.program([varDecl])).code, "var x, z;");
    });
    it("MultiLineVarPrinting", function () {
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var varDecl = b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("x"), null),
            b.variableDeclarator(b.identifier("y"), b.objectExpression([
                b.property("init", b.identifier("why"), b.literal("not"))
            ])),
            b.variableDeclarator(b.identifier("z"), null)
        ]);
        assert_1.default.strictEqual(printer.print(b.program([varDecl])).code, [
            "var x,",
            "    y = {",
            "      why: \"not\"",
            "    },",
            "    z;"
        ].join(os_1.EOL));
    });
    it("ForLoopPrinting", function () {
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var loop = b.forStatement(b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("i"), b.literal(0))
        ]), b.binaryExpression("<", b.identifier("i"), b.literal(3)), b.updateExpression("++", b.identifier("i"), /* prefix: */ false), b.expressionStatement(b.callExpression(b.identifier("log"), [b.identifier("i")])));
        assert_1.default.strictEqual(printer.print(loop).code, "for (var i = 0; i < 3; i++)" + os_1.EOL +
            "  log(i);");
    });
    it("EmptyForLoopPrinting", function () {
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var loop = b.forStatement(b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("i"), b.literal(0))
        ]), b.binaryExpression("<", b.identifier("i"), b.literal(3)), b.updateExpression("++", b.identifier("i"), /* prefix: */ false), b.emptyStatement());
        assert_1.default.strictEqual(printer.print(loop).code, "for (var i = 0; i < 3; i++)" + os_1.EOL +
            "  ;");
    });
    it("ForInLoopPrinting", function () {
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var loop = b.forInStatement(b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("key"), null)
        ]), b.identifier("obj"), b.expressionStatement(b.callExpression(b.identifier("log"), [b.identifier("key")])));
        assert_1.default.strictEqual(printer.print(loop).code, "for (var key in obj)" + os_1.EOL +
            "  log(key);");
    });
    it("GuessTabWidth", function () {
        var code = [
            "function identity(x) {",
            "  return x;",
            "}"
        ].join(os_1.EOL);
        var guessedTwo = [
            "function identity(x) {",
            "  log(x);",
            "  return x;",
            "}"
        ].join(os_1.EOL);
        var explicitFour = [
            "function identity(x) {",
            "    log(x);",
            "    return x;",
            "}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var funDecl = ast.program.body[0];
        n.FunctionDeclaration.assert(funDecl);
        var funBody = funDecl.body.body;
        funBody.unshift(b.expressionStatement(b.callExpression(b.identifier("log"), funDecl.params)));
        assert_1.default.strictEqual(new printer_1.Printer().print(ast).code, guessedTwo);
        assert_1.default.strictEqual(new printer_1.Printer({
            tabWidth: 4
        }).print(ast).code, explicitFour);
    });
    it("FunctionDefaultsAndRest", function () {
        var printer = new printer_1.Printer();
        var funExpr = b.functionExpression(b.identifier('a'), [b.identifier('b'), b.identifier('c')], b.blockStatement([]), false, false);
        funExpr.defaults = [null, b.literal(1)];
        funExpr.rest = b.identifier('d');
        assert_1.default.strictEqual(printer.print(funExpr).code, "function a(b, c = 1, ...d) {}");
        var arrowFunExpr = b.arrowFunctionExpression([b.identifier('b'), b.identifier('c')], b.blockStatement([]), false);
        arrowFunExpr.defaults = [null, b.literal(1)];
        arrowFunExpr.rest = b.identifier('d');
        assert_1.default.strictEqual(printer.print(arrowFunExpr).code, "(b, c = 1, ...d) => {}");
    });
    it("generically prints parsed code and generated code the same way", function () {
        var printer = new printer_1.Printer();
        var ast = b.program([
            b.expressionStatement(b.literal(1)),
            b.expressionStatement(b.literal(2))
        ]);
        assert_1.default.strictEqual(printer.printGenerically(parser_1.parse("1; 2;")).code, printer.printGenerically(ast).code);
    });
    it("ExportDeclaration semicolons", function () {
        var printer = new printer_1.Printer();
        var code = "export var foo = 42;";
        var ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
        code = "export var foo = 42";
        ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code + ";");
        code = "export function foo() {}";
        ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
        code = 'export * from "./lib";';
        ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
    });
    it("empty ExportDeclaration", function () {
        var printer = new printer_1.Printer();
        var code = "export {};";
        var ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
    });
    it("export default of IIFE", function () {
        var printer = new printer_1.Printer();
        var ast = b.exportDefaultDeclaration(b.callExpression(b.functionExpression(null, [], b.blockStatement([])), []));
        var code = printer.print(ast).code;
        ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.print(ast).code, code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
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
    ].join(os_1.EOL);
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
    ].join(os_1.EOL);
    it("Statement list whitespace reuse", function () {
        var ast = parser_1.parse(stmtListSpaces);
        var printer = new printer_1.Printer({ tabWidth: 2 });
        var debugStmt = b.expressionStatement(b.identifier("debugger"));
        ast.program.body.splice(2, 0, debugStmt);
        ast.program.body.unshift(debugStmt);
        ast.program.body.push(debugStmt);
        assert_1.default.strictEqual(printer.print(ast).code, stmtListSpacesExpected);
        var funDecl = b.functionDeclaration(b.identifier("foo"), [], b.blockStatement(ast.program.body));
        assert_1.default.strictEqual(printer.print(funDecl).code, linesModule.concat([
            "function foo() {" + os_1.EOL,
            linesModule.fromString(stmtListSpacesExpected.replace(/^\s+|\s+$/g, "")).indent(2),
            os_1.EOL + "}"
        ]).toString());
    });
    it("should print static methods with the static keyword", function () {
        var printer = new printer_1.Printer({ tabWidth: 4 });
        var ast = parser_1.parse([
            "class A {",
            "  static foo() {}",
            "}"
        ].join(os_1.EOL));
        var classBody = ast.program.body[0].body;
        n.ClassBody.assert(classBody);
        var foo = classBody.body[0];
        n.MethodDefinition.assert(foo);
        classBody.body.push(foo);
        foo.key.name = "formerlyFoo";
        assert_1.default.strictEqual(printer.print(ast).code, [
            "class A {",
            "    static formerlyFoo() {}",
            "    static formerlyFoo() {}",
            "}"
        ].join(os_1.EOL));
    });
    it("should print string literals with the specified delimiter", function () {
        var ast = parser_1.parse([
            "var obj = {",
            "    \"foo's\": 'bar',",
            "    '\"bar\\'s\"': /regex/m",
            "};"
        ].join(os_1.EOL));
        var variableDeclaration = ast.program.body[0];
        n.VariableDeclaration.assert(variableDeclaration);
        var printer = new printer_1.Printer({ quote: "single" });
        assert_1.default.strictEqual(printer.printGenerically(ast).code, [
            "var obj = {",
            "    'foo\\'s': 'bar',",
            "    '\"bar\\'s\"': /regex/m",
            "};"
        ].join(os_1.EOL));
        var printer2 = new printer_1.Printer({ quote: "double" });
        assert_1.default.strictEqual(printer2.printGenerically(ast).code, [
            "var obj = {",
            "    \"foo's\": \"bar\",",
            '    "\\"bar\'s\\"": /regex/m',
            "};"
        ].join(os_1.EOL));
        var printer3 = new printer_1.Printer({ quote: "auto" });
        assert_1.default.strictEqual(printer3.printGenerically(ast).code, [
            "var obj = {",
            '    "foo\'s": "bar",',
            '    \'"bar\\\'s"\': /regex/m',
            "};"
        ].join(os_1.EOL));
    });
    it("should print block comments at head of class once", function () {
        // Given.
        var ast = parser_1.parse([
            "/**",
            " * This class was in an IIFE and returned an instance of itself.",
            " */",
            "function SimpleClass() {",
            "};"
        ].join(os_1.EOL));
        var classIdentifier = b.identifier('SimpleClass');
        var exportsExpression = b.memberExpression(b.identifier('module'), b.identifier('exports'), false);
        var assignmentExpression = b.assignmentExpression('=', exportsExpression, classIdentifier);
        var exportStatement = b.expressionStatement(assignmentExpression);
        ast.program.body.push(exportStatement);
        // When.
        var printedClass = new printer_1.Printer().print(ast).code;
        // Then.
        assert_1.default.strictEqual(printedClass, [
            "/**",
            " * This class was in an IIFE and returned an instance of itself.",
            " */",
            "function SimpleClass() {",
            "}",
            "module.exports = SimpleClass;"
        ].join(os_1.EOL));
    });
    it("should support computed properties", function () {
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
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
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
        ].join(os_1.EOL);
        ast = parser_1.parse(code);
        assert_1.default.strictEqual(printer.printGenerically(ast).code, code);
        ast = parser_1.parse([
            "var o = {",
            "  // This foo will become a computed method name.",
            "  foo() { return bar }",
            "};"
        ].join(os_1.EOL));
        var objExpr = ast.program.body[0].declarations[0].init;
        n.ObjectExpression.assert(objExpr);
        assert_1.default.strictEqual(objExpr.properties[0].computed, false);
        objExpr.properties[0].computed = true;
        objExpr.properties[0].kind = "get";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "var o = {",
            "  // This foo will become a computed method name.",
            "  get [foo]() { return bar }",
            "};"
        ].join(os_1.EOL));
    });
    it("prints trailing commas in object literals", function () {
        var code = [
            "({",
            "  foo: bar,",
            "  bar: foo,",
            "});"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // Supports trailing commas whereas plain esprima does not.
            parser: require("esprima-fb")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // It should also work when using the `trailingComma` option as an object.
        printer = new printer_1.Printer({
            tabWidth: 2,
            trailingComma: { objects: true },
        });
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints trailing commas in function calls", function () {
        var code = [
            "call(",
            "  1,",
            "  2,",
            ");"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // Supports trailing commas whereas plain esprima does not.
            parser: require("esprima-fb")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // It should also work when using the `trailingComma` option as an object.
        printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: { parameters: true },
        });
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints trailing commas in array expressions", function () {
        var code = [
            "[",
            "  1,",
            "  2,",
            "];"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // Supports trailing commas whereas plain esprima does not.
            parser: require("esprima-fb")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // It should also work when using the `trailingComma` option as an object.
        printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: { arrays: true },
        });
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints trailing commas in function definitions", function () {
        var code = [
            "function foo(",
            "  a,",
            "  b,",
            ") {}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // Supports trailing commas whereas plain esprima does not.
            parser: require("esprima-fb")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // It should also work when using the `trailingComma` option as an object.
        printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: { parameters: true },
        });
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    (nodeMajorVersion >= 6 ? it : xit)("shouldn't print a trailing comma for a RestElement", function () {
        var code = [
            "function foo(",
            "  a,",
            "  b,",
            "  ...rest",
            ") {}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // The flow parser and Babylon recognize `...rest` as a `RestElement`
            parser: require("@babel/parser")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("should support AssignmentPattern and RestElement", function () {
        var code = [
            "function foo(a, [b, c] = d(a), ...[e, f, ...rest]) {",
            "  return [a, b, c, e, f, rest];",
            "}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            // Supports rest parameter destructuring whereas plain esprima
            // does not.
            parser: require("esprima-fb")
        });
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around spread patterns", function () {
        var code = "(...rest) => rest;";
        var ast = b.program([
            b.expressionStatement(b.arrowFunctionExpression([b.spreadElementPattern(b.identifier('rest'))], b.identifier('rest'), false))
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // Print RestElement the same way
        ast = b.program([
            b.expressionStatement(b.arrowFunctionExpression([b.restElement(b.identifier('rest'))], b.identifier('rest'), false))
        ]);
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // Do the same for the `rest` field.
        var arrowFunction = b.arrowFunctionExpression([], b.identifier('rest'), false);
        arrowFunction.rest = b.identifier('rest');
        ast = b.program([
            b.expressionStatement(arrowFunction)
        ]);
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around single arrow function arg when options.arrowParensAlways is true", function () {
        var code = "(a) => {};";
        var fn = b.arrowFunctionExpression([b.identifier('a')], b.blockStatement([]), false);
        var ast = b.program([
            b.expressionStatement(fn)
        ]);
        var printer = new printer_1.Printer({
            arrowParensAlways: true
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around arrow function when binding", function () {
        var code = "var a = (x => y).bind(z);";
        var fn = b.arrowFunctionExpression([b.identifier("x")], b.identifier("y"));
        var declaration = b.variableDeclaration("var", [
            b.variableDeclarator(b.identifier("a"), b.callExpression(b.memberExpression(fn, b.identifier("bind"), false), [b.identifier("z")]))
        ]);
        var ast = b.program([declaration]);
        var printer = new printer_1.Printer();
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around async arrow functions with args", function () {
        var code = "async () => {};";
        var fn = b.arrowFunctionExpression([], b.blockStatement([]), false);
        fn.async = true;
        var ast = b.program([
            b.expressionStatement(fn)
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // No parenthesis for single params if they are identifiers
        code = "async foo => {};";
        fn.params = [b.identifier('foo')];
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        // Add parenthesis for destructuring
        code = "async ([a, b]) => {};";
        fn.params = [b.arrayPattern([b.identifier('a'), b.identifier('b')])];
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around arrow functions with single arg and a type", function () {
        var code = "(a: b) => {};";
        var arg = b.identifier('a');
        arg.typeAnnotation = b.typeAnnotation(b.genericTypeAnnotation(b.identifier('b'), null));
        var fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);
        var ast = b.program([
            b.expressionStatement(fn)
        ]);
        var printer = new printer_1.Printer();
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around arrow functions with single arg and a return type", function () {
        var code = "(a): void => {};";
        var arg = b.identifier('a');
        var fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);
        fn.returnType = b.typeAnnotation(b.voidTypeAnnotation());
        var ast = b.program([
            b.expressionStatement(fn)
        ]);
        var printer = new printer_1.Printer();
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints class property initializers with type annotations correctly", function () {
        var code = [
            "class A {",
            "  foo = (a: b): void => {};",
            "}",
        ].join(os_1.EOL);
        var arg = b.identifier('a');
        arg.typeAnnotation = b.typeAnnotation(b.genericTypeAnnotation(b.identifier('b'), null));
        var fn = b.arrowFunctionExpression([arg], b.blockStatement([]), false);
        fn.returnType = b.typeAnnotation(b.voidTypeAnnotation());
        var ast = b.program([
            b.classDeclaration(b.identifier('A'), b.classBody([
                b.classProperty(b.identifier('foo'), fn, null, false)
            ]))
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints ClassProperty correctly", function () {
        var code = [
            "class A {",
            "  foo: Type = Bar;",
            "}",
        ].join(os_1.EOL);
        var ast = b.program([
            b.classDeclaration(b.identifier('A'), b.classBody([
                b.classProperty(b.identifier('foo'), b.identifier('Bar'), b.typeAnnotation(b.genericTypeAnnotation(b.identifier('Type'), null)))
            ]))
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints static ClassProperty correctly", function () {
        var code = [
            "class A {",
            "  static foo = Bar;",
            "}",
        ].join(os_1.EOL);
        var ast = b.program([
            b.classDeclaration(b.identifier('A'), b.classBody([
                b.classProperty(b.identifier('foo'), b.identifier('Bar'), null, true)
            ]))
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints template expressions correctly", function () {
        var code = [
            "graphql`query`;",
        ].join(os_1.EOL);
        var ast = b.program([
            b.taggedTemplateStatement(b.identifier('graphql'), b.templateLiteral([b.templateElement({ cooked: 'query', raw: 'query' }, false)], []))
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        code = [
            "graphql`query${foo.getQuery()}field${bar}`;",
        ].join(os_1.EOL);
        ast = b.program([
            b.taggedTemplateStatement(b.identifier('graphql'), b.templateLiteral([
                b.templateElement({ cooked: 'query', raw: 'query' }, false),
                b.templateElement({ cooked: 'field', raw: 'field' }, false),
                b.templateElement({ cooked: '', raw: '' }, true),
            ], [
                b.callExpression(b.memberExpression(b.identifier('foo'), b.identifier('getQuery'), false), []),
                b.identifier('bar')
            ]))
        ]);
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
        code = [
            "graphql`",
            "  query {",
            "    ${foo.getQuery()},",
            "    field,",
            "    ${bar},",
            "  }",
            "`;",
        ].join(os_1.EOL);
        ast = parser_1.parse(code);
        pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("preserves newlines at the beginning/end of files", function () {
        var code = [
            "",
            "f();",
            ""
        ].join(os_1.EOL);
        var lines = lines_1.fromString(code);
        var ast = parser_1.parse(code, {
            esprima: {
                parse: function (source, options) {
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
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        assert_1.default.strictEqual(printer.print(ast).code, [
            "",
            "debugger;",
            "f();",
            ""
        ].join(os_1.EOL));
    });
    it("respects options.lineTerminator", function () {
        var lines = [
            "var first = 1;",
            "var second = 2;"
        ];
        var code = lines.join("\n");
        var ast = parser_1.parse(code);
        assert_1.default.strictEqual(new printer_1.Printer({
            lineTerminator: "\r\n"
        }).print(ast).code, lines.join("\r\n"));
    });
    it("preserves indentation in unmodified template expressions", function () {
        var printer = new printer_1.Printer({
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
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("preserves indentation in modified template expressions", function () {
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
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer({
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
        assert_1.default.strictEqual(actual, expected);
    });
    it("prints commas for flow object types by default", function () {
        var code = [
            "type MyType = {",
            "    message: string,",
            "    isAwesome: boolean,",
            "};"
        ].join(os_1.EOL);
        var ast = b.typeAlias(b.identifier("MyType"), null, b.objectTypeAnnotation([
            b.objectTypeProperty(b.identifier("message"), b.stringTypeAnnotation(), false),
            b.objectTypeProperty(b.identifier("isAwesome"), b.booleanTypeAnnotation(), false)
        ]));
        var printer = new printer_1.Printer();
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("shouldn't print a trailing comma for single-line flow object types", function () {
        var code1 = "type MyType = { message: string };";
        var code2 = "type MyType = { [key: string]: string };";
        var ast1 = b.typeAlias(b.identifier("MyType"), null, b.objectTypeAnnotation([
            b.objectTypeProperty(b.identifier("message"), b.stringTypeAnnotation(), false)
        ]));
        var ast2 = b.typeAlias(b.identifier("MyType"), null, b.objectTypeAnnotation([], [
            b.objectTypeIndexer(b.identifier('key'), b.stringTypeAnnotation(), b.stringTypeAnnotation())
        ]));
        var printer = new printer_1.Printer({ trailingComma: true });
        var pretty1 = printer.printGenerically(ast1).code;
        var pretty2 = printer.printGenerically(ast2).code;
        assert_1.default.strictEqual(pretty1, code1);
        assert_1.default.strictEqual(pretty2, code2);
    });
    it("prints semicolons for flow object types when options.flowObjectCommas is falsy", function () {
        var code = [
            "type MyType = {",
            "    message: string;",
            "    isAwesome: boolean;",
            "};"
        ].join(os_1.EOL);
        var ast = b.typeAlias(b.identifier("MyType"), null, b.objectTypeAnnotation([
            b.objectTypeProperty(b.identifier("message"), b.stringTypeAnnotation(), false),
            b.objectTypeProperty(b.identifier("isAwesome"), b.booleanTypeAnnotation(), false)
        ]));
        var printer = new printer_1.Printer({ flowObjectCommas: false });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints parens for nullable union/intersection types", function () {
        var code = "type MyType = ?(string | number);";
        var ast = b.typeAlias(b.identifier("MyType"), null, b.nullableTypeAnnotation(b.unionTypeAnnotation([b.stringTypeAnnotation(), b.numberTypeAnnotation()])));
        var printer = new printer_1.Printer({});
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    (nodeMajorVersion >= 6 ? it : xit)("uses the `arrayBracketSpacing` and the `objectCurlySpacing` option", function () {
        var babelParser = require("@babel/parser");
        var parseOptions = {
            parser: {
                parse: function (source) {
                    return babelParser.parse(source, {
                        sourceType: 'module',
                        plugins: ['flow'],
                    });
                }
            }
        };
        var testCaseList = [{
                printerConfig: { arrayBracketSpacing: false, objectCurlySpacing: false },
                code: [
                    'import {java, script} from "javascript";',
                    '',
                    'function foo(a) {',
                    '    type MyType = {message: string};',
                    '    return [1, 2, 3];',
                    '}',
                    '',
                    'export {foo};'
                ].join(os_1.EOL)
            }, {
                printerConfig: { arrayBracketSpacing: true, objectCurlySpacing: false },
                code: [
                    'import {java, script} from "javascript";',
                    '',
                    'function foo(a) {',
                    '    type MyType = {message: string};',
                    '    return [ 1, 2, 3 ];',
                    '}',
                    '',
                    'export {foo};'
                ].join(os_1.EOL)
            }, {
                printerConfig: { arrayBracketSpacing: false, objectCurlySpacing: true },
                code: [
                    'import { java, script } from "javascript";',
                    '',
                    'function foo(a) {',
                    '    type MyType = { message: string };',
                    '    return [1, 2, 3];',
                    '}',
                    '',
                    'export { foo };'
                ].join(os_1.EOL)
            }, {
                printerConfig: { arrayBracketSpacing: true, objectCurlySpacing: true },
                code: [
                    'import { java, script } from "javascript";',
                    '',
                    'function foo(a) {',
                    '    type MyType = { message: string };',
                    '    return [ 1, 2, 3 ];',
                    '}',
                    '',
                    'export { foo };'
                ].join(os_1.EOL)
            }];
        testCaseList.forEach(function (testCase) {
            var code = testCase.code;
            var printer = new printer_1.Printer(testCase.printerConfig);
            var ast = parser_1.parse(code, parseOptions);
            var pretty = printer.printGenerically(ast).code;
            assert_1.default.strictEqual(pretty, code);
        });
    });
    it("prints no extra semicolons in for-loop heads (#377)", function () {
        function check(head, parser) {
            var source = "for (" + head + ") console.log(i);";
            var ast = recast.parse(source, { parser: parser });
            var loop = ast.program.body[0];
            assert_1.default.strictEqual(loop.type, "ForStatement");
            loop.body = b.blockStatement([]);
            var reprinted = recast.print(ast).code;
            var openParenIndex = reprinted.indexOf("(");
            assert_1.default.notStrictEqual(openParenIndex, -1);
            var closeParenIndex = reprinted.indexOf(")", openParenIndex);
            assert_1.default.notStrictEqual(closeParenIndex, -1);
            var newHead = reprinted.slice(openParenIndex + 1, closeParenIndex);
            assert_1.default.strictEqual(newHead.split(";").length, 3);
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
        checkWith(require("../parsers/esprima"));
        checkWith(require("../parsers/acorn"));
        if (nodeMajorVersion >= 6) {
            checkWith(require("../parsers/babel"));
            checkWith(require("../parsers/typescript"));
            checkWith(require("../parsers/flow"));
        }
    });
    it("parenthesizes NumericLiteral MemberExpression objects", function () {
        var nonBabelNode = b.memberExpression(b.literal(1), b.identifier('foo'));
        var babelNode = b.memberExpression(b.numericLiteral(1), b.identifier('foo'));
        assert_1.default.strictEqual(recast.print(nonBabelNode).code, "(1).foo");
        assert_1.default.strictEqual(recast.print(babelNode).code, "(1).foo");
    });
    it("obeys 'optional' property of OptionalMemberExpression", function () {
        var node = b.optionalMemberExpression(b.identifier('foo'), b.identifier('bar'));
        assert_1.default.strictEqual(recast.print(node).code, "foo?.bar");
        var nonOptionalNode = b.optionalMemberExpression(b.identifier('foo'), b.identifier('bar'), false, false);
        assert_1.default.strictEqual(recast.print(nonOptionalNode).code, "foo.bar");
    });
    it("prints numbers in bases other than 10 without converting them", function () {
        var code = [
            'let decimal = 6;',
            'let hex = 0xf00d;',
            'let binary = 0b1010;',
            'let octal = 0o744;'
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer({});
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("reprints modified numeric literals", function () {
        var code = '3 + 4;';
        var ast = parser_1.parse(code);
        var expr = ast.program.body[0].expression;
        var left = expr.left;
        var right = expr.right;
        left.value++;
        right.value++;
        assert_1.default.strictEqual(recast.print(ast).code, '4 + 5;');
    });
    it("prints flow tuple type annotations correctly, respecting array options", function () {
        var code = [
            'type MyTupleType = [',
            '  "tuple element 1",',
            '  "tuple element 2",',
            '  "tuple element 3",',
            '];',
        ].join(os_1.EOL);
        var ast = b.program([
            b.typeAlias(b.identifier('MyTupleType'), null, b.tupleTypeAnnotation([
                b.stringLiteralTypeAnnotation('tuple element 1', 'tuple element 1'),
                b.stringLiteralTypeAnnotation('tuple element 2', 'tuple element 2'),
                b.stringLiteralTypeAnnotation('tuple element 3', 'tuple element 3'),
            ])),
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 40,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around object expression", function () {
        var code = "({}).x = 1;";
        var assignment = b.assignmentExpression('=', b.memberExpression(b.objectExpression([]), b.identifier('x'), false), b.literal(1));
        var ast = b.program([
            b.expressionStatement(assignment)
        ]);
        var printer = new printer_1.Printer({
            arrowParensAlways: true
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("adds parenthesis around conditional", function () {
        var code = 'new (typeof a ? b : c)();';
        var callee = recast.parse("typeof a ? b : c").program.body[0].expression;
        var newExpression = b.newExpression(callee, []);
        var ast = b.program([
            b.expressionStatement(newExpression)
        ]);
        var printer = new printer_1.Printer({
            arrowParensAlways: true
        });
        var pretty = printer.print(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints flow object type internal slots correctly", function () {
        var code = [
            'type MyObjectType = {',
            '  [myIndexer: string]: any,',
            '  (myParameter: any): any,',
            '  (myOptionalParameter?: any): any,',
            '  (myParameterWithRest: any, ...rest: any[]): any,',
            '  [[myInternalSlot]]: any,',
            '  static [[myStaticOptionalInternalSlot]]?: (arg: any) => any,',
            '  static [[myStaticMethodOptionalInternalSlot]]?(arg: any): any,',
            '  myProperty: any,',
            '};',
        ].join(os_1.EOL);
        var ast = b.program([
            b.typeAlias(b.identifier('MyObjectType'), null, b.objectTypeAnnotation.from({
                properties: [
                    b.objectTypeProperty(b.identifier("myProperty"), b.anyTypeAnnotation(), false)
                ],
                indexers: [
                    b.objectTypeIndexer(b.identifier("myIndexer"), b.stringTypeAnnotation(), b.anyTypeAnnotation())
                ],
                callProperties: [
                    b.objectTypeCallProperty(b.functionTypeAnnotation([
                        b.functionTypeParam(b.identifier("myParameter"), b.anyTypeAnnotation(), false)
                    ], b.anyTypeAnnotation(), null, null)),
                    b.objectTypeCallProperty(b.functionTypeAnnotation([
                        b.functionTypeParam(b.identifier("myOptionalParameter"), b.anyTypeAnnotation(), true)
                    ], b.anyTypeAnnotation(), null, null)),
                    b.objectTypeCallProperty(b.functionTypeAnnotation([
                        b.functionTypeParam(b.identifier("myParameterWithRest"), b.anyTypeAnnotation(), false)
                    ], b.anyTypeAnnotation(), b.functionTypeParam(b.identifier("rest"), b.arrayTypeAnnotation(b.anyTypeAnnotation()), false), null))
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
                        value: b.functionTypeAnnotation([
                            b.functionTypeParam(b.identifier("arg"), b.anyTypeAnnotation(), false)
                        ], b.anyTypeAnnotation(), null, null),
                        static: true,
                        method: false,
                        optional: true,
                    }),
                    b.objectTypeInternalSlot.from({
                        id: b.identifier("myStaticMethodOptionalInternalSlot"),
                        value: b.functionTypeAnnotation([
                            b.functionTypeParam(b.identifier("arg"), b.anyTypeAnnotation(), false)
                        ], b.anyTypeAnnotation(), null, null),
                        static: true,
                        method: true,
                        optional: true,
                    }),
                ],
            })),
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 40,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints class private methods and properties correctly", function () {
        var code = [
            'class MyClassWithPrivate {',
            '  #myPrivateProperty: any;',
            '  #myPrivatePropertyWithValue: any = value;',
            '  #myPrivateMethod() {}',
            '}',
        ].join(os_1.EOL);
        var ast = b.program([
            b.classDeclaration(b.identifier("MyClassWithPrivate"), b.classBody([
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
                b.classPrivateMethod(b.privateName(b.identifier("myPrivateMethod")), [], b.blockStatement([])),
            ])),
        ]);
        var printer = new printer_1.Printer({
            tabWidth: 2,
            wrapColumn: 40,
            trailingComma: true,
        });
        var pretty = printer.printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints an interpreter directive correctly", function () {
        var code = [
            '#!/usr/bin/env node',
            'console.log("Hello, world!");'
        ].join(os_1.EOL);
        var ast = b.program.from({
            interpreter: b.interpreterDirective("/usr/bin/env node"),
            body: [
                b.expressionStatement(b.callExpression(b.memberExpression(b.identifier("console"), b.identifier("log")), [b.stringLiteral("Hello, world!")]))
            ],
        });
        var pretty = new printer_1.Printer().printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("prints an interface type annotation correctly", function () {
        var code = [
            'let myVar: interface extends MyOtherInterface { myProperty: any };',
        ].join(os_1.EOL);
        var ast = b.program([
            b.variableDeclaration("let", [
                b.variableDeclarator(b.identifier.from({
                    name: "myVar",
                    typeAnnotation: b.typeAnnotation(b.interfaceTypeAnnotation(b.objectTypeAnnotation([
                        b.objectTypeProperty(b.identifier("myProperty"), b.anyTypeAnnotation(), false)
                    ]), [b.interfaceExtends(b.identifier("MyOtherInterface"))]))
                }))
            ])
        ]);
        var pretty = new printer_1.Printer().printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
    it("using AssignmentPattern in destructuring", function () {
        var code = [
            'var {',
            '    a = "hi"',
            '} = b;'
        ].join(os_1.EOL);
        var init = b.identifier('b');
        var assign = b.assignmentPattern(b.identifier('a'), b.literal('hi'));
        var property = b.property('init', b.identifier('a'), assign);
        property.shorthand = true;
        var id = b.objectPattern([
            property
        ]);
        var ast = b.program([
            b.variableDeclaration('var', [
                b.variableDeclarator(id, init)
            ])
        ]);
        var pretty = new printer_1.Printer().printGenerically(ast).code;
        assert_1.default.strictEqual(pretty, code);
    });
});
