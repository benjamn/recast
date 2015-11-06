var assert = require("assert");
var recast = require("..");
var types = require("../lib/types");
var n = types.namedTypes;
var b = types.builders;
var patcherModule = require("../lib/patcher");
var getReprinter = patcherModule.getReprinter;
var Patcher = patcherModule.Patcher;
var fromString = require("../lib/lines").fromString;
var parse = require("../lib/parser").parse;
var FastPath = require("../lib/fast-path");
var eol = require("os").EOL;

var code = [
    "// file comment",
    "exports.foo({",
    "    // some comment",
    "    bar: 42,",
    "    baz: this",
    "});"
];

function loc(sl, sc, el, ec) {
    return {
        start: { line: sl, column: sc },
        end: { line: el, column: ec }
    };
}

describe("patcher", function() {
    it("Patcher", function() {
        var lines = fromString(code.join(eol)),
            patcher = new Patcher(lines),
            selfLoc = loc(5, 9, 5, 13);

        assert.strictEqual(patcher.get(selfLoc).toString(), "this");

        patcher.replace(selfLoc, "self");

        assert.strictEqual(patcher.get(selfLoc).toString(), "self");

        var got = patcher.get().toString();
        assert.strictEqual(got, code.join(eol).replace("this", "self"));

        // Make sure comments are preserved.
        assert.ok(got.indexOf("// some") >= 0);

        var oyezLoc = loc(2, 12, 6, 1),
            beforeOyez = patcher.get(oyezLoc).toString();
        assert.strictEqual(beforeOyez.indexOf("exports"), -1);
        assert.ok(beforeOyez.indexOf("comment") >= 0);

        patcher.replace(oyezLoc, "oyez");

        assert.strictEqual(patcher.get().toString(), [
            "// file comment",
            "exports.foo(oyez);"
        ].join(eol));

        // "Reset" the patcher.
        patcher = new Patcher(lines);
        patcher.replace(oyezLoc, "oyez");
        patcher.replace(selfLoc, "self");

        assert.strictEqual(patcher.get().toString(), [
            "// file comment",
            "exports.foo(oyez);"
        ].join(eol));
    });

    var trickyCode = [
        "    function",
        "      foo(bar,",
        "  baz) {",
        "        qux();",
        "    }"
    ].join(eol);

    it("GetIndent", function() {
        function check(indent) {
            var lines = fromString(trickyCode).indent(indent);
            var file = parse(lines.toString());
            var reprinter = FastPath.from(file).call(function(bodyPath) {
                return getReprinter(bodyPath);
            }, "program", "body", 0, "body");

            var reprintedLines = reprinter(function(path) {
                assert.ok(false, "should not have called print function");
            });

            assert.strictEqual(reprintedLines.length, 3);
            assert.strictEqual(reprintedLines.getIndentAt(1), 0);
            assert.strictEqual(reprintedLines.getIndentAt(2), 4);
            assert.strictEqual(reprintedLines.getIndentAt(3), 0);
            assert.strictEqual(reprintedLines.toString(), [
                "{",
                "    qux();",
                "}"
            ].join(eol));
        }

        for (var indent = -4; indent <= 4; ++indent) {
            check(indent);
        }
    });

    it("should patch return/throw/etc. arguments correctly", function() {
        var strAST = parse('return"foo"');
        var returnStmt = strAST.program.body[0];
        n.ReturnStatement.assert(returnStmt);
        assert.strictEqual(
            recast.print(strAST).code,
            'return"foo"'
        );

        returnStmt.argument = b.literal(null);
        assert.strictEqual(
            recast.print(strAST).code,
            "return null" // Instead of returnnull.
        );

        var arrAST = parse("throw[1,2,3]");
        var throwStmt = arrAST.program.body[0];
        n.ThrowStatement.assert(throwStmt);
        assert.strictEqual(
            recast.print(arrAST).code,
            "throw[1,2,3]"
        );

        throwStmt.argument = b.literal(false);
        assert.strictEqual(
            recast.print(arrAST).code,
            "throw false" // Instead of throwfalse.
        );

        var inAST = parse('"foo"in bar');
        var inExpr = inAST.program.body[0].expression;

        n.BinaryExpression.assert(inExpr);
        assert.strictEqual(inExpr.operator, "in");

        n.Literal.assert(inExpr.left);
        assert.strictEqual(inExpr.left.value, "foo");

        assert.strictEqual(
            recast.print(inAST).code,
            '"foo"in bar'
        );

        inExpr.left = b.identifier("x");
        assert.strictEqual(
            recast.print(inAST).code,
            "x in bar" // Instead of xin bar.
        );
    });

    it("should not add spaces to the beginnings of lines", function() {
        var twoLineCode = [
            "return",      // Because of ASI rules, these two lines will
            '"use strict"' // parse as separate statements.
        ].join(eol);

        var twoLineAST = parse(twoLineCode);

        assert.strictEqual(twoLineAST.program.body.length, 2);
        var useStrict = twoLineAST.program.body[1];
        n.ExpressionStatement.assert(useStrict);
        n.Literal.assert(useStrict.expression);
        assert.strictEqual(useStrict.expression.value, "use strict");

        assert.strictEqual(
            recast.print(twoLineAST).code,
            twoLineCode
        );

        useStrict.expression = b.identifier("sloppy");

        var withSloppyIdentifier = recast.print(twoLineAST).code;
        assert.strictEqual(withSloppyIdentifier, [
            "return",
            "sloppy" // The key is that no space should be added to the
                     // beginning of this line.
        ].join(eol));

        twoLineAST.program.body[1] = b.expressionStatement(
            b.callExpression(b.identifier("foo"), [])
        );

        var withFooCall = recast.print(twoLineAST).code;
        assert.strictEqual(withFooCall, [
            "return",
            "foo()"
        ].join(eol));
    });
});
