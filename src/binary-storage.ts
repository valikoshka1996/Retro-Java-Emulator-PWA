import Dexie, { type DBCore, type DBCoreMutateRequest } from "dexie";

// WebKit can read an existing Blob but fail when a record containing that Blob
// is written again. Store owned bytes instead; expose Blob at the app boundary.
const tag = "__javaRetroBinaryV1";
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
function hasBlob(value: unknown): boolean {
  if (value instanceof Blob) return true;
  if (Array.isArray(value)) return value.some(hasBlob);
  return plain(value) && Object.values(value).some(hasBlob);
}
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob)
    return { [tag]: true, type: value.type, bytes: await value.arrayBuffer() };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (plain(value))
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await encode(v)]),
      ),
    );
  return value;
}
export function decodeBinary<T>(value: T): T {
  if (plain(value)) {
    if (
      value[tag] === true &&
      value.bytes instanceof ArrayBuffer &&
      typeof value.type === "string"
    )
      return new Blob([value.bytes], { type: value.type }) as T;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decodeBinary(v)]),
    ) as T;
  }
  if (Array.isArray(value)) return value.map(decodeBinary) as T;
  return value;
}
export function installBinaryStorage(database: Dexie) {
  database.use({
    stack: "dbcore",
    name: "portable-binary-storage",
    create: (down: DBCore): DBCore => ({
      ...down,
      table: (name: string) => {
        const table = down.table(name);
        return {
          ...table,
          mutate: (request: DBCoreMutateRequest) => {
            if (
              (request.type !== "add" && request.type !== "put") ||
              !request.values.some(hasBlob)
            )
              return table.mutate(request);
            // Only local Blob reads happen here, never network or ZIP work.
            return Dexie.waitFor(Promise.all(request.values.map(encode))).then(
              (values) => table.mutate({ ...request, values }),
            );
          },
        };
      },
    }),
  });
  for (const table of database.tables) table.hook("reading", decodeBinary);
}
