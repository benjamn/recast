import assert from "assert";
import fs from "fs";
import path from "path";
import types from "../lib/types";
import { parse } from "../lib/parser";
var hasOwn = Object.prototype.hasOwnProperty;

// Babel 7 no longer supports Node 4 or 5.
var nodeMajorVersion = parseInt(process.versions.node, 10);
(nodeMajorVersion >= 6 ? describe : xdescribe)
("syntax", function() {
  // Make sure we handle all possible node types in Syntax, and no additional
  // types that are not present in Syntax.
  it("Completeness", function(done) {
    var printer = path.join(__dirname, "../lib/printer.ts");

    fs.readFile(printer, "utf-8", function(err, data) {
      assert.ok(!err);

      var ast = parse(data, { parser: require("../parsers/typescript") });
      assert.ok(ast);

      var typeNames: { [name: string]: string } = {};
      types.visit(ast, {
        visitFunctionDeclaration(path) {
          var decl = path.node;
          if (types.namedTypes.Identifier.check(decl.id) &&
              decl.id.name === "genericPrintNoParens") {
            this.traverse(path, {
              visitSwitchCase(path) {
                var test = path.node.test;
                if (test &&
                    test.type === "StringLiteral" &&
                    typeof test.value === "string") {
                  var name = test.value;
                  typeNames[name] = name;
                }
                return false;
              }
            });
          } else {
            this.traverse(path);
          }
        }
      });

      for (var name in types.namedTypes) {
        if (hasOwn.call(types.namedTypes, name)) {
          assert.ok(hasOwn.call(typeNames, name), "unhandled type: " + name);
          assert.strictEqual(name, typeNames[name]);
          delete typeNames[name];
        }
      }

      done();
    });
  });
});
