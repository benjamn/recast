var assert = require("assert");
var fs = require("fs");
var path = require("path");
var Syntax = require("../lib/types").Syntax;
var parse = require("../lib/parser").parse;
var Visitor = require("../lib/visitor").Visitor;

// Make sure we handle all possible node types in Syntax, and no additional
// types that are not present in Syntax.
exports.testCompleteness = function(t) {
    var printer = path.join(__dirname, "../lib/printer.js");

    fs.readFile(printer, "utf-8", function(err, data) {
        assert.ok(!err);

        var ast = parse(data);
        assert.ok(ast);

        var types = {};
        new GenericPrintVisitor(types).visit(ast);

        for (var name in Syntax) {
            if (Syntax.hasOwnProperty(name)) {
                assert.ok(types.hasOwnProperty(name), "unhandled type: " + name);
                assert.strictEqual(Syntax[name], types[name]);
                delete types[name];
            }
        }

        t.finish();
    });
};

var GenericPrintVisitor = Visitor.extend({
    init: function(types) {
        this.types = types;
    },

    visitFunctionDeclaration: function(decl) {
        if (decl.id &&
            decl.id.type === Syntax.Identifier &&
            decl.id.name === "genericPrintNoParens")
        {
            new CaseVisitor(this.types).visit(decl);
        }
    }
})

var CaseVisitor = Visitor.extend({
    init: function(types) {
        this.types = types;
    },

    visitSwitchCase: function(expr) {
        var test = expr.test;
        if (test &&
            test.type === "Literal" &&
            typeof test.value === "string")
        {
            var name = test.value;
            this.types[name] = Syntax[name];
        }
    }
});
