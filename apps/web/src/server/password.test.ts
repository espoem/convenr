import { argon2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const unpadded = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/u, "");

describe("password hashes (ADR 0003)", () => {
	it("stores Argon2id with the OWASP minimum parameters and a fresh salt", async () => {
		const first = await hashPassword("tajne heslo");
		const second = await hashPassword("tajne heslo");

		expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
		expect(first).not.toBe(second);
	});

	it("verifies the right password and refuses a wrong one", async () => {
		const stored = await hashPassword("tajne heslo");

		expect(await verifyPassword("tajne heslo", stored)).toBe(true);
		expect(await verifyPassword("tajné heslo", stored)).toBe(false);
	});

	it("verifies a hash made with the parameters stored in it, so they can be raised later", async () => {
		const salt = Buffer.from("0123456789abcdef");

		const key = argon2Sync("argon2id", {
			message: "heslo",
			nonce: salt,
			tagLength: 32,
			memory: 8192,
			passes: 3,
			parallelism: 1,
		});

		const older = `$argon2id$v=19$m=8192,t=3,p=1$${unpadded(salt)}$${unpadded(key)}`;

		expect(await verifyPassword("heslo", older)).toBe(true);
	});

	it("refuses to read a stored hash that is not an Argon2id PHC string", async () => {
		await expect(verifyPassword("heslo", "$argon2id$v=19$bad")).rejects.toThrow(/PHC/u);
	});

	it("hashes many passwords at once without failing", async () => {
		const hashes = await Promise.all(
			Array.from({ length: 10 }, (_, index) => hashPassword(`p${index}`)),
		);

		expect(new Set(hashes).size).toBe(10);
	});
});
