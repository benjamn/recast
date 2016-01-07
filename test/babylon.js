var assert = require("assert");
var recast = require("../main.js");
var n = recast.types.namedTypes;

describe("decorators", function () {
  var babylon = require("babylon");
  var babylonOptions = {
    sourceType: 'module',
    allowImportExportEverywhere: false,
    allowReturnOutsideFunction: false,
    plugins: [
      'asyncFunctions',
      'asyncGenerators',
      'classConstructorCall',
      'classProperties',
      'decorators',
      'doExpressions',
      'exponentiationOperator',
      'exportExtensions',
      'flow',
      'functionSent',
      'functionBind',
      'jsx',
      'objectRestSpread',
      'trailingFunctionCommas'
    ]
  };

  var parseOptions = {
    parser: {
      parse: function (source) {
        return babylon.parse(source, babylonOptions);
      }
    }
  };

  it("should not disappear when surrounding code changes", function () {
    var code = [
      'import foo from "foo";',
      'import React from "react";',
      '',
      '@component',
      '@callExpression({foo: "bar"})',
      'class DebugPanel extends React.Component {',
      '  render() {',
      '    return (',
      '      <div> test </div>',
      '    );',
      '  }',
      '}',
      '',
      'export default DebugPanel;',
    ].join("\n");

    var ast = recast.parse(code, parseOptions);

    assert.strictEqual(recast.print(ast).code, code);

    var root = new recast.types.NodePath(ast);
    var reactImportPath = root.get("program", "body", 1);
    n.ImportDeclaration.assert(reactImportPath.value);

    // Remove the second import statement.
    reactImportPath.prune();

    var reprinted = recast.print(ast).code;

    assert.ok(reprinted.match(/@component/));
    assert.ok(reprinted.match(/@callExpression/));

    assert.strictEqual(
      reprinted,
      code.split("\n").filter(function (line) {
        return ! line.match(/^import React from/);
      }).join("\n")
    );
  });
});
