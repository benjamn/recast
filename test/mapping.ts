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

  it("should generate correct mappings for dedented code", function () {
    // https://github.com/benjamn/recast/issues/1402
    const code = [
      "(",
      "",
      "  () => {",
      'update({ message: "test" });',
      "} )",
    ].join(eol);

    const ast = parse(code, {
      sourceFileName: "source.js",
    });

    const scope = b.identifier("scope");

    recast.visit(ast, {
      visitIdentifier: function (path) {
        if (path.value.name === "message") return false;
        path.replace(b.memberExpression(scope, path.node, false));
        return false;
      },
    });

    const expressionPath = new NodePath(ast).get("program", "body", 0);
    n.ExpressionStatement.assert(expressionPath.value);

    // Reusing the parenthesized arrow function dedents it by two columns,
    // but the lines of its body already begin at column zero, so they do not
    // move along with it.
    const printed = new Printer({
      sourceMapName: "source.map.json",
    }).print(
      b.arrowFunctionExpression([scope], expressionPath.value.expression),
    );

    assert.strictEqual(
      printed.code,
      ["scope => () => {", 'scope.update({ message: "test" });', "}"].join(eol),
    );

    const smc = new sourceMap.SourceMapConsumer(printed.map);

    function check(origLine: any, origCol: any, genLine: any, genCol: any) {
      assert.deepEqual(
        smc.originalPositionFor({
          line: genLine,
          column: genCol,
        }),
        {
          source: "source.js",
          line: origLine,
          column: origCol,
          name: null,
        },
      );

      assert.deepEqual(
        smc.generatedPositionFor({
          source: "source.js",
          line: origLine,
          column: origCol,
        }),
        {
          line: genLine,
          column: genCol,
          lastColumn: null,
        },
      );
    }

    check(3, 2, 1, 9); // (
    check(3, 8, 1, 15); // {
    check(4, 0, 2, 6); // update
    check(4, 25, 2, 31); // }
    check(5, 0, 3, 0); // }
  });

  describe("with tab indentation", function () {
    // Recast counts a leading tab as tabWidth columns, but source map columns
    // count characters.
    function checkMappings(code: string, printed: any, positions: number[][]) {
      const smc = new sourceMap.SourceMapConsumer(printed.map);
      const sourceLines = code.split(eol);
      const generatedLines = printed.code.split(eol);

      // Every mapping must point at the same character on both sides
      smc.eachMapping(function (mapping) {
        const generated = generatedLines[mapping.generatedLine - 1].charAt(
          mapping.generatedColumn,
        );
        const original = sourceLines[mapping.originalLine - 1].charAt(
          mapping.originalColumn,
        );

        assert.notStrictEqual(generated.trim(), "");
        assert.strictEqual(generated, original);
      });

      positions.forEach(function ([origLine, origCol, genLine, genCol]) {
        assert.deepEqual(
          smc.originalPositionFor({ line: genLine, column: genCol }),
          { source: "source.js", line: origLine, column: origCol, name: null },
        );

        assert.deepEqual(
          smc.generatedPositionFor({
            source: "source.js",
            line: origLine,
            column: origCol,
          }),
          { line: genLine, column: genCol, lastColumn: null },
        );
      });
    }

    function reprintInsideIf(ast: any, options: any) {
      const statements = ast.program.body;
      ast.program.body = [
        b.ifStatement(b.literal(true), b.blockStatement(statements)),
      ];

      return recast.print(ast, {
        sourceMapName: "source.map.json",
        ...options,
      });
    }

    it("should map reused tab indentation", function () {
      const code = ["function f() {", "\treturn 1;", "}"].join(eol);
      const ast = parse(code, { sourceFileName: "source.js" });
      ast.program.body.unshift(b.expressionStatement(b.literal("x")));

      const printed = recast.print(ast, { sourceMapName: "source.map.json" });

      assert.strictEqual(
        printed.code,
        ['"x";', "function f() {", "\treturn 1;", "}"].join(eol),
      );
      checkMappings(code, printed, [
        [2, 1, 3, 1], // return
        [2, 9, 3, 9], // ;
      ]);
    });

    it("should map tab indentation reprinted with spaces", function () {
      const code = ["function f() {", "\treturn 1;", "}"].join(eol);
      const ast = parse(code, { sourceFileName: "source.js" });

      const printed = reprintInsideIf(ast, {});

      assert.strictEqual(
        printed.code,
        [
          "if (true) {",
          "    function f() {",
          "        return 1;",
          "    }",
          "}",
        ].join(eol),
      );
      checkMappings(code, printed, [
        [2, 1, 3, 8], // return
        [3, 0, 4, 4], // }
      ]);
    });

    it("should map space indentation printed with tabs", function () {
      const code = ["function f() {", "    return 1;", "}"].join(eol);
      const ast = parse(code, { sourceFileName: "source.js" });
      ast.program.body.unshift(b.expressionStatement(b.literal("x")));

      const printed = recast.print(ast, {
        sourceMapName: "source.map.json",
        useTabs: true,
        reuseWhitespace: false,
      });

      assert.strictEqual(
        printed.code,
        ['"x";', "", "function f() {", "\treturn 1;", "}"].join(eol),
      );
      checkMappings(code, printed, [
        [2, 4, 4, 1], // return
        [2, 12, 4, 9], // ;
      ]);
    });

    it("should map mixed tabs and spaces", function () {
      const code = [
        "function f() {",
        "\t  if (a) {",
        "  \treturn 1;",
        "\t  }",
        "}",
      ].join(eol);
      const ast = parse(code, { sourceFileName: "source.js" });
      ast.program.body.unshift(b.expressionStatement(b.literal("x")));

      const printed = recast.print(ast, { sourceMapName: "source.map.json" });

      assert.strictEqual(printed.code, ['"x";', code].join(eol));
      checkMappings(code, printed, [
        [2, 3, 3, 3], // if
        [3, 3, 4, 3], // return
        [4, 3, 5, 3], // }
      ]);
    });

    it("should map tabs with a custom tabWidth", function () {
      const code = ["function f() {", "\treturn 1;", "}"].join(eol);
      const ast = parse(code, { sourceFileName: "source.js", tabWidth: 2 });

      const printed = reprintInsideIf(ast, { tabWidth: 2, useTabs: true });

      assert.strictEqual(
        printed.code,
        ["if (true) {", "  function f() {", "\t\treturn 1;", "\t}", "}"].join(
          eol,
        ),
      );
      checkMappings(code, printed, [
        [2, 1, 3, 2], // return
        [3, 0, 4, 1], // }
      ]);
    });
  });
});
