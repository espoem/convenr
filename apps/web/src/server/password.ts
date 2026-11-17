// Password hashes by ADR 0003, item 5: Argon2id from node:crypto in PHC string format.
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

// The OWASP minimum for Argon2id. Raising them changes new hashes only.
const current = { memory: 19 * 1024, passes: 2, parallelism: 1 };

const SALT_BYTES = 16;
const TAG_BYTES = 32;

// Each hash holds 19 MiB while it runs. More requests wait for a free place.
const MAX_CONCURRENT_HASHES = 4;

let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_HASHES) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running += 1;
  }

  try {
    return await work();
  } finally {
    const next = waiting.shift();

    // A waiting request takes over the place, so `running` stays the same.
    if (next === undefined) {
      running -= 1;
    } else {
      next();
    }
  }
}

type Parameters = typeof current;

function derive(password: string, salt: Buffer, parameters: Parameters): Promise<Buffer> {
  return limited(
    () =>
      new Promise((resolve, reject) => {
        argon2(
          "argon2id",
          { message: password, nonce: salt, tagLength: TAG_BYTES, ...parameters },
          (error, key) => (error === null ? resolve(key) : reject(error)),
        );
      }),
  );
}

// PHC strings use base64 without padding.
const encode = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");

/** `$argon2id$v=19$m=…,t=…,p=…$salt$hash` for a new random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, current);
  const { memory, passes, parallelism } = current;

  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${encode(salt)}$${encode(key)}`;
}

const phcPattern = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([\w+/]+)\$([\w+/]+)$/;

/** Whether `password` matches a stored hash, with the parameters stored in that hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = phcPattern.exec(stored);

  if (match === null) {
    throw new Error("A stored password hash is not an Argon2id PHC string.");
  }

  const [, memory, passes, parallelism, salt = "", hash = ""] = match;
  const expected = Buffer.from(hash, "base64");

  const key = await derive(password, Buffer.from(salt, "base64"), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  });

  return key.length === expected.length && timingSafeEqual(key, expected);
}
