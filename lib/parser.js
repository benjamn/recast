var assert = require("assert");
var types = require("./types");
var n = types.namedTypes;
var b = types.builders;
var isObject = types.builtInTypes.object;
var isArray = types.builtInTypes.array;
var isFunction = types.builtInTypes.function;
var Patcher = require("./patcher").Patcher;
var normalizeOptions = require("./options").normalize;
var fromString = require("./lines").fromString;
var attachComments = require("./comments").attach;

exports.parse = function parse(source, options) {
    options = normalizeOptions(options);

    var lines = fromString(source, options);

    var sourceWithoutTabs = lines.toString({
        tabWidth: options.tabWidth,
        reuseWhitespace: false,
        useTabs: false
    });

    var program = options.esprima.parse(sourceWithoutTabs, {
        loc: true,
        range: options.range,
        comment: true,
        tolerant: options.tolerant
    });

    var comments = program.comments;
    delete program.comments;

    // In order to ensure we reprint leading and trailing program
    // comments, wrap the original Program node with a File node.
    var file = b.file(program);
    file.loc = {
        lines: lines,
        indent: 0,
        start: lines.firstPos(),
        end: lines.lastPos()
    };

    // Return a copy of the original AST so that any changes made may be
    // compared to the original.
    var copy = new TreeCopier(lines).copy(file);

    // Attach comments to the copy rather than the original.
    attachComments(comments, copy.program, lines);

    return copy;
};

function TreeCopier(lines) {
    assert.ok(this instanceof TreeCopier);
    this.lines = lines;
    this.indent = 0;
}

var TCp = TreeCopier.prototype;

var cloner = require('node-v8-clone');
TCp.copy = function(node) {
  return cloner.clone(node);
};
