var assert = require("assert");
var recast = require("..");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var n = require("../lib/types").namedTypes;
var b = require("../lib/types").builders;

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
    ].join("\n");

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
    ].join("\n");

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
    var objectExprWithoutTrailingComma = '({\n  x: 1,\n  y: 2\n});';

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
    ].join("\n");

    var switchCaseReprinted = [
        "if (test) {",
        "  switch (test) {",
        "  default:",
        "  case a: break",
        "  case b:",
        "    break;",
        "  }",
        "}"
    ].join("\n");

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
    ].join("\n");

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
    ].join("\n");

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
        var code = classBody.join("\n");
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
            classBodyExpected.join("\n")
        );
    });

    var multiLineParams = [
        "function f(/* first",
        "              xxx",
        "              param */ a,",
        "  // other params",
        "  b, c, // see?",
        "  d) {",
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
        "  d) {",
        "  return a + b + c + d;",
        "}"
    ];

    it("MultiLineParams", function() {
        var code = multiLineParams.join("\n");
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
            multiLineParamsExpected.join("\n")
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
        ].join("\n"));
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
            "for (var i = 0; i < 3; i++)\n" +
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
            "for (var i = 0; i < 3; i++)\n" +
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
            "for (var key in obj)\n" +
            "  log(key);"
        );
    });

    it("GuessTabWidth", function() {
        var code = [
            "function identity(x) {",
            "  return x;",
            "}"
        ].join("\n");

        var guessedTwo = [
            "function identity(x) {",
            "  log(x);",
            "  return x;",
            "}"
        ].join("\n");

        var explicitFour = [
            "function identity(x) {",
            "    log(x);",
            "    return x;",
            "}"
        ].join("\n");

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
            "function a(b, c=1, ...d) {}"
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
            "(b, c=1, ...d) => {}"
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
        assert.strictEqual(printer.printGenerically(ast).code, code + ";");

        code = "export function foo() {};";
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
    ].join("\n");

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
    ].join("\n");

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
                "function foo() {\n",
                linesModule.fromString(
                    stmtListSpacesExpected.replace(/^\s+|\s+$/g, "")
                ).indent(2),
                "\n}"
            ]).toString()
        );
    });

    it("should print static methods with the static keyword", function() {
        var printer = new Printer({ tabWidth: 4 });
        var ast = parse([
            "class A {",
            "  static foo() {}",
            "}"
        ].join("\n"));

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
        ].join("\n"));
    });

    it("should print string literals with the specified delimiter", function() {
        var ast = parse([
            "var obj = {",
            "    \"foo's\": 'bar',",
            "    '\"bar\\'s\"': /regex/m",
            "};"
        ].join("\n"));

        var variableDeclaration = ast.program.body[0];
        n.VariableDeclaration.assert(variableDeclaration);

        var printer = new Printer({ quote: "single" });
        assert.strictEqual(printer.printGenerically(ast).code, [
            "var obj = {",
            "    'foo\\'s': 'bar',",
            "    '\"bar\\'s\"': /regex/m",
            "};"
        ].join("\n"));

        var printer2 = new Printer({ quote: "double" });
        assert.strictEqual(printer2.printGenerically(ast).code, [
            "var obj = {",
            "    \"foo's\": \"bar\",",
            '    "\\"bar\'s\\"": /regex/m',
            "};"
        ].join("\n"));

        var printer3 = new Printer({ quote: "auto" });
        assert.strictEqual(printer3.printGenerically(ast).code, [
            "var obj = {",
            '    "foo\'s": "bar",',
            '    \'"bar\\\'s"\': /regex/m',
            "};"
        ].join("\n"));
    });

    it("should print block comments at head of class once", function() {
        // Given.
        var ast = parse([
            "/**",
            " * This class was in an IIFE and returned an instance of itself.",
            " */",
            "function SimpleClass() {",
            "};"
        ].join("\n"));

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
        ].join("\n"));
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
        ].join("\n");

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
        ].join("\n");

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
        ].join("\n"));

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
        ].join("\n"));
    });

    it("prints trailing commas in object literals", function() {
        var code = [
            "({",
            "  foo: bar,",
            "  bar: foo,",
            "});"
        ].join("\n");

        var ast = parse(code);

        var printer = new Printer({
            tabWidth: 2,
            trailingComma: true,
        });

        var pretty = printer.printGenerically(ast).code;
        assert.strictEqual(pretty, code);
    });

    it("prints trailing commas in function calls", function() {
        var code = [
            "call(",
            "  1,",
            "  2,",
            ");"
        ].join("\n");

        var ast = parse(code);

        var printer = new Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });

        var pretty = printer.printGenerically(ast).code;
        assert.strictEqual(pretty, code);
    });

    it("prints trailing commas in array expressions", function() {
        var code = [
            "[",
            "  1,",
            "  2,",
            "];"
        ].join("\n");

        var ast = parse(code);

        var printer = new Printer({
            tabWidth: 2,
            wrapColumn: 1,
            trailingComma: true,
        });

        var pretty = printer.printGenerically(ast).code;
        assert.strictEqual(pretty, code);
    });

    it("prints trailing commas in function definitions", function() {
        var code = [
            "function foo(",
            "  a,",
            "  b,",
            ") {}"
        ].join("\n");

        var ast = parse(code);

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
            "function foo(a, [b, c]=d(a), ...[e, f, ...rest]) {",
            "  return [a, b, c, e, f, rest];",
            "}"
        ].join("\n");

        var ast = parse(code);
        var printer = new Printer({
            tabWidth: 2
        });

        var pretty = printer.printGenerically(ast).code;
        assert.strictEqual(pretty, code);
    });

    it("should add parenthesis around SpreadElementPattern", function() {
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
});
