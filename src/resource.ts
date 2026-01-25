import { Data, type Effect } from "effect";
import type { PulumiError } from "./error.ts";
import type {
	InferPulumiInputsSchema,
	InferPulumiObjectSchema,
	PulumiInputsSchema,
	PulumiObjectSchema,
	PulumiSchemaDict,
} from "./schema.ts";

type EmptyDict = Record<string, never>;

export interface CheckResult<Inputs> {
	readonly inputs: Inputs;
}

export class CheckError extends Data.TaggedError("CheckError")<{
	readonly failures: {
		readonly property: string;
		readonly reason: string;
	}[];
}> {}

export type DiffKind =
	| "ADD"
	| "ADD_REPLACE"
	| "DELETE"
	| "DELETE_REPLACE"
	| "UPDATE"
	| "UPDATE_REPLACE";

export interface DiffResult {
	readonly diffs: Array<{ kind: DiffKind; property: string }>;
}

export interface CreateResult<Outputs> {
	readonly id: string;
	readonly outs?: Outputs;
}

export interface ReadResult<Outputs> {
	readonly id?: string;
	readonly props?: Outputs;
}

export interface UpdateResult<Outputs> {
	readonly outs?: Outputs;
}

export type Resource<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
	TDict extends PulumiSchemaDict = EmptyDict,
> = {
	name: string;
	description: string;
	inputsSchema: TInputsSchema;
	propertiesSchema: TPropertiesSchema;
	schemaDict?: TDict;

	check: (
		olds: InferPulumiInputsSchema<TInputsSchema, TDict> | undefined,
		news: InferPulumiInputsSchema<TInputsSchema, TDict>,
	) => Effect.Effect<
		CheckResult<InferPulumiInputsSchema<TInputsSchema, TDict>>,
		CheckError
	>;
	diff: (
		id: string,
		olds: InferPulumiObjectSchema<TPropertiesSchema, TDict>,
		news: InferPulumiInputsSchema<TInputsSchema, TDict>,
	) => DiffResult;
	create: (
		config: InferPulumiInputsSchema<TInputsSchema, TDict>,
		isPreview: boolean,
	) => Effect.Effect<
		CreateResult<InferPulumiObjectSchema<TPropertiesSchema, TDict>>,
		PulumiError,
		TEnv
	>;
	read: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema, TDict> | undefined,
	) => Effect.Effect<
		ReadResult<InferPulumiObjectSchema<TPropertiesSchema, TDict>>,
		PulumiError,
		TEnv
	>;
	update: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema, TDict>,
		config: InferPulumiInputsSchema<TInputsSchema, TDict>,
		isPreview: boolean,
	) => Effect.Effect<
		UpdateResult<InferPulumiObjectSchema<TPropertiesSchema, TDict>>,
		PulumiError,
		TEnv
	>;
	delete: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema, TDict>,
	) => Effect.Effect<void, PulumiError, TEnv>;
};

export function resource<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
	TDict extends PulumiSchemaDict = EmptyDict,
>(
	r: Resource<TInputsSchema, TPropertiesSchema, TEnv, TDict>,
): Resource<TInputsSchema, TPropertiesSchema, TEnv, TDict> {
	return r;
}
