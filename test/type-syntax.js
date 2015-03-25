var assert = require("assert");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var types = require("../lib/types");
var n = types.namedTypes;
var b = types.builders;

describe("type syntax", function() {
    var printer = new Printer({ tabWidth: 2 });

    function check(source) {
        var ast1 = parse(source);
        var ast2 = parse(printer.printGenerically(ast1).code);
        types.astNodesAreEquivalent.assert(ast1, ast2);
    }

    it("should parse and print type annotations correctly", function() {
        // Import type annotations
        check("import type foo from 'foo'");

        // Scalar type annotations
        check("var a: number;");
        check("var a: number = 5;");

        check("var a: any;");
        check("var a: boolean;");
        check("var a: string;");
        check("var a: \"foo\";");
        check("var a: void;");

        // Nullable
        check("var a: ?number;");

        // Unions & Intersections
        check("var a: number | string | boolean = 26");
        check("var a: number & string & boolean = 26");

        // Types
        check("var a: A = 5;");
        // TODO!?
        check("var a: typeof A;");

        // Type aliases
        check("type A = B;");
        check("type A = B.C;");

        // Generic
        check("var a: Array<Foo>;");
        check("var a: number[];");

        // Return types
        check("function a(): number {}");
        check("var a: () => X = fn");

        // Object
        check("var a: {b: number; x: {y: A}};");
        check("var b: {[key: string]: number};")
        check("var c: {(): number};")
        check("var d: {[key: string]: A; [key: number]: B; (): C; a: D};")

        // Casts
        check("(1 + 1: number)");

        // Declare
        check("declare var A: string;");

        check("declare function foo(c: C): void;");
        check("declare function foo(c: C, b: B): void;");
        check("declare function foo(c: (e: Event) => void, b: B): void;");
        check("declare class C {x: string}");
        check("declare module M {declare function foo(c: C): void;}");

        // Classes
        check("class A { a: number; }");
        check("class A { foo(a: number): string {} }");
        check("class A { static foo(a: number): string {} }");

        // Type parameters
        check("class A<T> {}");
        check("class A<X, Y> {}");
        check("class A<X> extends B<Y> {}");
        check("function a<T>(y: Y<T>): T {}");
        check("class A { foo<T>(a: number): string {} }");

        // Interfaces
        check("interface A<X> extends B<A>, C { a: number; }");
        check("class A extends B implements C<T>, Y {}");

        // Bounded polymorphism
        check("class A<T: number> {}");
    });
});
