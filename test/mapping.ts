import assert from "assert";
import sourceMap from "source-map";
import * as recast from "../main";
import * as types from "ast-types";
const n = types.namedTypes;
const b = types.builders;
const NodePath = types.NodePath;
import { fromString } from "../lib/lines";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import { EOL as eol } from "os";

describe("source maps", function () {
  it("should generate correct mappings", function () {
    const code = ["function foo(bar) {", "  return 1 + bar;", "}"].join(eol);

    fromString(code);
    const ast = parse(code, {
      sourceFileName: "source.js",
    });

    const path = new NodePath(ast);
    const returnPath = path.get("program", "body", 0, "body", "body", 0);
    n.ReturnStatement.assert(returnPath.value);

    const leftPath = returnPath.get("argument", "left");
    const leftValue = leftPath.value;
    const rightPath = returnPath.get("argument", "right");

    leftPath.replace(rightPath.value);
    rightPath.replace(leftValue);

    const sourceRoot = "path/to/source/root";
    const printed = new Printer({
      sourceMapName: "source.map.json",
      sourceRoot: sourceRoot,
    }).print(ast);

    assert.ok(printed.map);

    assert.strictEqual(printed.map.file, "source.map.json");

    assert.strictEqual(printed.map.sourceRoot, sourceRoot);

    const smc = new sourceMap.SourceMapConsumer(printed.map);

    function check(
      origLine: any,
      origCol: any,
      genLine: any,
      genCol: any,
      lastColumn: any,
    ) {
      assert.deepEqual(
        smc.originalPositionFor({
          line: genLine,
          column: genCol,
        }),
        {
          source: sourceRoot + "/source.js",
          line: origLine,
          column: origCol,
          name: null,
        },
      );

      assert.deepEqual(
        smc.generatedPositionFor({
          source: sourceRoot + "/source.js",
          line: origLine,
          column: origCol,
        }),
        {
          line: genLine,
          column: genCol,
          lastColumn: lastColumn,
        },
      );
    }

    check(1, 0, 1, 0, null); // function
    check(1, 18, 1, 18, null); // {
    check(2, 13, 2, 9, null); // bar
    check(2, 9, 2, 15, null); // 1
    check(3, 0, 3, 0, null); // }
  });

  it("should compose with inputSourceMap", function () {
    function addUseStrict(ast: any) {
      return recast.visit(ast, {
        visitFunction: function (path) {
          path
            .get("body", "body")
            .unshift(b.expressionStatement(b.literal("use strict")));
          this.traverse(path);
        },
      });
    }

    function stripConsole(ast: any) {
      return recast.visit(ast, {
        visitCallExpression: function (path) {
          const node = path.value;
          if (
            n.MemberExpression.check(node.callee) &&
            n.Identifier.check(node.callee.object) &&
            node.callee.object.name === "console"
          ) {
            n.ExpressionStatement.assert(path.parent.node);
            path.parent.replace();
            return false;
          }
          return;
        },
      });
    }

    const code = [
      "function add(a, b) {",
      "  var sum = a + b;",
      "  console.log(a, b);",
      "  return sum;",
      "}",
    ].join(eol);

    const ast = parse(code, {
      sourceFileName: "original.js",
    });

    const useStrictResult = new Printer({
      sourceMapName: "useStrict.map.json",
    }).print(addUseStrict(ast));

    const useStrictAst = parse(useStrictResult.code, {
      sourceFileName: "useStrict.js",
    });

    const oneStepResult = new Printer({
      sourceMapName: "oneStep.map.json",
    }).print(stripConsole(ast));

    const twoStepResult = new Printer({
      sourceMapName: "twoStep.map.json",
      inputSourceMap: useStrictResult.map,
    }).print(stripConsole(useStrictAst));

    assert.strictEqual(oneStepResult.code, twoStepResult.code);

    const smc1 = new sourceMap.SourceMapConsumer(oneStepResult.map);
    const smc2 = new sourceMap.SourceMapConsumer(twoStepResult.map);

    smc1.eachMapping(function (mapping) {
      const pos = {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      };

      const orig1 = smc1.originalPositionFor(pos);
      const orig2 = smc2.originalPositionFor(pos);

      // The composition of the source maps generated separately from
      // the two transforms should be equivalent to the source map
      // generated from the composition of the two transforms.
      assert.deepEqual(orig1, orig2);

      // Make sure the two-step source map refers back to the original
      // source instead of the intermediate source.
      assert.strictEqual(orig2.source, "original.js");
    });
  });

  it("should work when a child node becomes null", function () {
    // https://github.com/facebook/regenerator/issues/103
    const code = ["for (var i = 0; false; i++)", "  log(i);"].join(eol);
    const ast = parse(code);
    const path = new NodePath(ast);

    const updatePath = path.get("program", "body", 0, "update");
    n.UpdateExpression.assert(updatePath.value);

    updatePath.replace(null);

    const printed = new Printer().print(ast);
    assert.strictEqual(
      printed.code,
      ["for (var i = 0; false; )", "  log(i);"].join(eol),
    );
  });

  it("should tolerate programs that become empty", function () {
    const source = "foo();";
    const ast = recast.parse(source, {
      sourceFileName: "foo.js",
    });

    assert.strictEqual(ast.program.body.length, 1);
    ast.program.body.length = 0;

    const result = recast.print(ast, {
      sourceMapName: "foo.map.json",
    });

    assert.strictEqual(result.map.file, "foo.map.json");
    assert.deepEqual(result.map.sources, []);
    assert.deepEqual(result.map.names, []);
    assert.strictEqual(result.map.mappings, "");
  });
});
