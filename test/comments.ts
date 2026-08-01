"use strict";

import * as recast from "../main";
const n = recast.types.namedTypes;
const b = recast.types.builders;
import { Printer } from "../lib/printer";
import { fromString } from "../lib/lines";
import assert from "assert";
import { EOL as eol } from "os";

const annotated = [
  "function dup(/* string */ s,",
  "             /* int */ n) /* string */",
  "{",
  "  // Use an array full of holes.",
  "  return Array(n + /*",
  "                    * off-by-*/ 1).join(s);",
  "}",
];

describe("comments", function () {
  [
    "../parsers/acorn",
    "../parsers/babel",
    "../parsers/esprima",
    "../parsers/flow",
    "../parsers/typescript",
  ].forEach(runTestsForParser);
});

function runTestsForParser(parserId: any) {
  const parserName = parserId.split("/").pop();
  const parser = require(parserId);

  function pit(message: any, callback: any) {
    it("[" + parserName + "] " + message, callback);
  }

  pit("attachment and reprinting", function () {
    const code = annotated.join(eol);
    const ast = recast.parse(code, { parser });

    const dup = ast.program.body[0];
    n.FunctionDeclaration.assert(dup);
    assert.strictEqual(dup.id.name, "dup");

    // More of a basic sanity test than a comment test.
    assert.strictEqual(recast.print(ast).code, code);
    assert.strictEqual(recast.print(ast.program).code, code);
    assert.strictEqual(recast.print(dup).code, code);

    assert.strictEqual(recast.print(dup.params[0]).code, "/* string */ s");

    assert.strictEqual(recast.print(dup.params[1]).code, "/* int */ n");

    assert.strictEqual(
      recast.print(dup.body).code,
      ["/* string */"].concat(annotated.slice(2)).join(eol),
    );

    const retStmt = dup.body.body[0];
    n.ReturnStatement.assert(retStmt);

    const indented = annotated.slice(3, 6).join(eol);
    const flush = fromString(indented).indent(-2);

    assert.strictEqual(recast.print(retStmt).code, flush.toString());

    const join = retStmt.argument;
    n.CallExpression.assert(join);

    const one = join.callee.object.arguments[0].right;
    n.Literal.assert(one);
    assert.strictEqual(one.value, 1);
    assert.strictEqual(
      recast.print(one).code,
      ["/*", " * off-by-*/ 1"].join(eol),
    );
  });

  const trailing = [
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
    "};",
  ];

  const trailingExpected = [
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
    "};",
  ];

  pit("TrailingComments", function () {
    const code = trailing.join(eol);
    const ast = recast.parse(code, { parser });
    assert.strictEqual(recast.print(ast).code, code);

    // Drop all original source information to force reprinting.
    recast.visit(ast, {
      visitNode: function (path) {
        this.traverse(path);
        path.value.original = null;
      },
    });

    const assign = ast.program.body[0].expression;
    n.AssignmentExpression.assert(assign);

    const esprimaInfo = {
      Property: n.Property,
      propBuilder(key: any, value: any) {
        return b.property("init", key, value);
      },
      literalBuilder(value: any) {
        return b.literal(value);
      },
    };

    const babelInfo = {
      Property: n.ObjectProperty,
      propBuilder(key: any, value: any) {
        return b.objectProperty(key, value);
      },
      literalBuilder(value: any) {
        if (typeof value === "string") {
          return b.stringLiteral(value);
        }
        if (typeof value === "number") {
          return b.numericLiteral(value);
        }
        throw new Error("unexpected literal: " + value);
      },
    };

    const info = (
      {
        acorn: esprimaInfo,
        babel: babelInfo,
        esprima: esprimaInfo,
        flow: babelInfo,
        typescript: babelInfo,
      } as any
    )[parserName];

    const props = assign.right.properties;
    info.Property.arrayOf().assert(props);

    props.push(
      info.propBuilder(b.identifier("extra"), info.literalBuilder("property")),
    );

    const quxVal = props[2].value;
    n.ObjectExpression.assert(quxVal);
    quxVal.properties.push(
      info.propBuilder(b.identifier("asdf"), info.literalBuilder(43)),
    );

    const actual = recast.print(ast, { tabWidth: 2 }).code;
    const expected = trailingExpected.join(eol);

    // Check semantic equivalence:
    recast.types.astNodesAreEquivalent.assert(
      ast,
      recast.parse(actual, { parser }),
    );

    assert.strictEqual(actual, expected);
  });

  const bodyTrailing = [
    "module.exports = {};",
    "/**",
    " * Trailing comment.",
    " */",
  ];

  const bodyTrailingExpected = [
    "module.exports = {};",
    "/**",
    " * Trailing comment.",
    " */",
  ];

  pit("BodyTrailingComments", function () {
    const code = bodyTrailing.join(eol);
    const ast = recast.parse(code, { parser });

    // Drop all original source information to force reprinting.
    recast.visit(ast, {
      visitNode: function (path) {
        this.traverse(path);
        path.value.original = null;
      },
    });

    const actual = recast.print(ast, { tabWidth: 2 }).code;
    const expected = bodyTrailingExpected.join(eol);

    assert.strictEqual(actual, expected);
  });

  const paramTrailing = [
    "function foo(bar, baz /* = null */) {",
    "  assert.strictEqual(baz, null);",
    "}",
  ];

  const paramTrailingExpected = [
    "function foo(zxcv, bar, baz /* = null */) {",
    "  assert.strictEqual(baz, null);",
    "}",
  ];

  pit("ParamTrailingComments", function () {
    const code = paramTrailing.join(eol);
    const ast = recast.parse(code, { parser });

    const func = ast.program.body[0];
    n.FunctionDeclaration.assert(func);

    func.params.unshift(b.identifier("zxcv"));

    const actual = recast.print(ast, { tabWidth: 2 }).code;
    const expected = paramTrailingExpected.join(eol);

    assert.strictEqual(actual, expected);
  });

  const statementTrailing = [
    "if (true) {",
    "  f();",
    "  // trailing 1",
    "  /* trailing 2 */",
    "  // trailing 3",
    "  /* trailing 4 */",
    "}",
  ];

  const statementTrailingExpected = [
    "if (true) {",
    "  e();",
    "  f();",
    "  // trailing 1",
    "  /* trailing 2 */",
    "  // trailing 3",
    "  /* trailing 4 */",
    "}",
  ];

  pit("StatementTrailingComments", function () {
    const code = statementTrailing.join(eol);
    const ast = recast.parse(code, { parser });

    const block = ast.program.body[0].consequent;
    n.BlockStatement.assert(block);

    block.body.unshift(
      b.expressionStatement(b.callExpression(b.identifier("e"), [])),
    );

    const actual = recast.print(ast, { tabWidth: 2 }).code;
    const expected = statementTrailingExpected.join(eol);

    assert.strictEqual(actual, expected);
  });

  const protoAssign = [
    "A.prototype.foo = function() {",
    "  return this.bar();",
    "}", // Lack of semicolon screws up location info.
    "",
    "// Comment about the bar method.",
    "A.prototype.bar = function() {",
    "  return this.foo();",
    "}",
  ];

  pit("ProtoAssignComment", function () {
    const code = protoAssign.join(eol);
    const ast = recast.parse(code, { parser });

    const foo = ast.program.body[0];
    const bar = ast.program.body[1];

    n.ExpressionStatement.assert(foo);
    n.ExpressionStatement.assert(bar);

    assert.strictEqual(foo.expression.left.property.name, "foo");
    assert.strictEqual(bar.expression.left.property.name, "bar");

    assert.ok(!foo.comments);
    assert.ok(bar.comments);
    assert.strictEqual(bar.comments.length, 1);

    const barComment = bar.comments[0];
    assert.strictEqual(barComment.leading, true);
    assert.strictEqual(barComment.trailing, false);

    assert.strictEqual(barComment.value, " Comment about the bar method.");
  });

  const conciseMethods = [
    "var obj = {",
    "  a(/*before*/ param) {},",
    "  b(param /*after*/) {},",
    "  c(param) /*body*/ {}",
    "};",
  ];

  pit("should correctly attach to concise methods", function () {
    const code = conciseMethods.join(eol);
    const ast = recast.parse(code, { parser });

    const objExpr = ast.program.body[0].declarations[0].init;
    n.ObjectExpression.assert(objExpr);

    const a = objExpr.properties[0];
    n.Identifier.assert(a.key);
    assert.strictEqual(a.key.name, "a");

    const aComments = (a.value || a).params[0].comments;
    assert.strictEqual(aComments.length, 1);

    const aComment = aComments[0];
    assert.strictEqual(aComment.leading, true);
    assert.strictEqual(aComment.trailing, false);
    assert.ok(aComment.type.endsWith("Block"));
    assert.strictEqual(aComment.value, "before");

    assert.strictEqual(recast.print(a).code, "a(/*before*/ param) {}");

    const b = objExpr.properties[1];
    n.Identifier.assert(b.key);
    assert.strictEqual(b.key.name, "b");

    const bComments = (b.value || b).params[0].comments;
    assert.strictEqual(bComments.length, 1);

    const bComment = bComments[0];
    assert.strictEqual(bComment.leading, false);
    assert.strictEqual(bComment.trailing, true);
    assert.ok(bComment.type.endsWith("Block"));
    assert.strictEqual(bComment.value, "after");

    assert.strictEqual(recast.print(b).code, "b(param /*after*/) {}");

    const c = objExpr.properties[2];
    n.Identifier.assert(c.key);
    assert.strictEqual(c.key.name, "c");

    const cComments = (c.value || c).body.comments;
    assert.strictEqual(cComments.length, 1);

    const cComment = cComments[0];
    assert.strictEqual(cComment.leading, true);
    assert.strictEqual(cComment.trailing, false);
    assert.ok(cComment.type.endsWith("Block"));
    assert.strictEqual(cComment.value, "body");

    assert.strictEqual(recast.print(c).code, "c(param) /*body*/ {}");
  });

  pit("should attach comments as configurable", function () {
    // Given
    const simpleCommentedCode = ["// A comment", "var obj = {", "};"];
    const code = simpleCommentedCode.join(eol);
    const ast = recast.parse(code, { parser });

    // When
    Object.defineProperty(ast.program, "comments", {
      value: undefined,
      enumerable: false,
    });

    // Then
    // An exception will be thrown if `comments` aren't configurable.
  });

  pit("should be reprinted when modified", function () {
    const code = ["foo;", "// bar", "bar;"].join(eol);

    const ast = recast.parse(code, { parser });

    const comments = ast.program.body[1].comments;
    assert.strictEqual(comments.length, 1);
    let comment = comments[0];
    assert.ok(comment.type.endsWith("Line"));
    assert.strictEqual(comment.value, " bar");

    comment.value = " barbara";
    assert.strictEqual(
      recast.print(ast).code,
      ["foo;", "// barbara", "bar;"].join(eol),
    );

    ast.program.body[0].comments = comments;
    delete ast.program.body[1].comments;
    assert.strictEqual(
      recast.print(ast).code,
      ["// barbara", "foo;", "bar;"].join(eol),
    );

    ast.program.body[0] = b.blockStatement([ast.program.body[0]]);
    assert.strictEqual(
      recast.print(ast).code,
      ["{", "  // barbara", "  foo;", "}", "", "bar;"].join(eol),
    );

    comment = ast.program.body[0].body[0].comments[0];
    comment.type = "Block";
    assert.strictEqual(
      recast.print(ast).code,
      ["{", "  /* barbara*/", "  foo;", "}", "", "bar;"].join(eol),
    );

    comment.value += "\n * babar\n ";
    assert.strictEqual(
      recast.print(ast).code,
      [
        "{",
        "  /* barbara",
        "   * babar",
        "   */",
        "  foo;",
        "}",
        "",
        "bar;",
      ].join(eol),
    );

    ast.program.body[1].comments = [comment];
    assert.strictEqual(
      recast.print(ast).code,
      [
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
        "bar;",
      ].join(eol),
    );

    delete ast.program.body[0].body[0].comments;
    ast.program.comments = [b.line(" program comment")];
    assert.strictEqual(
      recast.print(ast).code,
      [
        "// program comment",
        "{",
        "  foo;",
        "}",
        "",
        "/* barbara",
        " * babar",
        " */",
        "bar;",
      ].join(eol),
    );

    ast.program.body.push(ast.program.body.shift());
    assert.strictEqual(
      recast.print(ast).code,
      [
        "// program comment",
        "/* barbara",
        " * babar",
        " */",
        "bar;",
        "",
        "{",
        "  foo;",
        "}",
      ].join(eol),
    );

    recast.visit(ast, {
      visitNode: function (path) {
        delete path.value.comments;
        this.traverse(path);
      },
    });
    assert.strictEqual(
      recast.print(ast).code,
      ["bar;", "", "{", "  foo;", "}"].join(eol),
    );

    ast.program.body[1] = ast.program.body[1].body[0];
    assert.strictEqual(recast.print(ast).code, ["bar;", "foo;"].join(eol));
  });

  pit("should preserve stray non-comment syntax", function () {
    const code = [
      "[",
      "  foo",
      "  , /* comma */",
      "  /* hole */",
      "  , /* comma */",
      "  bar",
      "]",
    ].join(eol);

    const ast = recast.parse(code, { parser });
    assert.strictEqual(recast.print(ast).code, code);

    const elems = ast.program.body[0].expression.elements;
    elems[0].comments.push(b.line(" line comment", true, false));
    assert.strictEqual(
      recast.print(ast).code,
      [
        "[",
        "  // line comment",
        "  foo /* comma */",
        "  /* hole */",
        "  ,",
        "  , /* comma */",
        "  bar",
        "]",
      ].join(eol),
    );
  });

  pit("should be reprinted even if dangling", function () {
    const code = "[/*dangling*/] // array literal";
    const ast = recast.parse(code, { parser });
    const array = ast.program.body[0].expression;
    const stmt = ast.program.body[0];
    let danglingComment: any;
    let trailingComment: any;

    function handleComment(comment: any) {
      if (comment.trailing) {
        trailingComment = comment;
      } else if (!comment.leading) {
        danglingComment = comment;
      }
    }

    (stmt.comments || []).forEach(handleComment);
    (stmt.expression.comments || []).forEach(handleComment);

    assert.strictEqual(danglingComment.leading, false);
    assert.strictEqual(danglingComment.trailing, false);

    assert.strictEqual(trailingComment.leading, false);
    assert.strictEqual(trailingComment.trailing, true);

    danglingComment.value = " neither leading nor trailing ";
    assert.strictEqual(
      recast.print(ast).code,
      ["[/* neither leading nor trailing */] // array literal"].join(eol),
    );

    trailingComment.value = " trailing";
    assert.strictEqual(
      recast.print(ast).code,
      ["[/* neither leading nor trailing */] // trailing"].join(eol),
    );

    // Unfortuantely altering the elements of the array leads to
    // reprinting which blows away the dangling comment.
    array.elements.push(b.literal(1));
    assert.strictEqual(recast.print(ast).code, "[1] // trailing");
  });

  pit("should attach to program.body[0] instead of program", function () {
    const code = [
      "// comment 1",
      "var a;",
      "// comment 2",
      "var b;",
      "if (true) {",
      "  // comment 3",
      "  var c;",
      "}",
    ].join("\n");

    const ast = recast.parse(code, { parser });

    assert.ok(!ast.program.comments);

    const aDecl = ast.program.body[0];
    n.VariableDeclaration.assert(aDecl);
    assert.strictEqual(aDecl.comments.length, 1);
    assert.strictEqual(aDecl.comments[0].leading, true);
    assert.strictEqual(aDecl.comments[0].trailing, false);
    assert.strictEqual(aDecl.comments[0].value, " comment 1");

    const bDecl = ast.program.body[1];
    n.VariableDeclaration.assert(bDecl);
    assert.strictEqual(bDecl.comments.length, 1);
    assert.strictEqual(bDecl.comments[0].leading, true);
    assert.strictEqual(bDecl.comments[0].trailing, false);
    assert.strictEqual(bDecl.comments[0].value, " comment 2");

    const cDecl = ast.program.body[2].consequent.body[0];
    n.VariableDeclaration.assert(cDecl);
    assert.strictEqual(cDecl.comments.length, 1);
    assert.strictEqual(cDecl.comments[0].leading, true);
    assert.strictEqual(cDecl.comments[0].trailing, false);
    assert.strictEqual(cDecl.comments[0].value, " comment 3");
  });

  pit("should not collapse multi line function definitions", function () {
    const code = [
      "var obj = {",
      "  a(",
      "    /*before*/ param",
      "  ) /*after*/ {",
      "  },",
      "};",
    ].join(eol);

    const ast = recast.parse(code, { parser });
    const printer = new Printer({
      tabWidth: 2,
    });

    assert.strictEqual(printer.print(ast).code, code);
  });

  pit("should be pretty-printable in illegal positions", function () {
    const code = [
      "var sum = function /*anonymous*/(/*...args*/) /*int*/ {",
      "  // TODO",
      "};",
    ].join(eol);

    const ast = recast.parse(code, { parser });
    const funExp = ast.program.body[0].declarations[0].init;
    n.FunctionExpression.assert(funExp);

    funExp.original = null;

    const comments = funExp.body.comments;
    assert.strictEqual(comments.length, 4);
    funExp.id = comments.shift();
    funExp.params.push(comments.shift());
    funExp.body.body.push(comments.pop());

    assert.strictEqual(recast.print(ast).code, code);
  });

  pit(
    "should preserve correctness when a return expression has a comment",
    function () {
      const code = ["function f() {", "  return 3;", "}"].join(eol);

      const ast = recast.parse(code, { parser });
      ast.program.body[0].body.body[0].argument.comments = [b.line("Foo")];

      assert.strictEqual(
        recast.print(ast).code,
        [
          "function f() {",
          "  return (",
          "    //Foo",
          "    3",
          "  );",
          "}",
        ].join(eol),
      );
    },
  );

  pit(
    "should wrap in parens when the return expression has nested leftmost comment",
    function () {
      const code = ["function f() {", "  return 1 + 2;", "}"].join(eol);

      const ast = recast.parse(code, { parser });
      ast.program.body[0].body.body[0].argument.left.comments = [b.line("Foo")];

      assert.strictEqual(
        recast.print(ast).code,
        [
          "function f() {",
          "  return (",
          "    //Foo",
          "    1 + 2",
          "  );",
          "}",
        ].join(eol),
      );
    },
  );

  pit(
    "should not wrap in parens when the return expression has an interior comment",
    function () {
      const code = ["function f() {", "  return 1 + 2;", "}"].join(eol);

      const ast = recast.parse(code, { parser });
      ast.program.body[0].body.body[0].argument.right.comments = [
        b.line("Foo"),
      ];

      assert.strictEqual(
        recast.print(ast).code,
        ["function f() {", "  return 1 + //Foo", "  2;", "}"].join(eol),
      );
    },
  );

  pit("should correctly handle a lonesome comment (alt 1)", function () {
    const code = ["", "// boo", ""].join(eol);

    const ast = recast.parse(code);

    assert.strictEqual(recast.print(ast).code, ["", "// boo", ""].join(eol));
  });

  pit(
    "should correctly handle a not-so-lonesome comment (alt 2 - trailing whitespace)",
    function () {
      const code = ["", "// boo ", ";"].join(eol);

      const ast = recast.parse(code);

      assert.strictEqual(
        recast.print(ast).code,
        ["", "// boo ", ";"].join(eol),
      );
    },
  );

  pit(
    "should correctly handle a lonesome comment (alt 3 - trailing whitespace)",
    function () {
      const code = ["", "// boo ", ""].join(eol);

      const ast = recast.parse(code);

      assert.strictEqual(recast.print(ast).code, ["", "// boo ", ""].join(eol));
    },
  );

  pit(
    "should not reformat a return statement that is not modified",
    function () {
      const code = [
        "function f() {",
        "  return      {",
        "    a:     1,",
        "    b: 2,",
        "  };",
        "}",
      ].join(eol);

      const ast = recast.parse(code, { parser });

      assert.strictEqual(recast.print(ast).code, code);
    },
  );

  pit(
    "should correctly handle a removing the argument from a return",
    function () {
      const code = ["function f() {", "  return 'foo';", "}"].join(eol);

      const ast = recast.parse(code, { parser });
      ast.program.body[0].body.body[0].argument = null;

      assert.strictEqual(
        recast.print(ast).code,
        ["function f() {", "  return;", "}"].join(eol),
      );
    },
  );

  pit("should preserve comments attached to EmptyStatement", function () {
    const code = [
      "removeThisStatement;",
      "// comment",
      ";(function() {})();",
    ].join(eol);

    const ast = recast.parse(code, { parser });
    ast.program.body.shift();

    assert.strictEqual(
      recast.print(ast).code,
      ["// comment", ";(function() {})();"].join(eol),
    );
  });

  pit(
    "should preserve comments attached to CallExpression argument",
    function () {
      const code = "testFunc (/** @type {string} */ (a), b);";
      const ast = recast.parse(code, { parser });
      const args = ast.program.body[0].expression.arguments;

      args.unshift(args[1]);
      const expected = "testFunc(b, /** @type {string} */ a, b);";

      assert.strictEqual(recast.print(ast).code, expected);
    },
  );

  pit("should preserve comments attached: no enclosed", function () {
    const code = [
      "hello.world; // has computed value",
      'hello["world"]; // has computed value',
    ].join(eol);

    const ast = recast.parse(code, { parser });

    const expected = [
      "hello.world; // has computed value",
      'hello["world"]; // has computed value',
    ].join(eol);

    assert.strictEqual(recast.print(ast).code, expected);
  });
}
