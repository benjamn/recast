import * as types from "ast-types";

interface MutableAstTypesDefinition {
  finalized: boolean;
  allFields: Record<
    string,
    {
      type: {
        check(value: unknown): boolean;
      };
    }
  >;
  field(
    name: string,
    type: unknown,
    defaultFn?: () => unknown,
  ): MutableAstTypesDefinition;
}

interface FieldExtension {
  typeName: string;
  fieldName: string;
  fieldType: unknown;
  defaultFn?: () => unknown;
  unsupportedValue?: unknown;
}

function getMutableDefinition(typeName: string): MutableAstTypesDefinition {
  const definition = types.Type.def(
    typeName,
  ) as unknown as Partial<MutableAstTypesDefinition>;

  if (
    typeof definition.field !== "function" ||
    typeof definition.allFields !== "object" ||
    definition.allFields === null
  ) {
    throw new Error(
      `Cannot extend the ast-types ${typeName} definition for the Oxc parser`,
    );
  }

  return definition as MutableAstTypesDefinition;
}

/**
 * ast-types 0.16.1 predates these TypeScript fields. Without registering
 * them, ast-types visitors silently skip normalized Oxc subtrees even though
 * Recast's printer supports them.
 *
 * The default ast-types fork has already been finalized by the time a parser
 * is loaded. Reopening only the affected definitions and finalizing the same
 * fork preserves the identity of Recast's public `types` object.
 *
 * @internal
 */
export function registerOxcAstTypesExtensions(): void {
  const typeParametersType = types.Type.or(
    types.namedTypes.TSTypeParameterInstantiation,
    null,
  );
  const typeAnnotationType = types.Type.or(
    types.namedTypes.TypeAnnotation,
    types.namedTypes.TSTypeAnnotation,
    null,
  );
  const decoratorsType = types.Type.or(
    types.Type.from([types.namedTypes.Decorator]),
    null,
  );
  const fields: FieldExtension[] = [
    {
      typeName: "ArrayPattern",
      fieldName: "optional",
      fieldType: types.builtInTypes.boolean,
      defaultFn: () => false,
    },
    {
      typeName: "ArrayPattern",
      fieldName: "typeAnnotation",
      fieldType: typeAnnotationType,
      defaultFn: () => null,
    },
    {
      typeName: "AssignmentPattern",
      fieldName: "optional",
      fieldType: types.builtInTypes.boolean,
      defaultFn: () => false,
    },
    {
      typeName: "AssignmentPattern",
      fieldName: "typeAnnotation",
      fieldType: typeAnnotationType,
      defaultFn: () => null,
    },
    {
      typeName: "CallExpression",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "ClassDeclaration",
      fieldName: "decorators",
      fieldType: decoratorsType,
      defaultFn: () => null,
    },
    {
      typeName: "ClassExpression",
      fieldName: "decorators",
      fieldType: decoratorsType,
      defaultFn: () => null,
    },
    {
      typeName: "JSXOpeningElement",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "NewExpression",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "OptionalCallExpression",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "ObjectPattern",
      fieldName: "optional",
      fieldType: types.builtInTypes.boolean,
      defaultFn: () => false,
    },
    {
      typeName: "TaggedTemplateExpression",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "TSImportType",
      fieldName: "options",
      fieldType: types.Type.or(types.namedTypes.Expression, null),
      defaultFn: () => null,
    },
    {
      typeName: "TSTypeQuery",
      fieldName: "typeParameters",
      fieldType: typeParametersType,
      defaultFn: () => null,
    },
    {
      typeName: "VariableDeclaration",
      fieldName: "kind",
      fieldType: types.Type.or("var", "let", "const", "using", "await using"),
      unsupportedValue: "using",
    },
  ];
  let changed = false;

  fields.forEach(
    ({ typeName, fieldName, fieldType, defaultFn, unsupportedValue }) => {
      const definition = getMutableDefinition(typeName);
      const existingField = definition.allFields[fieldName];
      if (
        !existingField ||
        (unsupportedValue !== undefined &&
          !existingField.type.check(unsupportedValue))
      ) {
        definition.finalized = false;
        definition.field(fieldName, fieldType, defaultFn);
        changed = true;
      }
    },
  );

  if (changed) {
    types.finalize();
  }
}
