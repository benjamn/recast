var recast = require("../main");
var n = recast.namedTypes;
var fromString = require("../lib/lines").fromString;

var annotated = [
    "function dup(/* string */ s,",
    "             /* int */ n) /* string */",
    "{",
    "  // Use an array full of holes.",
    "  return Array(n + /*",
    "                    * off-by-*/ 1).join(s);",
    "}"
];

exports.testComments = function(t, assert) {
    var code = annotated.join("\n");
    var ast = recast.parse(code);

    var dup = ast.program.body[0];
    n.FunctionDeclaration.assert(dup);
    assert.strictEqual(dup.id.name, "dup");

    // More of a basic sanity test than a comment test.
    assert.strictEqual(recast.print(ast), code);
    assert.strictEqual(recast.print(ast.program), code);
    assert.strictEqual(recast.print(dup), code);

    assert.strictEqual(
        recast.print(dup.params[0]),
        "/* string */ s"
    );

    assert.strictEqual(
        recast.print(dup.params[1]),
        "/* int */ n"
    );

    assert.strictEqual(
        recast.print(dup.body),
        ["/* string */"].concat(annotated.slice(2)).join("\n")
    );

    var retStmt = dup.body.body[0];
    n.ReturnStatement.assert(retStmt);

    var indented = annotated.slice(3, 6).join("\n");
    var flush = fromString(indented).indent(-2);

    assert.strictEqual(
        recast.print(retStmt),
        flush.toString()
    );

    var join = retStmt.argument;
    n.CallExpression.assert(join);

    var one = join.callee.object.arguments[0].right;
    n.Literal.assert(one);
    assert.strictEqual(one.value, 1);
    assert.strictEqual(recast.print(one), [
        "/*",
        " * off-by-*/ 1"
    ].join("\n"));

    t.finish();
};
