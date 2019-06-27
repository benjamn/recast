"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var recast = __importStar(require("../main"));
var n = recast.types.namedTypes;
var b = recast.types.builders;
var printer_1 = require("../lib/printer");
var lines_1 = require("../lib/lines");
var assert_1 = __importDefault(require("assert"));
var os_1 = require("os");
var annotated = [
    "function dup(/* string */ s,",
    "             /* int */ n) /* string */",
    "{",
    "  // Use an array full of holes.",
    "  return Array(n + /*",
    "                    * off-by-*/ 1).join(s);",
    "}"
];
var nodeMajorVersion = parseInt(process.versions.node, 10);
describe("comments", function () {
    ["../parsers/acorn",
        "../parsers/babel",
        "../parsers/esprima",
        "../parsers/flow",
        "../parsers/typescript",
    ].forEach(runTestsForParser);
});
function runTestsForParser(parserId) {
    if (nodeMajorVersion < 6) {
        var parser_1 = parserId.split("/").pop();
        if (parser_1 === "babel" ||
            parser_1 === "flow" ||
            parser_1 === "typescript") {
            // Babel 7 no longer supports Node 4 and 5.
            return;
        }
    }
    var parserName = parserId.split("/").pop();
    var parser = require(parserId);
    function pit(message, callback) {
        it("[" + parserName + "] " + message, callback);
    }
    pit("attachment and reprinting", function () {
        var code = annotated.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var dup = ast.program.body[0];
        n.FunctionDeclaration.assert(dup);
        assert_1.default.strictEqual(dup.id.name, "dup");
        // More of a basic sanity test than a comment test.
        assert_1.default.strictEqual(recast.print(ast).code, code);
        assert_1.default.strictEqual(recast.print(ast.program).code, code);
        assert_1.default.strictEqual(recast.print(dup).code, code);
        assert_1.default.strictEqual(recast.print(dup.params[0]).code, "/* string */ s");
        assert_1.default.strictEqual(recast.print(dup.params[1]).code, "/* int */ n");
        assert_1.default.strictEqual(recast.print(dup.body).code, ["/* string */"].concat(annotated.slice(2)).join(os_1.EOL));
        var retStmt = dup.body.body[0];
        n.ReturnStatement.assert(retStmt);
        var indented = annotated.slice(3, 6).join(os_1.EOL);
        var flush = lines_1.fromString(indented).indent(-2);
        assert_1.default.strictEqual(recast.print(retStmt).code, flush.toString());
        var join = retStmt.argument;
        n.CallExpression.assert(join);
        var one = join.callee.object.arguments[0].right;
        n.Literal.assert(one);
        assert_1.default.strictEqual(one.value, 1);
        assert_1.default.strictEqual(recast.print(one).code, [
            "/*",
            " * off-by-*/ 1"
        ].join(os_1.EOL));
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
    pit("TrailingComments", function () {
        var code = trailing.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        assert_1.default.strictEqual(recast.print(ast).code, code);
        // Drop all original source information to force reprinting.
        recast.visit(ast, {
            visitNode: function (path) {
                this.traverse(path);
                path.value.original = null;
            }
        });
        var assign = ast.program.body[0].expression;
        n.AssignmentExpression.assert(assign);
        var esprimaInfo = {
            Property: n.Property,
            propBuilder: function (key, value) {
                return b.property("init", key, value);
            },
            literalBuilder: function (value) {
                return b.literal(value);
            }
        };
        var babelInfo = {
            Property: n.ObjectProperty,
            propBuilder: function (key, value) {
                return b.objectProperty(key, value);
            },
            literalBuilder: function (value) {
                if (typeof value === "string") {
                    return b.stringLiteral(value);
                }
                if (typeof value === "number") {
                    return b.numericLiteral(value);
                }
                throw new Error("unexpected literal: " + value);
            }
        };
        var info = {
            acorn: esprimaInfo,
            babel: babelInfo,
            esprima: esprimaInfo,
            flow: babelInfo,
            typescript: babelInfo
        }[parserName];
        var props = assign.right.properties;
        info.Property.arrayOf().assert(props);
        props.push(info.propBuilder(b.identifier("extra"), info.literalBuilder("property")));
        var quxVal = props[2].value;
        n.ObjectExpression.assert(quxVal);
        quxVal.properties.push(info.propBuilder(b.identifier("asdf"), info.literalBuilder(43)));
        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = trailingExpected.join(os_1.EOL);
        // Check semantic equivalence:
        recast.types.astNodesAreEquivalent.assert(ast, recast.parse(actual, { parser: parser }));
        assert_1.default.strictEqual(actual, expected);
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
    pit("BodyTrailingComments", function () {
        var code = bodyTrailing.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        // Drop all original source information to force reprinting.
        recast.visit(ast, {
            visitNode: function (path) {
                this.traverse(path);
                path.value.original = null;
            }
        });
        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = bodyTrailingExpected.join(os_1.EOL);
        assert_1.default.strictEqual(actual, expected);
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
    pit("ParamTrailingComments", function () {
        var code = paramTrailing.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var func = ast.program.body[0];
        n.FunctionDeclaration.assert(func);
        func.params.unshift(b.identifier("zxcv"));
        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = paramTrailingExpected.join(os_1.EOL);
        assert_1.default.strictEqual(actual, expected);
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
    pit("StatementTrailingComments", function () {
        var code = statementTrailing.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var block = ast.program.body[0].consequent;
        n.BlockStatement.assert(block);
        block.body.unshift(b.expressionStatement(b.callExpression(b.identifier("e"), [])));
        var actual = recast.print(ast, { tabWidth: 2 }).code;
        var expected = statementTrailingExpected.join(os_1.EOL);
        assert_1.default.strictEqual(actual, expected);
    });
    var protoAssign = [
        "A.prototype.foo = function() {",
        "  return this.bar();",
        "}",
        "",
        "// Comment about the bar method.",
        "A.prototype.bar = function() {",
        "  return this.foo();",
        "}"
    ];
    pit("ProtoAssignComment", function () {
        var code = protoAssign.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var foo = ast.program.body[0];
        var bar = ast.program.body[1];
        n.ExpressionStatement.assert(foo);
        n.ExpressionStatement.assert(bar);
        assert_1.default.strictEqual(foo.expression.left.property.name, "foo");
        assert_1.default.strictEqual(bar.expression.left.property.name, "bar");
        assert_1.default.ok(!foo.comments);
        assert_1.default.ok(bar.comments);
        assert_1.default.strictEqual(bar.comments.length, 1);
        var barComment = bar.comments[0];
        assert_1.default.strictEqual(barComment.leading, true);
        assert_1.default.strictEqual(barComment.trailing, false);
        assert_1.default.strictEqual(barComment.value, " Comment about the bar method.");
    });
    var conciseMethods = [
        "var obj = {",
        "  a(/*before*/ param) {},",
        "  b(param /*after*/) {},",
        "  c(param) /*body*/ {}",
        "};",
    ];
    pit("should correctly attach to concise methods", function () {
        var code = conciseMethods.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var objExpr = ast.program.body[0].declarations[0].init;
        n.ObjectExpression.assert(objExpr);
        var a = objExpr.properties[0];
        n.Identifier.assert(a.key);
        assert_1.default.strictEqual(a.key.name, "a");
        var aComments = (a.value || a).params[0].comments;
        assert_1.default.strictEqual(aComments.length, 1);
        var aComment = aComments[0];
        assert_1.default.strictEqual(aComment.leading, true);
        assert_1.default.strictEqual(aComment.trailing, false);
        assert_1.default.ok(aComment.type.endsWith("Block"));
        assert_1.default.strictEqual(aComment.value, "before");
        assert_1.default.strictEqual(recast.print(a).code, "a(/*before*/ param) {}");
        var b = objExpr.properties[1];
        n.Identifier.assert(b.key);
        assert_1.default.strictEqual(b.key.name, "b");
        var bComments = (b.value || b).params[0].comments;
        assert_1.default.strictEqual(bComments.length, 1);
        var bComment = bComments[0];
        assert_1.default.strictEqual(bComment.leading, false);
        assert_1.default.strictEqual(bComment.trailing, true);
        assert_1.default.ok(bComment.type.endsWith("Block"));
        assert_1.default.strictEqual(bComment.value, "after");
        assert_1.default.strictEqual(recast.print(b).code, "b(param /*after*/) {}");
        var c = objExpr.properties[2];
        n.Identifier.assert(c.key);
        assert_1.default.strictEqual(c.key.name, "c");
        var cComments = (c.value || c).body.comments;
        assert_1.default.strictEqual(cComments.length, 1);
        var cComment = cComments[0];
        assert_1.default.strictEqual(cComment.leading, true);
        assert_1.default.strictEqual(cComment.trailing, false);
        assert_1.default.ok(cComment.type.endsWith("Block"));
        assert_1.default.strictEqual(cComment.value, "body");
        assert_1.default.strictEqual(recast.print(c).code, "c(param) /*body*/ {}");
    });
    pit("should attach comments as configurable", function () {
        // Given
        var simpleCommentedCode = [
            "// A comment",
            "var obj = {",
            "};",
        ];
        var code = simpleCommentedCode.join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        // When
        Object.defineProperty(ast.program, 'comments', {
            value: undefined,
            enumerable: false
        });
        // Then
        // An exception will be thrown if `comments` aren't configurable.
    });
    pit("should be reprinted when modified", function () {
        var code = [
            "foo;",
            "// bar",
            "bar;"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var comments = ast.program.body[1].comments;
        assert_1.default.strictEqual(comments.length, 1);
        var comment = comments[0];
        assert_1.default.ok(comment.type.endsWith("Line"));
        assert_1.default.strictEqual(comment.value, " bar");
        comment.value = " barbara";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "foo;",
            "// barbara",
            "bar;"
        ].join(os_1.EOL));
        ast.program.body[0].comments = comments;
        delete ast.program.body[1].comments;
        assert_1.default.strictEqual(recast.print(ast).code, [
            "// barbara",
            "foo;",
            "bar;"
        ].join(os_1.EOL));
        ast.program.body[0] = b.blockStatement([
            ast.program.body[0]
        ]);
        assert_1.default.strictEqual(recast.print(ast).code, [
            "{",
            "  // barbara",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(os_1.EOL));
        var comment = ast.program.body[0].body[0].comments[0];
        comment.type = "Block";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "{",
            "  /* barbara*/",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(os_1.EOL));
        comment.value += "\n * babar\n ";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "{",
            "  /* barbara",
            "   * babar",
            "   */",
            "  foo;",
            "}",
            "",
            "bar;"
        ].join(os_1.EOL));
        ast.program.body[1].comments = [comment];
        assert_1.default.strictEqual(recast.print(ast).code, [
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
        ].join(os_1.EOL));
        delete ast.program.body[0].body[0].comments;
        ast.program.comments = [b.line(" program comment")];
        assert_1.default.strictEqual(recast.print(ast).code, [
            "// program comment",
            "{",
            "  foo;",
            "}",
            "",
            "/* barbara",
            " * babar",
            " */",
            "bar;"
        ].join(os_1.EOL));
        ast.program.body.push(ast.program.body.shift());
        assert_1.default.strictEqual(recast.print(ast).code, [
            "// program comment",
            "/* barbara",
            " * babar",
            " */",
            "bar;",
            "",
            "{",
            "  foo;",
            "}"
        ].join(os_1.EOL));
        recast.visit(ast, {
            visitNode: function (path) {
                delete path.value.comments;
                this.traverse(path);
            }
        });
        assert_1.default.strictEqual(recast.print(ast).code, [
            "bar;",
            "",
            "{",
            "  foo;",
            "}"
        ].join(os_1.EOL));
        ast.program.body[1] = ast.program.body[1].body[0];
        assert_1.default.strictEqual(recast.print(ast).code, [
            "bar;",
            "foo;"
        ].join(os_1.EOL));
    });
    pit("should preserve stray non-comment syntax", function () {
        var code = [
            "[",
            "  foo",
            "  , /* comma */",
            "  /* hole */",
            "  , /* comma */",
            "  bar",
            "]"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        assert_1.default.strictEqual(recast.print(ast).code, code);
        var elems = ast.program.body[0].expression.elements;
        elems[0].comments.push(b.line(" line comment", true, false));
        assert_1.default.strictEqual(recast.print(ast).code, [
            "[",
            "  // line comment",
            "  foo /* comma */",
            "  /* hole */",
            "  ,",
            "  , /* comma */",
            "  bar",
            "]"
        ].join(os_1.EOL));
    });
    pit("should be reprinted even if dangling", function () {
        var code = "[/*dangling*/] // array literal";
        var ast = recast.parse(code, { parser: parser });
        var array = ast.program.body[0].expression;
        var stmt = ast.program.body[0];
        var danglingComment;
        var trailingComment;
        function handleComment(comment) {
            if (comment.trailing) {
                trailingComment = comment;
            }
            else if (!comment.leading) {
                danglingComment = comment;
            }
        }
        (stmt.comments || []).forEach(handleComment);
        (stmt.expression.comments || []).forEach(handleComment);
        assert_1.default.strictEqual(danglingComment.leading, false);
        assert_1.default.strictEqual(danglingComment.trailing, false);
        assert_1.default.strictEqual(trailingComment.leading, false);
        assert_1.default.strictEqual(trailingComment.trailing, true);
        danglingComment.value = " neither leading nor trailing ";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "[/* neither leading nor trailing */] // array literal"
        ].join(os_1.EOL));
        trailingComment.value = " trailing";
        assert_1.default.strictEqual(recast.print(ast).code, [
            "[/* neither leading nor trailing */] // trailing"
        ].join(os_1.EOL));
        // Unfortuantely altering the elements of the array leads to
        // reprinting which blows away the dangling comment.
        array.elements.push(b.literal(1));
        assert_1.default.strictEqual(recast.print(ast).code, "[1] // trailing");
    });
    pit("should attach to program.body[0] instead of program", function () {
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
        var ast = recast.parse(code, { parser: parser });
        assert_1.default.ok(!ast.program.comments);
        var aDecl = ast.program.body[0];
        n.VariableDeclaration.assert(aDecl);
        assert_1.default.strictEqual(aDecl.comments.length, 1);
        assert_1.default.strictEqual(aDecl.comments[0].leading, true);
        assert_1.default.strictEqual(aDecl.comments[0].trailing, false);
        assert_1.default.strictEqual(aDecl.comments[0].value, " comment 1");
        var bDecl = ast.program.body[1];
        n.VariableDeclaration.assert(bDecl);
        assert_1.default.strictEqual(bDecl.comments.length, 1);
        assert_1.default.strictEqual(bDecl.comments[0].leading, true);
        assert_1.default.strictEqual(bDecl.comments[0].trailing, false);
        assert_1.default.strictEqual(bDecl.comments[0].value, " comment 2");
        var cDecl = ast.program.body[2].consequent.body[0];
        n.VariableDeclaration.assert(cDecl);
        assert_1.default.strictEqual(cDecl.comments.length, 1);
        assert_1.default.strictEqual(cDecl.comments[0].leading, true);
        assert_1.default.strictEqual(cDecl.comments[0].trailing, false);
        assert_1.default.strictEqual(cDecl.comments[0].value, " comment 3");
    });
    pit("should not collapse multi line function definitions", function () {
        var code = [
            "var obj = {",
            "  a(",
            "    /*before*/ param",
            "  ) /*after*/ {",
            "  },",
            "};",
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var printer = new printer_1.Printer({
            tabWidth: 2
        });
        assert_1.default.strictEqual(printer.print(ast).code, code);
    });
    pit("should be pretty-printable in illegal positions", function () {
        var code = [
            "var sum = function /*anonymous*/(/*...args*/) /*int*/ {",
            "  // TODO",
            "};"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        var funExp = ast.program.body[0].declarations[0].init;
        n.FunctionExpression.assert(funExp);
        funExp.original = null;
        var comments = funExp.body.comments;
        assert_1.default.strictEqual(comments.length, 4);
        funExp.id = comments.shift();
        funExp.params.push(comments.shift());
        funExp.body.body.push(comments.pop());
        assert_1.default.strictEqual(recast.print(ast).code, code);
    });
    pit("should preserve correctness when a return expression has a comment", function () {
        var code = [
            "function f() {",
            "  return 3;",
            "}"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        ast.program.body[0].body.body[0].argument.comments = [b.line('Foo')];
        assert_1.default.strictEqual(recast.print(ast).code, [
            "function f() {",
            "  return (",
            "    //Foo",
            "    3",
            "  );",
            "}"
        ].join(os_1.EOL));
    });
    pit("should wrap in parens when the return expression has nested leftmost comment", function () {
        var code = [
            "function f() {",
            "  return 1 + 2;",
            "}"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        ast.program.body[0].body.body[0].argument.left.comments = [b.line('Foo')];
        assert_1.default.strictEqual(recast.print(ast).code, [
            "function f() {",
            "  return (",
            "    //Foo",
            "    1 + 2",
            "  );",
            "}"
        ].join(os_1.EOL));
    });
    pit("should not wrap in parens when the return expression has an interior comment", function () {
        var code = [
            "function f() {",
            "  return 1 + 2;",
            "}"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        ast.program.body[0].body.body[0].argument.right.comments = [b.line('Foo')];
        assert_1.default.strictEqual(recast.print(ast).code, [
            "function f() {",
            "  return 1 + //Foo",
            "  2;",
            "}"
        ].join(os_1.EOL));
    });
    pit("should correctly handle a lonesome comment (alt 1)", function () {
        var code = ["", "// boo", ""].join(os_1.EOL);
        var ast = recast.parse(code);
        assert_1.default.strictEqual(recast.print(ast).code, ["", "// boo", ""].join(os_1.EOL));
    });
    pit("should correctly handle a not-so-lonesome comment (alt 2 - trailing whitespace)", function () {
        var code = ["", "// boo ", ";"].join(os_1.EOL);
        var ast = recast.parse(code);
        assert_1.default.strictEqual(recast.print(ast).code, ["", "// boo ", ";"].join(os_1.EOL));
    });
    pit("should correctly handle a lonesome comment (alt 3 - trailing whitespace)", function () {
        var code = ["", "// boo ", ""].join(os_1.EOL);
        var ast = recast.parse(code);
        assert_1.default.strictEqual(recast.print(ast).code, ["", "// boo ", ""].join(os_1.EOL));
    });
    pit("should not reformat a return statement that is not modified", function () {
        var code = [
            "function f() {",
            "  return      {",
            "    a:     1,",
            "    b: 2,",
            "  };",
            "}"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        assert_1.default.strictEqual(recast.print(ast).code, code);
    });
    pit("should correctly handle a removing the argument from a return", function () {
        var code = [
            "function f() {",
            "  return 'foo';",
            "}"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        ast.program.body[0].body.body[0].argument = null;
        assert_1.default.strictEqual(recast.print(ast).code, [
            "function f() {",
            "  return;",
            "}"
        ].join(os_1.EOL));
    });
    pit("should preserve comments attached to EmptyStatement", function () {
        var code = [
            "removeThisStatement;",
            "// comment",
            ";(function() {})();"
        ].join(os_1.EOL);
        var ast = recast.parse(code, { parser: parser });
        ast.program.body.shift();
        assert_1.default.strictEqual(recast.print(ast).code, [
            "// comment",
            ";(function() {})();"
        ].join(os_1.EOL));
    });
}
