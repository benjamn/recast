"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var source_map_1 = __importDefault(require("source-map"));
var recast = __importStar(require("../main"));
var types = __importStar(require("ast-types"));
var n = types.namedTypes;
var b = types.builders;
var NodePath = types.NodePath;
var lines_1 = require("../lib/lines");
var parser_1 = require("../lib/parser");
var printer_1 = require("../lib/printer");
var os_1 = require("os");
describe("source maps", function () {
    it("should generate correct mappings", function () {
        var code = ["function foo(bar) {", "  return 1 + bar;", "}"].join(os_1.EOL);
        lines_1.fromString(code);
        var ast = parser_1.parse(code, {
            sourceFileName: "source.js",
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
        var printed = new printer_1.Printer({
            sourceMapName: "source.map.json",
            sourceRoot: sourceRoot,
        }).print(ast);
        assert_1.default.ok(printed.map);
        assert_1.default.strictEqual(printed.map.file, "source.map.json");
        assert_1.default.strictEqual(printed.map.sourceRoot, sourceRoot);
        var smc = new source_map_1.default.SourceMapConsumer(printed.map);
        function check(origLine, origCol, genLine, genCol, lastColumn) {
            assert_1.default.deepEqual(smc.originalPositionFor({
                line: genLine,
                column: genCol,
            }), {
                source: sourceRoot + "/source.js",
                line: origLine,
                column: origCol,
                name: null,
            });
            assert_1.default.deepEqual(smc.generatedPositionFor({
                source: sourceRoot + "/source.js",
                line: origLine,
                column: origCol,
            }), {
                line: genLine,
                column: genCol,
                lastColumn: lastColumn,
            });
        }
        check(1, 0, 1, 0, null); // function
        check(1, 18, 1, 18, null); // {
        check(2, 13, 2, 9, null); // bar
        check(2, 9, 2, 15, null); // 1
        check(3, 0, 3, 0, null); // }
    });
    it("should compose with inputSourceMap", function () {
        function addUseStrict(ast) {
            return recast.visit(ast, {
                visitFunction: function (path) {
                    path
                        .get("body", "body")
                        .unshift(b.expressionStatement(b.literal("use strict")));
                    this.traverse(path);
                },
            });
        }
        function stripConsole(ast) {
            return recast.visit(ast, {
                visitCallExpression: function (path) {
                    var node = path.value;
                    if (n.MemberExpression.check(node.callee) &&
                        n.Identifier.check(node.callee.object) &&
                        node.callee.object.name === "console") {
                        n.ExpressionStatement.assert(path.parent.node);
                        path.parent.replace();
                        return false;
                    }
                    return;
                },
            });
        }
        var code = [
            "function add(a, b) {",
            "  var sum = a + b;",
            "  console.log(a, b);",
            "  return sum;",
            "}",
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, {
            sourceFileName: "original.js",
        });
        var useStrictResult = new printer_1.Printer({
            sourceMapName: "useStrict.map.json",
        }).print(addUseStrict(ast));
        var useStrictAst = parser_1.parse(useStrictResult.code, {
            sourceFileName: "useStrict.js",
        });
        var oneStepResult = new printer_1.Printer({
            sourceMapName: "oneStep.map.json",
        }).print(stripConsole(ast));
        var twoStepResult = new printer_1.Printer({
            sourceMapName: "twoStep.map.json",
            inputSourceMap: useStrictResult.map,
        }).print(stripConsole(useStrictAst));
        assert_1.default.strictEqual(oneStepResult.code, twoStepResult.code);
        var smc1 = new source_map_1.default.SourceMapConsumer(oneStepResult.map);
        var smc2 = new source_map_1.default.SourceMapConsumer(twoStepResult.map);
        smc1.eachMapping(function (mapping) {
            var pos = {
                line: mapping.generatedLine,
                column: mapping.generatedColumn,
            };
            var orig1 = smc1.originalPositionFor(pos);
            var orig2 = smc2.originalPositionFor(pos);
            // The composition of the source maps generated separately from
            // the two transforms should be equivalent to the source map
            // generated from the composition of the two transforms.
            assert_1.default.deepEqual(orig1, orig2);
            // Make sure the two-step source map refers back to the original
            // source instead of the intermediate source.
            assert_1.default.strictEqual(orig2.source, "original.js");
        });
    });
    it("should work when a child node becomes null", function () {
        // https://github.com/facebook/regenerator/issues/103
        var code = ["for (var i = 0; false; i++)", "  log(i);"].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var path = new NodePath(ast);
        var updatePath = path.get("program", "body", 0, "update");
        n.UpdateExpression.assert(updatePath.value);
        updatePath.replace(null);
        var printed = new printer_1.Printer().print(ast);
        assert_1.default.strictEqual(printed.code, ["for (var i = 0; false; )", "  log(i);"].join(os_1.EOL));
    });
    it("should tolerate programs that become empty", function () {
        var source = "foo();";
        var ast = recast.parse(source, {
            sourceFileName: "foo.js",
        });
        assert_1.default.strictEqual(ast.program.body.length, 1);
        ast.program.body.length = 0;
        var result = recast.print(ast, {
            sourceMapName: "foo.map.json",
        });
        assert_1.default.strictEqual(result.map.file, "foo.map.json");
        assert_1.default.deepEqual(result.map.sources, []);
        assert_1.default.deepEqual(result.map.names, []);
        assert_1.default.strictEqual(result.map.mappings, "");
    });
});
