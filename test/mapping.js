var fromString = require("../lib/lines").fromString;
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var Mapping = require("../lib/mapping");

exports.testMapping = function(t, assert) {
    var ast = parse([
        "function foo(bar) {",
        "  return 1 + bar;",
        "}"
    ].join("\n"), {
        sourceFileName: "source.js"
    });

    var printer = new Printer({
        sourceMapName: "map.js"
    });

    console.log(printer.print(ast));

    t.finish();
};
