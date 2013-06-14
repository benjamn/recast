var types = require("ast-types");
var def = types.Type.def;

def("File")
    .bases("Node")
    .build("program")
    .field("program", def("Program"));

types.finalize();

exports.builders = types.builders;
exports.namedTypes = types.namedTypes;
exports.getFieldValue = types.getFieldValue;

var Syntax = exports.Syntax = {};
Object.keys(types.namedTypes).forEach(function(name) {
    if (def(name).buildable)
        Syntax[name] = name;
});

// These two types are buildable but do not technically count as syntax
// because they are not printable.
delete Syntax.SourceLocation;
delete Syntax.Position;
