import assert from "assert";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import types from "../lib/types";
import { EOL as eol } from "os";

describe("type syntax", function() {
  var printer = new Printer({ tabWidth: 2, quote: 'single', flowObjectCommas: false });
  var esprimaParserParseOptions = {
    parser: require("esprima-fb")
  };
  var flowParserParseOptions = {
    parser: require("flow-parser")
  };

  function check(source: string, parseOptions?: any) {
    parseOptions = parseOptions || esprimaParserParseOptions;
    var ast1 = parse(source, parseOptions);
    var code = printer.printGenerically(ast1).code;
    var ast2 = parse(code, parseOptions);
    types.astNodesAreEquivalent.assert(ast1, ast2);
    assert.strictEqual(source, code);
  }

  it("should parse and print type annotations correctly", function() {
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
    check("type A = {" + eol + "  ...B;" + eol + "  optionalNumber?: number;" + eol + "};", flowParserParseOptions);
    check("type A = {| optionalNumber?: number |};", flowParserParseOptions);
    check("type A = {|" + eol + "  ...B;" + eol + "  optionalNumber?: number;" + eol + "|};", flowParserParseOptions);

    // Opaque types
    check("opaque type A = B;", flowParserParseOptions);
    check("opaque type A = B.C;", flowParserParseOptions);
    check("opaque type A = { optionalNumber?: number };", flowParserParseOptions);
    check("opaque type A: X = B;", flowParserParseOptions);
    check("opaque type A: X.Y = B.C;", flowParserParseOptions);
    check("opaque type A: { stringProperty: string } = {" + eol + "  stringProperty: string;" + eol + "  optionalNumber?: number;" + eol + "};", flowParserParseOptions);
    check("opaque type A<T>: X<T> = B<T>;", flowParserParseOptions);
    check("opaque type A<T>: X.Y<T> = B.C<T>;", flowParserParseOptions);
    check("opaque type A<T>: { optional?: T } = {" + eol + "  stringProperty: string;" + eol + "  optional?: T;" + eol + "};", flowParserParseOptions);

    // Generic
    check("var a: Array<Foo>;");
    check("var a: number[];");

    // Return types
    check("function a(): number {}");
    check("var a: () => X = fn;");

    // Object
    check("var a: {" + eol + "  b: number;" + eol + "  x: { y: A };" + eol + "};");
    check("var b: { [key: string]: number };")
    check("var c: { (): number };")
    check("var d: {" + eol + "  [key: string]: A;" + eol + "  [key: number]: B;" + eol + "  (): C;" + eol + "  a: D;" + eol + "};")

    // Casts
    check("(1 + 1: number);");

    // Declare
    check("declare var A: string;");

    check("declare function foo(c: C): void;");
    check("declare function foo(c: C, b: B): void;");
    check("declare function foo(c: (e: Event) => void, b: B): void;");
    check("declare function foo(c: C, d?: Array<D>): void;");
    check("declare class C { x: string }");
    check("declare module M {" + eol + "  declare function foo(c: C): void;" + eol + "}");

    check("declare opaque type A;", flowParserParseOptions);
    check("declare opaque type A: X;", flowParserParseOptions);
    check("declare opaque type A: X.Y;", flowParserParseOptions);
    check("declare opaque type A: { stringProperty: string };", flowParserParseOptions);
    check("declare opaque type A<T>: X<T>;", flowParserParseOptions);
    check("declare opaque type A<T>: X.Y<T>;", flowParserParseOptions);
    check("declare opaque type A<T>: { property: T };", flowParserParseOptions);

    // Classes
    check("class A {" + eol + "  a: number;" + eol + "}");
    check("class A {" + eol + "  foo(a: number): string {}" + eol + "}");
    check("class A {" + eol + "  static foo(a: number): string {}" + eol + "}");

    // Type parameters
    check("class A<T> {}");
    check("class A<X, Y> {}");
    check("class A<X> extends B<Y> {}");
    check("function a<T>(y: Y<T>): T {}");
    check("class A {" + eol + "  foo<T>(a: number): string {}" + eol + "}");

    // Interfaces
    check("interface A<X> extends B<A>, C { a: number }");
    check("class A extends B implements C<T>, Y {}");

    // Bounded polymorphism
    check("class A<T: number> {}");
  });
});
