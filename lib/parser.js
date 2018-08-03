"use strict";

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
var util = require("./util");

exports.parse = function parse(source, options) {
  options = normalizeOptions(options);

  const lines = fromString(source, options);

  const sourceWithoutTabs = lines.toString({
    tabWidth: options.tabWidth,
    reuseWhitespace: false,
    useTabs: false
  });

  let comments = [];
  const ast = options.parser.parse(sourceWithoutTabs, {
    jsx: true,
    loc: true,
    locations: true,
    range: options.range,
    comment: true,
    onComment: comments,
    tolerant: util.getOption(options, "tolerant", true),
    ecmaVersion: 6,
    sourceType: util.getOption(options, "sourceType", "module")
  });

  if (Array.isArray(ast.comments)) {
    comments = ast.comments;
    delete ast.comments;
  }

  if (ast.loc) {
    // If the source was empty, some parsers give loc.{start,end}.line
    // values of 0, instead of the minimum of 1.
    util.fixFaultyLocations(ast, lines);
  } else {
    ast.loc = {
      start: lines.firstPos(),
      end: lines.lastPos()
    };
  }

  ast.loc.lines = lines;
  ast.loc.indent = 0;

  let file;
  let program;
  if (ast.type === "Program") {
    program = ast;
    // In order to ensure we reprint leading and trailing program
    // comments, wrap the original Program node with a File node. Only
    // ESTree parsers (Acorn and Esprima) return a Program as the root AST
    // node. Most other (Babylon-like) parsers return a File.
    file = b.file(ast, options.sourceFileName || null);
    file.loc = {
      start: lines.firstPos(),
      end: lines.lastPos(),
      lines: lines,
      indent: 0
    };
  } else if (ast.type === "File") {
    file = ast;
    program = file.program;
  }

  // Expand the Program's .loc to include all comments (not just those
  // attached to the Program node, as its children may have comments as
  // well), since sometimes program.loc.{start,end} will coincide with the
  // .loc.{start,end} of the first and last *statements*, mistakenly
  // excluding comments that fall outside that region.
  var trueProgramLoc = util.getTrueLoc({
    type: program.type,
    loc: program.loc,
    body: [],
    comments
  }, lines);
  program.loc.start = trueProgramLoc.start;
  program.loc.end = trueProgramLoc.end;

  // Passing file.program here instead of just file means that initial
  // comments will be attached to program.body[0] instead of program.
  attachComments(
    comments,
    program.body.length ? file.program : file,
    lines
  );

  // Return a copy of the original AST so that any changes made may be
  // compared to the original.
  return new TreeCopier(lines).copy(file);
};

function TreeCopier(lines) {
  assert.ok(this instanceof TreeCopier);
  this.lines = lines;
  this.indent = 0;
  this.seen = new Map;
}

var TCp = TreeCopier.prototype;

TCp.copy = function(node) {
  if (this.seen.has(node)) {
    return this.seen.get(node);
  }

  if (isArray.check(node)) {
    var copy = new Array(node.length);
    this.seen.set(node, copy);
    node.forEach(function (item, i) {
      copy[i] = this.copy(item);
    }, this);
    return copy;
  }

  if (!isObject.check(node)) {
    return node;
  }

  util.fixFaultyLocations(node, this.lines);

  var copy = Object.create(Object.getPrototypeOf(node), {
    original: { // Provide a link from the copy to the original.
      value: node,
      configurable: false,
      enumerable: false,
      writable: true
    }
  });

  this.seen.set(node, copy);

  var loc = node.loc;
  var oldIndent = this.indent;
  var newIndent = oldIndent;

  if (loc) {
    // When node is a comment, we set node.loc.indent to
    // node.loc.start.column so that, when/if we print the comment by
    // itself, we can strip that much whitespace from the left margin of
    // the comment. This only really matters for multiline Block comments,
    // but it doesn't hurt for Line comments.
    if (node.type === "Block" || node.type === "Line" ||
        node.type === "CommentBlock" || node.type === "CommentLine" ||
        this.lines.isPrecededOnlyByWhitespace(loc.start)) {
      newIndent = this.indent = loc.start.column;
    }

    loc.lines = this.lines;
    loc.indent = newIndent;
  }

  var keys = Object.keys(node);
  var keyCount = keys.length;
  for (var i = 0; i < keyCount; ++i) {
    var key = keys[i];
    if (key === "loc") {
      copy[key] = node[key];
    } else if (key === "tokens" &&
               node.type === "File") {
      // Preserve file.tokens (uncopied) in case client code cares about
      // it, even though Recast ignores it when reprinting.
      copy[key] = node[key];
    } else {
      copy[key] = this.copy(node[key]);
    }
  }

  this.indent = oldIndent;

  return copy;
};
