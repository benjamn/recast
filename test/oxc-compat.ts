import assert from "assert";
import * as types from "ast-types";
import fs from "fs";
import path from "path";
import { parse } from "../lib/parser";
import { Printer } from "../lib/printer";

const nodeMajorVersion = parseInt(process.versions.node, 10);
const nodeMinorVersion = parseInt(process.versions.node.split(".")[1], 10);
const supportsOxcParser =
  (nodeMajorVersion === 20 && nodeMinorVersion >= 19) ||
  nodeMajorVersion > 22 ||
  (nodeMajorVersion === 22 && nodeMinorVersion >= 12);

interface Fixture {
  name: string;
  source: string;
}

const fixtures: Fixture[] = [
  {
    name: "type-only import equals",
    source: 'import type X = require("x");',
  },
  {
    name: "import types with options and arguments",
    source:
      'type T = import("pkg", { with: { "resolution-mode": "import" } }).Foo<string>;',
  },
  {
    name: "type queries and abstract constructors",
    source: [
      "type Query = typeof Foo<string>;",
      "type Factory = abstract new () => Query;",
    ].join("\n"),
  },
  {
    name: "type parameter modifiers and signatures",
    source: [
      "interface Variance<in T, out U> {",
      "  method(value: T): U;",
      "  (value: T): U;",
      "}",
      "class Box<const T> extends Base<T> implements Container<T> {}",
    ].join("\n"),
  },
  {
    name: "class members and parameter properties",
    source: [
      "class Base { value = 1; }",
      "class Derived extends Base {",
      "  #privateValue: number;",
      "  accessor item: string;",
      "  constructor(public override value: number) { super(); }",
      "  optional?(): void;",
      "}",
    ].join("\n"),
  },
  {
    name: "phased dynamic imports",
    source: 'const value = import.source("x", { with: { type: "bytes" } });',
  },
  {
    name: "static import attributes",
    source: [
      'import data from "x" with { type: "json" };',
      'export * from "x" with {};',
    ].join("\n"),
  },
  {
    name: "mapped, template literal, and enum types",
    source: [
      "type M<T> = { -readonly [K in keyof T]+?: T[K] };",
      "type Event = `on${string}`;",
      "enum E { A, B = 2 }",
    ].join("\n"),
  },
  {
    name: "typed optional patterns and module kinds",
    source: [
      "namespace N {}",
      "module M {}",
      "const array = ([value]?: [number]) => value;",
      "const object = ({ value }?: { value: number }) => value;",
    ].join("\n"),
  },
  {
    name: "decorated classes and members",
    source: [
      "@sealed",
      "export class Service {",
      "  @tracked accessor value: string;",
      "  @bound method(input: string): void {}",
      "}",
    ].join("\n"),
  },
  {
    name: "explicit resource management",
    source: [
      "using resource = acquire();",
      "await using asyncResource = acquireAsync();",
    ].join("\n"),
  },
  {
    name: "satisfies and instantiation expressions",
    source: [
      "const config = { mode: 'strict' } satisfies Config;",
      "const specialized = factory<string>;",
    ].join("\n"),
  },
  {
    name: "literal types and typed calls",
    source: [
      'type Literals = "text" | 1 | true | 1n | -1;',
      "const called = factory<string>();",
      "const optional = factory?.<number>();",
      "const created = new Box<boolean>();",
    ].join("\n"),
  },
  {
    name: "type-only import and export specifiers",
    source: [
      'import { type Input, output as value } from "pkg";',
      "export { type Input, value };",
      'export type * from "types";',
    ].join("\n"),
  },
  {
    name: "ambient and abstract declarations",
    source: [
      "declare namespace Runtime {",
      "  abstract class Base { abstract method(): void; }",
      "}",
      'declare module "virtual" { export const value: string; }',
    ].join("\n"),
  },
  {
    name: "complex typed binding patterns",
    source: [
      "function consume(",
      "  { value = 1, ...rest }: { value?: number; rest?: unknown },",
      "  [head, ...tail]: [string, ...number[]],",
      "): void {}",
    ].join("\n"),
  },
  {
    name: "modern tuple types",
    source: [
      "type Named = readonly [name?: string, ...values: number[]];",
      "type Variadic<T extends unknown[]> = [head: string, ...tail: T];",
    ].join("\n"),
  },
  {
    name: "TSX and typed tagged templates",
    source: [
      "const element = <Component<string> />;",
      "const output = tag<number>`value`;",
    ].join("\n"),
  },
  {
    name: "hashbang metadata",
    source: "#!/usr/bin/env node\nconst value = 1;",
  },
];

const metadataFields = new Set([
  "start",
  "end",
  "loc",
  "range",
  "raw",
  "comments",
]);

// These fields are emitted by Oxc and retained because they are semantically
// meaningful or useful parser metadata, but ast-types 0.16.1 does not declare
// them. The semantic round-trip tests below ensure printer support for the
// meaningful fields, while this allowlist makes newly observed fields fail.
const knownAstTypeExtensions = new Set([
  "ClassAccessorProperty.declare",
  "ClassDeclaration.abstract",
  "ClassDeclaration.declare",
  "ClassProperty.accessibility",
  "ClassProperty.declare",
  "ClassProperty.decorators",
  "ClassProperty.definite",
  "ClassProperty.optional",
  "ClassProperty.override",
  "ClassProperty.readonly",
  "ExportAllDeclaration.exportKind",
  "ExportAllDeclaration.importAttributesKeyword",
  "ExportDefaultDeclaration.exportKind",
  "ExportNamedDeclaration.exportKind",
  "ExportNamedDeclaration.importAttributesKeyword",
  "ExportSpecifier.exportKind",
  "ExpressionStatement.directive",
  "File.tokens",
  "FunctionDeclaration.declare",
  "FunctionExpression.declare",
  "Identifier.decorators",
  "ImportDeclaration.importAttributesKeyword",
  "ImportDeclaration.phase",
  "ImportSpecifier.importKind",
  "Literal.regex",
  "MethodDefinition.accessibility",
  "MethodDefinition.optional",
  "MethodDefinition.override",
  "Program.hashbang",
  "Program.sourceType",
  "Property.optional",
  "RestElement.decorators",
  "RestElement.optional",
  "RestElement.value",
  "ArrayPattern.decorators",
  "AssignmentPattern.decorators",
  "ClassExpression.abstract",
  "ClassExpression.declare",
  "TSConstructorType.abstract",
  "TSDeclareMethod.override",
  "TSEnumMember.computed",
  "TSImportEqualsDeclaration.importKind",
  "TSMappedType.nameType",
  "TSMethodSignature.accessibility",
  "TSMethodSignature.kind",
  "TSMethodSignature.readonly",
  "TSMethodSignature.static",
  "TSModuleDeclaration.kind",
  "TSParameterProperty.decorators",
  "TSParameterProperty.override",
  "TSParameterProperty.static",
  "TSIndexSignature.accessibility",
  "TSIndexSignature.static",
  "TSPropertySignature.accessibility",
  "TSPropertySignature.static",
  "TSTypeParameter.const",
  "TSTypeParameter.in",
  "TSTypeParameter.out",
  "VariableDeclaration.declare",
  "VariableDeclarator.definite",
]);

if (supportsOxcParser) {
  const oxcParser = require("../parsers/oxc");
  const parseSync = require("oxc-parser").parseSync;
  const corpusFixtures = loadCorpusFixtures().filter((fixture) =>
    canParseFixture(fixture, parseSync),
  );
  const auditedFixtures = fixtures.concat(corpusFixtures);

  describe("Oxc compatibility audit", function () {
    it("registers ast-types extensions idempotently on Recast's shared types", function () {
      const recast = require("../main");
      const {
        registerOxcAstTypesExtensions,
      } = require("../parsers/_oxc_ast_types");
      const callDefinition = types.Type.def("CallExpression") as any;
      const typeParametersField = callDefinition.allFields.typeParameters;

      registerOxcAstTypesExtensions();
      registerOxcAstTypesExtensions();

      assert.strictEqual(recast.types, types);
      assert.strictEqual(
        callDefinition.allFields.typeParameters,
        typeParametersField,
      );
      assert.strictEqual(
        types.builders.variableDeclaration("const", []).kind,
        "const",
      );
    });

    fixtures.forEach((fixture) => {
      it(`preserves semantics when generically printing ${fixture.name}`, function () {
        assert.strictEqual(
          assertSemanticRoundTrip(fixture, oxcParser, parseSync),
          true,
          `${fixture.name} should be valid Oxc input`,
        );
      });
    });

    it("preserves semantics across the existing TypeScript fixture corpus", function () {
      corpusFixtures.forEach((fixture) => {
        assert.strictEqual(
          assertSemanticRoundTrip(fixture, oxcParser, parseSync),
          true,
          `${fixture.name} should remain valid Oxc input`,
        );
      });

      assert.ok(
        corpusFixtures.length >= 60,
        `Expected at least 60 valid Oxc fixtures, checked ${corpusFixtures.length}`,
      );
    });

    it("preserves semantics when mutated nodes use Recast's patching path", function () {
      auditedFixtures.forEach((fixture) => {
        assert.ok(
          assertMutationRoundTrip(fixture, oxcParser, parseSync) > 0,
          `Expected at least one statement mutation in ${fixture.name}`,
        );
      });
    });

    it("recognizes every node and detects new ast-types field gaps", function () {
      const unknownFields = new Set<string>();

      auditedFixtures.forEach((fixture) => {
        const ast = parse(fixture.source, {
          parser: oxcParser,
          range: true,
        });
        collectNodes(ast).forEach(({ node }) => {
          assert.ok(
            (types.namedTypes as Record<string, unknown>)[node.type],
            `ast-types does not recognize ${node.type} in ${fixture.name}`,
          );

          const knownFields = new Set(types.getFieldNames(node));
          Object.keys(node).forEach((field) => {
            if (!metadataFields.has(field) && !knownFields.has(field)) {
              unknownFields.add(`${node.type}.${field}`);
            }
          });
        });
      });

      const unexpected = Array.from(unknownFields).filter(
        (field) => !knownAstTypeExtensions.has(field),
      );
      assert.deepStrictEqual(
        unexpected,
        [],
        `New Oxc fields need normalization or printer support:\n${unexpected.join(
          "\n",
        )}`,
      );
    });

    it("deeply matches the ast-types schema", function () {
      const mismatches: string[] = [];

      auditedFixtures.forEach((fixture) => {
        const ast = parse(fixture.source, {
          parser: oxcParser,
          range: true,
        });
        const schemaMismatches = collectSchemaMismatches(ast);
        schemaMismatches.forEach((mismatch) => {
          mismatches.push(`${fixture.name}: ${mismatch}`);
        });

        if (schemaMismatches.length === 0) {
          try {
            types.namedTypes.File.assert(ast, true);
          } catch (error) {
            mismatches.push(
              `${fixture.name}: deep assertion failed: ${
                (error as Error).message
              }`,
            );
          }
        }
      });

      assert.deepStrictEqual(
        mismatches,
        [],
        `Normalized Oxc AST does not match ast-types:\n${mismatches.join(
          "\n",
        )}`,
      );
    });

    it("detects new ast-types traversal gaps", function () {
      const traversalGaps = new Set<string>();

      auditedFixtures.forEach((fixture) => {
        const ast = parse(fixture.source, { parser: oxcParser });
        const nodes = collectNodes(ast);
        const visited = new Set<object>();
        types.visit(ast, {
          visitNode(path) {
            visited.add(path.node);
            this.traverse(path);
          },
        });

        nodes.forEach(({ node, parent, field }) => {
          if (parent && field && visited.has(parent) && !visited.has(node)) {
            traversalGaps.add(`${parent.type}.${field}`);
          }
        });
      });

      assert.deepStrictEqual(
        Array.from(traversalGaps),
        [],
        `Child fields are not traversed by ast-types:\n${Array.from(
          traversalGaps,
        ).join("\n")}`,
      );
    });

    it("provides complete locations and ranges", function () {
      auditedFixtures.forEach((fixture) => {
        const ast = oxcParser.parse(fixture.source, {
          range: true,
        });

        collectNodes(ast).forEach(({ node }) => {
          if (typeof node.start !== "number" || typeof node.end !== "number") {
            return;
          }

          assert.deepStrictEqual(
            node.range,
            [node.start, node.end],
            `${node.type} has an invalid range in ${fixture.name}`,
          );
          assert.ok(
            node.loc,
            `${node.type} has no location in ${fixture.name}`,
          );
        });
      });
    });
  });
}

function loadCorpusFixtures(): Fixture[] {
  const files = new Set<string>();
  [
    "data/babel-parser/test/fixtures/typescript/**/input.js",
    "data/graphql-tools-src/**/*.ts",
  ].forEach((pattern) => {
    require("glob")
      .sync(pattern, { cwd: __dirname })
      .forEach((file: string) => files.add(file));
  });

  return Array.from(files)
    .sort()
    .map((file) => ({
      name: file,
      source: fs.readFileSync(path.join(__dirname, file), "utf8"),
    }));
}

interface AuditedNode {
  type: string;
  start?: number;
  end?: number;
  range?: [number, number];
  loc?: unknown;
  [key: string]: any;
}

interface CollectedNode {
  node: AuditedNode;
  parent: AuditedNode | null;
  field: string | null;
}

function collectSchemaMismatches(value: unknown): string[] {
  const mismatches: string[] = [];
  const seen = new Set<object>();

  function visit(child: unknown, path: string): void {
    if (!child || typeof child !== "object" || seen.has(child)) {
      return;
    }
    seen.add(child);

    const possibleNode = child as AuditedNode;
    if (typeof possibleNode.type === "string") {
      const definition = types.Type.def(possibleNode.type);
      definition.fieldNames.forEach((fieldName) => {
        const field = definition.allFields[fieldName];
        const fieldValue = field.getValue(possibleNode);
        if (!field.type.check(fieldValue)) {
          mismatches.push(
            `${path}.${fieldName}: expected ${
              field.type
            }, received ${formatSchemaValue(fieldValue)}`,
          );
        }
      });
    }

    Object.keys(possibleNode).forEach((key) => {
      if (key === "loc" || key === "comments") {
        return;
      }
      const nested = possibleNode[key];
      if (Array.isArray(nested)) {
        nested.forEach((item, index) =>
          visit(item, `${path}.${key}[${index}]`),
        );
      } else {
        visit(nested, `${path}.${key}`);
      }
    });
  }

  visit(value, "$");
  return mismatches;
}

function formatSchemaValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        item && typeof item === "object" && "type" in item
          ? (item as AuditedNode).type
          : typeof item,
      )
      .join(", ")}]`;
  }
  if (typeof value === "object" && "type" in value) {
    return String((value as AuditedNode).type);
  }
  return JSON.stringify(value);
}

function collectNodes(value: unknown): CollectedNode[] {
  const nodes: CollectedNode[] = [];
  const seen = new Set<object>();

  function visit(
    child: unknown,
    parent: AuditedNode | null,
    field: string | null,
  ): void {
    if (!child || typeof child !== "object" || seen.has(child)) {
      return;
    }
    seen.add(child);

    const possibleNode = child as AuditedNode;
    const childIsNode = typeof possibleNode.type === "string";
    const nextParent = childIsNode ? possibleNode : parent;
    if (childIsNode) {
      nodes.push({
        node: possibleNode,
        parent,
        field,
      });
    }

    Object.keys(possibleNode).forEach((key) => {
      if (key === "loc" || key === "comments") {
        return;
      }
      const nested = possibleNode[key];
      if (Array.isArray(nested)) {
        nested.forEach((item) => visit(item, nextParent, key));
      } else {
        visit(nested, nextParent, key);
      }
    });
  }

  visit(value, null, null);
  return nodes;
}

function semanticProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(semanticProjection);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if ((value as Record<string, unknown>).type === "ParenthesizedExpression") {
    return semanticProjection((value as Record<string, unknown>).expression);
  }

  const projected: Record<string, unknown> = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      if (
        !metadataFields.has(key) &&
        key !== "parent" &&
        (value as Record<string, unknown>)[key] !== undefined
      ) {
        projected[key] = semanticProjection(
          (value as Record<string, unknown>)[key],
        );
      }
    });
  return projected;
}

function canParseFixture(fixture: Fixture, parseSync: any): boolean {
  return (
    parseSync("source.tsx", fixture.source, getOxcParseOptions()).errors
      .length === 0
  );
}

function getOxcParseOptions() {
  return {
    astType: "ts",
    lang: "tsx",
    preserveParens: true,
  };
}

function assertSemanticRoundTrip(
  fixture: Fixture,
  oxcParser: any,
  parseSync: any,
): boolean {
  const parseOptions = getOxcParseOptions();
  const before = parseSync("source.tsx", fixture.source, parseOptions);
  if (before.errors.length > 0) {
    return false;
  }

  const ast = parse(fixture.source, { parser: oxcParser });
  const printed = new Printer().printGenerically(ast).code;
  const after = parseSync("source.tsx", printed, parseOptions);
  assert.deepStrictEqual(
    after.errors,
    [],
    `Generic output for ${fixture.name} no longer parses:\n${printed}`,
  );
  assert.deepStrictEqual(
    semanticProjection(after.program),
    semanticProjection(before.program),
    `Semantic AST changed for ${fixture.name}:\n${printed}`,
  );
  return true;
}

function assertMutationRoundTrip(
  fixture: Fixture,
  oxcParser: any,
  parseSync: any,
): number {
  const patchedAst = parse(fixture.source, { parser: oxcParser }) as any;
  const genericAst = parse(fixture.source, { parser: oxcParser }) as any;
  const patchedMutationCount = mutateAst(patchedAst);
  const genericMutationCount = mutateAst(genericAst);
  if (patchedMutationCount === 0 || genericMutationCount === 0) {
    return 0;
  }
  assert.strictEqual(patchedMutationCount, genericMutationCount);

  const patched = new Printer().print(patchedAst).code;
  const generic = new Printer().printGenerically(genericAst).code;
  const parseOptions = getOxcParseOptions();
  const originalResult = parseSync("source.tsx", fixture.source, parseOptions);
  const patchedResult = parseSync("source.tsx", patched, parseOptions);
  const genericResult = parseSync("source.tsx", generic, parseOptions);

  assert.deepStrictEqual(
    patchedResult.errors,
    [],
    `Patched output for ${fixture.name} no longer parses:\n${patched}`,
  );
  assert.deepStrictEqual(
    genericResult.errors,
    [],
    `Generic mutated output for ${fixture.name} no longer parses:\n${generic}`,
  );
  assert.notDeepStrictEqual(
    semanticProjection(genericResult.program),
    semanticProjection(originalResult.program),
    `Mutation did not change the semantic AST for ${fixture.name}`,
  );
  assert.deepStrictEqual(
    semanticProjection(patchedResult.program),
    semanticProjection(genericResult.program),
    `Patched and generic output differ after mutating ${fixture.name}:\n${patched}`,
  );
  return patchedMutationCount;
}

function mutateAst(ast: any): number {
  const body = ast.program.body as AuditedNode[];
  let mutationCount = 0;

  for (let index = 0; index < body.length; index++) {
    const statement = { ...body[index] };
    if (mutateFirstLeaf(statement)) {
      body[index] = statement;
      mutationCount++;
    }
  }

  return mutationCount;
}

function mutateFirstLeaf(value: unknown): boolean {
  const nodes = collectNodes(value);
  const identifierLocations = new Map<string, number>();
  nodes.forEach(({ node }) => {
    if (
      node.type === "Identifier" &&
      typeof node.start === "number" &&
      typeof node.end === "number"
    ) {
      const location = `${node.start}:${node.end}`;
      identifierLocations.set(
        location,
        (identifierLocations.get(location) || 0) + 1,
      );
    }
  });
  const identifier = nodes.find(
    ({ node }) =>
      node.type === "Identifier" &&
      typeof node.name === "string" &&
      identifierLocations.get(`${node.start}:${node.end}`) === 1,
  );
  if (identifier) {
    identifier.node.name += "Audit";
    return true;
  }

  const literal = nodes.find(
    ({ node }) =>
      (node.type === "Literal" || node.type === "StringLiteral") &&
      typeof node.value === "string",
  );
  if (literal) {
    literal.node.value += "-audit";
    delete literal.node.raw;
    return true;
  }

  const numericLiteral = nodes.find(
    ({ node }) =>
      (node.type === "Literal" || node.type === "NumericLiteral") &&
      typeof node.value === "number",
  );
  if (numericLiteral) {
    numericLiteral.node.value++;
    delete numericLiteral.node.raw;
    return true;
  }

  return false;
}
