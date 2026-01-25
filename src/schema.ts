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

const PULUMI_ANY_REF = "pulumi.json#/Any" as const;
const PULUMI_JSON_REF = "pulumi.json#/Json" as const;

export type PulumiAnySchema = {
	$ref: typeof PULUMI_ANY_REF;
	type?: undefined;
};

export type PulumiJsonSchema = {
	$ref: typeof PULUMI_JSON_REF;
	type?: undefined;
};

export type PulumiDiscriminatorSchema = {
	propertyName: string;
	mapping?: Record<string, string>;
};

export type PulumiOneOfSchema = {
	oneOf: ReadonlyArray<PulumiTypeSchemaNoOneOf>;
	discriminator?: PulumiDiscriminatorSchema;
};

export type PulumiSchemaDict = Record<string, PulumiObjectSchema>;
type EmptyDict = Record<string, never>;

export type PulumiRefSchema<
	T extends PulumiObjectSchema | undefined = undefined,
> = T extends PulumiObjectSchema
	? { $ref: string; type: T }
	: { $ref: string; type?: undefined };

export type PulumiObjectSchema = {
	properties: Record<string, PulumiTypeSchema>;
	required: readonly string[];
	description?: string;
	additionalProperties?: PulumiTypeSchema;
};

export type PulumiInlineObjectSchema = {
	type: "object";
	properties: Record<string, PulumiTypeSchema>;
	required: readonly string[];
	description?: string;
	additionalProperties?: PulumiTypeSchema;
};

export type PulumiTypeSchemaNoOneOf =
	| PulumiStringSchema
	| PulumiNumberSchema
	| PulumiBooleanSchema
	| PulumiAnySchema
	| PulumiJsonSchema
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
	additionalProperties?: PulumiNormalizedTypeSchema;
};

export type PulumiNormalizedTypeSchemaNoOneOf =
	| PulumiStringSchema
	| PulumiNumberSchema
	| PulumiBooleanSchema
	| PulumiAnySchema
	| PulumiJsonSchema
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

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

// required に含まれるキーのうち、properties に実在するものだけ抽出
type RequiredKeysOf<
	O extends { properties: Record<string, any>; required: readonly string[] },
> = Extract<O["required"][number], keyof O["properties"]>;

// PulumiSchema -> TS 型へ
export type InferPulumiSchemaNoOneOf<
	S,
	Dict extends PulumiSchemaDict = EmptyDict,
> = S extends PulumiStringSchema
	? S["enum"] extends readonly (infer E)[]
		? E
		: string
	: S extends PulumiAnySchema
		? any
		: S extends PulumiJsonSchema
			? JsonValue
			: S extends PulumiNumberSchema
				? number
				: S extends PulumiBooleanSchema
					? boolean
					: S extends PulumiArraySchema<infer I>
						? InferPulumiSchemaNoOneOf<I, Dict>[]
						: // $ref + type (後方互換)
							S extends {
									$ref: string;
									type: infer O extends PulumiObjectSchema;
								}
							? InferPulumiObjectSchema<O, Dict>
							: // $ref のみ (Dict から解決 + 組み込み)
								S extends {
										$ref: infer RefName extends string;
										type?: undefined;
									}
								? RefName extends typeof PULUMI_ANY_REF
									? any
									: RefName extends typeof PULUMI_JSON_REF
										? JsonValue
										: RefName extends keyof Dict
											? InferPulumiObjectSchema<Dict[RefName], Dict>
											: never
								: S extends PulumiInputsSchema
									? InferPulumiInputsSchema<S, Dict>
									: S extends PulumiObjectSchema
										? InferPulumiObjectSchema<S, Dict>
										: never;

export type InferPulumiSchema<
	S,
	Dict extends PulumiSchemaDict = EmptyDict,
> = S extends PulumiOneOfSchema
	? InferPulumiSchemaNoOneOf<S["oneOf"][number], Dict>
	: InferPulumiSchemaNoOneOf<S, Dict>;

// additionalProperties の型を抽出するヘルパー
type AdditionalPropertiesType<O, Dict extends PulumiSchemaDict> = O extends {
	additionalProperties: infer AP;
}
	? AP extends PulumiTypeSchema
		? Record<string, InferPulumiSchema<AP, Dict>>
		: object
	: object;

// PulumiObjectSchema -> required/optional を反映した TS 型へ
export type InferPulumiObjectSchema<
	O extends { properties: Record<string, any>; required: readonly string[] },
	Dict extends PulumiSchemaDict = EmptyDict,
> = Simplify<
	{
		[K in RequiredKeysOf<O>]-?: InferPulumiSchema<O["properties"][K], Dict>;
	} & {
		[K in Exclude<
			keyof O["properties"],
			RequiredKeysOf<O>
		>]?: InferPulumiSchema<O["properties"][K], Dict>;
	} & AdditionalPropertiesType<O, Dict>
>;

export type InferPulumiInputsSchema<
	S extends PulumiInputsSchema,
	Dict extends PulumiSchemaDict = EmptyDict,
> = Simplify<
	{
		[K in RequiredKeysOf<S>]-?: InferPulumiSchema<S["properties"][K], Dict>;
	} & {
		[K in Exclude<
			keyof S["properties"],
			RequiredKeysOf<S>
		>]?: InferPulumiSchema<S["properties"][K], Dict>;
	} & AdditionalPropertiesType<S, Dict>
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

function isJsonValue(value: unknown): value is JsonValue {
	if (
		typeof value === "string" ||
		typeof value === "boolean" ||
		value === null
	) {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	if (isRecord(value)) {
		return Object.values(value).every(isJsonValue);
	}
	return false;
}

function schemaLabel(schema: PulumiTypeSchema): string {
	if ("oneOf" in schema) return "oneOf";
	if ("$ref" in schema && typeof schema.$ref === "string")
		return `ref(${schema.$ref})`;
	if ("type" in schema && typeof schema.type === "string") return schema.type;
	return "unknown-schema";
}

export function parse<
	S extends PulumiInputsSchema,
	Dict extends PulumiSchemaDict = EmptyDict,
>(
	value: unknown,
	schema: S,
	dict?: Dict,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiInputsSchema<S, Dict>, ParseError>;
export function parse<
	S extends PulumiObjectSchema,
	Dict extends PulumiSchemaDict = EmptyDict,
>(
	value: unknown,
	schema: S,
	dict?: Dict,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiObjectSchema<S, Dict>, ParseError>;
export function parse<
	S extends PulumiTypeSchema,
	Dict extends PulumiSchemaDict = EmptyDict,
>(
	value: unknown,
	schema: S,
	dict?: Dict,
	path?: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiSchema<S, Dict>, ParseError>;
export function parse<
	S extends PulumiTypeSchema | PulumiInputsSchema | PulumiObjectSchema,
	Dict extends PulumiSchemaDict = EmptyDict,
>(
	value: unknown,
	schema: S,
	dict: Dict = {} as Dict,
	path: ReadonlyArray<string | number> = [],
): Effect.Effect<InferPulumiSchema<S, Dict>, ParseError> {
	if ("oneOf" in schema) {
		return parseOneOf(value, schema, dict, path) as Effect.Effect<
			InferPulumiSchema<S, Dict>,
			ParseError
		>;
	}
	if ("properties" in schema && "required" in schema) {
		return parsePulumiObjectSchema(value, schema, dict, path) as Effect.Effect<
			InferPulumiSchema<S, Dict>,
			ParseError
		>;
	}

	// $ref (object)
	if ("$ref" in schema) {
		if (schema.type) {
			// typeがある場合は従来通り
			return parsePulumiObjectSchema(
				value,
				schema.type,
				dict,
				path,
			) as Effect.Effect<InferPulumiSchema<S, Dict>, ParseError>;
		}
		// typeがない場合は組み込み or dict から解決
		switch (schema.$ref) {
			case PULUMI_ANY_REF: {
				return Effect.succeed(value as InferPulumiSchema<S, Dict>);
			}
			case PULUMI_JSON_REF: {
				if (!isJsonValue(value)) {
					return Effect.fail(
						new ParseError({
							message: `Expected JSON-serializable value, got ${typeof value} for schema ref(${schema.$ref})`,
							path,
						}),
					);
				}
				return Effect.succeed(value as InferPulumiSchema<S, Dict>);
			}
			default: {
				const resolvedSchema = dict[schema.$ref];
				if (!resolvedSchema) {
					return Effect.fail(
						new ParseError({
							message: `Unknown $ref "${schema.$ref}"`,
							path,
						}),
					);
				}
				return parsePulumiObjectSchema(
					value,
					resolvedSchema,
					dict,
					path,
				) as Effect.Effect<InferPulumiSchema<S, Dict>, ParseError>;
			}
		}
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
			return Effect.succeed(value as InferPulumiSchema<S, Dict>);
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
			return Effect.succeed(value as InferPulumiSchema<S, Dict>);
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
			return Effect.succeed(value as InferPulumiSchema<S, Dict>);
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
					out.push(
						yield* parse(value[i], schema.items, dict, pushPath(path, i)),
					);
				}
				return out as InferPulumiSchema<S, Dict>;
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

function parseOneOf<S extends PulumiOneOfSchema, Dict extends PulumiSchemaDict>(
	value: unknown,
	schema: S,
	dict: Dict,
	path: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiSchema<S, Dict>, ParseError> {
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
					(candidate) => "$ref" in candidate && candidate.$ref === mapped,
				);
				if (!target) {
					return yield* Effect.fail(
						new ParseError({
							message: `Discriminator mapping "${mapped}" not found in oneOf`,
							path,
						}),
					);
				}
				return (yield* parse(value, target, dict, path)) as InferPulumiSchema<
					S,
					Dict
				>;
			}
		}

		const successes: unknown[] = [];
		for (let i = 0; i < oneOf.length; i++) {
			const result = yield* Effect.either(parse(value, oneOf[i], dict, path));
			if (result._tag === "Right") {
				successes.push(result.right);
			}
		}

		if (successes.length === 1) {
			return successes[0] as InferPulumiSchema<S, Dict>;
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

function parsePulumiObjectSchema<
	S extends PulumiObjectSchema,
	Dict extends PulumiSchemaDict,
>(
	value: unknown,
	schema: S,
	dict: Dict,
	path: ReadonlyArray<string | number>,
): Effect.Effect<InferPulumiObjectSchema<S, Dict>, ParseError> {
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
			out[key] = yield* parse(
				value[key],
				propSchema,
				dict,
				pushPath(path, key),
			);
		}

		// unknown keys の処理
		for (const key of Object.keys(value)) {
			if (key in schema.properties) continue;

			if (schema.additionalProperties) {
				// additionalProperties がある場合は、そのスキーマでパース
				out[key] = yield* parse(
					value[key],
					schema.additionalProperties,
					dict,
					pushPath(path, key),
				);
			} else {
				// 従来通りエラー
				return yield* Effect.fail(
					new ParseError({
						message: `Unknown property "${key}" for schema ref(${path.join(".")})`,
						path: pushPath(path, key),
					}),
				);
			}
		}

		return out as InferPulumiObjectSchema<S, Dict>;
	});
}

function normalizeResourceSchema<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
>(
	resource: Resource<TInputsSchema, TPropertiesSchema, any, any>,
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

function normalizeRef(ref: string): string {
	if (ref.includes("#")) return ref;
	return `#/types/${ref}`;
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
		// $ref のみ（type なし）の場合はそのまま参照を返す
		const normalizedRef = normalizeRef(schema.$ref);
		if (!schema.type) {
			return [{ $ref: normalizedRef }, {}];
		}
		// $ref + type がある場合は従来通り正規化
		const [internalSchema, typeMap] = normalizeObjectSchema(schema.type);
		return [
			{ $ref: normalizedRef },
			{ ...typeMap, [schema.$ref]: internalSchema },
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
					additionalProperties: normalized.additionalProperties,
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

	// additionalProperties を正規化
	let additionalProperties: PulumiNormalizedTypeSchema | undefined;
	let additionalTypeMap: Record<string, PulumiNormalizedObjectSchema> = {};
	if (schema.additionalProperties) {
		const [normalizedAdditional, map] = normalizeTypeSchema(
			schema.additionalProperties,
		);
		additionalProperties = normalizedAdditional;
		additionalTypeMap = map;
	}

	return [
		{
			type: "object",
			properties: normalized,
			required: schema.required,
			description: schema.description,
			additionalProperties,
		},
		{ ...typeMap, ...additionalTypeMap },
	];
}

export function normalizeProviderSchema<T>(
	provider: Provider<T>,
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
