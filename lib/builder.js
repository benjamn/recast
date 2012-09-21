var Syntax = require("./syntax"),
    assert = require("assert");

// TODO Implement all builder functions.
// TODO Add type checking assertions.

exports.property = function(kind, key, val) {
    return {
        type: Syntax.Property,
        kind: kind,
        key: key,
        value: val
    };
};

exports.identifier = function(name) {
    return {
        type: Syntax.Identifier,
        name: name
    };
};

exports.literal = function(value) {
    return {
        type: Syntax.Literal,
        value: value
    };
};

exports.objectExpression = function(props) {
    return {
        type: Syntax.ObjectExpression,
        properties: props
    }
};

exports.memberExpression = function(obj, prop, isComputed) {
    return {
        type: Syntax.MemberExpression,
        object: obj,
        property: prop,
        computed: !!isComputed
    };
};

exports.variableDeclaration = function(kind, declarators) {
    return {
        type: Syntax.VariableDeclaration,
        kind: kind,
        declarations: declarators
    };
};

exports.variableDeclarator = function(id, init) {
    return {
        type: Syntax.VariableDeclarator,
        id: id,
        init: init
    };
};

exports.thisExpression = function() {
    return { type: Syntax.ThisExpression };
};

exports.blockStatement = function(body) {
    assert.ok(body instanceof Array);

    return {
        type: Syntax.BlockStatement,
        body: body
    };
};
