var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;

function testPrinter(t, assert) {
    var code = testPrinter + "";
    var ast = parse(code);
    var printer = new Printer;

    assert.strictEqual(typeof printer.print, "function");
    assert.ok(printer.print(null).isEmpty());
    assert.ok(printer.print(null, true).isEmpty());

    var printed = printer.printGenerically(ast);
    var string = printed.toString();

    assert.ok(string.indexOf("t.finish();") > 0);

    printed = printer.print(ast, true);
    string = printed.toString();

    // TODO

    assert.ok(string.indexOf("// TODO") > 0);

    t.finish();
};
exports.testPrinter = testPrinter;
