var assert = require("assert");
var fs = require("fs");
var path = require("path");
var util = require("../lib/util");

function identity(ast, callback) {
    assert.ok(ast.originalPath);
    var orig = ast.originalPath.node;
    assert.ok(util.deepEquivalent(orig, ast));
    callback(ast);
}

function testFile(t, path) {
    fs.readFile(path, "utf-8", function(err, source) {
        assert.equal(err, null);
        assert.strictEqual(typeof source, "string");

        require("../main").runString(source, identity, {
            writeback: function(code) {
                assert.strictEqual(source, code);
                t.finish();
            }
        });
    });
}

function addTest(name) {
    exports["test " + name] = function(t) {
        testFile(t, path.join(__dirname, "..", name + ".js"));
    };
}

// Add more tests here as need be.
addTest("test/data/regexp-props");
addTest("test/data/empty");
addTest("test/data/jquery-1.9.1");
addTest("test/lines");
addTest("lib/lines");
addTest("lib/printer");
