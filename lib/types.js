var types = require("ast-types");
var def = types.Type.def;

def("File")
    .bases("Node")
    .build("program")
    .field("program", def("Program"));

types.finalize();

exports.builders = types.builders;
