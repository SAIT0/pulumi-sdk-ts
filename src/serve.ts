// biome-ignore-all lint/suspicious/noExplicitAny: libs use any

import * as grpc from "@grpc/grpc-js";
import pluginProto from "@pulumi/pulumi/proto/plugin_pb.js";
import providerGrpc from "@pulumi/pulumi/proto/provider_grpc_pb.js";
import providerProto from "@pulumi/pulumi/proto/provider_pb.js";
import { Effect } from "effect";
import emptyProto from "google-protobuf/google/protobuf/empty_pb.js";
import structProto from "google-protobuf/google/protobuf/struct_pb.js";
import { PulumiError } from "./error.ts";
import type { Provider } from "./provider.ts";
import type { DiffKind, Resource } from "./resource.ts";
import {
	normalizeProviderSchema,
	type PulumiInputsSchema,
	type PulumiObjectSchema,
	parse,
} from "./schema.ts";

export function serve<TEnv>(provider: Provider<TEnv>) {
	const providerImpl = implementProvider(provider);

	// Start gRPC server
	const server = new grpc.Server();
	server.addService(providerGrpc.ResourceProviderService, providerImpl);

	server.bindAsync(
		"127.0.0.1:0",
		grpc.ServerCredentials.createInsecure(),
		(err, port) => {
			if (err) {
				console.error(`Failed to bind: ${err}`);
				process.exit(1);
			}
			console.log(port);
			server.start();
		},
	);
}

// Helper to convert plain object to Struct
function objectToStruct(obj: Record<string, any>): any {
	return structProto.Struct.fromJavaScript(obj);
}

// Helper to convert Struct to plain object
function structToObject(struct: any): unknown {
	if (!struct) return undefined;
	const result = struct.toJavaScript();
	if (Object.keys(result).length === 0) return undefined;
	return result;
}

function mapDiffKind(kind: DiffKind): providerProto.PropertyDiff.Kind {
	switch (kind) {
		case "ADD":
			return providerProto.PropertyDiff.Kind.ADD;
		case "ADD_REPLACE":
			return providerProto.PropertyDiff.Kind.ADD_REPLACE;
		case "DELETE":
			return providerProto.PropertyDiff.Kind.DELETE;
		case "DELETE_REPLACE":
			return providerProto.PropertyDiff.Kind.DELETE_REPLACE;
		case "UPDATE":
			return providerProto.PropertyDiff.Kind.UPDATE;
		case "UPDATE_REPLACE":
			return providerProto.PropertyDiff.Kind.UPDATE_REPLACE;
	}
}

function tryWith<T>(fn: () => T): Effect.Effect<T, PulumiError> {
	return Effect.try({
		try: fn,
		catch: (e) =>
			new PulumiError({
				status: grpc.status.INTERNAL,
				message:
					e instanceof Error
						? `internal error occurred (${e.message})`
						: `internal error occurred (unknown error)`,
			}),
	});
}

function findResource<TEnv>(
	provider: Provider<TEnv>,
	call: grpc.ServerUnaryCall<any, any>,
): Effect.Effect<Resource<any, any, TEnv>, PulumiError> {
	return tryWith(() => call.request.getType()).pipe(
		Effect.flatMap((resourceType) => {
			const resource = provider.resources.find(
				(resource) => resource.name === resourceType,
			);
			return resource
				? Effect.succeed(resource)
				: Effect.fail(
						new PulumiError({
							status: grpc.status.UNIMPLEMENTED,
							message: `resource ${resourceType} not implemented`,
						}),
					);
		}),
	);
}

function handleError(callback: grpc.sendUnaryData<any>) {
	return Effect.catchAll((e: PulumiError) =>
		Effect.sync(() => {
			callback({
				code: e.status,
				message: e.message,
			});
		}),
	);
}

function handleCheck<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("olds", () =>
			tryWith(() => structToObject(call.request.getOlds())).pipe(
				Effect.flatMap((rawProps) =>
					rawProps
						? parse(rawProps, resource.inputsSchema)
						: Effect.succeed(undefined),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[CHECK]: failed to parse olds: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("news", () =>
			tryWith(() => structToObject(call.request.getNews())).pipe(
				Effect.flatMap((rawProps) => parse(rawProps, resource.inputsSchema)),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[CHECK]: failed to parse news: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("result", ({ olds, news }) =>
			resource.check(olds, news).pipe(
				Effect.flatMap((result) => parse(result.inputs, resource.inputsSchema)),
				Effect.map((inputs) => ({
					inputs,
				})),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[CHECK]: failed to parse result: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.flatMap(({ result }) => {
			const response = new providerProto.CheckResponse();
			response.setInputs(objectToStruct(result.inputs));
			callback(null, response);

			return Effect.void;
		}),
		Effect.catchTag("CheckError", (e) => {
			const response = new providerProto.CheckResponse();
			e.failures.forEach((f) => {
				const failure = new providerProto.CheckFailure();
				failure.setProperty(f.property);
				failure.setReason(f.reason);
				response.addFailures(failure);
			});
			callback(null, response);

			return Effect.void;
		}),
	);
}

function handleDiff<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("id", () => tryWith<string>(() => call.request.getId())),
		Effect.bind("olds", () =>
			tryWith(() => structToObject(call.request.getOlds())).pipe(
				Effect.flatMap((rawProps) =>
					parse(rawProps, resource.propertiesSchema),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[DIFF]: failed to parse olds: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("news", () =>
			tryWith(() => structToObject(call.request.getNews())).pipe(
				Effect.flatMap((rawProps) => parse(rawProps, resource.inputsSchema)),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[DIFF]: failed to parse news: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("result", ({ id, olds, news }) =>
			Effect.try({
				try: () => resource.diff(id, olds, news),
				catch: (e) =>
					new PulumiError({
						status: grpc.status.INTERNAL,
						message: `[DIFF]: ${e instanceof Error ? e.message : "unknown error"}`,
					}),
			}),
		),
		Effect.flatMap(({ result }) => {
			const response = new providerProto.DiffResponse();
			response.setChanges(
				result.diffs.length > 0
					? providerProto.DiffResponse.DiffChanges.DIFF_SOME
					: providerProto.DiffResponse.DiffChanges.DIFF_NONE,
			);
			result.diffs.forEach((d) => {
				response.addDiffs(d.property);
				switch (d.kind) {
					case "ADD_REPLACE":
					case "DELETE_REPLACE":
					case "UPDATE_REPLACE":
						response.addReplaces(d.property);
				}
				const diff = new providerProto.PropertyDiff();
				diff.setKind(mapDiffKind(d.kind));
				response.getDetaileddiffMap().set(d.property, diff);
			});
			response.setHasdetaileddiff(true);
			response.setDeletebeforereplace(
				result.diffs.some((d) =>
					["ADD_REPLACE", "DELETE_REPLACE", "UPDATE_REPLACE"].includes(d.kind),
				),
			);
			callback(null, response);

			return Effect.void;
		}),
	);
}

function handleCreate<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("props", () =>
			tryWith(() => structToObject(call.request.getProperties())).pipe(
				Effect.flatMap((rawProps) => parse(rawProps, resource.inputsSchema)),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[CREATE]: failed to parse properties: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("isPreview", () =>
			tryWith<boolean>(() => call.request.getPreview()),
		),
		Effect.bind("result", ({ props, isPreview }) =>
			resource.create(props, isPreview).pipe(
				Effect.flatMap((result) =>
					parse(result.outs, resource.propertiesSchema).pipe(
						Effect.map((props) => ({ id: result.id, props })),
					),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[CREATE]: failed to parse result: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.flatMap(({ result }) => {
			const response = new providerProto.CreateResponse();
			response.setId(result.id);
			response.setProperties(objectToStruct(result.props));
			callback(null, response);

			return Effect.void;
		}),
	);
}

function handleRead<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("id", () => tryWith<string>(() => call.request.getId())),
		Effect.bind("props", () =>
			tryWith(() => structToObject(call.request.getProperties())).pipe(
				Effect.flatMap((rawProps) =>
					rawProps
						? parse(rawProps, resource.propertiesSchema)
						: Effect.succeed(undefined),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[READ]: failed to parse properties: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("result", ({ id, props }) =>
			resource.read(id, props).pipe(
				Effect.flatMap(({ id, props }) =>
					parse(props, resource.propertiesSchema).pipe(
						Effect.map((props) => ({ id, props })),
					),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[READ]: failed to parse result: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.flatMap(({ result, id, props }) => {
			const response = new providerProto.ReadResponse();
			response.setId(id);
			response.setProperties(objectToStruct(result.props));
			response.setInputs(objectToStruct(props ?? {}));
			callback(null, response);

			return Effect.void;
		}),
	);
}

function handleUpdate<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("id", () => tryWith<string>(() => call.request.getId())),
		Effect.bind("olds", () =>
			tryWith(() => structToObject(call.request.getOlds())).pipe(
				Effect.flatMap((rawProps) =>
					parse(rawProps, resource.propertiesSchema),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[UPDATE]: failed to parse olds: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("news", () =>
			tryWith(() => structToObject(call.request.getNews())).pipe(
				Effect.flatMap((rawProps) => parse(rawProps, resource.inputsSchema)),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[UPDATE]: failed to parse news: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.bind("isPreview", () =>
			tryWith<boolean>(() => call.request.getPreview()),
		),
		Effect.bind("result", ({ id, olds, news, isPreview }) =>
			resource.update(id, olds, news, isPreview).pipe(
				Effect.flatMap(({ outs }) =>
					parse(outs, resource.propertiesSchema).pipe(
						Effect.map((outs) => ({ id, outs })),
					),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[UPDATE]: failed to parse result: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.flatMap(({ result }) => {
			const response = new providerProto.UpdateResponse();
			response.setProperties(objectToStruct(result.outs));
			callback(null, response);

			return Effect.void;
		}),
	);
}

function handleDelete<
	TInputsSchema extends PulumiInputsSchema,
	TPropertiesSchema extends PulumiObjectSchema,
	TEnv,
>(
	call: grpc.ServerUnaryCall<any, any>,
	callback: grpc.sendUnaryData<any>,
	resource: Resource<TInputsSchema, TPropertiesSchema, TEnv>,
) {
	return Effect.Do.pipe(
		Effect.bind("id", () => tryWith<string>(() => call.request.getId())),
		Effect.bind("olds", () =>
			tryWith(() => structToObject(call.request.getProperties())).pipe(
				Effect.flatMap((rawProps) =>
					parse(rawProps, resource.propertiesSchema),
				),
				Effect.catchTag("ParseError", (e) =>
					Effect.fail(
						new PulumiError({
							status: grpc.status.INTERNAL,
							message: `[DELETE]: failed to parse properties: ${e.message}`,
						}),
					),
				),
			),
		),
		Effect.flatMap(({ id, olds }) => resource.delete(id, olds)),
		Effect.flatMap(() => {
			callback(null, new emptyProto.Empty());

			return Effect.void;
		}),
	);
}

function implementProvider<TEnv>(
	provider: Provider<TEnv>,
): grpc.UntypedServiceImplementation {
	let serviceFactory: () => <A, E, R>(
		self: Effect.Effect<A, E, R>,
	) => Effect.Effect<A, E, Exclude<R, TEnv>>;

	return {
		getPluginInfo(
			_: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			const response = new pluginProto.PluginInfo();
			response.setVersion(provider.version);
			callback(null, response);
		},

		getSchema(
			_: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			const response = new providerProto.GetSchemaResponse();
			response.setSchema(JSON.stringify(normalizeProviderSchema(provider)));
			callback(null, response);
		},

		configure(
			_: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			serviceFactory = () => provider.configure();

			const response = new providerProto.ConfigureResponse();
			response.setAcceptsecrets(true);
			response.setSupportspreview(true);
			callback(null, response);
		},

		checkConfig(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			const response = new providerProto.CheckResponse();
			response.setInputs(call.request.getNews());
			callback(null, response);
		},

		diffConfig(
			_: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			const response = new providerProto.DiffResponse();
			callback(null, response);
		},

		check(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleCheck(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		diff(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleDiff(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		create(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleCreate(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		read(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleRead(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		update(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleUpdate(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		delete(
			call: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			return Effect.runPromise(
				findResource(provider, call).pipe(
					Effect.flatMap((resource) => handleDelete(call, callback, resource)),
					handleError(callback),
					serviceFactory(),
				),
			);
		},

		cancel(
			_: grpc.ServerUnaryCall<any, any>,
			callback: grpc.sendUnaryData<any>,
		) {
			callback(null, new emptyProto.Empty());
		},
	};
}
