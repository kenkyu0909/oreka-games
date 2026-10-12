import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  supportedNode,
  localPort,
  dependencyKey,
  npmInvocation,
} from "../scripts/launcher-utils.mjs";

test("launcher requires Node 22.12 or newer before installation", () => {
  for (const version of ["18.20.0", "20.19.0", "22.11.0", "bad", "22.bad.0"])
    assert.equal(supportedNode(version), false);
  for (const version of ["22.12.0", "22.22.3", "24.0.0", "24.10.0"])
    assert.equal(supportedNode(version), true);
});
test("launcher validates its port before starting a process or opening a URL", () => {
  assert.equal(localPort(undefined), 3000);
  assert.equal(localPort("8080"), 8080);
  assert.equal(localPort("65535"), 65535);
  for (const value of [
    "0",
    "65536",
    "-1",
    "1.5",
    "abc",
    "3000 & calc.exe",
    "http://elsewhere",
    "",
  ])
    assert.throws(() => localPort(value));
});
test("dependency stamp changes for lockfile, Node runtime, platform or architecture", () => {
  const base = ["lock-a", "22.12.0", "win32", "x64"];
  const original = dependencyKey(...base);
  assert.equal(dependencyKey(...base), original);
  for (let i = 0; i < base.length; i++) {
    const values = [...base];
    values[i] += "changed";
    assert.notEqual(dependencyKey(...values), original);
  }
});
test("npm runs via Windows cmd with delayed expansion off and without interpolating the project path", () => {
  const command = npmInvocation(
    "install",
    "win32",
    "C:\\Windows\\System32\\cmd.exe",
  );
  assert.equal(command.command, "C:\\Windows\\System32\\cmd.exe");
  assert.equal(command.windowsVerbatimArguments, true);
  assert.deepEqual(command.args, [
    "/d",
    "/v:off",
    "/s",
    "/c",
    '"npm.cmd ci --include=dev --no-audit --no-fund"',
  ]);
  assert.deepEqual(npmInvocation("build", "linux").args, ["run", "build"]);
  assert.throws(() => npmInvocation("something & unsafe", "win32"));
});
test("batch launcher uses its own folder, keeps failures visible and disables ! expansion", () => {
  const bat = readFileSync(
    new URL("../start-game.bat", import.meta.url),
    "utf8",
  );
  assert.match(bat, /DisableDelayedExpansion/);
  assert.match(bat, /pushd "%~dp0"/);
  assert.match(bat, /node scripts\\launch-game\.mjs/);
  assert.match(bat, /set "RESULT=%ERRORLEVEL%"/);
  assert.match(bat, /pause/);
  assert.doesNotMatch(bat, /powershell|ExecutionPolicy|taskkill/i);
});

// npm's generated vite.cmd can misparse an ampersand in the checkout path.
test("build uses the Vite Node entrypoint instead of its Windows shell shim", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.scripts.build, "node node_modules/vite/bin/vite.js build");
});
