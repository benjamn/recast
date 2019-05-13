import assert from "assert";
import fs from "fs";
import path from "path";
import * as types from "ast-types";
import main from "../main";

var nodeMajorVersion = parseInt(process.versions.node, 10);

function testFile(path: string, options: { parser?: any } = {}) {
    fs.readFile(path, "utf-8", function(err, source) {
        assert.equal(err, null);
        assert.strictEqual(typeof source, "string");

        var ast = main.parse(source, options);
        types.astNodesAreEquivalent.assert(ast.original, ast);
        var code = main.print(ast).code;
        assert.strictEqual(source, code);
    });
}

function addTest(name: string) {
    it(name, function() {
        var filename = path.join(__dirname, "..", name);

        if (path.extname(filename) === ".ts") {
            // Babel 7 no longer supports Node 4 and 5.
            if (nodeMajorVersion >= 6) {
                testFile(filename, { parser: require("../parsers/typescript") });
            }
        } else {
            testFile(filename);
        }
    });
}

describe("identity", function() {
    // Add more tests here as need be.
    addTest("test/data/regexp-props.js");
    addTest("test/data/empty.js");
    addTest("test/data/backbone.js");
    addTest("test/lines.ts");
    addTest("lib/lines.ts");
    addTest("lib/printer.ts");
});
