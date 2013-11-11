var fs = require("fs");
var normalizeOptions = require("./lib/options").normalize;
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
    fs.readFile(path, "utf-8", function(err, code) {
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
        writeback(print(node, options));
    });
}

Object.defineProperties(exports, {
    /**
     * Scriptable interface to recast.
     */
    run: {
        enumerable: true,
        value: run
    },

    runFile: {
        enumerable: true,
        value: runFile
    },

    runString: {
        enumerable: true,
        value: runString
    },

    /**
     * Useful utilities for implementing transformer functions.
     */
    Syntax: {
        enumerable: true,
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

    Visitor: {
        enumerable: true,
        value: require("./lib/visitor").Visitor
    },

    // Properties like require("recast").namedTypes exist for backwards
    // compatibility; prefer require("recast").types.namedTypes.
    types: {
        enumerable: true,
        value: types
    },

    builder: { // Legacy singular form.
        enumerable: false,
        value: types.builders
    },

    builders: { // Plural preferred.
        enumerable: false,
        value: types.builders
    },

    namedTypes: {
        enumerable: false,
        value: types.namedTypes
    },

    /**
     * Direct access to the parsing and printing interfaces.
     */
    parse: {
        enumerable: true,
        value: parse
    },

    print: {
        enumerable: true,
        value: print
    },

    prettyPrint: {
        enumerable: true,
        value: prettyPrint
    }
});
