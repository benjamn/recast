import fs from "fs";
import types, { ASTNode } from "./lib/types";
import { parse } from "./lib/parser";
import { Printer } from "./lib/printer";
import { Options } from "./lib/options";

export interface Parser {
    parse(source: string, options?: any): ASTNode;
}

function print(node: ASTNode, options?: Options) {
    return new Printer(options).print(node);
}

function prettyPrint(node: ASTNode, options?: Options) {
    return new Printer(options).printGenerically(node);
}

interface Transformer {
    (ast: ASTNode, callback: (ast: ASTNode) => void): void;
}

interface RunOptions extends Options {
    writeback?(code: string): void;
}

function run(transformer: Transformer, options?: RunOptions) {
    return runFile(process.argv[2], transformer, options);
}

function runFile(path: any, transformer: Transformer, options?: RunOptions) {
    fs.readFile(path, "utf-8", function(err, code) {
        if (err) {
            console.error(err);
            return;
        }

        runString(code, transformer, options);
    });
}

function defaultWriteback(output: string) {
    process.stdout.write(output);
}

function runString(code: string, transformer: Transformer, options?: RunOptions) {
    var writeback = options && options.writeback || defaultWriteback;
    transformer(parse(code, options), function(node: any) {
        writeback(print(node, options).code);
    });
}

interface Main {
    parse: typeof parse;
    visit: typeof types.visit;
    print: typeof print;
    prettyPrint: typeof prettyPrint;
    types: typeof types;
    run: typeof run;
}

const main = {} as Main;
Object.defineProperties(main, {
    /**
     * Parse a string of code into an augmented syntax tree suitable for
     * arbitrary modification and reprinting.
     */
    parse: {
        enumerable: true,
        value: parse
    },

    /**
     * Traverse and potentially modify an abstract syntax tree using a
     * convenient visitor syntax:
     *
     *   recast.visit(ast, {
     *     names: [],
     *     visitIdentifier: function(path) {
     *       var node = path.value;
     *       this.visitor.names.push(node.name);
     *       this.traverse(path);
     *     }
     *   });
     */
    visit: {
        enumerable: true,
        value: types.visit
    },

    /**
     * Reprint a modified syntax tree using as much of the original source
     * code as possible.
     */
    print: {
        enumerable: true,
        value: print
    },

    /**
     * Print without attempting to reuse any original source code.
     */
    prettyPrint: {
        enumerable: false,
        value: prettyPrint
    },

    /**
     * Customized version of require("ast-types").
     */
    types: {
        enumerable: false,
        value: types
    },

    /**
     * Convenient command-line interface (see e.g. example/add-braces).
     */
    run: {
        enumerable: false,
        value: run
    }
});

export default main;

// Type exports
export {
    ASTNode,
    NamedTypes,
    Builders,
    NodePath,
    Type,
} from "./lib/types";
export { Options } from "./lib/options";
