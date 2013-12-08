var sourceMap = require("source-map");
var types = require("ast-types");
var n = types.namedTypes;
var NodePath = types.NodePath;
var fromString = require("../lib/lines").fromString;
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var Mapping = require("../lib/mapping");

exports.testMapping = function(t, assert) {
    var code = [
        "function foo(bar) {",
        "  return 1 + bar;",
        "}"
    ].join("\n");

    var lines = fromString(code);
    var ast = parse(code, {
        sourceFileName: "source.js"
    });

    var path = new NodePath(ast);
    var returnPath = path.get("program", "body", 0, "body", "body", 0);
    n.ReturnStatement.assert(returnPath.value);

    var leftPath = returnPath.get("argument", "left");
    var leftValue = leftPath.value;
    var rightPath = returnPath.get("argument", "right");

    leftPath.replace(rightPath.value);
    rightPath.replace(leftValue);

    var printed = new Printer({
        sourceMapName: "source.map.json"
    }).print(ast);

    assert.ok(printed.map);

    assert.strictEqual(
        printed.map.file,
        "source.map.json"
    );

    var smc = new sourceMap.SourceMapConsumer(printed.map);

    function check(origLine, origCol, genLine, genCol) {
        assert.deepEqual(smc.originalPositionFor({
            line: genLine,
            column: genCol
        }), {
            source: "source.js",
            line: origLine,
            column: origCol,
            name: lines.charAt({
                line: origLine,
                column: origCol
            })
        });

        assert.deepEqual(smc.generatedPositionFor({
            source: "source.js",
            line: origLine,
            column: origCol
        }), {
            line: genLine,
            column: genCol
        });
    }

    check(1, 0, 1, 0); // function
    check(1, 18, 1, 18); // {
    check(2, 2, 2, 2); // return
    check(2, 13, 2, 9); // bar
    check(2, 9, 2, 15); // 1
    check(2, 16, 2, 16); // ;
    check(3, 0, 3, 0); // }

    t.finish();
};
