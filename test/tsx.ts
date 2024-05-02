"use strict";

const nodeMajorVersion = parseInt(process.versions.node, 10);
import * as parser from "../parsers/babel-ts";
import { EOL as eol } from "os";
import * as recast from "../main";
import assert from "assert";

(nodeMajorVersion >= 6 ? describe : xdescribe)(
  "Babel TSX Compatibility",
  function () {
    function check(lines: string[]) {
      const code = lines.join(eol);
      const ast = recast.parse(code, { parser });
      const output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
      assert.strictEqual(code, output);
    }

    it("should parse and print typed JSX elements", function () {
      check(["<Foo<Bar> />;"]);
    });
  },
);
