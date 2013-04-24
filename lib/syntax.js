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
addNonStandardType("ArrowFunctionExpression");
addNonStandardType("YieldExpression");
addNonStandardType("ObjectPattern");
addNonStandardType("ArrayPattern");
addNonStandardType("ForOfStatement");
addNonStandardType("ComprehensionBlock");
addNonStandardType("ComprehensionExpression");
addNonStandardType("SpreadElement");
addNonStandardType("TaggedTemplateExpression");
addNonStandardType("TemplateElement");
addNonStandardType("TemplateLiteral");
addNonStandardType("ClassBody");
addNonStandardType("ClassDeclaration");
addNonStandardType("ClassExpression");
addNonStandardType("ClassHeritage");
addNonStandardType("MethodDefinition");
addNonStandardType("ExportDeclaration");
addNonStandardType("ExportSpecifier");
addNonStandardType("ExportSpecifierSet");
addNonStandardType("Glob");
addNonStandardType("ImportDeclaration");
addNonStandardType("ImportSpecifier");
addNonStandardType("ModuleDeclaration");
addNonStandardType("Path");
addNonStandardType("XJSIdentifier");
addNonStandardType("XJSExpression");
addNonStandardType("XJSElement");
addNonStandardType("XJSOpeningElement");
addNonStandardType("XJSClosingElement");
addNonStandardType("XJSAttribute");
addNonStandardType("XJSText");
