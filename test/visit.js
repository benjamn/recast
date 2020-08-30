"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var types = __importStar(require("ast-types"));
var namedTypes = types.namedTypes;
var builders = types.builders;
var parser_1 = require("../lib/parser");
var printer_1 = require("../lib/printer");
var os_1 = require("os");
var lines = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 42,",
    "    baz: this",
    "});",
];
describe("types.visit", function () {
    it("replacement", function () {
        var source = lines.join(os_1.EOL);
        var printer = new printer_1.Printer();
        var ast = parser_1.parse(source);
        var withThis = printer.print(ast).code;
        var thisExp = /\bthis\b/g;
        assert_1.default.ok(thisExp.test(withThis));
        types.visit(ast, {
            visitThisExpression: function () {
                return builders.identifier("self");
            },
        });
        assert_1.default.strictEqual(printer.print(ast).code, withThis.replace(thisExp, "self"));
        var propNames = [];
        var methods = {
            visitProperty: function (path) {
                var key = path.node.key;
                propNames.push(key.value || key.name);
                this.traverse(path);
            },
        };
        types.visit(ast, methods);
        assert_1.default.deepEqual(propNames, ["bar", "baz"]);
        types.visit(ast, {
            visitProperty: function (path) {
                if (namedTypes.Identifier.check(path.node.value) &&
                    path.node.value.name === "self") {
                    path.replace();
                    return false;
                }
                this.traverse(path);
                return;
            },
        });
        propNames.length = 0;
        types.visit(ast, methods);
        assert_1.default.deepEqual(propNames, ["bar"]);
    });
    it("reindent", function () {
        var lines = [
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
            "})));",
        ];
        var source = lines.join(os_1.EOL);
        var ast = parser_1.parse(source);
        var printer = new printer_1.Printer();
        var funExpr;
        types.visit(ast, {
            visitFunctionExpression: function (path) {
                assert_1.default.strictEqual(typeof funExpr, "undefined");
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
                var expr = path.node;
                if (namedTypes.Identifier.check(expr.callee) &&
                    expr.callee.name === "b") {
                    expr.callee.name = "xxx";
                    expr["arguments"].unshift(funExpr);
                }
            },
            visitObjectExpression: function () {
                return funExpr;
            },
        });
        assert_1.default.strictEqual(altered.join(os_1.EOL), printer.print(ast).code);
    });
});
