import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type {
	InferPulumiSchema,
	PulumiObjectSchema,
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
				{ $ref: schema, refName: "" },
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
				{ $ref: schema, refName: "" },
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
				{ $ref: schema, refName: "" },
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
				{ $ref: schema, refName: "" },
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
				{ $ref: schema, refName: "" },
			);
			expect(error.message).toContain('Unknown property "unknown"');
			expect(error.path).toStrictEqual(["unknown"]);
		}),
	);

	it.effect("object以外はエラーになる", () =>
		expectParseError("value", { $ref: schema, refName: "" }),
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
					{ $ref: catSchema, refName: "Cat" },
					{ $ref: dogSchema, refName: "Dog" },
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
					$ref: {
						properties: {
							type: { type: "string", enum: ["cat"] },
							meow: { type: "string" },
						},
						required: ["type", "meow"] as const,
					},
					refName: "Cat",
				},
				{
					$ref: {
						properties: {
							type: { type: "string", enum: ["dog"] },
							bark: { type: "string" },
						},
						required: ["type", "bark"] as const,
					},
					refName: "Dog",
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
