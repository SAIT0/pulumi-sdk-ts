import { Data, type Effect } from "effect";
import type { PulumiError } from "./error.ts";
import type {
	InferPulumiInputsSchema,
	InferPulumiObjectSchema,
	PulumiInputsSchema,
	PulumiObjectSchema,
} from "./schema.ts";

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
> = {
	name: string;
	description: string;
	inputsSchema: TInputsSchema;
	propertiesSchema: TPropertiesSchema;

	check: (
		olds: InferPulumiInputsSchema<TInputsSchema> | undefined,
		news: InferPulumiInputsSchema<TInputsSchema>,
	) => Effect.Effect<
		CheckResult<InferPulumiInputsSchema<TInputsSchema>>,
		CheckError
	>;
	diff: (
		id: string,
		olds: InferPulumiObjectSchema<TPropertiesSchema>,
		news: InferPulumiInputsSchema<TInputsSchema>,
	) => DiffResult;
	create: (
		config: InferPulumiInputsSchema<TInputsSchema>,
		isPreview: boolean,
	) => Effect.Effect<
		CreateResult<InferPulumiObjectSchema<TPropertiesSchema>>,
		PulumiError,
		TEnv
	>;
	read: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema> | undefined,
	) => Effect.Effect<
		ReadResult<InferPulumiObjectSchema<TPropertiesSchema>>,
		PulumiError,
		TEnv
	>;
	update: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema>,
		config: InferPulumiInputsSchema<TInputsSchema>,
		isPreview: boolean,
	) => Effect.Effect<
		UpdateResult<InferPulumiObjectSchema<TPropertiesSchema>>,
		PulumiError,
		TEnv
	>;
	delete: (
		id: string,
		props: InferPulumiObjectSchema<TPropertiesSchema>,
	) => Effect.Effect<void, PulumiError, TEnv>;
};

export function resource<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	r: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
): Resource<TInputsSchema, TPropertiesSchema, TEnv> {
	return r;
}
