var recast = require("../main");
var n = recast.types.namedTypes;
var b = recast.types.builders;
var Printer = require("../lib/printer").Printer;
var fromString = require("../lib/lines").fromString;
var assert = require("assert");
var printer = new Printer;
var eol = require("os").EOL;

var annotated = [
    "function dup(/* string */ s,",
    "             /* int */ n) /* string */",
    "{",
    "  // Use an array full of holes.",
    "  return Array(n + /*",
    "                    * off-by-*/ 1).join(s);",
    "}"
];

describe("comments", function() {
    it("attachment and reprinting", function() {
        var code = annotated.join(eol);
        var ast = recast.parse(code);

        var dup = ast.program.body[0];
        n.FunctionDeclaration.assert(dup);
        assert.strictEqual(dup.id.name, "dup");

        // More of a basic sanity test than a comment test.
        assert.strictEqual(recast.print(ast).code, code);
        assert.strictEqual(recast.print(ast.program).code, code);
        assert.strictEqual(recast.print(dup).code, code);

        assert.strictEqual(
            recast.print(dup.params[0]).code,
            "/* string */ s"
        );

        assert.strictEqual(
            recast.print(dup.params[1]).code,
            "/* int */ n"
        );

        assert.strictEqual(
            recast.print(dup.body).code,
            ["/* string */"].concat(annotated.slice(2)).join(eol)
        );

        var retStmt = dup.body.body[0];
        n.ReturnStatement.assert(retStmt);

        var indented = annotated.slice(3, 6).join(eol);
        var flush = fromString(indented).indent(-2);

        assert.strictEqual(
            recast.print(retStmt).code,
            flush.toString()
        );

        var join = retStmt.argument;
        n.CallExpression.assert(join);

        var one = join.callee.object.arguments[0].right;
        n.Literal.assert(one);
        assert.strictEqual(one.value, 1);
        assert.strictEqual(recast.print(one).code, [
            "/*",
            " * off-by-*/ 1"
        ].join(eol));
    });

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
        "",
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
        "  qux: {",
        "    // Here is an object literal.",
        "    // Put more properties here when you think of them.",
        "    zxcv: 42,",
        "",
        "    asdf: 43",
        "  },",
        "",
        '  extra: "property"',
        "};"
    ];

    it("TrailingComments", function() {
        var code = trailing.join(eol);
        var ast = recast.parse(code);
        assert.strictEqual(recast.print(ast).code, code);

        // Drop all original source information to force reprinting.
        recast.visit(ast, {
            visitNode: function(path) {
                this.traverse(path);
                path.value.original = null;
            }
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

        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = trailingExpected.join(eol);

        // Check semantic equivalence:
        recast.types.astNodesAreEquivalent.assert(
            ast,
            recast.parse(actual)
        );

        assert.strictEqual(actual, expected);
    });

    var bodyTrailing = [
        "module.exports = {};",
        "/**",
        " * Trailing comment.",
        " */"
    ];

    var bodyTrailingExpected = [
        "module.exports = {};",
        "/**",
        " * Trailing comment.",
        " */"
    ];

    it("BodyTrailingComments", function() {
        var code = bodyTrailing.join(eol);
        var ast = recast.parse(code);

        // Drop all original source information to force reprinting.
        recast.visit(ast, {
            visitNode: function(path) {
                this.traverse(path);
                path.value.original = null;
            }
        });

        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = bodyTrailingExpected.join(eol);

        assert.strictEqual(actual, expected);
    });

    var paramTrailing = [
        "function foo(bar, baz /* = null */) {",
        "  assert.strictEqual(baz, null);",
        "}"
    ];

    var paramTrailingExpected = [
        "function foo(zxcv, bar, baz /* = null */) {",
        "  assert.strictEqual(baz, null);",
        "}"
    ];

    it("ParamTrailingComments", function() {
        var code = paramTrailing.join(eol);
        var ast = recast.parse(code);

        var func = ast.program.body[0];
        n.FunctionDeclaration.assert(func);

        func.params.unshift(b.identifier("zxcv"));

        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = paramTrailingExpected.join(eol);

        assert.strictEqual(actual, expected);
    });

    var statementTrailing = [
        "if (true) {",
        "  f();",
        "  // trailing 1",
        "  /* trailing 2 */",
        "  // trailing 3",
        "  /* trailing 4 */",
        "}"
    ];

    var statementTrailingExpected = [
        "if (true) {",
        "  e();",
        "  f();",
        "  // trailing 1",
        "  /* trailing 2 */",
        "  // trailing 3",
        "  /* trailing 4 */",
        "}"
    ];

    it("StatementTrailingComments", function() {
        var code = statementTrailing.join(eol);
        var ast = recast.parse(code);

        var block = ast.program.body[0].consequent;
        n.BlockStatement.assert(block);

        block.body.unshift(b.expressionStatement(
            b.callExpression(b.identifier("e"), [])));

        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = statementTrailingExpected.join(eol);

        assert.strictEqual(actual, expected);
    });

    var protoAssign = [
        "A.prototype.foo = function() {",
        "  return this.bar();",
        "}", // Lack of semicolon screws up location info.
        "",
        "// Comment about the bar method.",
        "A.prototype.bar = function() {",
        "  return this.foo();",
        "}"
    ];

    it("ProtoAssignComment", function() {
        var code = protoAssign.join(eol);
        var ast = recast.parse(code);

        var foo = ast.program.body[0];
        var bar = ast.program.body[1];

        n.ExpressionStatement.assert(foo);
        n.ExpressionStatement.assert(bar);

        assert.strictEqual(foo.expression.left.property.name, "foo");
        assert.strictEqual(bar.expression.left.property.name, "bar");

        assert.ok(!foo.comments);
        assert.ok(bar.comments);
        assert.strictEqual(bar.comments.length, 1);

        var barComment = bar.comments[0];
        assert.strictEqual(barComment.leading, true);
        assert.strictEqual(barComment.trailing, false);

        assert.strictEqual(
            barComment.value,
            " Comment about the bar method."
        );
    });

    var conciseMethods = [
        "var obj = {",
        "  a(/*before*/ param) {},",
        "  b(param /*after*/) {},",
        "  c(param) /*body*/ {}",
        "};",
    ];

    it("should correctly attach to concise methods", function() {
        var code = conciseMethods.join(eol);
        var ast = recast.parse(code);

        var objExpr = ast.program.body[0].declarations[0].init;
        n.ObjectExpression.assert(objExpr);

        var a = objExpr.properties[0];
        n.Identifier.assert(a.key);
        assert.strictEqual(a.key.name, "a");

        var aComments = a.value.params[0].comments;
        assert.strictEqual(aComments.length, 1);

        var aComment = aComments[0];
        assert.strictEqual(aComment.leading, true);
        assert.strictEqual(aComment.trailing, false);
        assert.strictEqual(aComment.type, "Block");
        assert.strictEqual(aComment.value, "before");

        assert.strictEqual(
            recast.print(a).code,
            "a(/*before*/ param) {}"
        );

        var b = objExpr.properties[1];
        n.Identifier.assert(b.key);
        assert.strictEqual(b.key.name, "b");

        var bComments = b.value.params[0].comments;
        assert.strictEqual(bComments.length, 1);

        var bComment = bComments[0];
        assert.strictEqual(bComment.leading, false);
        assert.strictEqual(bComment.trailing, true);
        assert.strictEqual(bComment.type, "Block");
        assert.strictEqual(bComment.value, "after");

        assert.strictEqual(
            recast.print(b).code,
            "b(param /*after*/) {}"
        );

        var c = objExpr.properties[2];
        n.Identifier.assert(c.key);
        assert.strictEqual(c.key.name, "c");

        var cComments = c.value.body.comments;
        assert.strictEqual(cComments.length, 1);

        var cComment = cComments[0];
        assert.strictEqual(cComment.leading, true);
        assert.strictEqual(cComment.trailing, false);
        assert.strictEqual(cComment.type, "Block");
        assert.strictEqual(cComment.value, "body");

        assert.strictEqual(
            recast.print(c).code,
            "c(param) /*body*/ {}"
        );
    });

    it("should attach comments as configurable", function() {
        // Given
        var simpleCommentedCode = [
            "// A comment",
            "var obj = {",
            "};",
        ];
        var code = simpleCommentedCode.join(eol);
        var ast = recast.parse(code);

        // When
        Object.defineProperty(ast.program, 'comments', {
            value: undefined,
            enumerable: false
        });

        // Then
        // An exception will be thrown if `comments` aren't configurable.
    });

    it("should be reprinted when modified", function() {
        var code = [
            "foo;",
            "// bar",
            "bar;"
        ].join(eol);

        var ast = recast.parse(code);

        var comments = ast.program.body[1].comments;
        assert.strictEqual(comments.length, 1);
        var comment = comments[0];
        assert.strictEqual(comment.type, "Line");
        assert.strictEqual(comment.value, " bar");

        comment.value = " barbara";
        assert.strictEqual(recast.print(ast).code, [
            "foo;",
            "// barbara",
            "bar;"
        ].join(eol));

        ast.program.body[0].comments = comments;
        delete ast.program.body[1].comments;
        assert.strictEqual(recast.print(ast).code, [
            "// barbara",
            "foo;",
            "bar;"
        ].join(eol));

        ast.program.body[0] = b.blockStatement([
            ast.program.body[0]
        ]);
        assert.strictEqual(recast.print(ast).code, [
            "{",
            "  // barbara",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(eol));

        var comment = ast.program.body[0].body[0].comments[0];
        comment.type = "Block";
        assert.strictEqual(recast.print(ast).code, [
            "{",
            "  /* barbara*/",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(eol));

        comment.value += "\n * babar\n ";
        assert.strictEqual(recast.print(ast).code, [
            "{",
            "  /* barbara",
            "   * babar",
            "   */",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(eol));

        ast.program.body[1].comments = [comment];
        assert.strictEqual(recast.print(ast).code, [
            "{",
            "  /* barbara",
            "   * babar",
            "   */",
            "  foo;",
            "}",
            "",
            "/* barbara",
            " * babar",
            " */",
            "bar;"
        ].join(eol));

        delete ast.program.body[0].body[0].comments;
        ast.program.comments = [b.line(" program comment")];
        assert.strictEqual(recast.print(ast).code, [
            "// program comment",
            "{",
            "  foo;",
            "}",
            "",
            "/* barbara",
            " * babar",
            " */",
            "bar;"
        ].join(eol));

        ast.program.body.push(
            ast.program.body.shift()
        );
        assert.strictEqual(recast.print(ast).code, [
            "// program comment",
            "/* barbara",
            " * babar",
            " */",
            "bar;",
            "",
            "{",
            "  foo;",
            "}"
        ].join(eol));

        recast.visit(ast, {
            visitNode: function(path) {
                delete path.value.comments;
                this.traverse(path);
            }
        });
        assert.strictEqual(recast.print(ast).code, [
            "bar;",
            "",
            "{",
            "  foo;",
            "}"
        ].join(eol));

        ast.program.body[1] = ast.program.body[1].body[0];
        assert.strictEqual(recast.print(ast).code, [
            "bar;",
            "foo;"
        ].join(eol));
    });

    it("should preserve stray non-comment syntax", function() {
        var code = [
            "[",
            "  foo",
            "  , /* comma */",
            "  /* hole */",
            "  , /* comma */",
            "  bar",
            "]"
        ].join(eol);

        var ast = recast.parse(code);
        assert.strictEqual(recast.print(ast).code, code);

        var elems = ast.program.body[0].expression.elements;
        elems[0].comments.push(b.line(" line comment", true, false));
        assert.strictEqual(recast.print(ast).code, [
            "[",
            "  // line comment",
            "  foo /* comma */",
            "  /* hole */",
            "  ,",
            "  , /* comma */",
            "  bar",
            "]"
        ].join(eol));
    });

    it("should be reprinted even if dangling", function() {
        var code = [
            "[/*dangling*/] // array literal"
        ].join(eol);

        var ast = recast.parse(code);
        var array = ast.program.body[0].expression;
        var danglingComment = array.comments[0];
        var trailingComment = array.comments[1];

        assert.strictEqual(danglingComment.leading, false);
        assert.strictEqual(danglingComment.trailing, false);

        assert.strictEqual(trailingComment.leading, false);
        assert.strictEqual(trailingComment.trailing, true);

        danglingComment.value = " neither leading nor trailing ";
        assert.strictEqual(recast.print(ast).code, [
            "[/* neither leading nor trailing */] // array literal"
        ].join(eol));

        trailingComment.value = " trailing";
        assert.strictEqual(recast.print(ast).code, [
            "[/* neither leading nor trailing */] // trailing"
        ].join(eol));

        // Unfortuantely altering the elements of the array leads to
        // reprinting which blows away the dangling comment.
        array.elements.push(b.literal(1));
        assert.strictEqual(
            recast.print(ast).code,
            "[1] // trailing"
        );
    });

    it("should attach to program.body[0] instead of program", function() {
        var code = [
            "// comment 1",
            "var a;",
            "// comment 2",
            "var b;",
            "if (true) {",
            "  // comment 3",
            "  var c;",
            "}"
        ].join('\n');

        var ast = recast.parse(code);

        assert.ok(!ast.program.comments);

        var aDecl = ast.program.body[0];
        n.VariableDeclaration.assert(aDecl);
        assert.strictEqual(aDecl.comments.length, 1);
        assert.strictEqual(aDecl.comments[0].leading, true);
        assert.strictEqual(aDecl.comments[0].trailing, false);
        assert.strictEqual(aDecl.comments[0].value, " comment 1");

        var bDecl = ast.program.body[1];
        n.VariableDeclaration.assert(bDecl);
        assert.strictEqual(bDecl.comments.length, 1);
        assert.strictEqual(bDecl.comments[0].leading, true);
        assert.strictEqual(bDecl.comments[0].trailing, false);
        assert.strictEqual(bDecl.comments[0].value, " comment 2");

        var cDecl = ast.program.body[2].consequent.body[0];
        n.VariableDeclaration.assert(cDecl);
        assert.strictEqual(cDecl.comments.length, 1);
        assert.strictEqual(cDecl.comments[0].leading, true);
        assert.strictEqual(cDecl.comments[0].trailing, false);
        assert.strictEqual(cDecl.comments[0].value, " comment 3");
    });

    it("should not collapse multi line function definitions", function() {
        var code = [
            "var obj = {",
            "  a(",
            "    /*before*/ param",
            "  ) /*after*/ {",
            "  },",
            "};",
        ].join(eol);

        var ast = recast.parse(code);
        var printer = new Printer({
            tabWidth: 2
        });

        assert.strictEqual(
            printer.print(ast).code,
            code
        );
    });

    it("should be pretty-printable in illegal positions", function() {
        var code = [
            "var sum = function /*anonymous*/(/*...args*/) /*int*/ {",
            "  // TODO",
            "};"
        ].join(eol);

        var ast = recast.parse(code);
        var funExp = ast.program.body[0].declarations[0].init;
        n.FunctionExpression.assert(funExp);

        funExp.original = null;

        var comments = funExp.body.comments;
        assert.strictEqual(comments.length, 4);
        funExp.id = comments.shift();
        funExp.params.push(comments.shift());
        funExp.body.body.push(comments.pop());

        assert.strictEqual(
            recast.print(ast).code,
            code
        );
    });
});
