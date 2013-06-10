var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;

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
