"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var parser_1 = require("../lib/parser");
var printer_1 = require("../lib/printer");
var types = __importStar(require("ast-types"));
var os_1 = require("os");
describe("type syntax", function () {
    var printer = new printer_1.Printer({ tabWidth: 2, quote: 'single', flowObjectCommas: false });
    var esprimaParserParseOptions = {
        parser: require("esprima-fb")
    };
    var flowParserParseOptions = {
        parser: require("flow-parser")
    };
    function check(source, parseOptions) {
        parseOptions = parseOptions || esprimaParserParseOptions;
        var ast1 = parser_1.parse(source, parseOptions);
        var code = printer.printGenerically(ast1).code;
        var ast2 = parser_1.parse(code, parseOptions);
        types.astNodesAreEquivalent.assert(ast1, ast2);
        assert_1.default.strictEqual(source, code);
    }
    it("should parse and print type annotations correctly", function () {
        // Import type annotations
        check("import type foo from 'foo';");
        check("import typeof foo from 'foo';");
        check("import { type foo } from 'foo';", flowParserParseOptions);
        // Export type annotations
        check("export type { foo };");
        // Scalar type annotations
        check("var a: number;");
        check("var a: number = 5;");
        check("var a: any;");
        check("var a: boolean;");
        check("var a: string;");
        check("var a: 'foo';");
        check("var a: void;");
        // Nullable
        check("var a: ?number;");
        // Unions & Intersections
        check("var a: number | string | boolean = 26;");
        check("var a: number & string & boolean = 26;");
        // Types
        check("var a: A = 5;");
        // TODO!?
        check("var a: typeof A;");
        // Type aliases
        check("type A = B;");
        check("type A = B.C;");
        check("type A = { optionalNumber?: number };");
        check("type A = {" + os_1.EOL + "  ...B;" + os_1.EOL + "  optionalNumber?: number;" + os_1.EOL + "};", flowParserParseOptions);
        check("type A = {| optionalNumber?: number |};", flowParserParseOptions);
        check("type A = {|" + os_1.EOL + "  ...B;" + os_1.EOL + "  optionalNumber?: number;" + os_1.EOL + "|};", flowParserParseOptions);
        // Opaque types
        check("opaque type A = B;", flowParserParseOptions);
        check("opaque type A = B.C;", flowParserParseOptions);
        check("opaque type A = { optionalNumber?: number };", flowParserParseOptions);
        check("opaque type A: X = B;", flowParserParseOptions);
        check("opaque type A: X.Y = B.C;", flowParserParseOptions);
        check("opaque type A: { stringProperty: string } = {" + os_1.EOL + "  stringProperty: string;" + os_1.EOL + "  optionalNumber?: number;" + os_1.EOL + "};", flowParserParseOptions);
        check("opaque type A<T>: X<T> = B<T>;", flowParserParseOptions);
        check("opaque type A<T>: X.Y<T> = B.C<T>;", flowParserParseOptions);
        check("opaque type A<T>: { optional?: T } = {" + os_1.EOL + "  stringProperty: string;" + os_1.EOL + "  optional?: T;" + os_1.EOL + "};", flowParserParseOptions);
        // Generic
        check("var a: Array<Foo>;");
        check("var a: number[];");
        // Return types
        check("function a(): number {}");
        check("var a: () => X = fn;");
        // Object
        check("var a: {" + os_1.EOL + "  b: number;" + os_1.EOL + "  x: { y: A };" + os_1.EOL + "};");
        check("var b: { [key: string]: number };");
        check("var c: { (): number };");
        check("var d: {" + os_1.EOL + "  [key: string]: A;" + os_1.EOL + "  [key: number]: B;" + os_1.EOL + "  (): C;" + os_1.EOL + "  a: D;" + os_1.EOL + "};");
        // Casts
        check("(1 + 1: number);");
        // Declare
        check("declare var A: string;");
        check("declare function foo(c: C): void;");
        check("declare function foo(c: C, b: B): void;");
        check("declare function foo(c: (e: Event) => void, b: B): void;");
        check("declare function foo(c: C, d?: Array<D>): void;");
        check("declare class C { x: string }");
        check("declare module M {" + os_1.EOL + "  declare function foo(c: C): void;" + os_1.EOL + "}");
        check("declare opaque type A;", flowParserParseOptions);
        check("declare opaque type A: X;", flowParserParseOptions);
        check("declare opaque type A: X.Y;", flowParserParseOptions);
        check("declare opaque type A: { stringProperty: string };", flowParserParseOptions);
        check("declare opaque type A<T>: X<T>;", flowParserParseOptions);
        check("declare opaque type A<T>: X.Y<T>;", flowParserParseOptions);
        check("declare opaque type A<T>: { property: T };", flowParserParseOptions);
        // Classes
        check("class A {" + os_1.EOL + "  a: number;" + os_1.EOL + "}");
        check("class A {" + os_1.EOL + "  foo(a: number): string {}" + os_1.EOL + "}");
        check("class A {" + os_1.EOL + "  static foo(a: number): string {}" + os_1.EOL + "}");
        // Type parameters
        check("class A<T> {}");
        check("class A<X, Y> {}");
        check("class A<X> extends B<Y> {}");
        check("function a<T>(y: Y<T>): T {}");
        check("class A {" + os_1.EOL + "  foo<T>(a: number): string {}" + os_1.EOL + "}");
        // Interfaces
        check("interface A<X> extends B<A>, C { a: number }");
        check("class A extends B implements C<T>, Y {}");
        // Bounded polymorphism
        check("class A<T: number> {}");
        // Inexact object types
        check("type InexactFoo = { foo: number; ... };", flowParserParseOptions);
        check([
            "type MultiLineInexact = {",
            "  reallyLongPropertyNameOyezOyezOyezFiddlyFeeDiDumDeDoo: VeryLongTypeName<With, Generic, Type, Parameters>;",
            "  somewhatShorterButStillNotVeryShortPropertyName: string;",
            "  ...",
            "};"
        ].join(os_1.EOL), flowParserParseOptions);
    });
});
