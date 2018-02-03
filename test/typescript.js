var assert = require("assert");
var recast = require("../main.js");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var types = require("../lib/types");
var eol = require("os").EOL;

var babylon = require("babylon");

describe("TypeScript", function() {
  var babylonOptions = {
    plugins: ['jsx', 'typescript']
  }

  var parser = {
    parse(source) {
      return babylon.parse(source, babylonOptions);
    }
  }

  var parseOptions = { parser };

  it('basic printing', function() {
    function check(lines) {
      var code = lines.join(eol);
      var ast = recast.parse(code, parseOptions);
      var output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
      assert.strictEqual(output, code);
    }

    check([
      'type A = number;',
      'type A = string;',
      'type A = never;',
      'type A = any;'
    ]);

    check([
      'type A = "cat" | "dog" | "bird";'
    ]);

    check([
      'type A<T, U> = {u: "cat", x: number, y: T, z: U};'
    ]);

    check([
      'type F = <T, U>(a: string, b: {y: T, z: U}) => void;'
    ]);

    check([
      'const a = b as U as V;'
    ]);

    check([
      'class C<T> extends B {',
      '  f(a: T) {',
      '    c(a as D);',
      '  }',
      '}'
    ]);
  });
});
