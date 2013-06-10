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
