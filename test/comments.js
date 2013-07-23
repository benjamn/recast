var recast = require("../main");
var n = recast.namedTypes;
var b = recast.builders;
var fromString = require("../lib/lines").fromString;
var util = require("../lib/util");

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

var trailing = [
    "Foo.prototype = {",
    "// Copyright (c) 2013 Ben Newman <bn@cs.stanford.edu>",
    "",
    "  /**",
    "   * Leading comment.",
    "   */",
    "  constructor: Foo, // Important for instanceof",
    "                    // to work in all browsers.",
    '  bar: "baz", // Just in case we need it.',
    "  qux: { // Here is an object literal.",
    "    zxcv: 42",
    "    // Put more properties here when you think of them.",
    "  } // There was an object literal...",
    "    // ... and here I am continuing this comment.",
    "};"
];

var trailingExpected = [
    "Foo.prototype = {",
    "  // Copyright (c) 2013 Ben Newman <bn@cs.stanford.edu>",
    "",
    "  /**",
    "   * Leading comment.",
    "   */",
    "  // Important for instanceof",
    "  // to work in all browsers.",
    "  constructor: Foo,",
    "",
    "  // Just in case we need it.",
    '  bar: "baz",',
    "",
    "  // There was an object literal...",
    "  // ... and here I am continuing this comment.",
    "  qux: // Here is an object literal.",
    "  {",
    "    // Put more properties here when you think of them.",
    "    zxcv: 42,",
    "",
    "    asdf: 43",
    "  },",
    "",
    '  extra: "property"',
    "};"
];

exports.testTrailingComments = function(t, assert) {
    var code = trailing.join("\n");
    var ast = recast.parse(code);
    assert.strictEqual(recast.print(ast), code);

    // Drop all original source information to force reprinting.
    require("ast-types").traverse(ast, function(node) {
        node.original = null;
    });

    var assign = ast.program.body[0].expression;
    n.AssignmentExpression.assert(assign);

    var props = assign.right.properties;
    n.Property.arrayOf().assert(props);

    props.push(b.property(
        "init",
        b.identifier("extra"),
        b.literal("property")
    ));

    var quxVal = props[2].value;
    n.ObjectExpression.assert(quxVal);
    quxVal.properties.push(b.property(
        "init",
        b.identifier("asdf"),
        b.literal(43)
    ));

    var actual = recast.print(ast, { tabWidth: 2 });
    var expected = trailingExpected.join("\n");

    // Check semantic equivalence:
    util.assertEquivalent(ast, recast.parse(actual));

    assert.strictEqual(actual, expected);

    t.finish();
};
