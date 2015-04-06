var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var types = require("../lib/types");

describe("JSX Compatability", function() {
    var printer = new Printer({ tabWidth: 2 });

    function check(source) {
        var ast1 = parse(source);
        var ast2 = parse(printer.printGenerically(ast1).code);
        types.astNodesAreEquivalent.assert(ast1, ast2);
    }

    it("should parse and print attribute comments", function() {
        check("<b /* comment */ />");
        check("<b /* multi\nline\ncomment */ />");
    });

    it("should parse and print child comments", function() {
        check("<b>{/* comment */}</b>");
        check("<b>{/* multi\nline\ncomment */}</b>");
    });

    it("should parse and print literal attributes", function() {
        check("<b className=\"hello\" />");
    });

    it("should parse and print expression attributes", function() {
        check("<b className={classes} />");
    });

    it("should parse and print chidren", function() {
        check("<label><input /></label>");
    });

    it("should parse and print literal chidren", function() {
        check("<b>hello world</b>");
    });

    it("should parse and print expression children", function() {
        check("<b>{this.props.user.name}</b>");
    });

    it("should parse and print namespaced elements", function() {
        check("<Foo.Bar />");
    });
});
