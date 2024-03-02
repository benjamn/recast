import assert from "assert";
import fs from "fs";
import path from "path";
import * as types from "ast-types";
import { parse } from "../lib/parser";
const hasOwn = Object.prototype.hasOwnProperty;

// Babel 7 no longer supports Node 4 or 5.
const nodeMajorVersion = parseInt(process.versions.node, 10);
(nodeMajorVersion >= 6 ? describe : xdescribe)("Syntax", function () {
  // Make sure the pretty-printer can print all node types currently provided by
  // types.namedTypes.
  describe("Pretty-printer switch (node.type) cases implemented", function () {
    const printer = path.join(__dirname, "../lib/printer.ts");
    const data = fs.readFileSync(printer, "utf-8");
    const ast = parse(data, { parser: require("../parsers/typescript") });
    const typeNames: { [name: string]: string } = {};

    types.visit(ast, {
      visitFunctionDeclaration(path) {
        const decl = path.node;
        if (
          types.namedTypes.Identifier.check(decl.id) &&
          decl.id.name === "genericPrintNoParens"
        ) {
          this.traverse(path, {
            visitSwitchCase(path) {
              const test = path.node.test;
              if (
                test &&
                test.type === "StringLiteral" &&
                typeof test.value === "string"
              ) {
                const name = test.value;
                typeNames[name] = name;
              }
              return false;
            },
          });
        } else {
          this.traverse(path);
        }
      },
    });

    Object.keys(types.namedTypes).forEach((name) => {
      it(name, () => {
        assert.ok(hasOwn.call(typeNames, name), "unhandled type: " + name);
        assert.strictEqual(name, typeNames[name]);
        delete typeNames[name];
      });
    });
  });
});
