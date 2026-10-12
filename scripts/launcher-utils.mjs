import { createHash } from "node:crypto";

export function supportedNode(version) {
  const [major, minor] = version.split(".").map(Number);
  return (
    Number.isInteger(major) &&
    Number.isInteger(minor) &&
    (major > 22 || (major === 22 && minor >= 12))
  );
}

export function localPort(value) {
  const text = value ?? "3000";
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535)
    throw new Error("PORTは1〜65535の整数にしてください（通常は3000）。");
  return Number(text);
}

export function dependencyKey(lockfile, version, platform, arch) {
  return createHash("sha256")
    .update(lockfile)
    .update(JSON.stringify([version, platform, arch, "npm-ci-include-dev-v1"]))
    .digest("hex");
}

// Only fixed, developer-owned commands are sent to cmd.exe. Never interpolate paths.
export function npmInvocation(task, platform, comspec = "cmd.exe") {
  const commands = {
    install: ["ci", "--include=dev", "--no-audit", "--no-fund"],
    build: ["run", "build"],
  };
  const args = commands[task];
  if (!args) throw new Error("Unknown launcher task");
  return platform === "win32"
    ? {
        command: comspec,
        args: ["/d", "/v:off", "/s", "/c", `"npm.cmd ${args.join(" ")}"`],
        windowsVerbatimArguments: true,
      }
    : { command: "npm", args, windowsVerbatimArguments: false };
}
