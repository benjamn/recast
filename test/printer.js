var Printer = require("../lib/printer").Printer,
    Parser = require("../lib/parser").Parser;

function testPrinter(t, assert) {
    var code = testPrinter + "",
        parser = new Parser(code),
        printer = new Printer;

    assert.strictEqual(typeof printer.print, "function");
    assert.ok(printer.print(null).isEmpty());
    assert.ok(printer.print(null, true).isEmpty());

    var printed = printer.printGenerically(parser.getAst()),
        string = printed.toString();

    assert.ok(string.indexOf("t.finish();") > 0);

    printed = printer.print(parser.getAst(), true);
    string = printed.toString();

    // TODO

    assert.ok(string.indexOf("// TODO") > 0);

    t.finish();
};
exports.testPrinter = testPrinter;
