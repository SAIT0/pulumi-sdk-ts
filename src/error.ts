import type * as grpc from "@grpc/grpc-js";
import { Data } from "effect";

export class PulumiError extends Data.TaggedError("PulumiError")<{
	status: grpc.status;
	readonly message: string;
}> {}
