import assert from "assert";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import * as types from "ast-types";
import { EOL as eol } from "os";

describe("type syntax", function () {
  const printer = new Printer({
    tabWidth: 2,
    quote: "single",
    flowObjectCommas: false,
  });
  const flowParserParseOptions = {
    parser: require("flow-parser"),
  };

  function checkEquiv(a: string, b: string) {
    const aAst = parse(a, flowParserParseOptions);
    const bAst = parse(b, flowParserParseOptions);
    types.astNodesAreEquivalent.assert(aAst, bAst);
  }

  function check(source: string, parseOptions?: any) {
    parseOptions = parseOptions || flowParserParseOptions;
    const ast1 = parse(source, parseOptions);
    const code = printer.printGenerically(ast1).code;
    const ast2 = parse(code, parseOptions);
    types.astNodesAreEquivalent.assert(ast1, ast2);
    assert.strictEqual(source, code);
  }

  it("should parse and print type annotations correctly", function () {
    // Import type annotations
    check("import type foo from 'foo';");
    check("import typeof foo from 'foo';");
    check("import { type foo } from 'foo';");

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
    check(
      "type A = {" +
        eol +
        "  ...B;" +
        eol +
        "  optionalNumber?: number;" +
        eol +
        "};",
    );
    check("type A = {| optionalNumber?: number |};");
    check(
      "type A = {|" +
        eol +
        "  ...B;" +
        eol +
        "  optionalNumber?: number;" +
        eol +
        "|};",
    );

    // Opaque types
    check("opaque type A = B;");
    check("opaque type A = B.C;");
    check("opaque type A = { optionalNumber?: number };");
    check("opaque type A: X = B;");
    check("opaque type A: X.Y = B.C;");
    check(
      "opaque type A: { stringProperty: string } = {" +
        eol +
        "  stringProperty: string;" +
        eol +
        "  optionalNumber?: number;" +
        eol +
        "};",
    );
    check("opaque type A<T>: X<T> = B<T>;");
    check("opaque type A<T>: X.Y<T> = B.C<T>;");
    check(
      "opaque type A<T>: { optional?: T } = {" +
        eol +
        "  stringProperty: string;" +
        eol +
        "  optional?: T;" +
        eol +
        "};",
    );

    // Generic
    check("var a: Array<Foo>;");
    check("var a: number[];");
    check("var a: <T>() => T;");

    // Return types
    check("function a(): number {}");
    check("var a: () => X = fn;");

    // Object
    check(
      "var a: {" + eol + "  b: number;" + eol + "  x: { y: A };" + eol + "};",
    );
    check("var b: { [key: string]: number };");
    check("var c: { (): number };");
    check(
      "var d: {" +
        eol +
        "  [key: string]: A;" +
        eol +
        "  [key: number]: B;" +
        eol +
        "  (): C;" +
        eol +
        "  a: D;" +
        eol +
        "};",
    );

    // Casts
    check("(1 + 1: number);");

    // Declare
    check("declare var A: string;");

    check("declare function foo(c: C): void;");
    check("declare function foo(c: C, b: B): void;");
    check("declare function foo(c: (e: Event) => void, b: B): void;");
    check("declare function foo(c: C, d?: Array<D>): void;");
    check("declare class C { x: string }");
    check(
      "declare module M {" +
        eol +
        "  declare function foo(c: C): void;" +
        eol +
        "}",
    );

    check("declare opaque type A;");
    check("declare opaque type A: X;");
    check("declare opaque type A: X.Y;");
    check("declare opaque type A: { stringProperty: string };");
    check("declare opaque type A<T>: X<T>;");
    check("declare opaque type A<T>: X.Y<T>;");
    check("declare opaque type A<T>: { property: T };");

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

    // Inexact object types
    check("type InexactFoo = { foo: number; ... };");
    check(
      [
        "type MultiLineInexact = {",
        "  reallyLongPropertyNameOyezOyezOyezFiddlyFeeDiDumDeDoo: VeryLongTypeName<With, Generic, Type, Parameters>;",
        "  somewhatShorterButStillNotVeryShortPropertyName: string;",
        "  ...",
        "};",
      ].join(eol),
    );

    // typeArguments
    check("new A<string>();");
    check("createPlugin<number>();");

    check("function myFunction([param1]: Params) {}");
  });

  it("can pretty-print [Optional]IndexedAccessType AST nodes", () => {
    check("type A = Obj?.['a'];");
    check("type B = Array<string>?.[number];");
    check("type C = Obj?.['bar']['baz'];");
    check("type D = (Obj?.['bar'])['baz'];");
    check("type C3 = Obj?.['foo']['bar']['baz'];");
    check("type D3 = (Obj?.['foo']['bar'])['baz'];");
    check("type E = Obj?.['bar'][];");
    check("type F = Obj?.['bar'][boolean][];");
    check("type G = Obj['bar']?.[boolean][];");
    check("type H = (Obj?.['bar'])[string][];");
    check("type I = Obj?.['bar']?.[string][];");

    // Since FastPath#needsParens does not currently add any parentheses to
    // these expressions, make sure they do not matter for parsing the AST.

    checkEquiv(
      "type F = (Obj?.['bar'])?.[string][];",
      "type F = Obj?.['bar']?.[string][];",
    );

    checkEquiv(
      "type F = (Obj['bar'])?.[string][];",
      "type F = Obj['bar']?.[string][];",
    );
  });

  it("parenthesizes correctly", () => {
    // The basic binary operators `&` and `|`.
    // `&` binds tighter than `|`
    check("type Num = number & (empty | mixed);"); // parens needed
    check("type Num = number | empty & mixed;"); // equivalent to `…|(…&…)`

    // Unary suffix `[]`, with the above.
    // `[]` binds tighter than `&` or `|`
    check("type T = (number | string)[];");
    check("type T = number | string[];"); // a union
    check("type T = (number & mixed)[];");
    check("type T = number & mixed[];"); // an intersection

    // Unary prefix `?`, with the above.
    // `?` binds tighter than `&` or `|`
    check("type T = ?(A & B);");
    check("type T = ?(A | B);");
    // `?` binds less tightly than `[]`
    check("type T = (?number)[];"); // array of nullable
    check("type T = ?number[];"); // nullable of array

    // (Optional) indexed-access types, with the above.
    // `[…]` and `?.[…]` bind (their left) tighter than either `&` or `|`
    check("type T = (O & P)['x'];");
    check("type T = (O | P)['x'];");
    check("type T = (O & P)?.['x'];");
    check("type T = (O | P)?.['x'];");
    // `[…]` and `?.[…]` bind (their left) tighter than `?`
    check("type T = (?O)['x'];"); // indexed-access of nullable
    check("type T = ?O['x'];"); // nullable of indexed-access
    check("type T = (?O)?.['x'];"); // optional-indexed-access of nullable
    check("type T = ?O?.['x'];"); // nullable of optional-indexed-access
    // `[…]` and `?.[…]` provide brackets on their right, so skip parens:
    check("type T = A[B & C];");
    check("type T = A[B | C];");
    check("type T = A[?B];");
    check("type T = A[B[]];");
    check("type T = A[B[C]];");
    check("type T = A[B?.[C]];");
    check("type T = A?.[B & C];");
    check("type T = A?.[B | C];");
    check("type T = A?.[?B];");
    check("type T = A?.[B[]];");
    check("type T = A?.[B[C]];");
    check("type T = A?.[B?.[C]];");
    // `[…]` and `?.[…]` interact in a nonobvious way:
    // OptionalIndexedAccessType inside IndexedAccessType.
    check("type T = (O?.['x']['y'])['z'];"); // indexed of optional-indexed
    check("type T = O?.['x']['y']['z'];"); // optional-indexed throughout

    return;
    // Skip test cases involving function types, because those are currently
    // broken in other ways.  Those will be fixed by:
    //   https://github.com/benjamn/recast/pull/1089

    // Function types.
    // Function binds less tightly than binary operators at right:
    check("type T = (() => number) & O;"); // an intersection
    check("type T = (() => number) | void;"); // a union
    check("type T = () => number | void;"); // a function
    check("type T = (() => void)['x'];");
    check("type T = () => void['x'];"); // a function
    check("type T = (() => void)?.['x'];");
    check("type T = () => void?.['x'];"); // a function
    // … and less tightly than suffix operator:
    check("type T = (() => void)[];"); // an array
    check("type T = () => void[];"); // a function

    // Function does bind tighter than prefix operator (how could it not?)
    checkEquiv("type T = ?() => void;", "type T = ?(() => void);");
    // … and tighter than `&` or `|` at left (ditto):
    checkEquiv("type T = A | () => void;", "type T = A | (() => void);");
    checkEquiv("type T = A & () => void;", "type T = A & (() => void);");
    // … but we choose to insert parens anyway:
    check("type T = ?(() => void);");
    check("type T = A | (() => void);");
    check("type T = A & (() => void);");
    // We don't insert parens for the *right* operand of indexed access,
    // though, that'd be silly (sillier than writing such a type at all?):
    check("type T = A[() => void];");
    check("type T = A?.[() => void];");

    // Here's one reason we insert those parens we don't strictly have to:
    // Even when the parent is something at left so that function binds
    // tighter than it, *its* parent (or further ancestor) might be
    // something at right that binds tighter than function.
    // E.g., union of nullable of function:
    check("type T = ?(() => void) | A;");
    checkEquiv("type T = ?() => void | A;", "type T = ?() => (void | A);");
    // … or intersection of nullable of function:
    check("type T = ?(() => void) & A;");
    checkEquiv("type T = ?() => void & A;", "type T = ?() => (void & A);");
    // … or array or (optional-)indexed-access of nullable of function:
    check("type T = ?(() => void)[];");
    check("type T = ?(() => void)['x'];");
    check("type T = ?(() => void)?.['x'];");
    // … or union of intersection:
    check("type T = A & (() => void) | B;");
    // Or for an example beyond the grandparent: union of cubic nullable:
    check("type T = ???(() => void) | B;");
    // … or union of intersection of nullable:
    check("type T = A & ?(() => void) | B;");
  });
});
