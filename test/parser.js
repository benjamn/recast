var Parser = require("../lib/parser").Parser,
    Printer = require("../lib/printer").Printer,
    Visitor = require("../lib/visitor").Visitor,
    Syntax = require("../lib/syntax"),
    printComment = require("../lib/comments").print,
    linesModule = require("../lib/lines");

// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.

function testParser(t, assert) {
    var code = testParser + "",
        parser = new Parser(code),
        ast = parser.getAst();

    assert.strictEqual(ast.type, Syntax.File);
    assert.ok(parser.getReprinter(ast));

    var funDecl = ast.program.body[0],
        funBody = funDecl.body;

    assert.strictEqual(funDecl.type, Syntax.FunctionDeclaration);
    assert.strictEqual(funBody.type, Syntax.BlockStatement);
    assert.ok(parser.getReprinter(funBody));

    var lastStatement = funBody.body.pop(),
        tFinish = lastStatement.expression;

    assert.ok(!parser.getReprinter(funBody));
    assert.ok(parser.getReprinter(ast));

    funBody.body.push(lastStatement);
    assert.ok(parser.getReprinter(funBody));

    assert.strictEqual(tFinish.callee.object.name, "t");
    assert.strictEqual(tFinish.callee.property.name, "finish");

    assert.ok(lastStatement.comments);
    assert.ok(lastStatement.comments instanceof Array);
    assert.strictEqual(lastStatement.comments.length, 2);

    var printedComments = lastStatement.comments.map(printComment),
        joinedComments = linesModule.fromString("\n").join(printedComments),
        printedComments = joinedComments.toString();

    assert.strictEqual(joinedComments.length, 2);
    assert.strictEqual(printedComments.indexOf("Make sure"), 3);

    // Make sure t.finish() remains the final statement in this function,
    // or the above assertions will probably fail.
    t.finish();
}
exports.testParser = testParser;

function testLocationFixer(t, assert) {
    var code = [
        "function foo() {",
        "    a()",
        "    b()",
        "}"].join("\n");
        parser = new Parser(code),
        printer = new Printer(parser),
        ast = parser.getAst();

    new FunctionBodyReverser().visit(ast);

    var altered = code
        .replace("a()", "xxx")
        .replace("b()", "a()")
        .replace("xxx", "b()");

    assert.strictEqual(altered, printer.print(ast).toString());

    t.finish();
}
exports.testLocationFixer = testLocationFixer;

var FunctionBodyReverser = Visitor.extend({
    visitFunctionDeclaration: function(expr) {
        expr.body.body.reverse();
    }
});
