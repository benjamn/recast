var Visitor = require("../lib/visitor").Visitor;
var types = require("../lib/types");
var namedTypes = types.namedTypes;
var builders = types.builders;
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;

var lines = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 41 + 1,",
    "    baz: this",
    "});"
];

exports.testVisitor = function(t, assert) {
    var source = lines.join("\n"),
        printer = new Printer,
        ast = parse(source),
        withThis = printer.print(ast).code,
        thisExp = /\bthis\b/g;

    var ec = new ExprChecker;
    ec.visit(ast);
    assert.deepEqual(ec.exprTypes, ['CallExpression', 'MemberExpression', 'ObjectExpression', 'BinaryExpression', 'ThisExpression']);

    assert.ok(thisExp.test(withThis));

    new ThisReplacer().visit(ast);

    assert.strictEqual(
        printer.print(ast).code,
        withThis.replace(thisExp, "self"));

    var bc = new BazChecker;

    bc.visit(ast);

    assert.deepEqual(bc.propNames, ["bar", "baz"]);

    new BazRemover().visit(ast);

    bc.clear();
    bc.visit(ast);

    assert.deepEqual(bc.propNames, ["bar"]);

    t.finish();
};

var ThisReplacer = Visitor.extend({
    visitThisExpression: function(expr) {
        return builders.identifier("self");
    }
});

var BazChecker = Visitor.extend({
    init: function() {
        this.propNames = [];
    },

    clear: function() {
        this.propNames.length = 0;
    },

    visitProperty: function(prop) {
        var key = prop.key;
        this.propNames.push(key.value || key.name);
    }
});

var BazRemover = Visitor.extend({
    visitIdentifier: function(id) {
        if (id.name === "self")
            this.remove();
    }
});

var ExprChecker = Visitor.extend({
    init: function() {
        this.exprTypes = [];
    },

    clear: function() {
        this.exprTypes.length = 0;
    },

    visitExpression: function(expr) {
        this.exprTypes.push(expr.type);
        this.genericVisit(expr);
    }
});

exports.testReindent = function(t, assert) {
    var lines = [
        "a(b(c({",
        "    m: d(function() {",
        "        if (e('y' + 'z'))",
        "            f(42).h()",
        "                 .i()",
        "                 .send();",
        "        g(8);",
        "    })",
        "})));"],

        altered = [
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
        "})));"],

        source = lines.join("\n"),
        ast = parse(source),
        printer = new Printer;

    var ff = new FunctionFinder;
    ff.visit(ast);

    new ObjectReplacer(ff.funExpr).visit(ast);

    assert.strictEqual(
        altered.join("\n"),
        printer.print(ast).code);

    t.finish();
};

var FunctionFinder = Visitor.extend({
    visitFunctionExpression: function(expr) {
        this.funExpr = expr;
        this.genericVisit(expr);
    },

    visitBinaryExpression: function(expr) {
        expr.operator = ">";
    }
});

var ObjectReplacer = Visitor.extend({
    init: function(replacement) {
        this.replacement = replacement;
    },

    visitCallExpression: function(expr) {
        this.genericVisit(expr);

        if (namedTypes.Identifier.check(expr.callee) &&
            expr.callee.name === "b")
        {
            expr.callee.name = "xxx";
            expr["arguments"].unshift(this.replacement);
        }
    },

    visitObjectExpression: function(expr) {
        return this.replacement;
    }
});
