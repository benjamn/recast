import assert from "assert";
import fs from "fs";
import path from "path";
import { parse } from "../lib/parser";
import * as util from "../lib/util";
import { getReprinter } from "../lib/patcher";
import { Printer } from "../lib/printer";
import { fromString } from "../lib/lines";
import * as types from "ast-types";
const namedTypes = types.namedTypes;
import FastPath from "../lib/fast-path";
import { EOL as eol } from "os";
const nodeMajorVersion = parseInt(process.versions.node, 10);

// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.

describe("parser", function () {
  [
    "../parsers/acorn",
    "../parsers/babel",
    "../parsers/esprima",
    "../parsers/flow",
    "../parsers/typescript",
  ].forEach(runTestsForParser);

  it("AlternateParser", function () {
    const b = types.builders;
    const parser = {
      parse: function () {
        const program = b.program([
          b.expressionStatement(b.identifier("surprise")),
        ]);
        program.comments = [];
        return program;
      },
    };

    function check(options?: any) {
      const ast = parse("ignored", options);
      const printer = new Printer();

      types.namedTypes.File.assert(ast, true);
      assert.strictEqual(printer.printGenerically(ast).code, "surprise;");
    }

    check({ esprima: parser });
    check({ parser: parser });
  });
});

function runTestsForParser(parserId: string) {
  const parserName = parserId.split("/").pop();

  if (
    nodeMajorVersion < 6 &&
    (parserName === "babel" ||
      parserName === "flow" ||
      parserName === "typescript")
  ) {
    // Babel 7 no longer supports Node 4 or 5.
    return;
  }

  if (!parserName) {
    return;
  }

  const parser = require(parserId);

  it("[" + parserName + "] empty source", function () {
    const printer = new Printer();

    function check(code: string) {
      const ast = parse(code, { parser });
      assert.strictEqual(printer.print(ast).code, code);
    }

    check("");
    check("/* block comment */");
    check("// line comment");
    check("\t\t\t");
    check(eol);
    check(eol + eol);
    check("    ");
  });

  const lineCommentTypes: { [name: string]: string } = {
    acorn: "Line",
    babel: "CommentLine",
    esprima: "Line",
    flow: "CommentLine",
    typescript: "CommentLine",
  };

  it("[" + parserName + "] parser basics", function testParser(done) {
    const code = testParser + "";
    const ast = parse(code, { parser });

    namedTypes.File.assert(ast);
    assert.ok(getReprinter(FastPath.from(ast)));

    const funDecl = ast.program.body[0];
    const funBody = funDecl.body;

    namedTypes.FunctionDeclaration.assert(funDecl);
    namedTypes.BlockStatement.assert(funBody);
    assert.ok(getReprinter(FastPath.from(funBody)));

    const lastStatement = funBody.body.pop();
    const doneCall = lastStatement.expression;

    assert.ok(!getReprinter(FastPath.from(funBody)));
    assert.ok(getReprinter(FastPath.from(ast)));

    funBody.body.push(lastStatement);
    assert.ok(getReprinter(FastPath.from(funBody)));

    assert.strictEqual(doneCall.callee.name, "done");

    assert.strictEqual(lastStatement.comments.length, 2);

    const firstComment = lastStatement.comments[0];

    assert.strictEqual(firstComment.type, lineCommentTypes[parserName]);

    assert.strictEqual(firstComment.leading, true);
    assert.strictEqual(firstComment.trailing, false);
    assert.strictEqual(
      firstComment.value,
      " Make sure done() remains the final statement in this function,",
    );

    const secondComment = lastStatement.comments[1];

    assert.strictEqual(secondComment.type, lineCommentTypes[parserName]);

    assert.strictEqual(secondComment.leading, true);
    assert.strictEqual(secondComment.trailing, false);
    assert.strictEqual(
      secondComment.value,
      " or the above assertions will probably fail.",
    );

    // Make sure done() remains the final statement in this function,
    // or the above assertions will probably fail.
    done();
  });

  it("[" + parserName + "] LocationFixer", function () {
    const code = ["function foo() {", "    a()", "    b()", "}"].join(eol);
    const ast = parse(code, { parser });
    const printer = new Printer();

    types.visit(ast, {
      visitFunctionDeclaration: function (path) {
        if (namedTypes.BlockStatement.check(path.node.body)) {
          path.node.body.body.reverse();
        }
        this.traverse(path);
      },
    });

    const altered = code
      .replace("a()", "xxx")
      .replace("b()", "a()")
      .replace("xxx", "b()");

    assert.strictEqual(altered, printer.print(ast).code);
  });

  it("[" + parserName + "] TabHandling", function () {
    function check(code: string, tabWidth: number) {
      const lines = fromString(code, { tabWidth: tabWidth });
      assert.strictEqual(lines.length, 1);

      function checkId(s: any, loc: types.namedTypes.SourceLocation) {
        const sliced = lines.slice(loc.start, loc.end);
        assert.strictEqual(s + "", sliced.toString());
      }

      types.visit(
        parse(code, {
          tabWidth: tabWidth,
          parser,
        }),
        {
          visitIdentifier(path) {
            const ident = path.node;
            checkId(ident.name, ident.loc!);
            this.traverse(path);
          },

          visitLiteral(path) {
            const lit = path.node;
            checkId(lit.value, lit.loc!);
            this.traverse(path);
          },
        },
      );
    }

    for (let tabWidth = 1; tabWidth <= 8; ++tabWidth) {
      check("\t\ti = 10;", tabWidth);
      check("\t\ti \t= 10;", tabWidth);
      check("\t\ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;\t", tabWidth);
      check("\t \ti \t=\t 10;\t ", tabWidth);
    }
  });

  it("[" + parserName + "] Only comment followed by space", function () {
    const printer = new Printer();

    function check(code: string) {
      const ast = parse(code, { parser });
      assert.strictEqual(printer.print(ast).code, code);
    }

    check("// comment");
    check("// comment ");
    check("// comment\n");
    check("// comment\n\n");
    check(" // comment\n");
    check(" // comment\n ");
    check(" // comment \n ");

    check("/* comment */");
    check("/* comment */ ");
    check(" /* comment */");
    check("\n/* comment */");
    check("\n/* comment */\n");
    check("\n /* comment */\n ");
    check("/* comment */\n ");
    check("/* com\n\nment */");
    check("/* com\n\nment */ ");
    check(" /* com\n\nment */ ");
  });
}

// The token indices recast records on every node.loc are computed incrementally
// (see TreeCopier.findTokenRange), so they are only as good as the invariant
// they are supposed to maintain: loc.tokens.slice(loc.start.token,
// loc.end.token) must be exactly the tokens the node's loc covers.
//
// Tokens are sorted and don't overlap, so the tokens a loc covers are always a
// contiguous run, and checking the two tokens just inside the claimed range and
// the two just outside it is equivalent to comparing the whole run -- but costs
// O(1) per node instead of a scan over every token.
describe("token ranges", function () {
  function checkTokenRanges(source: string) {
    const ast = parse(source, { parser: require("../parsers/babel") });
    const tokens = ast.tokens;
    const seen = new Set();

    (function walk(node: any, where: string) {
      if (typeof node !== "object" || node === null || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${where}[${i}]`));
        return;
      }

      const loc = node.loc;
      if (loc && loc.start && typeof loc.start.token === "number") {
        const first = loc.start.token;
        const bound = loc.end.token;

        const covers = (i: number) =>
          util.comparePos(loc.start, tokens[i].loc.start) <= 0 &&
          util.comparePos(tokens[i].loc.end, loc.end) <= 0;

        const check = (i: number, expected: boolean) =>
          assert.strictEqual(
            covers(i),
            expected,
            `${node.type} at ${where} claims tokens [${first},${bound}) but ` +
              `${expected ? "excludes covered" : "includes uncovered"} ` +
              `token ${i} (${JSON.stringify(tokens[i].value)})`,
          );

        // Nothing outside the range may be covered...
        if (first > 0) check(first - 1, false);
        if (bound < tokens.length) check(bound, false);
        // ...and everything inside it must be.
        if (bound > first) {
          check(first, true);
          check(bound - 1, true);
        }
      }

      Object.keys(node).forEach(function (key) {
        if (key !== "loc" && key !== "tokens" && key !== "original") {
          walk(node[key], `${where}.${key}`);
        }
      });
    })(ast, "");
  }

  it("cover exactly the tokens inside each node", function () {
    checkTokenRanges(
      fs.readFileSync(path.join(__dirname, "data", "backbone.js"), "utf8"),
    );
  });

  it("include a node's final token", function () {
    // A node whose last token ends exactly where the node ends used to be
    // dropped from its own range, so a trailing comment ended up claiming no
    // tokens at all (#1399).
    checkTokenRanges("var x = 1; // c\n");
    checkTokenRanges("if (x) {\n  y(); // c\n}\n");
    checkTokenRanges("`before${x}middle${y}after`;\n");
  });
});
