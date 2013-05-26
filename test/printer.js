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
