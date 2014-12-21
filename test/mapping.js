var assert = require("assert");
var sourceMap = require("source-map");
var recast = require("..");
var types = require("../lib/types");
var n = types.namedTypes;
var b = types.builders;
var NodePath = types.NodePath;
var fromString = require("../lib/lines").fromString;
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var Mapping = require("../lib/mapping");

describe("source maps", function() {
    it("should generate correct mappings", function() {
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

        var sourceRoot = "path/to/source/root";
        var printed = new Printer({
            sourceMapName: "source.map.json",
            sourceRoot: sourceRoot
        }).print(ast);

        assert.ok(printed.map);

        assert.strictEqual(
            printed.map.file,
            "source.map.json"
        );

        assert.strictEqual(
            printed.map.sourceRoot,
            sourceRoot
        );

        var smc = new sourceMap.SourceMapConsumer(printed.map);

        function check(origLine, origCol, genLine, genCol, lastColumn) {
            assert.deepEqual(smc.originalPositionFor({
                line: genLine,
                column: genCol
            }), {
                source: sourceRoot + "/source.js",
                line: origLine,
                column: origCol,
                name: null
            });

            assert.deepEqual(smc.generatedPositionFor({
                source: sourceRoot + "/source.js",
                line: origLine,
                column: origCol
            }), {
                line: genLine,
                column: genCol,
                lastColumn: lastColumn
            });
        }

        check(1, 0, 1, 0, null); // function
        check(1, 18, 1, 18, null); // {
        check(2, 2, 2, 2, null); // return
        check(2, 13, 2, 9, null); // bar
        check(2, 9, 2, 15, null); // 1
        check(2, 16, 2, 16, null); // ;
        check(3, 0, 3, 0, null); // }
    });

    it("should compose with inputSourceMap", function() {
        function addUseStrict(ast) {
            return recast.visit(ast, {
                visitFunction: function(path) {
                    path.get("body", "body").unshift(
                        b.expressionStatement(b.literal("use strict"))
                    );
                    this.traverse(path);
                }
            });
        }

        function stripConsole(ast) {
            return recast.visit(ast, {
                visitCallExpression: function(path) {
                    var node = path.value;
                    if (n.MemberExpression.check(node.callee) &&
                        n.Identifier.check(node.callee.object) &&
                        node.callee.object.name === "console") {
                        n.ExpressionStatement.assert(path.parent.node);
                        path.parent.replace();
                        return false;
                    }
                }
            });
        }

        var code = [
            "function add(a, b) {",
            "  var sum = a + b;",
            "  console.log(a, b);",
            "  return sum;",
            "}"
        ].join("\n");

        var ast = parse(code, {
            sourceFileName: "original.js"
        });

        var useStrictResult = new Printer({
            sourceMapName: "useStrict.map.json"
        }).print(addUseStrict(ast));

        var useStrictAst = parse(useStrictResult.code, {
            sourceFileName: "useStrict.js"
        });

        var oneStepResult = new Printer({
            sourceMapName: "oneStep.map.json"
        }).print(stripConsole(ast));

        var twoStepResult = new Printer({
            sourceMapName: "twoStep.map.json",
            inputSourceMap: useStrictResult.map
        }).print(stripConsole(useStrictAst));

        assert.strictEqual(
            oneStepResult.code,
            twoStepResult.code
        );

        var smc1 = new sourceMap.SourceMapConsumer(oneStepResult.map);
        var smc2 = new sourceMap.SourceMapConsumer(twoStepResult.map);

        smc1.eachMapping(function(mapping) {
            var pos = {
                line: mapping.generatedLine,
                column: mapping.generatedColumn
            };

            var orig1 = smc1.originalPositionFor(pos);
            var orig2 = smc2.originalPositionFor(pos);

            // The composition of the source maps generated separately from
            // the two transforms should be equivalent to the source map
            // generated from the composition of the two transforms.
            assert.deepEqual(orig1, orig2);

            // Make sure the two-step source map refers back to the original
            // source instead of the intermediate source.
            assert.strictEqual(orig2.source, "original.js");
        });
    });

    it("should work when a child node becomes null", function() {
        // https://github.com/facebook/regenerator/issues/103
        var code = [
            "for (var i = 0; false; i++)",
            "  log(i);"
        ].join("\n");
        var ast = parse(code);
        var path = new NodePath(ast);

        var updatePath = path.get("program", "body", 0, "update");
        n.UpdateExpression.assert(updatePath.value);

        updatePath.replace(null);

        var printed = new Printer().print(ast);
        assert.strictEqual(printed.code, [
            "for (var i = 0; false; )",
            "  log(i);"
        ].join("\n"));
    });

    it("should tolerate programs that become empty", function() {
        var source = "foo();";
        var ast = recast.parse(source, {
            sourceFileName: "foo.js"
        });

        assert.strictEqual(ast.program.body.length, 1);
        ast.program.body.length = 0;

        var result = recast.print(ast, {
            sourceMapName: "foo.map.json"
        });

        assert.strictEqual(result.map.file, "foo.map.json");
        assert.deepEqual(result.map.sources, []);
        assert.deepEqual(result.map.names, []);
        assert.strictEqual(result.map.mappings, "");
    });
});
