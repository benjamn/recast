var types = require("./lib/types");
var parse = require("./lib/parser").parse;
var Printer = require("./lib/printer").Printer;

function print(node, options) {
    return new Printer(options).print(node);
}

function prettyPrint(node, options) {
    return new Printer(options).printGenerically(node);
}

function run(transformer, options) {
    return runFile(process.argv[2], transformer, options);
}

function runFile(path, transformer, options) {
    require("fs").readFile(path, "utf-8", function(err, code) {
        if (err) {
            console.error(err);
            return;
        }

        runString(code, transformer, options);
    });
}

function defaultWriteback(output) {
    process.stdout.write(output);
}

function runString(code, transformer, options) {
    var writeback = options && options.writeback || defaultWriteback;
    transformer(parse(code, options), function(node) {
        writeback(print(node, options).code);
    });
}

Object.defineProperties(exports, {
    /**
     * Parse a string of code into an augmented syntax tree suitable for
     * arbitrary modification and reprinting.
     */
    parse: {
        enumerable: true,
        value: parse
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
        enumerable: true,
        value: prettyPrint
    },

    /**
     * Customized version of require("ast-types").
     */
    types: {
        enumerable: true,
        value: types
    },

    /**
     * Convenient command-line interface (see e.g. example/add-braces).
     */
    run: {
        enumerable: true,
        value: run
    },

    /**
     * Useful utilities for implementing transformer functions.
     */
    Syntax: {
        enumerable: false,
        value: (function() {
            var def = types.Type.def;
            var Syntax = {};

            Object.keys(types.namedTypes).forEach(function(name) {
                if (def(name).buildable)
                    Syntax[name] = name;
            });

            // These two types are buildable but do not technically count
            // as syntax because they are not printable.
            delete Syntax.SourceLocation;
            delete Syntax.Position;

            return Syntax;
        })()
    },
    /**
     * A class that represents a transformer, which is built from a definition
     * of visitors (which is the parameter a Transformer is initialized with) as
     * the constructor's single parameter. This transform makes use of 
     * recast.visit and is designed to be used as an external transformer in
     * packages that make use of recast.visit().
     */
    Transformer: {
        enumerable: false,
        value: require('./lib/transformer')
    },
    /**
     * The main interface for traversing AST using visitors
     */
    visit: {
        enumerable: true,
        value: require("./lib/visitor").visit
    },

    Visitor: {
        enumerable: false,
        value: require("./lib/visitor").Visitor
    }
});
