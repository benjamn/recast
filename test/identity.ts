import assert from "assert";
import fs from "fs";
import path from "path";
import * as types from "ast-types";
import * as recast from "../main";

function testFile(path: string, options: { parser?: any } = {}) {
  fs.readFile(path, "utf-8", function (err, source) {
    assert.equal(err, null);
    assert.strictEqual(typeof source, "string");

    const ast = recast.parse(source, options);
    types.astNodesAreEquivalent.assert(ast.original, ast);
    const code = recast.print(ast).code;
    assert.strictEqual(source, code);
  });
}

function addTest(name: string) {
  it(name, function () {
    const filename = path.join(__dirname, "..", name);

    if (path.extname(filename) === ".ts") {
      testFile(filename, { parser: require("../parsers/typescript") });
    } else {
      testFile(filename);
    }
  });
}

describe("identity", function () {
  // Add more tests here as need be.
  addTest("test/data/regexp-props.js");
  addTest("test/data/empty.js");
  addTest("test/data/backbone.js");
  addTest("test/lines.ts");
  addTest("lib/lines.ts");
  addTest("lib/printer.ts");
});
