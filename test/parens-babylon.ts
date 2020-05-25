import assert from "assert";
import * as babylon from "@babel/parser";
import { parse as recastParse } from "../lib/parser";
import { Printer } from "../lib/printer";
import * as types from "ast-types";

const printer = new Printer();
const { namedTypes: n } = types;

function parseExpression(expr: any) {
  const ast: any = babylon.parseExpression(expr);
  return n.ExpressionStatement.check(ast) ? ast.expression : ast;
}

const parse = (expr: string) =>
  recastParse(expr, {
    parser: babylon,
  });

function check(expr: string) {
  const ast = parse(expr);

  const reprinted = printer.print(ast).code;
  assert.strictEqual(reprinted, expr);

  const expressionAst = parseExpression(expr);
  const generic = printer.printGenerically(expressionAst).code;
  types.astNodesAreEquivalent.assert(expressionAst, parseExpression(generic));
}

describe("babylon parens", function () {
  it("AwaitExpression", function () {
    check("async () => ({...(await obj)})");
    check("(async function* () { yield await foo })");
  });

  it("YieldExpression", function () {
    check("(function* () { return {...(yield obj)}})");
  });

  it("decorative parens", function () {
    const ast = parse("1");
    const expr = ast.program.body[0].expression;

    expr.extra.parenthesized = true;

    assert.strictEqual(printer.print(ast).code, "(1)");
  });

  it("decorative parens which are also necessary", function () {
    const ast = parse("(1).foo");
    const expr = ast.program.body[0].expression;

    expr.object.extra.parenthesized = false;

    assert.strictEqual(printer.print(ast).code, "(1).foo");
  });
});
