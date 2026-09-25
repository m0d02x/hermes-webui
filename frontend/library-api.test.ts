import assert from "node:assert/strict";
import test from "node:test";
import { uploadLibraryBatch, type LibraryRequest } from "./library-api";

test("upload batch keeps its starting project and folder across navigation", async () => {
  const files = [
    { file: new File(["one"], "one.txt"), relDir: "Manuals/Setup" },
    { file: new File(["two"], "two.txt"), relDir: "Manuals/Setup" },
  ];
  const captured: { project: FormDataEntryValue | null; path: FormDataEntryValue | null }[] = [];
  let releaseFirst!: () => void;
  const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const request: LibraryRequest = async <T>(_path: string, options: Parameters<LibraryRequest>[1]) => {
    assert.ok(options);
    assert.ok(options.body instanceof FormData);
    const body = options.body;
    captured.push({ project: body.get("project_id"), path: body.get("path") });
    calls++;
    if (calls === 1) await firstRequest;
    return (calls === 2 ? { files: [{ extract_error: "unsupported archive" }] } : { files: [] }) as unknown as T;
  };

  let selectedProject = "project-start";
  let selectedFolder = "Research";
  const batch = uploadLibraryBatch(files, selectedProject, selectedFolder, request);
  assert.deepEqual(captured, [{ project: "project-start", path: "Research/Manuals/Setup" }]);
  selectedProject = "project-after-navigation";
  selectedFolder = "Elsewhere";
  releaseFirst();
  const failed = await batch;

  assert.equal(selectedProject, "project-after-navigation");
  assert.equal(selectedFolder, "Elsewhere");
  assert.deepEqual(captured, [
    { project: "project-start", path: "Research/Manuals/Setup" },
    { project: "project-start", path: "Research/Manuals/Setup" },
  ]);
  assert.deepEqual(failed, ["two.txt: unsupported archive"]);
});
