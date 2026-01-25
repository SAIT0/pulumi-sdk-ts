import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type {
	InferPulumiSchema,
	PulumiObjectSchema,
	PulumiSchemaDict,
	PulumiTypeSchema,
} from "./schema.ts";
import { parse } from "./schema.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

const expectParseError = (value: unknown, schema: PulumiTypeSchema) =>
	Effect.gen(function* () {
		const error = yield* Effect.flip(parse(value, schema));
		expect(error._tag).toStrictEqual("ParseError");
		return error;
	});

describe("stringのテスト", () => {
	it.effect("パース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse("", { type: "string" });
			expect(result).toStrictEqual("");
		}),
	);

	it.effect("enumの値のみパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse("cat", {
				type: "string",
				enum: ["cat", "dog"],
			});
			expect(result).toStrictEqual("cat");
		}),
	);

	it.effect("enum外はエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* expectParseError("bird", {
				type: "string",
				enum: ["cat", "dog"],
			});
			expect(error.message).toContain("Expected string enum");
		}),
	);

	it.effect("numberはエラーになる", () =>
		expectParseError(0, { type: "string" }),
	);

	it.effect("booleanはエラーになる", () =>
		expectParseError(true, { type: "string" }),
	);

	it.effect("objectはエラーになる", () =>
		expectParseError({}, { type: "string" }),
	);

	it.effect("arrayはエラーになる", () =>
		expectParseError([], { type: "string" }),
	);
});

describe("numberのテスト", () => {
	it.effect("パース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(1, { type: "number" });
			expect(result).toStrictEqual(1);
		}),
	);

	it.effect("stringはエラーになる", () =>
		expectParseError("1", { type: "number" }),
	);

	it.effect("booleanはエラーになる", () =>
		expectParseError(true, { type: "number" }),
	);

	it.effect("objectはエラーになる", () =>
		expectParseError({}, { type: "number" }),
	);

	it.effect("arrayはエラーになる", () =>
		expectParseError([], { type: "number" }),
	);

	it.effect("NaNはエラーになる", () =>
		expectParseError(Number.NaN, { type: "number" }),
	);
});

describe("booleanのテスト", () => {
	it.effect("パース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(true, { type: "boolean" });
			expect(result).toStrictEqual(true);
		}),
	);

	it.effect("stringはエラーになる", () =>
		expectParseError("true", { type: "boolean" }),
	);

	it.effect("numberはエラーになる", () =>
		expectParseError(1, { type: "boolean" }),
	);

	it.effect("objectはエラーになる", () =>
		expectParseError({}, { type: "boolean" }),
	);

	it.effect("arrayはエラーになる", () =>
		expectParseError([], { type: "boolean" }),
	);
});

describe("anyのテスト", () => {
	it.effect("どの値でもパース出来る", () =>
		Effect.gen(function* () {
			const schema: PulumiTypeSchema = { $ref: "pulumi.json#/Any" };
			expect(yield* parse("text", schema)).toStrictEqual("text");
			expect(yield* parse(123, schema)).toStrictEqual(123);
			expect(yield* parse({ a: 1 }, schema)).toStrictEqual({ a: 1 });
		}),
	);

	it("型推論はanyになる", () => {
		const schema = {
			$ref: "pulumi.json#/Any",
		} as const satisfies PulumiTypeSchema;
		type Actual = InferPulumiSchema<typeof schema>;
		type Expected = any;
		const _assert: Assert<Equal<Actual, Expected>> = true;
		expect(_assert).toStrictEqual(true);
	});
});

describe("objectのテスト", () => {
	const schema: PulumiObjectSchema = {
		properties: {
			requiredText: { type: "string" },
			optionalCount: { type: "number" },
		},
		required: ["requiredText"],
	};

	it.effect("requiredとoptionalのプロパティをパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(
				{
					requiredText: "value",
					optionalCount: 42,
				},
				{ $ref: "", type: schema },
			);
			expect(result).toStrictEqual({
				requiredText: "value",
				optionalCount: 42,
			});
		}),
	);

	it.effect("optionalが無くてもパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(
				{
					requiredText: "value",
				},
				{ $ref: "", type: schema },
			);
			expect(result).toStrictEqual({
				requiredText: "value",
			});
		}),
	);

	it.effect("requiredが欠けるとエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* expectParseError(
				{
					optionalCount: 42,
				},
				{ $ref: "", type: schema },
			);
			expect(error.message).toContain(
				'Missing required property "requiredText"',
			);
			expect(error.path).toStrictEqual([]);
		}),
	);

	it.effect("プロパティの型が違うとエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* expectParseError(
				{
					requiredText: 1,
				},
				{ $ref: "", type: schema },
			);
			expect(error.message).toContain("Expected string");
			expect(error.path).toStrictEqual(["requiredText"]);
		}),
	);

	it.effect("unknownのプロパティはエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* expectParseError(
				{
					requiredText: "value",
					unknown: "unexpected",
				},
				{ $ref: "", type: schema },
			);
			expect(error.message).toContain('Unknown property "unknown"');
			expect(error.path).toStrictEqual(["unknown"]);
		}),
	);

	it.effect("object以外はエラーになる", () =>
		expectParseError("value", { $ref: "", type: schema }),
	);
});

describe("arrayのテスト", () => {
	const schema: PulumiTypeSchema = {
		type: "array",
		items: { type: "string" },
	};

	it.effect("パース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(["a", "b"], schema);
			expect(result).toStrictEqual(["a", "b"]);
		}),
	);

	it.effect("array以外はエラーになる", () =>
		expectParseError("not-array", schema),
	);

	it.effect("要素の型が違うとエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* expectParseError(["a", 1], schema);
			expect(error.message).toContain("Expected string");
			expect(error.path).toStrictEqual([1]);
		}),
	);

	it.effect("空配列でもパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse([], schema);
			expect(result).toStrictEqual([]);
		}),
	);
});

describe("oneOfのテスト", () => {
	it.effect("string/numberのoneOfをパース出来る", () =>
		Effect.gen(function* () {
			const schema: PulumiTypeSchema = {
				oneOf: [{ type: "string" }, { type: "number" }],
			};
			const result = yield* parse("value", schema);
			expect(result).toStrictEqual("value");
		}),
	);

	it.effect("oneOfの候補に一致しないとエラーになる", () =>
		Effect.gen(function* () {
			const schema: PulumiTypeSchema = {
				oneOf: [{ type: "string" }, { type: "number" }],
			};
			const error = yield* expectParseError(true, schema);
			expect(error.message).toContain("No matching oneOf schemas");
		}),
	);

	it.effect("discriminator + mappingで判定出来る", () =>
		Effect.gen(function* () {
			const catSchema: PulumiObjectSchema = {
				properties: {
					type: { type: "string" },
					meow: { type: "string" },
				},
				required: ["type", "meow"],
			};
			const dogSchema: PulumiObjectSchema = {
				properties: {
					type: { type: "string" },
					bark: { type: "string" },
				},
				required: ["type", "bark"],
			};
			const schema: PulumiTypeSchema = {
				oneOf: [
					{ $ref: "Cat", type: catSchema },
					{ $ref: "Dog", type: dogSchema },
				],
				discriminator: {
					propertyName: "type",
					mapping: {
						cat: "Cat",
						dog: "Dog",
					},
				},
			};
			const result = yield* parse(
				{
					type: "cat",
					meow: "mew",
				},
				schema,
			);
			expect(result).toStrictEqual({
				type: "cat",
				meow: "mew",
			});
		}),
	);

	it.effect("discriminatorが不足しているとエラーになる", () =>
		Effect.gen(function* () {
			const schema: PulumiTypeSchema = {
				oneOf: [{ type: "string" }, { type: "number" }],
				discriminator: {
					propertyName: "type",
				},
			};
			const error = yield* expectParseError({}, schema);
			expect(error.message).toContain('Missing discriminator "type"');
		}),
	);
});

describe("enumの型推論", () => {
	it("literal unionとして推論される", () => {
		const schema = {
			oneOf: [
				{
					$ref: "Cat",
					type: {
						properties: {
							type: { type: "string", enum: ["cat"] },
							meow: { type: "string" },
						},
						required: ["type", "meow"] as const,
					},
				},
				{
					$ref: "Dog",
					type: {
						properties: {
							type: { type: "string", enum: ["dog"] },
							bark: { type: "string" },
						},
						required: ["type", "bark"] as const,
					},
				},
			],
			discriminator: {
				propertyName: "type",
			},
		} as const satisfies PulumiTypeSchema;

		type Actual = InferPulumiSchema<typeof schema>;
		type Expected =
			| { type: "cat"; meow: string }
			| { type: "dog"; bark: string };
		const _assert: Assert<Equal<Actual, Expected>> = true;
		expect(_assert).toStrictEqual(true);
	});
});

describe("再帰的なスキーマのテスト", () => {
	const treeNodeSchemaDict = {
		TreeNode: {
			properties: {
				value: { type: "string" },
				children: {
					type: "array",
					items: { $ref: "TreeNode" },
				},
			},
			required: ["value", "children"],
		},
	} as const satisfies PulumiSchemaDict;

	it("再帰的な型が正しく推論される", () => {
		type TreeNode = InferPulumiSchema<
			{ $ref: "TreeNode" },
			typeof treeNodeSchemaDict
		>;
		type Expected = { value: string; children: TreeNode[] };
		const _assert: Assert<Equal<TreeNode, Expected>> = true;
		expect(_assert).toStrictEqual(true);
	});

	it.effect("再帰的なスキーマをパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(
				{
					value: "root",
					children: [
						{ value: "child1", children: [] },
						{
							value: "child2",
							children: [{ value: "grandchild", children: [] }],
						},
					],
				},
				{ $ref: "TreeNode" },
				treeNodeSchemaDict,
			);
			expect(result).toStrictEqual({
				value: "root",
				children: [
					{ value: "child1", children: [] },
					{
						value: "child2",
						children: [{ value: "grandchild", children: [] }],
					},
				],
			});
		}),
	);

	it.effect("再帰的なスキーマで型エラーになる", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				parse(
					{
						value: "root",
						children: [{ value: 123, children: [] }],
					},
					{ $ref: "TreeNode" },
					treeNodeSchemaDict,
				),
			);
			expect(error._tag).toStrictEqual("ParseError");
			expect(error.message).toContain("Expected string");
		}),
	);

	it.effect("存在しない$refはエラーになる", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				parse({ value: "test" }, { $ref: "Unknown" }, treeNodeSchemaDict),
			);
			expect(error._tag).toStrictEqual("ParseError");
			expect(error.message).toContain('Unknown $ref "Unknown"');
		}),
	);
});

describe("相互参照のテスト", () => {
	const schemaDict = {
		Person: {
			properties: {
				name: { type: "string" },
				pet: { $ref: "Pet" },
			},
			required: ["name"],
		},
		Pet: {
			properties: {
				name: { type: "string" },
				owner: { $ref: "Person" },
			},
			required: ["name"],
		},
	} as const satisfies PulumiSchemaDict;

	it("相互参照の型が正しく推論される", () => {
		type Person = InferPulumiSchema<{ $ref: "Person" }, typeof schemaDict>;
		type Pet = InferPulumiSchema<{ $ref: "Pet" }, typeof schemaDict>;
		type ExpectedPerson = { name: string; pet?: Pet };
		type ExpectedPet = { name: string; owner?: Person };
		const _assertPerson: Assert<Equal<Person, ExpectedPerson>> = true;
		const _assertPet: Assert<Equal<Pet, ExpectedPet>> = true;
		expect(_assertPerson).toStrictEqual(true);
		expect(_assertPet).toStrictEqual(true);
	});

	it.effect("相互参照のスキーマをパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(
				{
					name: "Alice",
					pet: {
						name: "Fluffy",
						owner: { name: "Bob" },
					},
				},
				{ $ref: "Person" },
				schemaDict,
			);
			expect(result).toStrictEqual({
				name: "Alice",
				pet: {
					name: "Fluffy",
					owner: { name: "Bob" },
				},
			});
		}),
	);
});

describe("後方互換性のテスト", () => {
	it("typeを指定した場合は従来通り動作する", () => {
		const catSchema = {
			properties: {
				name: { type: "string" },
				meow: { type: "string" },
			},
			required: ["name", "meow"],
		} as const satisfies PulumiObjectSchema;

		type Cat = InferPulumiSchema<{ $ref: "Cat"; type: typeof catSchema }>;
		type Expected = { name: string; meow: string };
		const _assert: Assert<Equal<Cat, Expected>> = true;
		expect(_assert).toStrictEqual(true);
	});

	it.effect("typeを指定した場合のパースは従来通り動作する", () =>
		Effect.gen(function* () {
			const catSchema: PulumiObjectSchema = {
				properties: {
					name: { type: "string" },
					meow: { type: "string" },
				},
				required: ["name", "meow"],
			};
			const result = yield* parse(
				{ name: "Kitty", meow: "meow!" },
				{ $ref: "Cat", type: catSchema },
			);
			expect(result).toStrictEqual({ name: "Kitty", meow: "meow!" });
		}),
	);
});

describe("additionalPropertiesのテスト", () => {
	it.effect("純粋なRecord<string, string>をパース出来る", () =>
		Effect.gen(function* () {
			const schema: PulumiObjectSchema = {
				properties: {},
				required: [],
				additionalProperties: { type: "string" },
			};
			const result = yield* parse(
				{ key1: "value1", key2: "value2" },
				{ $ref: "", type: schema },
			);
			expect(result).toStrictEqual({ key1: "value1", key2: "value2" });
		}),
	);

	it.effect("propertiesとadditionalPropertiesの組み合わせをパース出来る", () =>
		Effect.gen(function* () {
			const schema: PulumiObjectSchema = {
				properties: {
					id: { type: "string" },
				},
				required: ["id"],
				additionalProperties: { type: "string" },
			};
			const result = yield* parse(
				{ id: "123", extra1: "a", extra2: "b" },
				{ $ref: "", type: schema },
			);
			expect(result).toStrictEqual({ id: "123", extra1: "a", extra2: "b" });
		}),
	);

	it.effect("additionalPropertiesの型エラーを検出する", () =>
		Effect.gen(function* () {
			const schema: PulumiObjectSchema = {
				properties: {},
				required: [],
				additionalProperties: { type: "string" },
			};
			const error = yield* expectParseError(
				{ key1: "valid", key2: 123 },
				{ $ref: "", type: schema },
			);
			expect(error.message).toContain("Expected string");
			expect(error.path).toStrictEqual(["key2"]);
		}),
	);

	it.effect("ネストしたadditionalPropertiesをパース出来る", () =>
		Effect.gen(function* () {
			const innerSchema: PulumiObjectSchema = {
				properties: {},
				required: [],
				additionalProperties: { type: "number" },
			};
			const outerSchema: PulumiObjectSchema = {
				properties: {},
				required: [],
				additionalProperties: {
					$ref: "Inner",
					type: innerSchema,
				},
			};
			const result = yield* parse(
				{
					group1: { a: 1, b: 2 },
					group2: { x: 10 },
				},
				{ $ref: "", type: outerSchema },
			);
			expect(result).toStrictEqual({
				group1: { a: 1, b: 2 },
				group2: { x: 10 },
			});
		}),
	);

	it("additionalPropertiesの型推論が正しく行われる(同一型)", () => {
		const schema = {
			properties: {
				id: { type: "string" },
			},
			required: ["id"],
			additionalProperties: { type: "string" },
		} as const satisfies PulumiObjectSchema;

		type Actual = InferPulumiSchema<{ $ref: ""; type: typeof schema }>;
		// additionalPropertiesの値がRecord<string, string>に割り当て可能かを確認
		const test: Actual = { id: "test", extra: "value" };
		expect(test.id).toBe("test");
		expect(test.extra).toBe("value");
	});

	it("純粋なRecord<string, T>の型推論が正しく行われる", () => {
		const schema = {
			properties: {},
			required: [],
			additionalProperties: { type: "boolean" },
		} as const satisfies PulumiObjectSchema;

		type Actual = InferPulumiSchema<{ $ref: ""; type: typeof schema }>;
		type Expected = Record<string, boolean>;
		const _assert: Assert<Equal<Actual, Expected>> = true;
		expect(_assert).toStrictEqual(true);
	});

	it.effect("additionalPropertiesがanyの場合は未知キーも通す", () =>
		Effect.gen(function* () {
			const schema: PulumiObjectSchema = {
				properties: {
					id: { type: "string" },
				},
				required: ["id"],
				additionalProperties: { $ref: "pulumi.json#/Any" },
			};
			const result = yield* parse(
				{ id: "abc", extra: { nested: 1 }, another: 42 },
				{ $ref: "", type: schema },
			);
			expect(result).toStrictEqual({
				id: "abc",
				extra: { nested: 1 },
				another: 42,
			});
		}),
	);

	it.effect("additionalPropertiesがundefinedの場合は従来通りエラー", () =>
		Effect.gen(function* () {
			const schema: PulumiObjectSchema = {
				properties: {
					id: { type: "string" },
				},
				required: ["id"],
			};
			const error = yield* expectParseError(
				{ id: "123", unknown: "value" },
				{ $ref: "", type: schema },
			);
			expect(error.message).toContain('Unknown property "unknown"');
		}),
	);
});

describe("additionalPropertiesと再帰的スキーマの組み合わせテスト", () => {
	const jiraSchemaDict = {
		ConditionGroupConfiguration: {
			properties: {
				operation: { type: "string", enum: ["ANY", "ALL"] },
				conditions: {
					type: "array",
					items: { $ref: "WorkflowRuleConfiguration" },
				},
				conditionGroups: {
					type: "array",
					items: { $ref: "ConditionGroupConfiguration" },
				},
			},
			required: [],
		},
		WorkflowRuleConfiguration: {
			properties: {
				id: { type: "string" },
				ruleKey: { type: "string" },
				parameters: {
					type: "object",
					properties: {},
					required: [],
					additionalProperties: { type: "string" },
				},
			},
			required: ["ruleKey"],
		},
	} as const satisfies PulumiSchemaDict;

	it.effect("Jiraスタイルのスキーマをパース出来る", () =>
		Effect.gen(function* () {
			const result = yield* parse(
				{
					operation: "ALL",
					conditions: [
						{
							ruleKey: "jira.condition.1",
							parameters: { key1: "value1", key2: "value2" },
						},
					],
					conditionGroups: [
						{
							operation: "ANY",
							conditions: [{ ruleKey: "jira.condition.2", parameters: {} }],
							conditionGroups: [],
						},
					],
				},
				{ $ref: "ConditionGroupConfiguration" },
				jiraSchemaDict,
			);
			expect(result).toStrictEqual({
				operation: "ALL",
				conditions: [
					{
						ruleKey: "jira.condition.1",
						parameters: { key1: "value1", key2: "value2" },
					},
				],
				conditionGroups: [
					{
						operation: "ANY",
						conditions: [{ ruleKey: "jira.condition.2", parameters: {} }],
						conditionGroups: [],
					},
				],
			});
		}),
	);

	it("Jiraスタイルの型推論が正しく行われる", () => {
		type ConditionGroup = InferPulumiSchema<
			{ $ref: "ConditionGroupConfiguration" },
			typeof jiraSchemaDict
		>;
		type WorkflowRule = InferPulumiSchema<
			{ $ref: "WorkflowRuleConfiguration" },
			typeof jiraSchemaDict
		>;

		type ExpectedRule = {
			ruleKey: string;
			id?: string;
			parameters?: Record<string, string>;
		};
		type ExpectedGroup = {
			operation?: "ANY" | "ALL";
			conditions?: ExpectedRule[];
			conditionGroups?: ConditionGroup[];
		};

		const _assertRule: Assert<Equal<WorkflowRule, ExpectedRule>> = true;
		const _assertGroup: Assert<Equal<ConditionGroup, ExpectedGroup>> = true;
		expect(_assertRule).toStrictEqual(true);
		expect(_assertGroup).toStrictEqual(true);
	});
});
