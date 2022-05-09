import assert from "assert";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";
import * as types from "ast-types";
import { EOL as eol } from "os";

describe("Flow type syntax", function () {
  const printer = new Printer({
    tabWidth: 2,
    quote: "single",
    flowObjectCommas: false,
  });
  const flowParserParseOptions = {
    parser: require("flow-parser"),
  };

  function check(source: string, parseOptions?: any) {
    it(`handles: ${source}`, () => {
      parseOptions = parseOptions || flowParserParseOptions;
      const ast1 = parse(source, parseOptions);
      const code = printer.printGenerically(ast1).code;
      assert.strictEqual(code, source);
      const ast2 = parse(code, parseOptions);
      types.astNodesAreEquivalent.assert(ast1, ast2);
    });
  }

  function checkEquiv(a: string, b: string) {
    it(`handles equivalently \`${a}\` vs. \`${b}\``, () => {
      const aAst = parse(a, flowParserParseOptions);
      const bAst = parse(b, flowParserParseOptions);
      types.astNodesAreEquivalent.assert(aAst, bAst);
    });
  }

  describe("should parse and print type annotations correctly", function () {
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
    check("function f(): () => void {}");
    check("function f(): () => () => void {}");
    check("function f(): (cb: () => void) => () => void {}");
    check("function f(): (() => void) => () => void {}");
    check("function f(m: (cb: () => void) => () => void): void {}");

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
    check("var methodAnonymousParameter: { m(number): void };")

    check(`declare var v: { get getter(): number };`);
    check(`declare var v: { set setter(number): void };`);
    check(`declare var v: { set setter(value: number): void };`);

    // Casts
    check("(1 + 1: number);");

    // Declare
    check("declare var A: string;");
    check("declare var methodAnonymousParameter: { m(number): void };")

    check("declare function foo(c: C): void;");
    check("declare function foo(c: C, b: B): void;");
    check("declare function foo(c: (e: Event) => void, b: B): void;");
    check("declare function foo(c: C, d?: Array<D>): void;");
    check("declare function f(): () => void;");
    check("declare function f(): (cb: () => void) => () => void;");
    check("declare function f(m: (cb: () => void) => () => void): void;");
    check("declare function anonymousParameter(number): void;")
    check("declare function f(): (() => void) => () => void;");
    check("declare function f((() => void) => () => void): void;");
    check("declare function f(): ('a' & mixed) => void;");
    check("declare function f(): ('a' | 'b') => void;");

    check("declare class C { x: string }");
    check("declare class C { constructor(): void }");
    check("declare class D { f(): D }");
    check("declare class C { [number]: string }");
    check("declare class C { [key: number]: string }");
    check("declare class C { static make(): C }");
    check("declare class C { static make: () => C }");
    check("declare class C { static instance: C }");
    check("declare class A<X> extends B<X[]> { x: X }");
    check("declare class A extends B implements I<string>, J {}");

    check(`declare class C { get getter(): number }`);
    check(`declare class C { set setter(number): void }`);
    check(`declare class C { set setter(value: number): void }`);

    check("declare interface A<X> extends B<X[]>, C { a: number }");
    check(`declare interface I { get getter(): number }`);
    check(`declare interface I { set setter(number): void }`);
    check(`declare interface I { set setter(value: number): void }`);

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
    check(`class C {${eol}  constructor() {}${eol}}`);
    check(`class C {${eol}  f(): C {}${eol}}`);

    // Getters, setters
    check(`class C {${eol}  get getter(): number {}${eol}}`);
    check(`class C {${eol}  set setter(value: number): void {}${eol}}`);

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

    // Internal slots
    check(
      [
        "declare class C {",
        "  [[myInternalSlot]]: any;",
        "  [[myOptionalInternalSlot]]?: any;",
        "  [[myMethodInternalSlot]](arg: any): any;",
        "  static [[myStaticInternalSlot]]: any;",
        "  static [[myStaticOptionalInternalSlot]]?: any;",
        "  static [[myStaticMethodInternalSlot]](arg: any): any;",
        // Is there actually syntax for an optional method like this?
        // Can't seem to find one that Flow's parser accepts.
        // "  static [[myStaticMethodOptionalInternalSlot]]?(arg: any): any;",
        "}",
      ].join(eol),
    );

    // typeArguments
    check("new A<string>();");
    check("createPlugin<number>();");

    check("function myFunction([param1]: Params) {}");
  });

  describe("can pretty-print [Optional]IndexedAccessType AST nodes", () => {
    check("type A = Obj?.['a'];");
    check("type B = Array<string>?.[number];");
    check("type C = Obj?.['bar']['baz'];");
    check("type D = (Obj?.['bar'])['baz'];");
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
});
