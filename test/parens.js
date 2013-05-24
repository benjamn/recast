var assert = require("assert");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var util = require("../lib/util");
var n = require("../lib/types").namedTypes;
var printer = new Printer;

function parseExpression(expr) {
    var ast = parse(expr);
    n.File.assert(ast);
    ast = ast.program.body[0];
    if (n.ExpressionStatement.check(ast))
        return ast.expression;
    return ast;
}

function check(expr) {
    var ast1 = parseExpression(expr);
    var printed = printer.printGenerically(ast1).toString();
    try {
        var ast2 = parseExpression(printed);
    } finally {
        assert.ok(
            util.deepEquivalent(ast1, ast2),
            expr + " printed incorrectly as " + printed
        );
    }
}

var operators = [
    "==", "!=", "===", "!==",
    "<", "<=", ">", ">=",
    "<<", ">>", ">>>",
    "+", "-", "*", "/", "%",
    "&", // TODO Missing from the Parser API.
    "|", "^", "in",
    "instanceof",
    "&&", "||"
];

exports.testArithmetic = function(t) {
    check("1 - 2");
    check("  2 +2 ");

    operators.forEach(function(op1) {
        operators.forEach(function(op2) {
            check("(a " + op1 + " b) " + op2 + " c");
            check("a " + op1 + " (b " + op2 + " c)");
        });
    });

    t.finish();
};

exports.testUnary = function(t) {
    check("(-a).b");
    check("(+a).b");
    check("(!a).b");
    check("(~a).b");
    check("(typeof a).b");
    check("(void a).b");
    check("(delete a.b).c");

    t.finish();
};

exports.testBinary = function(t) {
    check("(a && b)()");
    check("typeof (a && b)");
    check("(a && b)[c]");
    check("(a && b).c");

    t.finish();
};

exports.testSequence = function(t) {
    check("(a, b)()");
    check("a(b, (c, d), e)");
    check("!(a, b)");
    check("a + (b, c) + d");
    check("var a = (1, 2), b = a + a;");
    check("(a, { b: 2 }).b");
    check("[a, (b, c), d]");
    check("({ a: (1, 2) }).a");
    check("(a, b) ? (a = 1, b = 2) : (c = 3)");

    t.finish();
};

exports.testNewExpression = function(t) {
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

    t.finish();
};

exports.testNumbers = function(t) {
    check("(1).foo");
    check("(-1).foo");
    check("+0");
    check("NaN.foo");
    check("(-Infinity).foo");

    t.finish();
};

exports.testAssign = function(t) {
    check("!(a = false)");
    check("a + (b = 2) + c");
    check("(a = fn)()");
    check("(a = b) ? c : d");
    check("(a = b)[c]");
    check("(a = b).c");

    t.finish();
};

exports.testFunction = function(t) {
    check("a(function(){}.bind(this))");
    check("(function(){}).call(this)");

    t.finish();
};

exports.testObjectLiteral = function(t) {
    check("a({b:c(d)}.b)");
    check("({a:b(c)}).a");

    t.finish();
};
