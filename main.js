var fs = require("fs");
var normalizeOptions = require("./lib/options").normalize;
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

exports.run = run;
exports.runFile = runFile;
exports.runString = runString;

// Useful utilities for implementing transformer functions.
exports.Syntax = require("./lib/syntax");
exports.Visitor = require("./lib/visitor").Visitor;
exports.builder = require("./lib/types").builders;

// Quick shortcut to the generic pretty-printer.
exports.print = function(node) {
    return genericPrinter.printGenerically(node).toString();
};
