"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var types = __importStar(require("ast-types"));
var recast = __importStar(require("../main"));
var nodeMajorVersion = parseInt(process.versions.node, 10);
function testFile(path, options) {
    if (options === void 0) { options = {}; }
    fs_1.default.readFile(path, "utf-8", function (err, source) {
        assert_1.default.equal(err, null);
        assert_1.default.strictEqual(typeof source, "string");
        var ast = recast.parse(source, options);
        types.astNodesAreEquivalent.assert(ast.original, ast);
        var code = recast.print(ast).code;
        assert_1.default.strictEqual(source, code);
    });
}
function addTest(name) {
    it(name, function () {
        var filename = path_1.default.join(__dirname, "..", name);
        if (path_1.default.extname(filename) === ".ts") {
            // Babel 7 no longer supports Node 4 and 5.
            if (nodeMajorVersion >= 6) {
                testFile(filename, { parser: require("../parsers/typescript") });
            }
        }
        else {
            testFile(filename);
        }
    });
}
describe("identity", function () {
    // Add more tests here as need be.
    addTest("test/data/regexp-props.js");
    addTest("test/data/empty.js");
    addTest("test/data/backbone.js");
    addTest("test/lines.ts");
    addTest("lib/lines.ts");
    addTest("lib/printer.ts");
});
