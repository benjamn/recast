var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var n = require("../lib/types").namedTypes;
var b = require("../lib/types").builders;

function testPrinter(t, assert) {
    var code = testPrinter + "";
    var ast = parse(code);
    var printer = new Printer;

    assert.strictEqual(typeof printer.print, "function");
    assert.strictEqual(printer.print(null).code, "");

    var string = printer.printGenerically(ast).code;
    assert.ok(string.indexOf("t.finish();") > 0);

    string = printer.print(ast).code;

    // TODO

    assert.ok(string.indexOf("// TODO") > 0);

    t.finish();
};
exports.testPrinter = testPrinter;

var uselessSemicolons = [
    'function a() {',
    '  return "a";',
    '};',
    '',
    'function b() {',
    '  return "b";',
    '};'
].join("\n");

exports.testEmptyStatements = function(t, assert) {
    var ast = parse(uselessSemicolons);
    var printer = new Printer({ tabWidth: 2 });

    var reprinted = printer.print(ast).code;
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, uselessSemicolons);

    var generic = printer.printGenerically(ast).code;
    var withoutTrailingSemicolons = uselessSemicolons.replace(/\};/g, "}");
    assert.strictEqual(typeof generic, "string");
    assert.strictEqual(generic, withoutTrailingSemicolons);

    t.finish();
};

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

exports.testSwitchCase = function(t, assert) {
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

    t.finish();
};

var tryCatch = [
    "try {",
    "  a();",
    "} catch (e) {",
    "  b(e);",
    "}"
].join("\n");

exports.testIndentTryCatch = function(t, assert) {
    var ast = parse(tryCatch);
    var printer = new Printer({ tabWidth: 2 });
    var body = ast.program.body;
    var tryStmt = body[0];
    n.TryStatement.assert(tryStmt);

    // Force reprinting of the catch.
    tryStmt.handlers[0].guard = null;

    assert.strictEqual(printer.print(ast).code, tryCatch);

    t.finish();
};

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
    "",
    "  baz(x, y) {",
    "    this.foo(x);",
    "    this.bar(y);",
    "  }",
    "",
    "  foo(x) { return x }",
    "}"
];

exports.testMethodPrinting = function(t, assert) {
    var code = classBody.join("\n");
    try {
        var ast = parse(code);
    } catch (e) {
        // ES6 not supported, silently finish
        return t.finish();
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

    t.finish();
};

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

exports.testMultiLineParams = function(t, assert) {
    var code = multiLineParams.join("\n");
    var ast = parse(code);
    var printer = new Printer({ tabWidth: 2 });

    require("ast-types").traverse(ast, function(node) {
        // Drop all original source information.
        node.original = null;
    });

    assert.strictEqual(
        printer.print(ast).code,
        multiLineParamsExpected.join("\n")
    );

    t.finish();
};

exports.testSimpleVarPrinting = function(t, assert) {
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

    t.finish();
};

exports.testMultiLineVarPrinting = function(t, assert) {
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

    t.finish();
};

exports.testForLoopPrinting = function(t, assert) {
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

    t.finish();
};

exports.testEmptyForLoopPrinting = function(t, assert) {
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

    t.finish();
};

exports.testForInLoopPrinting = function(t, assert) {
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

    t.finish();
};

exports.testGuessTabWidth = function(t, assert) {
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

    t.finish();
};
