# pulumi-sdk-ts

(AI Generated Document)  

Unofficial Pulumi TypeScript SDK for building custom providers with [Effect](https://effect.website/).

## Disclaimer

This project is intended for personal learning and experimentation.
It is not recommended for production use.

## Installation

```bash
bun install
```

## Usage

### Define a Schema

Define input and output schemas using `PulumiInputsSchema` and `PulumiObjectSchema`:

```typescript
import type { PulumiInputsSchema, PulumiObjectSchema } from "pulumi-sdk-ts";

const bucketInputsSchema = {
  properties: {
    name: { type: "string", description: "The bucket name" },
    region: {
      type: "string",
      enum: ["us-east-1", "us-west-2", "eu-west-1"] as const,
      description: "AWS region",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Resource tags",
    },
  },
  required: ["name", "region"] as const,
} satisfies PulumiInputsSchema;

const bucketPropertiesSchema = {
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    region: { type: "string" },
    arn: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["id", "name", "region", "arn"] as const,
} satisfies PulumiObjectSchema;
```

### Define a Resource

```typescript
import { Effect } from "effect";
import { resource, CheckError, PulumiError } from "pulumi-sdk-ts";

const bucketResource = resource({
  name: "my-provider:storage:Bucket",
  description: "A storage bucket resource",
  inputsSchema: bucketInputsSchema,
  propertiesSchema: bucketPropertiesSchema,

  check: (olds, news) =>
    Effect.gen(function* () {
      if (news.name.length < 3) {
        return yield* new CheckError({
          failures: [{ property: "name", reason: "Name must be at least 3 characters" }],
        });
      }
      return { inputs: news };
    }),

  diff: (id, olds, news) => {
    const diffs: Array<{ kind: "UPDATE" | "UPDATE_REPLACE"; property: string }> = [];
    if (olds.name !== news.name) {
      diffs.push({ kind: "UPDATE_REPLACE", property: "name" });
    }
    if (olds.region !== news.region) {
      diffs.push({ kind: "UPDATE_REPLACE", property: "region" });
    }
    return { diffs };
  },

  create: (config, isPreview) =>
    Effect.gen(function* () {
      if (isPreview) {
        return { id: "preview-id", outs: undefined };
      }
      // Create the actual resource
      const id = `bucket-${Date.now()}`;
      return {
        id,
        outs: {
          id,
          name: config.name,
          region: config.region,
          arn: `arn:aws:s3:::${config.name}`,
          tags: config.tags,
        },
      };
    }),

  read: (id, props) =>
    Effect.succeed({
      id,
      props: props ?? { id, name: "", region: "", arn: "" },
    }),

  update: (id, props, config, isPreview) =>
    Effect.succeed({
      outs: { ...props, name: config.name, tags: config.tags },
    }),

  delete: (id, props) => Effect.void,
});
```

### Create a Provider with Dependency Injection

```typescript
import { Context, Effect, Layer } from "effect";
import { createProvider, serve } from "pulumi-sdk-ts";

// Define a service for dependency injection
class StorageClient extends Context.Tag("StorageClient")<
  StorageClient,
  { createBucket: (name: string) => Effect.Effect<string> }
>() {}

const provider = createProvider({
  name: "my-provider",
  displayName: "My Provider",
  version: "0.1.0",
  description: "My custom Pulumi provider",
  config: {},
  provider: { description: "Provider configuration" },
  resources: [bucketResource],

  // Provide dependencies to all resource operations
  configure: () => {
    const layer = Layer.succeed(StorageClient, {
      createBucket: (name) => Effect.succeed(`created-${name}`),
    });
    return Effect.provide(layer);
  },
});

// Start the gRPC server
serve(provider);
```

## API Reference

### Schema Types

| Type | Description |
|------|-------------|
| `PulumiStringSchema` | String type with optional enum values |
| `PulumiNumberSchema` | Number type |
| `PulumiBooleanSchema` | Boolean type |
| `PulumiArraySchema` | Array type with item schema |
| `PulumiObjectSchema` | Object type with properties |
| `PulumiRefSchema` | Reference to another schema |
| `PulumiOneOfSchema` | Union type with discriminator support |

### Resource Lifecycle Methods

| Method | Description |
|--------|-------------|
| `check` | Validate and transform inputs |
| `diff` | Compute differences between old and new state |
| `create` | Create a new resource |
| `read` | Read current resource state |
| `update` | Update an existing resource |
| `delete` | Delete a resource |

### Error Types

| Type | Description |
|------|-------------|
| `PulumiError` | General provider error with gRPC status |
| `CheckError` | Validation failures in check method |
| `ParseError` | Schema parsing errors |

## Scripts

```bash
bun run tsc    # Type check
bun run test   # Run tests
bun run check  # Lint and format
```

## License

MIT
