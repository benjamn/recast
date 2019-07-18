var assert = require("assert");
var types = require("../lib/types");
var namedTypes = types.namedTypes;
var builders = types.builders;
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var eol = require("os").EOL;

var lines = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 42,",
    "    baz: this",
    "});"
];

describe("types.visit", function() {
    it("replacement", function() {
        var source = lines.join(eol);
        var printer = new Printer;
        var ast = parse(source);
        var withThis = printer.print(ast).code;
        var thisExp = /\bthis\b/g;

        assert.ok(thisExp.test(withThis));

        types.visit(ast, {
            visitThisExpression: function() {
                return builders.identifier("self");
            }
        });

        assert.strictEqual(
            printer.print(ast).code,
            withThis.replace(thisExp, "self")
        );

        var propNames = [];
        var methods = {
            visitObjectProperty: function(path) {
                var key = path.node.key;
                propNames.push(key.value || key.name);
                this.traverse(path);
            }
        };

        types.visit(ast, methods);
        assert.deepEqual(propNames, ["bar", "baz"]);

        types.visit(ast, {
            visitObjectProperty: function(path) {
                if (namedTypes.Identifier.check(path.node.value) &&
                    path.node.value.name === "self") {
                    path.replace();
                    return false;
                }

                this.traverse(path);
            }
        });

        propNames.length = 0;

        types.visit(ast, methods);
        assert.deepEqual(propNames, ["bar"]);
    });

    it("reindent", function() {
        var lines = [
            "a(b(c({",
            "    m: d(function() {",
            "        if (e('y' + 'z'))",
            "            f(42).h()",
            "                 .i()",
            "                 .send();",
            "        g(8);",
            "    })",
            "})));"
        ];

        var altered = [
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
            "})));"
        ];

        var source = lines.join(eol);
        var ast = parse(source);
        var printer = new Printer;

        var funExpr;
        types.visit(ast, {
            visitFunctionExpression: function(path) {
                assert.strictEqual(typeof funExpr, "undefined");
                funExpr = path.node;
                this.traverse(path);
            },

            visitBinaryExpression: function(path) {
                path.node.operator = ">";
                this.traverse(path);
            }
        });

        namedTypes.FunctionExpression.assert(funExpr);

        types.visit(ast, {
            visitCallExpression: function(path) {
                this.traverse(path);
                var expr = path.node;
                if (namedTypes.Identifier.check(expr.callee) &&
                    expr.callee.name === "b") {
                    expr.callee.name = "xxx";
                    expr["arguments"].unshift(funExpr);
                }
            },

            visitObjectExpression: function() {
                return funExpr;
            }
        });

        assert.strictEqual(
            altered.join(eol),
            printer.print(ast).code
        );
    });
});
