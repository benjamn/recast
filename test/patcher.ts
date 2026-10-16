import assert from "assert";
import * as recast from "../main";
import * as types from "ast-types";
const n = types.namedTypes;
const b = types.builders;
import { getReprinter, Patcher } from "../lib/patcher";
import { fromString } from "../lib/lines";
import { parse } from "../lib/parser";
import * as flowParser from "../parsers/flow";
import FastPath from "../lib/fast-path";
import { EOL as eol } from "os";

const code = [
  "// file comment",
  "exports.foo({",
  "    // some comment",
  "    bar: 42,",
  "    baz: this",
  "});",
];

function loc(sl: number, sc: number, el: number, ec: number) {
  return {
    start: { line: sl, column: sc },
    end: { line: el, column: ec },
  };
}

describe("patcher", function () {
  it("Patcher", function () {
    let lines = fromString(code.join(eol)),
      patcher = new Patcher(lines),
      selfLoc = loc(5, 9, 5, 13);

    assert.strictEqual(patcher.get(selfLoc).toString(), "this");

    patcher.replace(selfLoc, "self");

    assert.strictEqual(patcher.get(selfLoc).toString(), "self");

    const got = patcher.get().toString();
    assert.strictEqual(got, code.join(eol).replace("this", "self"));

    // Make sure comments are preserved.
    assert.ok(got.indexOf("// some") >= 0);

    const oyezLoc = loc(2, 12, 6, 1),
      beforeOyez = patcher.get(oyezLoc).toString();
    assert.strictEqual(beforeOyez.indexOf("exports"), -1);
    assert.ok(beforeOyez.indexOf("comment") >= 0);

    patcher.replace(oyezLoc, "oyez");

    assert.strictEqual(
      patcher.get().toString(),
      ["// file comment", "exports.foo(oyez);"].join(eol),
    );

    // "Reset" the patcher.
    patcher = new Patcher(lines);
    patcher.replace(oyezLoc, "oyez");
    patcher.replace(selfLoc, "self");

    assert.strictEqual(
      patcher.get().toString(),
      ["// file comment", "exports.foo(oyez);"].join(eol),
    );
  });

  const trickyCode = [
    "    function",
    "      foo(bar,",
    "  baz) {",
    "        qux();",
    "    }",
  ].join(eol);

  it("GetIndent", function () {
    function check(indent: number) {
      const lines = fromString(trickyCode).indent(indent);
      const file = parse(lines.toString());
      const reprinter = FastPath.from(file).call(
        (bodyPath: any) => getReprinter(bodyPath),
        "program",
        "body",
        0,
        "body",
      );

      const reprintedLines = reprinter(function () {
        assert.ok(false, "should not have called print function");
      });

      assert.strictEqual(reprintedLines.length, 3);
      assert.strictEqual(reprintedLines.getIndentAt(1), 0);
      assert.strictEqual(reprintedLines.getIndentAt(2), 4);
      assert.strictEqual(reprintedLines.getIndentAt(3), 0);
      assert.strictEqual(
        reprintedLines.toString(),
        ["{", "    qux();", "}"].join(eol),
      );
    }

    for (let indent = -4; indent <= 4; ++indent) {
      check(indent);
    }
  });

  it("should patch return/throw/etc. arguments correctly", function () {
    const strAST = parse('return"foo"');
    const returnStmt = strAST.program.body[0];
    n.ReturnStatement.assert(returnStmt);
    assert.strictEqual(recast.print(strAST).code, 'return"foo"');

    returnStmt.argument = b.literal(null);
    assert.strictEqual(
      recast.print(strAST).code,
      "return null;", // Instead of returnnull.
    );

    const arrAST = parse("throw[1,2,3]");
    const throwStmt = arrAST.program.body[0];
    n.ThrowStatement.assert(throwStmt);
    assert.strictEqual(recast.print(arrAST).code, "throw[1,2,3]");

    throwStmt.argument = b.literal(false);
    assert.strictEqual(
      recast.print(arrAST).code,
      "throw false", // Instead of throwfalse.
    );

    const inAST = parse('"foo"in bar');
    const inExpr = inAST.program.body[0].expression;

    n.BinaryExpression.assert(inExpr);
    assert.strictEqual(inExpr.operator, "in");

    n.Literal.assert(inExpr.left);
    assert.strictEqual(inExpr.left.value, "foo");

    assert.strictEqual(recast.print(inAST).code, '"foo"in bar');

    inExpr.left = b.identifier("x");
    assert.strictEqual(
      recast.print(inAST).code,
      "x in bar", // Instead of xin bar.
    );
  });

  it("should not add spaces to the beginnings of lines", function () {
    const twoLineCode = [
      "return", // Because of ASI rules, these two lines will
      "xxx", // parse as separate statements.
    ].join(eol);

    const twoLineAST = parse(twoLineCode);

    assert.strictEqual(twoLineAST.program.body.length, 2);
    const xxx = twoLineAST.program.body[1];
    n.ExpressionStatement.assert(xxx);
    n.Identifier.assert(xxx.expression);
    assert.strictEqual(xxx.expression.name, "xxx");

    assert.strictEqual(recast.print(twoLineAST).code, twoLineCode);

    xxx.expression = b.identifier("expression");

    const withExpression = recast.print(twoLineAST).code;
    assert.strictEqual(
      withExpression,
      [
        "return",
        "expression", // The key is that no space should be added to the
        // beginning of this line.
      ].join(eol),
    );

    twoLineAST.program.body[1] = b.expressionStatement(
      b.callExpression(b.identifier("foo"), []),
    );

    const withFooCall = recast.print(twoLineAST).code;
    assert.strictEqual(withFooCall, ["return", "foo()"].join(eol));
  });

  it("should handle function", () => {
    const strAST = parse("type T = number => string;", { parser: flowParser });
    const typeAliasStatement = strAST.program.body[0];
    n.TypeAlias.assert(typeAliasStatement);
    assert.strictEqual(recast.print(strAST).code, "type T = number => string;");

    const functionTypeAnnotation = typeAliasStatement.right;
    n.FunctionTypeAnnotation.assert(functionTypeAnnotation);

    functionTypeAnnotation.params[0].optional = true;
    functionTypeAnnotation.params[0].name = b.identifier("_");
    assert.strictEqual(
      recast.print(strAST, { tabWidth: 2 }).code,
      "type T = (_?: number) => string;",
    );
  });
});

describe("import specifier aliases", function () {
  it("reprints an alias added to an existing specifier", function () {
    const ast = recast.parse('import { load, untouched } from "mod";');
    ast.program.body[0].specifiers[0].local = b.identifier("messages");
    assert.strictEqual(
      recast.print(ast).code,
      'import { load as messages, untouched } from "mod";',
    );
  });

  it("keeps comments and neighboring import formatting", function () {
    const ast = recast.parse(
      'import { /* keep */ foo,   untouched } from "mod";',
    );
    const specifier = ast.program.body[0].specifiers[0];
    specifier.imported = b.identifier("load");
    specifier.local = b.identifier("messages");
    assert.strictEqual(
      recast.print(ast).code,
      'import { /* keep */ load as messages,   untouched } from "mod";',
    );
  });

  ["esprima", "babel", "typescript"].forEach(function (parserName) {
    const parser = require("../parsers/" + parserName);

    [false, true].forEach(function (originalAliased) {
      [false, true].forEach(function (replacementAliased) {
        it(
          parserName +
            " changes alias syntax from " +
            originalAliased +
            " to " +
            replacementAliased,
          function () {
            const source =
              "import { foo" +
              (originalAliased ? " as bar" : "") +
              ', untouched } from "mod";';
            const ast = recast.parse(source, { parser });
            const imported = "load";
            const local = replacementAliased ? "$loadMessages$" : imported;
            ast.program.body[0].specifiers[0] = b.importSpecifier(
              b.identifier(imported),
              b.identifier(local),
            );
            const expected =
              "import { load" +
              (replacementAliased ? " as " + local : "") +
              ', untouched } from "mod";';
            const output = recast.print(ast).code;
            assert.strictEqual(output, expected);
            types.astNodesAreEquivalent.assert(
              recast.parse(output, { parser }).program,
              ast.program,
            );
          },
        );
      });
    });
  });
});

describe("sibling children with shared source ranges", function () {
  ["esprima", "acorn", "babel", "typescript", "flow"].forEach(function (
    parserName,
  ) {
    const parser = require("../parsers/" + parserName);

    function check(
      source: string,
      mutate: (body: any[]) => void,
      expected: string,
    ) {
      const ast = recast.parse(source, { parser });
      mutate(ast.program.body);
      const output = recast.print(ast).code;
      assert.strictEqual(output, expected);
      types.astNodesAreEquivalent.assert(
        recast.parse(output, { parser }).program,
        ast.program,
      );
    }

    it(
      parserName + " renames an unaliased import's local in place",
      function () {
        check(
          'import { foo, x } from "m";',
          (body) => {
            body[0].specifiers[0].local.name = "bar";
          },
          'import { foo as bar, x } from "m";',
        );
      },
    );

    it(parserName + " removes an import alias in place", function () {
      check(
        'import { foo as bar, x } from "m";',
        (body) => {
          body[0].specifiers[0].local.name = "foo";
        },
        'import { foo, x } from "m";',
      );
    });

    it(parserName + " adds an export alias", function () {
      check(
        "var foo, x;\nexport { foo, x };",
        (body) => {
          body[1].specifiers[0].exported = b.identifier("bar");
        },
        "var foo, x;\nexport { foo as bar, x };",
      );
    });

    it(parserName + " renames an unaliased export in place", function () {
      check(
        'export { foo, x } from "m";',
        (body) => {
          body[0].specifiers[0].exported.name = "bar";
        },
        'export { foo as bar, x } from "m";',
      );
    });

    it(parserName + " removes an export alias", function () {
      check(
        "var foo, x;\nexport { foo as bar, x };",
        (body) => {
          body[1].specifiers[0].exported = b.identifier("foo");
        },
        "var foo, x;\nexport { foo, x };",
      );
    });

    it(
      parserName + " renames a shorthand property value in place",
      function () {
        // Leave .shorthand alone (as most codemods do), so the reparsed
        // AST is not equivalent; only the printed code is checked.
        const ast = recast.parse("({ foo, x });", { parser });
        ast.program.body[0].expression.properties[0].value.name = "bar";
        assert.strictEqual(recast.print(ast).code, "({ foo: bar, x });");
      },
    );
  });
});
