"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var esprima = __importStar(require("esprima"));
var parser_1 = require("../lib/parser");
var printer_1 = require("../lib/printer");
var types = __importStar(require("ast-types"));
var os_1 = require("os");
var printer = new printer_1.Printer;
var n = types.namedTypes, b = types.builders, NodePath = types.NodePath;
function parseExpression(expr) {
    var ast = esprima.parse(expr);
    n.Program.assert(ast);
    ast = ast.body[0];
    return n.ExpressionStatement.check(ast) ? ast.expression : ast;
}
function check(expr) {
    var ast = parser_1.parse(expr);
    var reprinted = printer.print(ast).code;
    assert_1.default.strictEqual(reprinted, expr);
    var expressionAst = parseExpression(expr);
    var generic = printer.printGenerically(expressionAst).code;
    types.astNodesAreEquivalent.assert(expressionAst, parseExpression(generic));
}
var operators = [
    "==", "!=", "===", "!==",
    "<", "<=", ">", ">=",
    "<<", ">>", ">>>",
    "+", "-", "*", "/", "%",
    "&",
    "|", "^", "in",
    "instanceof",
    "&&", "||"
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
    it("ReprintedParens", function () {
        var code = "a(function g(){}.call(this));";
        var ast1 = parser_1.parse(code);
        var body = ast1.program.body;
        // Copy the function from a position where it does not need
        // parentheses to a position where it does need parentheses.
        body.push(b.expressionStatement(body[0].expression.arguments[0]));
        var generic = printer.printGenerically(ast1).code;
        var ast2 = parser_1.parse(generic);
        types.astNodesAreEquivalent.assert(ast1, ast2);
        var reprint = printer.print(ast1).code;
        var ast3 = parser_1.parse(reprint);
        types.astNodesAreEquivalent.assert(ast1, ast3);
        body.shift();
        reprint = printer.print(ast1).code;
        var ast4 = parser_1.parse(reprint);
        assert_1.default.strictEqual(ast4.program.body.length, 1);
        var callExp = ast4.program.body[0].expression;
        n.CallExpression.assert(callExp);
        n.MemberExpression.assert(callExp.callee);
        n.FunctionExpression.assert(callExp.callee.object);
        types.astNodesAreEquivalent.assert(ast1, ast4);
        var objCode = "({ foo: 42 }.foo);";
        var objAst = parser_1.parse(objCode);
        var memExp = objAst.program.body[0].expression;
        n.MemberExpression.assert(memExp);
        n.ObjectExpression.assert(memExp.object);
        n.Identifier.assert(memExp.property);
        assert_1.default.strictEqual(memExp.property.name, "foo");
        var blockStmt = b.blockStatement([b.expressionStatement(memExp)]);
        reprint = printer.print(blockStmt).code;
        types.astNodesAreEquivalent.assert(blockStmt, parser_1.parse(reprint).program.body[0]);
    });
    it("don't reparenthesize valid IIFEs", function () {
        var iifeCode = "(function     spaces   () {        }.call()  )  ;";
        var iifeAst = parser_1.parse(iifeCode);
        var iifeReprint = printer.print(iifeAst).code;
        assert_1.default.strictEqual(iifeReprint, iifeCode);
    });
    it("don't reparenthesize valid object literals", function () {
        var objCode = "(  {    foo   :  42}.  foo )  ;";
        var objAst = parser_1.parse(objCode);
        var objReprint = printer.print(objAst).code;
        assert_1.default.strictEqual(objReprint, objCode);
    });
    it("don't parenthesize return statements with sequence expressions", function () {
        var objCode = "function foo() { return 1, 2; }";
        var objAst = parser_1.parse(objCode);
        var objReprint = printer.print(objAst).code;
        assert_1.default.strictEqual(objReprint, objCode);
    });
    it("NegatedLoopCondition", function () {
        var ast = parser_1.parse([
            "for (var i = 0; i < 10; ++i) {",
            "  console.log(i);",
            "}"
        ].join(os_1.EOL));
        var loop = ast.program.body[0];
        var test = loop.test;
        var negation = b.unaryExpression("!", test);
        assert_1.default.strictEqual(printer.print(negation).code, "!(i < 10)");
        loop.test = negation;
        assert_1.default.strictEqual(printer.print(ast).code, [
            "for (var i = 0; !(i < 10); ++i) {",
            "  console.log(i);",
            "}"
        ].join(os_1.EOL));
    });
    it("MisleadingExistingParens", function () {
        var ast = parser_1.parse([
            // The key === "oyez" expression appears to have parentheses
            // already, but those parentheses won't help us when we negate the
            // condition with a !.
            'if (key === "oyez") {',
            "  throw new Error(key);",
            "}"
        ].join(os_1.EOL));
        var ifStmt = ast.program.body[0];
        ifStmt.test = b.unaryExpression("!", ifStmt.test);
        var binaryPath = new NodePath(ast).get("program", "body", 0, "test", "argument");
        assert_1.default.ok(binaryPath.needsParens());
        assert_1.default.strictEqual(printer.print(ifStmt).code, [
            'if (!(key === "oyez")) {',
            "  throw new Error(key);",
            "}"
        ].join(os_1.EOL));
    });
    it("DiscretionaryParens", function () {
        var code = [
            "if (info.line && (i > 0 || !skipFirstLine)) {",
            "  info = copyLineInfo(info);",
            "}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var rightPath = new NodePath(ast).get("program", "body", 0, "test", "right");
        assert_1.default.ok(rightPath.needsParens());
        assert_1.default.strictEqual(printer.print(ast).code, code);
    });
    it("should not be added to multiline boolean expressions", function () {
        var code = [
            "function foo() {",
            "  return !(",
            "    a &&",
            "    b &&",
            "    c",
            "  );",
            "}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code);
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        assert_1.default.strictEqual(printer.print(ast).code, code);
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
        var expr = "(function(){}())";
        check(expr);
        var ast = parser_1.parse(expr);
        var callExpression = ast.program.body[0].expression;
        assert_1.default.strictEqual(callExpression.type, "CallExpression");
        callExpression.callee.type = "ArrowFunctionExpression";
        assert_1.default.strictEqual(printer.print(ast).code, "((() => {})())");
        // Print just the callExpression without its enclosing AST context.
        assert_1.default.strictEqual(printer.print(callExpression).code, "(() => {})()");
        // Trigger pretty-printing of the callExpression to remove the outer
        // layer of parentheses.
        callExpression.original = null;
        assert_1.default.strictEqual(printer.print(ast).code, "(() => {})();");
    });
    it("regression test for issue #366", function () {
        var code = "typeof a ? b : c";
        check(code);
        var ast = parser_1.parse(code);
        var exprStmt = ast.program.body[0];
        var callee = exprStmt.expression;
        exprStmt.expression = b.callExpression(callee, []);
        assert_1.default.strictEqual(printer.print(ast).code, "(typeof a ? b : c)()");
    });
});
