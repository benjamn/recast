import assert from "assert";
import * as types from "ast-types";
const namedTypes = types.namedTypes;
const builders = types.builders;
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import { EOL as eol } from "os";

const lines = [
  "// file comment",
  "exports.foo({",
  "    // some comment",
  "    bar: 42,",
  "    baz: this",
  "});",
];

describe("types.visit", function () {
  it("replacement", function () {
    const source = lines.join(eol);
    const printer = new Printer();
    const ast = parse(source);
    const withThis = printer.print(ast).code;
    const thisExp = /\bthis\b/g;

    assert.ok(thisExp.test(withThis));

    types.visit(ast, {
      visitThisExpression: function () {
        return builders.identifier("self");
      },
    });

    assert.strictEqual(
      printer.print(ast).code,
      withThis.replace(thisExp, "self"),
    );

    const propNames: any[] = [];
    const methods: types.Visitor = {
      visitProperty: function (path) {
        const key: any = path.node.key;
        propNames.push(key.value || key.name);
        this.traverse(path);
      },
    };

    types.visit(ast, methods);
    assert.deepEqual(propNames, ["bar", "baz"]);

    types.visit(ast, {
      visitProperty: function (path) {
        if (
          namedTypes.Identifier.check(path.node.value) &&
          path.node.value.name === "self"
        ) {
          path.replace();
          return false;
        }

        this.traverse(path);
        return;
      },
    });

    propNames.length = 0;

    types.visit(ast, methods);
    assert.deepEqual(propNames, ["bar"]);
  });

  it("reindent", function () {
    const lines = [
      "a(b(c({",
      "    m: d(function() {",
      "        if (e('y' + 'z'))",
      "            f(42).h()",
      "                 .i()",
      "                 .send();",
      "        g(8);",
      "    })",
      "})));",
    ];

    const altered = [
      "a(xxx(function() {",
      "    if (e('y' > 'z'))",
      "        f(42).h()",
      "             .i()",
      "             .send();",
      "    g(8);",
      "}, c(function() {",
      "    if (e('y' > 'z'))",
      "        f(42).h()",
      "             .i()",
      "             .send();",
      "    g(8);",
      "})));",
    ];

    const source = lines.join(eol);
    const ast = parse(source);
    const printer = new Printer();

    let funExpr: any;
    types.visit(ast, {
      visitFunctionExpression: function (path) {
        assert.strictEqual(typeof funExpr, "undefined");
        funExpr = path.node;
        this.traverse(path);
      },

      visitBinaryExpression: function (path) {
        path.node.operator = ">";
        this.traverse(path);
      },
    });

    namedTypes.FunctionExpression.assert(funExpr);

    types.visit(ast, {
      visitCallExpression: function (path) {
        this.traverse(path);
        const expr = path.node;
        if (
          namedTypes.Identifier.check(expr.callee) &&
          expr.callee.name === "b"
        ) {
          expr.callee.name = "xxx";
          expr["arguments"].unshift(funExpr);
        }
      },

      visitObjectExpression: function () {
        return funExpr;
      },
    });

    assert.strictEqual(altered.join(eol), printer.print(ast).code);
  });
});
