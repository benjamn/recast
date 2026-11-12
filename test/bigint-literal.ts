import assert from "assert";
import * as recast from "../main";
import * as types from "ast-types";

const b = types.builders;

describe("ESTree BigInt Literal printing", function () {
  it("prints builders.literal(BigInt) with an n suffix", function () {
    assert.strictEqual(recast.print(b.literal(BigInt(10))).code, "10n");
    assert.strictEqual(recast.print(b.literal(BigInt(0))).code, "0n");
  });

  it("preserves raw ESTree BigInt spelling including hex", function () {
    const hex = {
      type: "Literal" as const,
      value: BigInt("0x1f"),
      raw: "0x1fn",
      bigint: "0x1f",
    };
    assert.strictEqual(recast.print(hex).code, "0x1fn");

    const huge = {
      type: "Literal" as const,
      value: BigInt("12345678901234567890"),
      raw: "12345678901234567890n",
      bigint: "12345678901234567890",
    };
    assert.strictEqual(recast.print(huge).code, "12345678901234567890n");
  });

  it("falls back to the bigint field when raw is missing", function () {
    const node = {
      type: "Literal" as const,
      value: BigInt("0x1f"),
      bigint: "0x1f",
    };
    assert.strictEqual(recast.print(node).code, "0x1fn");
  });
});
