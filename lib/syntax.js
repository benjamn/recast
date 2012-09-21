var assert = require("assert"),
    esprimaSyntax = require("esprima").Syntax,
    type;

for (type in esprimaSyntax)
    exports[type] = esprimaSyntax[type];

function addNonStandardType(type) {
    assert.strictEqual(typeof type, "string");
    exports[type] = type;
}

addNonStandardType("File");
