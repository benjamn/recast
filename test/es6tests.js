var assert = require("assert");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var types = require("../lib/types");
var n = types.namedTypes;
var b = types.builders;
var eol = require("os").EOL;

describe("ES6 Compatability", function() {
    function convertShorthandMethod() {
        var printer = new Printer({ tabWidth: 2 });

        var code = [
            "var name='test-name';",
            "var shorthandObj = {",
            "  name,",
            "  func() { return 'value'; }",
            "};"
        ].join(eol);

        var ast = parse(code);
        n.VariableDeclaration.assert(ast.program.body[1]);

        var shorthandObjDec = ast.program.body[1].declarations[0].init;
        var methodDecProperty = shorthandObjDec.properties[1];
        var newES5MethodProperty = b.property(
            methodDecProperty.kind,
            methodDecProperty.key,
            methodDecProperty.value,
            false,
            false
        );

        var correctMethodProperty = b.property(
            methodDecProperty.kind,
            methodDecProperty.key,
            b.functionExpression(
                methodDecProperty.value.id,
                methodDecProperty.value.params,
                methodDecProperty.value.body,
                methodDecProperty.value.generator,
                methodDecProperty.value.expression
            ),
            false,
            false
        );

        assert.strictEqual(
            printer.print(newES5MethodProperty).code,
            printer.print(correctMethodProperty).code
        );
    }

    it("correctly converts from a shorthand method to ES5 function",
       convertShorthandMethod);

    function respectDestructuringAssignment() {
        var printer = new Printer({ tabWidth: 2 });
        var code = 'var {a} = {};';
        var ast = parse(code);
        n.VariableDeclaration.assert(ast.program.body[0]);
        assert.strictEqual(printer.print(ast).code, code);
    }

    it("respects destructuring assignments",
       respectDestructuringAssignment);
});

describe("import/export syntax", function() {
    var printer = new Printer({ tabWidth: 2 });

    function check(source) {
        var ast1 = parse(source);
        var ast2 = parse(printer.printGenerically(ast1).code);
        types.astNodesAreEquivalent.assert(ast1, ast2);
    }

    it("should parse and print import statements correctly", function() {
        check("import foo from 'foo'");

        // default imports
        check("import foo from 'foo';");
        check("import {default as foo} from 'foo';");

        // named imports
        check("import {bar} from 'foo';");
        check("import {bar, baz} from 'foo';");
        check("import {bar as baz} from 'foo';");
        check("import {bar as baz, xyz} from 'foo';");

        // glob imports
        check("import * as foo from 'foo';");

        // mixing imports
        check("import foo, {baz as xyz} from 'foo';");
        check("import foo, * as bar from 'foo';");

        // just import
        check("import 'foo';");
    });

    it("should parse and print export statements correctly", function() {
        // default exports
        check("export default 42;");
        check("export default {};");
        check("export default [];");
        check("export default foo;");
        check("export default function () {}");
        check("export default class {}");
        check("export default function foo () {}");
        check("export default class foo {}");

        // variables exports
        check("export var foo = 1;");
        check("export var foo = function () {};");
        check("export var bar;"); // lazy initialization
        check("export let foo = 2;");
        check("export let bar;"); // lazy initialization
        check("export const foo = 3;");
        check("export function foo () {}");
        check("export class foo {}");

        // named exports
        check("export {foo};");
        check("export {foo, bar};");
        check("export {foo as bar};");
        check("export {foo as default};");
        check("export {foo as default, bar};");

        // exports from
        check("export * from 'foo';");
        check("export {foo} from 'foo';");
        check("export {foo, bar} from 'foo';");
        check("export {foo as bar} from 'foo';");
        check("export {foo as default} from 'foo';");
        check("export {foo as default, bar} from 'foo';");
        check("export {default} from 'foo';");
        check("export {default as foo} from 'foo';");
    });

    it("should forbid invalid import/export syntax", function() {
        function checkInvalid(source, expectedMessage) {
            try {
                parse(source);
                throw new Error("Parsing should have failed: " +
                                JSON.stringify(source));
            } catch (err) {
                assert.strictEqual(err.message, "Line 1: " + expectedMessage);
            }
        }

        // const variables must have an initializer
        checkInvalid(
            "export const bar;",
            "Unexpected token ;"
        );

        // Unexpected token identifier, invalid named export syntax
        checkInvalid(
            "export foo;",
            "Unexpected identifier"
        );

        // Unexpected token (, use a function declaration instead
        checkInvalid(
            "export function () {}",
            "Unexpected token ("
        );

        // Unexpected token default
        checkInvalid(
            "export function default () {}",
            "Unexpected token default"
        );

        // Missing from after import
        checkInvalid(
            "import foo;",
            "Unexpected token ;"
        );

        // Missing from after import
        checkInvalid(
            "import { foo, bar };",
            "Unexpected token ;"
        );

        // Invalid module specifier
        checkInvalid(
            "import foo from bar;",
            "Unexpected token"
        );

        // Unexpected token default
        checkInvalid(
            "import default from 'foo';",
            "Unexpected token default"
        );

        // Unexpected token from
        checkInvalid(
            "export default from 'foo';",
            "Unexpected token from"
        );

        // Missing from after export
        checkInvalid(
            "export {default};",
            "Unexpected token ;"
        );

        // Missing from after export
        checkInvalid(
            "export *;",
            "Unexpected token ;"
        );

        // Missing from after import
        checkInvalid(
            "import {default as foo};",
            "Unexpected token ;"
        );

        // Missing as after import *
        checkInvalid(
            "import * from 'foo';",
            "Unexpected token"
        );

        // Unexpected token =
        checkInvalid(
            "export default = 42;",
            "Unexpected token ="
        );

        // Unexpected token default
        checkInvalid(
            "import {bar as default} from 'foo';",
            "Unexpected token default"
        );

        // Unexpected token ,
        checkInvalid(
            "import foo, * as bar, {baz as xyz} from 'foo';",
            "Unexpected token ,"
        );

        // Unexpected token ,
        checkInvalid(
            "import {bar}, foo from 'foo';",
            "Unexpected token ,"
        );

        // Unexpected token ,
        checkInvalid(
            "import {bar}, * as foo from 'foo';",
            "Unexpected token ,"
        );

        // Unexpected token ,
        checkInvalid(
            "import foo, {bar}, foo from 'foo';",
            "Unexpected token ,"
        );

        // Unexpected token ,
        checkInvalid(
            "import {bar}, {foo} from 'foo';",
            "Unexpected token ,"
        );

        // Unexpected token ,
        checkInvalid(
            "import * as bar, {baz as xyz} from 'foo';",
            "Unexpected token ,"
        );
    });

    it("should pretty-print template strings with backticks", function() {
        var code = [
            'var noun = "fool";',
            'var s = `I am a ${noun}`;',
            'var t = tag`You said: ${s}!`;'
        ].join(eol);

        var ast = parse(code);

        assert.strictEqual(
            new Printer({
                tabWidth: 2
            }).printGenerically(ast).code,
            code
        );
    });
});
