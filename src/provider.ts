import type { Effect } from "effect";
import type { Resource } from "./resource.ts";

export type Provider<TEnv> = {
	name: string;
	displayName: string;
	version: string;
	description: string;
	config: Record<string, unknown>;
	provider: {
		description: string;
	};
	resources: Array<Resource<any, any, TEnv, any>>;

	configure: () => <A, E, R>(
		self: Effect.Effect<A, E, R>,
	) => Effect.Effect<A, E, Exclude<R, TEnv>>;
};

export function createProvider<TEnv>(
	providerConfig: Provider<TEnv>,
): Provider<TEnv> {
	return providerConfig;
}
