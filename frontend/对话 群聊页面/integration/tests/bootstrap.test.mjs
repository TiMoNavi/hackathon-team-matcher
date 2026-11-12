import assert from "node:assert/strict";
import test from "node:test";
import { parseBootstrap, parseShellPath } from "../src/bootstrap.ts";

const origin = "http://127.0.0.1:8124";
const input = () => ({ schema_version: 1, integration_stage: "shell", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: "/dashboard/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-csrf-for-parser-tests" });

test("accepts only the fixed eight-field shell contract and freezes its projection", () => {
  const result = parseBootstrap(input(), origin);
  assert.equal(result.integration_stage, "shell");
  assert.equal(Object.keys(result).length, 8);
  assert.ok(Object.isFrozen(result));
});

test("accepts server-generated pretty and front-controller links", () => {
  const value = input();
  value.native_home_url = "/dashboard";
  assert.equal(parseBootstrap(value, origin).native_home_url, "/dashboard");
  value.native_home_url = "/index.php?r=dashboard%2Fdashboard";
  value.native_login_url = "/index.php?r=user%2Fauth%2Flogin";
  assert.equal(parseBootstrap(value, origin).native_login_url, value.native_login_url);
});

test("rejects absent, inherited, unknown and changed-version bootstrap fields", () => {
  for (const key of Object.keys(input())) {
    const value = input(); delete value[key];
    assert.throws(() => parseBootstrap(value, origin));
  }
  for (const value of [null, [], "", { ...input(), user_id: 1 }, { ...input(), actor: {} }, { ...input(), schema_version: "1" }, { ...input(), schema_version: 2 }, { ...input(), integration_stage: "ready" }, Object.create(input())]) {
    assert.throws(() => parseBootstrap(value, origin));
  }
});

test("rejects changed roots and malformed CSRF without exposing values", () => {
  for (const change of [{ base_path: "/matcher/app" }, { api_base: "https://example.test/api/v1" }, { csrf_header: "Authorization" }, { csrf_token: "" }, { csrf_token: 1 }, { csrf_token: "x".repeat(4097) }, { csrf_token: "token\nvalue" }]) {
    assert.throws(() => parseBootstrap({ ...input(), ...change }, origin), /^Error: Invalid chat bootstrap\.$/);
  }
});

test("rejects external, redirected, ambiguous and traversal native links", () => {
  const invalid = ["https://example.test/dashboard/dashboard", "//example.test/dashboard/dashboard", "/user/registration", "/dashboard/dashboard?returnUrl=/mail", "/dashboard/dashboard#part", "/x/../dashboard/dashboard", "/dashboard%2Fdashboard", "/index.php?r=dashboard/dashboard&r=dashboard/dashboard", "/index.php?r=dashboard/dashboard&returnUrl=/mail", "/index.php?r=mail/mail/index", "/\\example.test/dashboard/dashboard", "/dashboard/dashboard\n"];
  for (const link of invalid) assert.throws(() => parseBootstrap({ ...input(), native_home_url: link }, origin));
});

test("shell deep links validate decimal bounds without returning conversation facts", () => {
  assert.equal(parseShellPath("/matcher/chat"), "index");
  assert.equal(parseShellPath("/matcher/chat/conversations/1"), "conversation");
  assert.equal(parseShellPath("/matcher/chat/conversations/9223372036854775807"), "conversation");
  for (const url of ["/matcher/chat/", "/matcher/chat/conversations/0", "/matcher/chat/conversations/-1", "/matcher/chat/conversations/01", "/matcher/chat/conversations/9223372036854775808", "/matcher/chat/conversations/99999999999999999999", "/matcher/chat/conversations/1/messages", "/matcher/chat/conversations/%31", "/matcher/chat/../mail", "/api/v1/conversations"]) assert.throws(() => parseShellPath(url));
});
