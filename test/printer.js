var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var n = require("../lib/types").namedTypes;
var b = require("../lib/types").builders;

function testPrinter(t, assert) {
    var code = testPrinter + "";
    var ast = parse(code);
    var printer = new Printer;

    assert.strictEqual(typeof printer.print, "function");
    assert.strictEqual(printer.print(null), "");

    var string = printer.printGenerically(ast);
    assert.ok(string.indexOf("t.finish();") > 0);

    string = printer.print(ast);

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

    var reprinted = printer.print(ast);
    assert.strictEqual(typeof reprinted, "string");
    assert.strictEqual(reprinted, uselessSemicolons);

    var generic = printer.printGenerically(ast);
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
        printer.print(ast),
        switchCaseReprinted
    );

    assert.strictEqual(
        printer.printGenerically(ast),
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

    assert.strictEqual(printer.print(ast), tryCatch);

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
        return t.skip("ES6 not supported: " + e);
    }
    var printer = new Printer({ tabWidth: 2 });
    var cb = ast.program.body[0].body;
    n.ClassBody.assert(cb);

    // Trigger reprinting of the class body.
    cb.body.push(cb.body[0]);

    assert.strictEqual(
        printer.print(ast),
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
        printer.print(ast),
        multiLineParamsExpected.join("\n")
    );

    t.finish();
};
