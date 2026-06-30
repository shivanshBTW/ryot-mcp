export type GraphQLResponse<T = unknown> = {
  data?: T;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
    extensions?: unknown;
  }>;
};

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        isDeprecated
        deprecationReason
      }
      inputFields {
        name
        description
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
      enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
    }
  }
}`;

export function getGraphqlUrl(): string {
  if (process.env.RYOT_GRAPHQL_URL) return process.env.RYOT_GRAPHQL_URL;
  const base = process.env.RYOT_BASE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/backend/graphql`;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const auth = process.env.RYOT_AUTH_HEADER;
  const cookie = process.env.RYOT_COOKIE;
  if (auth) h.authorization = auth;
  if (cookie) h.cookie = cookie;
  return h;
}

export async function ryotGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
  const res = await fetch(getGraphqlUrl(), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  const text = await res.text();
  let json: GraphQLResponse<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Ryot GraphQL returned non-JSON HTTP ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `Ryot GraphQL HTTP ${res.status}: ${JSON.stringify(json).slice(0, 1000)}`,
    );
  }
  return json;
}

let cachedSchema: any | undefined;

export async function getSchema(): Promise<any> {
  if (!cachedSchema) {
    const result = await ryotGraphql(INTROSPECTION_QUERY);
    if (result.errors?.length)
      throw new Error(
        `Schema introspection failed: ${JSON.stringify(result.errors)}`,
      );
    cachedSchema = (result.data as any).__schema;
  }
  return cachedSchema;
}

export function typeToString(t: any): string {
  if (!t) return "unknown";
  if (t.kind === "NON_NULL") return `${typeToString(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeToString(t.ofType)}]`;
  return t.name ?? t.kind ?? "unknown";
}

export async function schemaSearch(keywords: string[], limit = 50) {
  const schema = await getSchema();
  const terms = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const matches: Array<any> = [];

  for (const type of schema.types ?? []) {
    const typeHaystack =
      `${type.name ?? ""} ${type.description ?? ""}`.toLowerCase();
    if (terms.some((t) => typeHaystack.includes(t))) {
      matches.push({
        kind: "type",
        type: type.name,
        typeKind: type.kind,
        description: type.description,
      });
    }

    for (const field of type.fields ?? []) {
      const haystack =
        `${type.name ?? ""} ${field.name ?? ""} ${field.description ?? ""}`.toLowerCase();
      if (terms.some((t) => haystack.includes(t))) {
        matches.push({
          kind: "field",
          parentType: type.name,
          field: field.name,
          returnType: typeToString(field.type),
          args: (field.args ?? []).map((a: any) => ({
            name: a.name,
            type: typeToString(a.type),
            description: a.description,
          })),
          description: field.description,
          deprecated: field.isDeprecated
            ? field.deprecationReason || true
            : false,
        });
      }
    }

    for (const input of type.inputFields ?? []) {
      const haystack =
        `${type.name ?? ""} ${input.name ?? ""} ${input.description ?? ""}`.toLowerCase();
      if (terms.some((t) => haystack.includes(t))) {
        matches.push({
          kind: "inputField",
          inputType: type.name,
          field: input.name,
          type: typeToString(input.type),
          description: input.description,
        });
      }
    }
  }

  return matches.slice(0, limit);
}

export async function candidateOperations(keywords: string[], limit = 50) {
  const schema = await getSchema();
  const rootNames = [schema.queryType?.name, schema.mutationType?.name].filter(
    Boolean,
  );
  const terms = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const ops: Array<any> = [];

  for (const rootName of rootNames) {
    const rootType = (schema.types ?? []).find((t: any) => t.name === rootName);
    for (const field of rootType?.fields ?? []) {
      const haystack =
        `${field.name ?? ""} ${field.description ?? ""} ${(field.args ?? []).map((a: any) => a.name).join(" ")}`.toLowerCase();
      if (terms.some((t) => haystack.includes(t))) {
        ops.push({
          operationType:
            rootName === schema.mutationType?.name ? "mutation" : "query",
          name: field.name,
          returnType: typeToString(field.type),
          args: (field.args ?? []).map((a: any) => ({
            name: a.name,
            type: typeToString(a.type),
            description: a.description,
          })),
          description: field.description,
          deprecated: field.isDeprecated
            ? field.deprecationReason || true
            : false,
        });
      }
    }
  }
  return ops.slice(0, limit);
}

function unwrapNamedType(t: any): string | undefined {
  if (!t) return undefined;
  if (t.kind === "NON_NULL" || t.kind === "LIST")
    return unwrapNamedType(t.ofType);
  return t.name;
}

function isLeafKind(kind: string | undefined): boolean {
  return kind === "SCALAR" || kind === "ENUM";
}

function selectionForNamedType(
  schema: any,
  typeName: string,
  depth = 2,
  seen = new Set<string>(),
): string {
  const type = (schema.types ?? []).find((t: any) => t.name === typeName);
  if (!type) return "__typename";
  if (isLeafKind(type.kind)) return "";
  if (seen.has(typeName) || depth <= 0) return "__typename";

  const nextSeen = new Set(seen);
  nextSeen.add(typeName);
  const fields: string[] = ["__typename"];

  for (const field of type.fields ?? []) {
    if (!field?.name || field.name.startsWith("_")) continue;
    const named = unwrapNamedType(field.type);
    const childType = (schema.types ?? []).find((t: any) => t.name === named);
    if (!childType) continue;

    if (isLeafKind(childType.kind)) {
      fields.push(field.name);
      continue;
    }

    // Include a shallow selection for common useful nested objects, but avoid huge/recursive responses.
    if (depth > 1 && named) {
      const nested = selectionForNamedType(schema, named, depth - 1, nextSeen);
      if (nested.trim()) fields.push(`${field.name} { ${nested} }`);
    }
  }

  // GraphQL object selections cannot be empty. __typename is always legal on object/interface/union types.
  return fields.slice(0, 60).join("\n");
}

async function rootField(
  operationType: "query" | "mutation",
  fieldName: string,
): Promise<any> {
  const schema = await getSchema();
  const rootName =
    operationType === "query"
      ? schema.queryType?.name
      : schema.mutationType?.name;
  const root = (schema.types ?? []).find((t: any) => t.name === rootName);
  const field = (root?.fields ?? []).find((f: any) => f.name === fieldName);
  if (!field)
    throw new Error(`Could not find ${operationType} root field ${fieldName}`);
  return { schema, field };
}

export async function ryotRootOperation<T = unknown>(
  operationType: "query" | "mutation",
  fieldName: string,
  variables: Record<string, unknown> = {},
  selectionDepth = 2,
): Promise<GraphQLResponse<T>> {
  const { schema, field } = await rootField(operationType, fieldName);
  const variableDefs = (field.args ?? [])
    .filter((arg: any) =>
      Object.prototype.hasOwnProperty.call(variables, arg.name),
    )
    .map((arg: any) => `$${arg.name}: ${typeToString(arg.type)}`)
    .join(", ");
  const argUses = (field.args ?? [])
    .filter((arg: any) =>
      Object.prototype.hasOwnProperty.call(variables, arg.name),
    )
    .map((arg: any) => `${arg.name}: $${arg.name}`)
    .join(", ");

  const returnTypeName = unwrapNamedType(field.type);
  const returnType = (schema.types ?? []).find(
    (t: any) => t.name === returnTypeName,
  );
  const selection =
    returnTypeName && returnType && !isLeafKind(returnType.kind)
      ? ` { ${selectionForNamedType(schema, returnTypeName, selectionDepth)} }`
      : "";

  const opName = `${operationType === "query" ? "Query" : "Mutation"}_${fieldName}`;
  const query = `${operationType} ${opName}${variableDefs ? `(${variableDefs})` : ""} { ${fieldName}${argUses ? `(${argUses})` : ""}${selection} }`;
  return ryotGraphql<T>(query, variables);
}
