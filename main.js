var fs = require("fs"),
    path = process.argv[2],
    Parser = require("./lib/parser").Parser,
    Printer = require("./lib/printer").Printer;

exports.run = function(transformer, options) {
    fs.readFile(path, "utf-8", function(err, data) {
        if (err) {
            console.log(err);
            return;
        }

        var parser = new Parser(data, options),
            printer = new Printer(parser, options);

        transformer(parser.getAst(), function(node) {
            var lines = printer.print(node, true);
            process.stdout.write(lines.toString(options));
        });
    });
};

// Useful utilities for implementing transformer functions.
exports.Syntax = require("./lib/syntax");
exports.Visitor = require("./lib/visitor").Visitor;
exports.builder = require("./lib/builder");
