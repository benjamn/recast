var assert = require("assert");
var fs = require("fs");
var path = require("path");
var eol = require("os").EOL;
var types = require("../lib/types");
var main = require("../main");

function testFile(path, done) {
    fs.readFile(path, "utf-8", function(err, source) {
        source = source.replace(/\r?\n/g, eol);
        assert.equal(err, null);
        assert.strictEqual(typeof source, "string");

        var ast = main.parse(source);
        types.astNodesAreEquivalent.assert(ast.original, ast);
        var code = main.print(ast).code;
        assert.strictEqual(source, code);
        
        done();
    });
}

function addTest(name) {
    it(name, function(done) {
        testFile(path.join(__dirname, "..", name + ".js"), done);
    });
}

describe("identity", function() {
    // Add more tests here as need be.
    addTest("test/data/regexp-props");
    addTest("test/data/empty");
    addTest("test/data/backbone");
    addTest("test/lines");
    addTest("lib/lines");
    addTest("lib/printer");
});
