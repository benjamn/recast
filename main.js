var fs = require("fs");
var normalizeOptions = require("./lib/options").normalize;
var types = require("./lib/types");
var Parser = require("./lib/parser").Parser;
var Printer = require("./lib/printer").Printer;
var genericPrinter = new Printer(new Parser(""));

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

function runString(code, transformer, options) {
    options = normalizeOptions(options);

    var parser = new Parser(code, options),
        printer = new Printer(parser, options);

    transformer(parser.getAst(), function(node) {
        var lines = printer.print(node, true);
        options.writeback(lines.toString(options));
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
        value: require("./lib/syntax")
    },

    Visitor: {
        enumerable: true,
        value: require("./lib/visitor").Visitor
    },

    builder: { // Legacy singular form.
        enumerable: false,
        value: types.builders
    },

    builders: { // Plural preferred.
        enumerable: true,
        value: types.builders
    },

    namedTypes: {
        enumerable: true,
        value: types.namedTypes
    },

    /**
     * Quick shortcut to the generic pretty-printer.
     */
    print: {
        enumerable: true,
        value: function(node) {
            return genericPrinter.printGenerically(node).toString();
        }
    }
});
