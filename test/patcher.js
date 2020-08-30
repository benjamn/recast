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
var recast = __importStar(require("../main"));
var types = __importStar(require("ast-types"));
var n = types.namedTypes;
var b = types.builders;
var patcher_1 = require("../lib/patcher");
var lines_1 = require("../lib/lines");
var parser_1 = require("../lib/parser");
var flowParser = __importStar(require("../parsers/flow"));
var fast_path_1 = __importDefault(require("../lib/fast-path"));
var os_1 = require("os");
var code = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 42,",
    "    baz: this",
    "});",
];
function loc(sl, sc, el, ec) {
    return {
        start: { line: sl, column: sc },
        end: { line: el, column: ec },
    };
}
describe("patcher", function () {
    it("Patcher", function () {
        var lines = lines_1.fromString(code.join(os_1.EOL)), patcher = new patcher_1.Patcher(lines), selfLoc = loc(5, 9, 5, 13);
        assert_1.default.strictEqual(patcher.get(selfLoc).toString(), "this");
        patcher.replace(selfLoc, "self");
        assert_1.default.strictEqual(patcher.get(selfLoc).toString(), "self");
        var got = patcher.get().toString();
        assert_1.default.strictEqual(got, code.join(os_1.EOL).replace("this", "self"));
        // Make sure comments are preserved.
        assert_1.default.ok(got.indexOf("// some") >= 0);
        var oyezLoc = loc(2, 12, 6, 1), beforeOyez = patcher.get(oyezLoc).toString();
        assert_1.default.strictEqual(beforeOyez.indexOf("exports"), -1);
        assert_1.default.ok(beforeOyez.indexOf("comment") >= 0);
        patcher.replace(oyezLoc, "oyez");
        assert_1.default.strictEqual(patcher.get().toString(), ["// file comment", "exports.foo(oyez);"].join(os_1.EOL));
        // "Reset" the patcher.
        patcher = new patcher_1.Patcher(lines);
        patcher.replace(oyezLoc, "oyez");
        patcher.replace(selfLoc, "self");
        assert_1.default.strictEqual(patcher.get().toString(), ["// file comment", "exports.foo(oyez);"].join(os_1.EOL));
    });
    var trickyCode = [
        "    function",
        "      foo(bar,",
        "  baz) {",
        "        qux();",
        "    }",
    ].join(os_1.EOL);
    it("GetIndent", function () {
        function check(indent) {
            var lines = lines_1.fromString(trickyCode).indent(indent);
            var file = parser_1.parse(lines.toString());
            var reprinter = fast_path_1.default.from(file).call(function (bodyPath) { return patcher_1.getReprinter(bodyPath); }, "program", "body", 0, "body");
            var reprintedLines = reprinter(function () {
                assert_1.default.ok(false, "should not have called print function");
            });
            assert_1.default.strictEqual(reprintedLines.length, 3);
            assert_1.default.strictEqual(reprintedLines.getIndentAt(1), 0);
            assert_1.default.strictEqual(reprintedLines.getIndentAt(2), 4);
            assert_1.default.strictEqual(reprintedLines.getIndentAt(3), 0);
            assert_1.default.strictEqual(reprintedLines.toString(), ["{", "    qux();", "}"].join(os_1.EOL));
        }
        for (var indent = -4; indent <= 4; ++indent) {
            check(indent);
        }
    });
    it("should patch return/throw/etc. arguments correctly", function () {
        var strAST = parser_1.parse('return"foo"');
        var returnStmt = strAST.program.body[0];
        n.ReturnStatement.assert(returnStmt);
        assert_1.default.strictEqual(recast.print(strAST).code, 'return"foo"');
        returnStmt.argument = b.literal(null);
        assert_1.default.strictEqual(recast.print(strAST).code, "return null;");
        var arrAST = parser_1.parse("throw[1,2,3]");
        var throwStmt = arrAST.program.body[0];
        n.ThrowStatement.assert(throwStmt);
        assert_1.default.strictEqual(recast.print(arrAST).code, "throw[1,2,3]");
        throwStmt.argument = b.literal(false);
        assert_1.default.strictEqual(recast.print(arrAST).code, "throw false");
        var inAST = parser_1.parse('"foo"in bar');
        var inExpr = inAST.program.body[0].expression;
        n.BinaryExpression.assert(inExpr);
        assert_1.default.strictEqual(inExpr.operator, "in");
        n.Literal.assert(inExpr.left);
        assert_1.default.strictEqual(inExpr.left.value, "foo");
        assert_1.default.strictEqual(recast.print(inAST).code, '"foo"in bar');
        inExpr.left = b.identifier("x");
        assert_1.default.strictEqual(recast.print(inAST).code, "x in bar");
    });
    it("should not add spaces to the beginnings of lines", function () {
        var twoLineCode = [
            "return",
            "xxx",
        ].join(os_1.EOL);
        var twoLineAST = parser_1.parse(twoLineCode);
        assert_1.default.strictEqual(twoLineAST.program.body.length, 2);
        var xxx = twoLineAST.program.body[1];
        n.ExpressionStatement.assert(xxx);
        n.Identifier.assert(xxx.expression);
        assert_1.default.strictEqual(xxx.expression.name, "xxx");
        assert_1.default.strictEqual(recast.print(twoLineAST).code, twoLineCode);
        xxx.expression = b.identifier("expression");
        var withExpression = recast.print(twoLineAST).code;
        assert_1.default.strictEqual(withExpression, [
            "return",
            "expression",
        ].join(os_1.EOL));
        twoLineAST.program.body[1] = b.expressionStatement(b.callExpression(b.identifier("foo"), []));
        var withFooCall = recast.print(twoLineAST).code;
        assert_1.default.strictEqual(withFooCall, ["return", "foo()"].join(os_1.EOL));
    });
    it("should handle function", function () {
        var strAST = parser_1.parse("type T = number => string;", { parser: flowParser });
        var typeAliasStatement = strAST.program.body[0];
        n.TypeAlias.assert(typeAliasStatement);
        assert_1.default.strictEqual(recast.print(strAST).code, "type T = number => string;");
        var functionTypeAnnotation = typeAliasStatement.right;
        n.FunctionTypeAnnotation.assert(functionTypeAnnotation);
        functionTypeAnnotation.params[0].optional = true;
        functionTypeAnnotation.params[0].name = b.identifier("_");
        assert_1.default.strictEqual(recast.print(strAST, { tabWidth: 2 }).code, "type T = (_?: number) => string;");
    });
});
