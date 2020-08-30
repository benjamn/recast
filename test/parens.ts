import assert from "assert";
import * as esprima from "esprima";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import * as types from "ast-types";
import { EOL as eol } from "os";

const printer = new Printer();
const { namedTypes: n, builders: b, NodePath } = types;

function parseExpression(expr: any) {
  let ast: any = esprima.parse(expr);
  n.Program.assert(ast);
  ast = ast.body[0];
  return n.ExpressionStatement.check(ast) ? ast.expression : ast;
}

function check(expr: any) {
  const ast = parse(expr);
  const reprinted = printer.print(ast).code;
  assert.strictEqual(reprinted, expr);

  const expressionAst = parseExpression(expr);
  const generic = printer.printGenerically(expressionAst).code;
  types.astNodesAreEquivalent.assert(expressionAst, parseExpression(generic));
}

const operators = [
  "==",
  "!=",
  "===",
  "!==",
  "<",
  "<=",
  ">",
  ">=",
  "<<",
  ">>",
  ">>>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&", // TODO Missing from the Parser API.
  "|",
  "^",
  "in",
  "instanceof",
  "&&",
  "||",
];

describe("parens", function () {
  it("Arithmetic", function () {
    check("1 - 2");
    check("  2 +2 ");

    operators.forEach(function (op1) {
      operators.forEach(function (op2) {
        check("(a " + op1 + " b) " + op2 + " c");
        check("a " + op1 + " (b " + op2 + " c)");
      });
    });
  });

  it("Unary", function () {
    check("(-a).b");
    check("(+a).b");
    check("(!a).b");
    check("(~a).b");
    check("(typeof a).b");
    check("(void a).b");
    check("(delete a.b).c");
  });

  it("Binary", function () {
    check("(a && b)()");
    check("typeof (a && b)");
    check("(a && b)[c]");
    check("(a && b).c");
  });

  it("Sequence", function () {
    check("(a, b)()");
    check("a(b, (c, d), e)");
    check("!(a, b)");
    check("a + (b, c) + d");
    check("var a = (1, 2), b = a + a;");
    check("(a, { b: 2 }).b");
    check("[a, (b, c), d]");
    check("({ a: (1, 2) }).a");
    check("(a, b) ? (a = 1, b = 2) : (c = 3)");
    check("a = (1, 2)");
  });

  it("NewExpression", function () {
    check("new (a.b())");
    check("new (a.b())(c)");
    check("new a.b(c)");
    check("+new Date");
    check("(new Date).getTime()");
    check("new a");
    check("(new a)(b)");
    check("(new (a.b(c))(d))(e)");
    check("(new Date)['getTime']()");
    check('(new Date)["getTime"]()');
  });

  it("Numbers", function () {
    check("(1).foo");
    check("(-1).foo");
    check("+0");
    check("NaN.foo");
    check("(-Infinity).foo");
  });

  it("Assign", function () {
    check("!(a = false)");
    check("a + (b = 2) + c");
    check("(a = fn)()");
    check("(a = b) ? c : d");
    check("(a = b)[c]");
    check("(a = b).c");
  });

  it("Function", function () {
    check("a(function (){}.bind(this))");
    check("(function (){}).apply(this, arguments)");
    check("function f() { (function (){}).call(this) }");
    check("while (true) { (function (){}).call(this) }");
    check("() => ({a:1,b:2})");
    check("(x, y={z:1}) => x + y.z");
    check("a || ((x, y={z:1}) => x + y.z)");
  });

  it("ObjectLiteral", function () {
    check("a({b:c(d)}.b)");
    check("({a:b(c)}).a");
  });

  it("ArrowFunctionExpression", () => {
    check("(() => {})()");
    check("test(() => {})");

    check("(() => {}).test");
    check("test[() => {}]");

    check("(() => {}) + (() => {})");
  });

  it("AwaitExpression", function () {
    check("async () => (await a) && (await b)");
    check("async () => +(await a)");
    check("async () => (await f)()");
    check("async () => new (await C)");
    check("async () => [...(await obj)]");
    check("async () => (await a) ? b : c");
    check("async () => (await a).b");
  });

  it("YieldExpression", function () {
    check("function* test () { return (yield a) && (yield b) }");
    check("function* test () { return +(yield a) }");
    check("function* test () { return (yield f)() }");
    check("function* test () { return new (yield C) }");
    check("function* test () { return [...(yield obj)] }");
    check("function* test () { return (yield a) ? b : c }");
    check("function* test () { return (yield a).b }");
    check("function* test () { yield yield foo }");
  });

  it("ArrowFunctionExpression", () => {
    check("(() => {})()");
    check("test(() => {})");

    check("(() => {}).test");
    check("test[() => {}]");

    check("(() => {}) + (() => {})");
  });

  it("ReprintedParens", function () {
    const code = "a(function g(){}.call(this));";
    const ast1 = parse(code);
    const body = ast1.program.body;

    // Copy the function from a position where it does not need
    // parentheses to a position where it does need parentheses.
    body.push(b.expressionStatement(body[0].expression.arguments[0]));

    const generic = printer.printGenerically(ast1).code;
    const ast2 = parse(generic);
    types.astNodesAreEquivalent.assert(ast1, ast2);

    let reprint = printer.print(ast1).code;
    const ast3 = parse(reprint);
    types.astNodesAreEquivalent.assert(ast1, ast3);

    body.shift();
    reprint = printer.print(ast1).code;
    const ast4 = parse(reprint);
    assert.strictEqual(ast4.program.body.length, 1);
    const callExp = ast4.program.body[0].expression;
    n.CallExpression.assert(callExp);
    n.MemberExpression.assert(callExp.callee);
    n.FunctionExpression.assert(callExp.callee.object);
    types.astNodesAreEquivalent.assert(ast1, ast4);

    const objCode = "({ foo: 42 }.foo);";
    const objAst = parse(objCode);
    const memExp = objAst.program.body[0].expression;
    n.MemberExpression.assert(memExp);
    n.ObjectExpression.assert(memExp.object);
    n.Identifier.assert(memExp.property);
    assert.strictEqual(memExp.property.name, "foo");
    const blockStmt = b.blockStatement([b.expressionStatement(memExp)]);
    reprint = printer.print(blockStmt).code;
    types.astNodesAreEquivalent.assert(
      blockStmt,
      parse(reprint).program.body[0],
    );
  });

  it("don't reparenthesize valid IIFEs", function () {
    const iifeCode = "(function     spaces   () {        }.call()  )  ;";
    const iifeAst = parse(iifeCode);
    const iifeReprint = printer.print(iifeAst).code;
    assert.strictEqual(iifeReprint, iifeCode);
  });

  it("don't reparenthesize valid object literals", function () {
    const objCode = "(  {    foo   :  42}.  foo )  ;";
    const objAst = parse(objCode);
    const objReprint = printer.print(objAst).code;
    assert.strictEqual(objReprint, objCode);
  });

  it("don't parenthesize return statements with sequence expressions", function () {
    const objCode = "function foo() { return 1, 2; }";
    const objAst = parse(objCode);
    const objReprint = printer.print(objAst).code;
    assert.strictEqual(objReprint, objCode);
  });

  it("NegatedLoopCondition", function () {
    const ast = parse(
      ["for (var i = 0; i < 10; ++i) {", "  console.log(i);", "}"].join(eol),
    );

    const loop = ast.program.body[0];
    const test = loop.test;
    const negation = b.unaryExpression("!", test);

    assert.strictEqual(printer.print(negation).code, "!(i < 10)");

    loop.test = negation;

    assert.strictEqual(
      printer.print(ast).code,
      ["for (var i = 0; !(i < 10); ++i) {", "  console.log(i);", "}"].join(eol),
    );
  });

  it("MisleadingExistingParens", function () {
    const ast = parse(
      [
        // The key === "oyez" expression appears to have parentheses
        // already, but those parentheses won't help us when we negate the
        // condition with a !.
        'if (key === "oyez") {',
        "  throw new Error(key);",
        "}",
      ].join(eol),
    );

    const ifStmt = ast.program.body[0];
    ifStmt.test = b.unaryExpression("!", ifStmt.test);

    const binaryPath = new NodePath(ast).get(
      "program",
      "body",
      0,
      "test",
      "argument",
    );

    assert.ok(binaryPath.needsParens());

    assert.strictEqual(
      printer.print(ifStmt).code,
      ['if (!(key === "oyez")) {', "  throw new Error(key);", "}"].join(eol),
    );
  });

  it("DiscretionaryParens", function () {
    const code = [
      "if (info.line && (i > 0 || !skipFirstLine)) {",
      "  info = copyLineInfo(info);",
      "}",
    ].join(eol);

    const ast = parse(code);

    const rightPath = new NodePath(ast).get(
      "program",
      "body",
      0,
      "test",
      "right",
    );

    assert.ok(rightPath.needsParens());
    assert.strictEqual(printer.print(ast).code, code);
  });

  it("should not be added to multiline boolean expressions", function () {
    const code = [
      "function foo() {",
      "  return !(",
      "    a &&",
      "    b &&",
      "    c",
      "  );",
      "}",
    ].join(eol);

    const ast = parse(code);
    const printer = new Printer({
      tabWidth: 2,
    });

    assert.strictEqual(printer.print(ast).code, code);
  });

  it("should be added to callees that are function expressions", function () {
    check("(()=>{})()");
    check("(function (){})()");
  });

  it("issues #504 and #512", function () {
    check("() => ({})['foo']");
    check("() => ({ foo: 123 }[foo] + 2) * 3");
    check("() => ({ foo: 123 }['foo'] + 1 - 2 - 10)");
    check("() => (function () { return 123 })()");
    check("() => (function () { return 456 }())");
  });

  it("should be added to bound arrow function expressions", function () {
    check("(()=>{}).bind(x)");
  });

  it("should be added to object destructuring assignment expressions", function () {
    check("({x}={x:1})");
    // Issue #533
    check("({ foo } = bar)");
  });

  it("regression test for issue #327", function () {
    const expr = "(function(){}())";
    check(expr);

    const ast = parse(expr);
    const callExpression = ast.program.body[0].expression;
    assert.strictEqual(callExpression.type, "CallExpression");
    callExpression.callee.type = "ArrowFunctionExpression";
    assert.strictEqual(printer.print(ast).code, "((() => {})())");
    // Print just the callExpression without its enclosing AST context.
    assert.strictEqual(printer.print(callExpression).code, "(() => {})()");
    // Trigger pretty-printing of the callExpression to remove the outer
    // layer of parentheses.
    callExpression.original = null;
    assert.strictEqual(printer.print(ast).code, "(() => {})();");
  });

  it("regression test for issue #366", function () {
    const code = "typeof a ? b : c";
    check(code);

    const ast = parse(code);
    const exprStmt = ast.program.body[0];
    const callee = exprStmt.expression;
    exprStmt.expression = b.callExpression(callee, []);

    assert.strictEqual(printer.print(ast).code, "(typeof a ? b : c)()");
  });
});
