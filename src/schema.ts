import { Data, Effect } from "effect";
import type { Provider } from "./provider.ts";
import type { Resource } from "./resource.ts";

export type PulumiStringSchema = {
	type: "string";
	enum?: readonly string[];
};

export type PulumiNumberSchema = {
	type: "number";
};

export type PulumiBooleanSchema = {
	type: "boolean";
};

export type PulumiDiscriminatorSchema = {
	propertyName: string;
	mapping?: Record<string, string>;
};

export type PulumiOneOfSchema = {
	oneOf: ReadonlyArray<PulumiTypeSchemaNoOneOf>;
	discriminator?: PulumiDiscriminatorSchema;
};

export type PulumiRefSchema<T extends PulumiObjectSchema> = {
	$ref: T;
	refName: string; // ProviderName:ModuleName:ObjectName
};

export type PulumiObjectSchema = {
	properties: Record<string, PulumiTypeSchema>;
	required: readonly string[];
	description?: string;
};

export type PulumiInlineObjectSchema = {
	type: "object";
	properties: Record<string, PulumiTypeSchema>;
	required: readonly string[];
	description?: string;
};

export type PulumiTypeSchemaNoOneOf =
	| PulumiStringSchema
	| PulumiNumberSchema
	| PulumiBooleanSchema
	| PulumiArraySchema<any>
	| PulumiRefSchema<any>
	| PulumiInlineObjectSchema;

export type PulumiArraySchema<T extends PulumiTypeSchemaNoOneOf> = {
	type: "array";
	items: T;
};

export type PulumiTypeSchema = PulumiTypeSchemaNoOneOf | PulumiOneOfSchema;

export type PulumiNormalizedArraySchema = {
	type: "array";
	items: PulumiNormalizedTypeSchemaNoOneOf;
};

export type PulumiNormalizedRefSchema = {
	$ref: string;
};

export type PulumiNormalizedOneOfSchema = {
	oneOf: ReadonlyArray<PulumiNormalizedTypeSchemaNoOneOf>;
	discriminator?: PulumiDiscriminatorSchema;
};

export type PulumiNormalizedObjectSchema = {
	type: "object";
	properties: Record<string, PulumiNormalizedTypeSchema>;
	required: readonly string[];
	description?: string;
};

export type PulumiNormalizedTypeSchemaNoOneOf =
	| PulumiStringSchema
	| PulumiNumberSchema
	| PulumiBooleanSchema
	| PulumiNormalizedArraySchema
	| PulumiNormalizedRefSchema
	| PulumiNormalizedObjectSchema;

export type PulumiNormalizedTypeSchema =
	| PulumiNormalizedTypeSchemaNoOneOf
	| PulumiNormalizedOneOfSchema;

export type PulumiPropertySchema<T extends PulumiTypeSchema> = T & {
	description: string;
	default?: unknown;
};

export type PulumiInputsSchema = PulumiObjectSchema & {
	properties: Record<string, PulumiPropertySchema<any>>;
};

export type PulumiResourceSchema = {
	description: string | undefined;
	inputProperties: Record<string, PulumiNormalizedTypeSchema>;
	requiredInputs: ReadonlyArray<string>;
	properties: Record<string, PulumiNormalizedTypeSchema>;
	requiredProperties: ReadonlyArray<string>;
};

export type PulumiProviderSchema = {
	name: string;
	version: string;
	description: string;
	config: Record<string, unknown>;
	provider: {
		description: string;
	};
	types: Record<string, PulumiNormalizedObjectSchema>;
	resources: Record<string, PulumiResourceSchema>;
};

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

// required に含まれるキーのうち、properties に実在するものだけ抽出
type RequiredKeysOf<
	O extends { properties: Record<string, any>; required: readonly string[] },
> = Extract<O["required"][number], keyof O["properties"]>;

// PulumiSchema -> TS 型へ
export type InferPulumiSchemaNoOneOf<S> = S extends PulumiStringSchema
	? S["enum"] extends readonly (infer E)[]
		? E
		: string
	: S extends PulumiNumberSchema
		? number
		: S extends PulumiBooleanSchema
			? boolean
			: S extends PulumiArraySchema<infer I>
				? InferPulumiSchemaNoOneOf<I>[]
				: S extends PulumiRefSchema<infer O>
					? O extends {
							properties: Record<string, any>;
							required: readonly string[];
						}
						? InferPulumiObjectSchema<O>
						: never
					: S extends PulumiInputsSchema
						? InferPulumiInputsSchema<S>
						: S extends PulumiObjectSchema
							? InferPulumiObjectSchema<S>
							: never;

export type InferPulumiSchema<S> = S extends PulumiOneOfSchema
	? InferPulumiSchemaNoOneOf<S["oneOf"][number]>
	: InferPulumiSchemaNoOneOf<S>;

// PulumiObjectSchema -> required/optional を反映した TS 型へ
export type InferPulumiObjectSchema<
	O extends { properties: Record<string, any>; required: readonly string[] },
> = Simplify<
	{
		[K in RequiredKeysOf<O>]-?: InferPulumiSchema<O["properties"][K]>;
	} & {
		[K in Exclude<
			keyof O["properties"],
			RequiredKeysOf<O>
		>]?: InferPulumiSchema<O["properties"][K]>;
	}
>;

export type InferPulumiInputsSchema<S extends PulumiInputsSchema> = Simplify<
	{
		[K in RequiredKeysOf<S>]-?: InferPulumiSchema<S["properties"][K]>;
	} & {
		[K in Exclude<
			keyof S["properties"],
			RequiredKeysOf<S>
		>]?: InferPulumiSchema<S["properties"][K]>;
	}
>;

export class ParseError extends Data.TaggedError("ParseError")<{
	readonly message: string;
	readonly path: ReadonlyArray<string | number>;
}> {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushPath(path: ReadonlyArray<string | number>, seg: string | number) {
	return [...path, seg] as const;
}

function schemaLabel(schema: PulumiTypeSchema): string {
	if ("oneOf" in schema) return "oneOf";
	if ("$ref" in schema) return `ref(${schema.$ref.name})`;
	if ("type" in schema) return schema.type;
	return "unknown-schema";
}

export function parse<S extends PulumiInputsSchema>(
	value: unknown,
	schema: S,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiInputsSchema<S>, ParseError>;
export function parse<S extends PulumiObjectSchema>(
	value: unknown,
	schema: S,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiObjectSchema<S>, ParseError>;
export function parse<S extends PulumiTypeSchema>(
	value: unknown,
	schema: S,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiSchema<S>, ParseError>;
export function parse<
	S extends PulumiTypeSchema | PulumiInputsSchema | PulumiObjectSchema,
>(
	value: unknown,
	schema: S,
	path: ReadonlyArray<string | number> = [],
): Effect.Effect<InferPulumiSchema<S>, ParseError> {
	if ("oneOf" in schema) {
		return parseOneOf(value, schema, path) as Effect.Effect<
			InferPulumiSchema<S>,
			ParseError
		>;
	}
	if ("properties" in schema && "required" in schema) {
		return parsePulumiObjectSchema(value, schema, path) as Effect.Effect<
			InferPulumiSchema<S>,
			ParseError
		>;
	}

	// $ref (object)
	if ("$ref" in schema) {
		return parsePulumiObjectSchema(value, schema.$ref, path) as Effect.Effect<
			InferPulumiSchema<S>,
			ParseError
		>;
	}

	// primitives / array
	switch (schema.type) {
		case "string": {
			if (typeof value !== "string") {
				return Effect.fail(
					new ParseError({
						message: `Expected string, got ${typeof value} for schema ${schemaLabel(schema)}`,
						path,
					}),
				);
			}
			if (schema.enum && !schema.enum.includes(value)) {
				return Effect.fail(
					new ParseError({
						message: `Expected string enum (${schema.enum.join(", ")}), got ${value} for schema ${schemaLabel(schema)}`,
						path,
					}),
				);
			}
			return Effect.succeed(value as InferPulumiSchema<S>);
		}
		case "number": {
			if (typeof value !== "number" || Number.isNaN(value)) {
				return Effect.fail(
					new ParseError({
						message: `Expected number, got ${typeof value} for schema ${schemaLabel(schema)}`,
						path,
					}),
				);
			}
			return Effect.succeed(value as InferPulumiSchema<S>);
		}
		case "boolean": {
			if (typeof value !== "boolean") {
				return Effect.fail(
					new ParseError({
						message: `Expected boolean, got ${typeof value} for schema ${schemaLabel(schema)}`,
						path,
					}),
				);
			}
			return Effect.succeed(value as InferPulumiSchema<S>);
		}
		case "array": {
			if (!Array.isArray(value)) {
				return Effect.fail(
					new ParseError({
						message: `Expected array, got ${typeof value} for schema ${schemaLabel(schema)}`,
						path,
					}),
				);
			}
			return Effect.gen(function* () {
				const out: unknown[] = [];
				for (let i = 0; i < value.length; i++) {
					out.push(yield* parse(value[i], schema.items, pushPath(path, i)));
				}
				return out as InferPulumiSchema<S>;
			});
		}
		default: {
			return Effect.fail(
				new ParseError({
					message: `Unsupported schema: ${String((schema as any).type)}`,
					path,
				}),
			);
		}
	}
}

function parseOneOf<S extends PulumiOneOfSchema>(
	value: unknown,
	schema: S,
	path: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiSchema<S>, ParseError> {
	return Effect.gen(function* () {
		const { oneOf, discriminator } = schema;
		if (discriminator) {
			const { propertyName, mapping } = discriminator;
			if (!isRecord(value)) {
				return yield* Effect.fail(
					new ParseError({
						message: `Expected object for discriminator "${propertyName}" in oneOf`,
						path,
					}),
				);
			}
			if (!(propertyName in value)) {
				return yield* Effect.fail(
					new ParseError({
						message: `Missing discriminator "${propertyName}" in oneOf`,
						path,
					}),
				);
			}
			const discriminatorValue = value[propertyName];
			if (mapping) {
				if (typeof discriminatorValue !== "string") {
					return yield* Effect.fail(
						new ParseError({
							message: `Expected discriminator "${propertyName}" to be string in oneOf`,
							path,
						}),
					);
				}
				const mapped = mapping[discriminatorValue];
				if (!mapped) {
					return yield* Effect.fail(
						new ParseError({
							message: `Unknown discriminator "${discriminatorValue}" for oneOf`,
							path,
						}),
					);
				}
				const target = oneOf.find(
					(candidate) => "$ref" in candidate && candidate.refName === mapped,
				);
				if (!target) {
					return yield* Effect.fail(
						new ParseError({
							message: `Discriminator mapping "${mapped}" not found in oneOf`,
							path,
						}),
					);
				}
				return (yield* parse(value, target, path)) as InferPulumiSchema<S>;
			}
		}

		const successes: unknown[] = [];
		for (let i = 0; i < oneOf.length; i++) {
			const result = yield* Effect.either(parse(value, oneOf[i], path));
			if (result._tag === "Right") {
				successes.push(result.right);
			}
		}

		if (successes.length === 1) {
			return successes[0] as InferPulumiSchema<S>;
		}
		if (successes.length === 0) {
			return yield* Effect.fail(
				new ParseError({
					message: `No matching oneOf schemas (${oneOf
						.map(schemaLabel)
						.join(", ")})`,
					path,
				}),
			);
		}
		return yield* Effect.fail(
			new ParseError({
				message: `Ambiguous oneOf: matched ${successes.length} schemas`,
				path,
			}),
		);
	});
}

function parsePulumiObjectSchema<S extends PulumiObjectSchema>(
	value: unknown,
	schema: S,
	path: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiObjectSchema<S>, ParseError> {
	return Effect.gen(function* () {
		if (!isRecord(value)) {
			return yield* Effect.fail(
				new ParseError({
					message: `Expected object for schema ref(${path.join(".")}), got ${typeof value}`,
					path,
				}),
			);
		}

		const out: Record<string, unknown> = {};

		// required チェック（存在 & undefined でない）
		for (const k of schema.required) {
			if (!(k in value) || value[k] === undefined) {
				return yield* Effect.fail(
					new ParseError({
						message: `Missing required property "${k}" for schema ref(${path.join(".")})`,
						path,
					}),
				);
			}
		}

		// known properties を parse
		for (const [key, propSchema] of Object.entries(schema.properties)) {
			if (!(key in value) || value[key] === undefined) {
				// required は上でチェック済みなので、optional は無視
				continue;
			}
			out[key] = yield* parse(value[key], propSchema, pushPath(path, key));
		}

		// unknown keysをはじく
		for (const key of Object.keys(value)) {
			if (key in schema.properties) continue;

			return yield* Effect.fail(
				new ParseError({
					message: `Unknown property "${key}" for schema ref(${path.join(".")})`,
					path: pushPath(path, key),
				}),
			);
		}

		return out as InferPulumiObjectSchema<S>;
	});
}

function normalizeResourceSchema<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
>(
	resource: Resource<TInputsSchema, TPropertiesSchema, any>,
): [
	string,
	PulumiResourceSchema,
	Record<string, PulumiNormalizedObjectSchema>,
] {
	const [propertiesSchema, map1] = normalizeObjectSchema(
		resource.propertiesSchema,
	);
	const [inputsSchema, map2] = normalizeObjectSchema(resource.inputsSchema);
	return [
		resource.name,
		{
			properties: propertiesSchema.properties,
			requiredProperties: propertiesSchema.required,
			inputProperties: inputsSchema.properties,
			requiredInputs: inputsSchema.required,
			description: propertiesSchema.description,
		},
		{
			...map1,
			...map2,
		},
	];
}

function normalizeTypeSchema(
	schema: PulumiTypeSchemaNoOneOf,
): [
	PulumiNormalizedTypeSchemaNoOneOf,
	Record<string, PulumiNormalizedObjectSchema>,
];
function normalizeTypeSchema(
	schema: PulumiOneOfSchema,
): [PulumiNormalizedOneOfSchema, Record<string, PulumiNormalizedObjectSchema>];
function normalizeTypeSchema(
	schema: PulumiTypeSchema,
): [PulumiNormalizedTypeSchema, Record<string, PulumiNormalizedObjectSchema>];
function normalizeTypeSchema(
	schema: PulumiTypeSchema,
): [PulumiNormalizedTypeSchema, Record<string, PulumiNormalizedObjectSchema>] {
	if ("$ref" in schema) {
		const [internalSchema, typeMap] = normalizeObjectSchema(schema.$ref);
		return [
			{ $ref: `#/types/${schema.refName}` },
			{ ...typeMap, [schema.refName]: internalSchema },
		];
	}
	if ("oneOf" in schema) {
		const [items, typeMap] = schema.oneOf.reduce<
			[
				PulumiNormalizedTypeSchemaNoOneOf[],
				Record<string, PulumiNormalizedObjectSchema>,
			]
		>(
			([items, typeMap], item) => {
				const [normalized, map] = normalizeTypeSchema(item);
				return [[...items, normalized], { ...typeMap, ...map }];
			},
			[[], {}],
		);
		return [
			{
				oneOf: items,
				discriminator: schema.discriminator,
			},
			typeMap,
		];
	}
	switch (schema.type) {
		case "string":
		case "number":
		case "boolean":
			return [schema, {}];
		case "array": {
			const [items, typeMap] = normalizeTypeSchema(schema.items);
			return [
				{
					type: "array",
					items,
				},
				typeMap,
			];
		}
		case "object": {
			const [normalized, typeMap] = normalizeObjectSchema(schema);
			return [
				{
					type: "object",
					properties: normalized.properties,
					required: normalized.required,
					description: normalized.description,
				},
				typeMap,
			];
		}
	}
	throw new Error(`Unsupported schema: ${String((schema as any).type)}`);
}

function normalizeObjectSchema(
	schema: PulumiObjectSchema | PulumiInlineObjectSchema,
): [
	PulumiNormalizedObjectSchema,
	Record<string, PulumiNormalizedObjectSchema>,
] {
	const [normalized, typeMap] = Object.entries(schema.properties).reduce<
		[
			Record<string, PulumiNormalizedTypeSchema>,
			Record<string, PulumiNormalizedObjectSchema>,
		]
	>(
		([properties, typeMap], [key, schema]) => {
			const [property, map] = normalizeTypeSchema(schema);
			return [
				{
					...properties,
					[key]: property,
				},
				{ ...typeMap, ...map },
			];
		},
		[{}, {}],
	);

	return [
		{
			type: "object",
			properties: normalized,
			required: schema.required,
			description: schema.description,
		},
		typeMap,
	];
}

export function normalizeProviderSchema(
	provider: Provider<any>,
): PulumiProviderSchema {
	const [resources, types] = provider.resources.reduce<
		[
			Record<string, PulumiResourceSchema>,
			Record<string, PulumiNormalizedObjectSchema>,
		]
	>(
		([resources, types], resource) => {
			const [name, schema, typeMap] = normalizeResourceSchema(resource);
			return [
				{
					...resources,
					[name]: schema,
				},
				{
					...types,
					...typeMap,
				},
			];
		},
		[{}, {}],
	);

	return {
		name: provider.name,
		description: provider.description,
		version: provider.version,
		config: provider.config,
		provider: provider.provider,
		types,
		resources,
	};
}
