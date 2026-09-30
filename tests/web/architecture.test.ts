import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Course rule (docs/ARCHITECTURE.md): the frontend only talks to the backend. The AI models and the
// secrets live in the backend; nothing in the browser bundle may run or call them.

const WEB_SRC = "apps/web/src";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("frontend never runs or calls AI directly", () => {
  const files = sourceFiles(WEB_SRC);

  it("has no in-browser image model module", () => {
    expect(files.filter((f) => /clip/i.test(f))).toEqual([]);
  });

  it("imports no AI runtime or SDK", () => {
    const banned = /@huggingface|onnxruntime|transformers|ollama|openai|anthropic/i;
    const offenders = files.filter((f) => banned.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("declares no AI dependency in the web package.json", () => {
    const pkg = JSON.parse(readFileSync("apps/web/package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /huggingface|onnx|transformers|ollama|openai/i.test(d))).toEqual([]);
  });

  it("holds no secrets: only the public anon key and URLs are read from env", () => {
    const secretish = /SERVICE_ROLE|OLLAMA_API_KEY|HF_TOKEN|API_KEY/;
    const offenders = files.filter((f) => secretish.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
