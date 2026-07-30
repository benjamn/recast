import path from "path";
import fs from "fs";
import assert from "assert";
import * as recast from "../main";
import * as babelParser from "../parsers/babel";

const source = fs.readFileSync(
  path.join(__dirname, "data", "backbone.js"),
  "utf8",
);

const start = +new Date();
const ast = recast.parse(source);
const types = Object.create(null);

const parseTime = +new Date() - start;
console.log("parse", parseTime, "ms");

recast.visit(ast, {
  visitNode: function (path) {
    types[path.value.type] = true;
    this.traverse(path);
  },
});

const visitTime = +new Date() - start - parseTime;
console.log("visit", visitTime, "ms");

recast.prettyPrint(ast).code;

const printTime = +new Date() - start - visitTime - parseTime;
console.log("print", printTime, "ms");

console.log("total", +new Date() - start, "ms");

// TreeCopier.findTokenRange finds each node's tokens by scanning outward from
// the token range of the node it just finished copying, so the total number of
// token lookups has to stay proportional to the number of tokens in the file.
// If the scan ever restarts from an enclosing node's range instead, siblings
// rescan their parent's whole span and the cost becomes quadratic: a 2.6MB
// bundle took ~120s to parse that way, versus ~1.5s (see #1399).
//
// This counts lookups instead of measuring elapsed time so the result is exact
// and identical on every machine.
describe("parse token scanning", function () {
  function tokenLookupsPerToken(source: string) {
    let lookups = 0;
    const ast = recast.parse(source, {
      parser: {
        parse(source: string) {
          const ast: any = babelParser.parse(source);
          ast.tokens = new Proxy(ast.tokens, {
            get(tokens, key, receiver) {
              // Indexed reads during parse() come from findTokenRange's scans,
              // plus one pass over the array in recast's own parse().
              if (typeof key === "string" && key >= "0" && key <= "9") {
                lookups++;
              }
              return Reflect.get(tokens, key, receiver);
            },
          });
          return ast;
        },
      },
    });
    return lookups / ast.tokens.length;
  }

  // One long function body, which is the shape that made the scanning quadratic.
  function bigFunction(statementCount: number) {
    let source = "function big() {\n";
    for (let i = 0; i < statementCount; ++i) {
      source += `  var v${i} = f(a${i}, b${i}) + g(c${i}, d${i});\n`;
    }
    return source + "}\n";
  }

  const small = tokenLookupsPerToken(bigFunction(250));
  const large = tokenLookupsPerToken(bigFunction(1000));

  it("does not rescan tokens as files grow", function () {
    // Linear scanning holds this ratio at 1; quadratic scanning makes the
    // larger file cost ~4x as much per token.
    assert.ok(
      large / small < 1.5,
      `token lookups per token grew ${(large / small).toFixed(
        2,
      )}x between a 250- and a 1000-statement function ` +
        `(${small.toFixed(1)} -> ${large.toFixed(
          1,
        )}), which means scanning is superlinear`,
    );
  });

  it("scans a bounded number of tokens per token", function () {
    assert.ok(
      large < 50,
      `${large.toFixed(1)} token lookups per token is far above the ~14 needed`,
    );
  });
});
