var assert = require("assert"),
    fs = require("fs"),
    path = require("path");

function identity(ast, callback) {
    debugger;
    callback(ast);
}

function testFile(t, path) {
    fs.readFile(path, "utf-8", function(err, source) {
        assert.ok(!err);
        assert.ok(source);

        require("recast").runString(source, identity, {
            writeback: function(code) {
                assert.ok(code);
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
addTest("test/lines");
addTest("lib/lines");
addTest("lib/printer");
