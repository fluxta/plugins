import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { R2_ENV_VARS } from "../scripts/publisher.mjs";
import { REGISTRY_SYNC_TOKEN_VAR, REGISTRY_SYNC_URL_VAR } from "../scripts/lib/registry-sync.mjs";
import { CREDENTIAL_ENV_VARS } from "../scripts/pr-validate.mjs";
import { repoRoot } from "./helpers.mjs";

const workflowPath = path.join(repoRoot, ".github", "workflows", "pull-request.yml");
const publishWorkflowPath = path.join(repoRoot, ".github", "workflows", "publish.yml");

/**
 * Publish workflow assertions need to target one job's body specifically —
 * the whole point of the split is that the 'build' job and the 'publish' job
 * carry different guarantees, so a whole-file regex can't tell them apart.
 */
function extractJob(workflow, jobName, nextJobName) {
  const startMatch = workflow.match(new RegExp(`^  ${jobName}:\\s*$`, "m"));
  assert.ok(startMatch, `expected a top-level '${jobName}:' job in the workflow`);
  const start = startMatch.index;

  let end = workflow.length;
  if (nextJobName) {
    const endMatch = workflow
      .slice(start + 1)
      .match(new RegExp(`^  ${nextJobName}:\\s*$`, "m"));
    if (endMatch) {
      end = start + 1 + endMatch.index;
    }
  }

  return workflow.slice(start, end);
}

test("pull request CI runs the validation seam in validate-only mode", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /^on:\s*$/m);
  assert.match(workflow, /^\s*pull_request:\s*$/m);

  assert.match(workflow, /pr-validate\.mjs/);
  assert.match(workflow, /--base-ref/);
  assert.match(workflow, /--source-commit/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("pull request CI requires no publication credentials", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, new RegExp(CREDENTIAL_ENV_VARS.join("|")));
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /plugins\.mjs publish/);
});

test("main-branch CI publishes through the repository seam in publish mode only from main", async () => {
  const workflow = await readFile(publishWorkflowPath, "utf8");

  assert.match(workflow, /^on:\s*$/m);
  assert.match(workflow, /^\s*push:\s*$/m);
  assert.match(workflow, /branches:\s*\n\s*-\s*main\s*$/m);
  assert.doesNotMatch(workflow, /pull_request/);

  const publishJob = extractJob(workflow, "publish", null);
  assert.match(publishJob, /plugins\.mjs publish/);
  assert.match(publishJob, /--publisher r2/);
  assert.match(publishJob, /--source-commit/);
  assert.match(publishJob, /needs:\s*build/);
});

test("main-branch publication uses R2 credentials that pull request CI cannot access", async () => {
  const workflow = await readFile(publishWorkflowPath, "utf8");
  const publishJob = extractJob(workflow, "publish", null);

  for (const name of R2_ENV_VARS) {
    assert.match(
      publishJob,
      new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`),
      `the publish job maps the ${name} secret into the environment`,
    );
  }
  const allowedElsewhere = new Set([...R2_ENV_VARS, REGISTRY_SYNC_TOKEN_VAR]);
  assert.doesNotMatch(
    workflow,
    new RegExp(CREDENTIAL_ENV_VARS.filter((name) => !allowedElsewhere.has(name)).join("|")),
    "credential environment variables other than R2 and the Registry sync token are not used anywhere in the workflow",
  );
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow, /git (commit|push)|contents:\s*write/);
  assert.doesNotMatch(workflow, /create-pull-request|peter-evans/);
});

test("main-branch publication posts the Publication Index to the Plugin Registry only after R2 succeeds, non-blocking", async () => {
  const workflow = await readFile(publishWorkflowPath, "utf8");
  const publishJob = extractJob(workflow, "publish", null);

  assert.match(publishJob, /registry-sync\.mjs/);
  assert.match(publishJob, /--result\b/);
  assert.match(
    publishJob,
    new RegExp(`${REGISTRY_SYNC_TOKEN_VAR}: \\$\\{\\{ secrets\\.${REGISTRY_SYNC_TOKEN_VAR} \\}\\}`),
    "the publish job maps the Registry sync bearer token secret into the environment",
  );
  assert.match(
    publishJob,
    new RegExp(`${REGISTRY_SYNC_URL_VAR}: \\$\\{\\{ secrets\\.${REGISTRY_SYNC_URL_VAR} \\}\\}`),
  );
  assert.match(publishJob, /registry-sync\.mjs[\s\S]*continue-on-error:\s*true|continue-on-error:\s*true[\s\S]*registry-sync\.mjs/);

  // The sync step must come after the R2 publish step and carry no 'if:'
  // condition of its own, so a failed R2 publish stops the job before the
  // sync step is ever reached — the Registry is only ever posted to once R2
  // has already succeeded.
  const r2StepIndex = publishJob.indexOf("Publish Plugin Artifacts and Publication Index");
  const syncStepIndex = publishJob.indexOf("registry-sync.mjs");
  assert.ok(r2StepIndex >= 0 && syncStepIndex > r2StepIndex);
  const syncStep = publishJob.slice(publishJob.lastIndexOf("- name:", syncStepIndex));
  assert.doesNotMatch(syncStep, /^\s*if:/m);
});

test("the build job never references publication credentials or a publisher", async () => {
  const workflow = await readFile(publishWorkflowPath, "utf8");
  const buildJob = extractJob(workflow, "build", "publish");

  // This is the job that runs each Plugin Source Package's own
  // 'pnpm install'/'pnpm run build' — the only place package-owned code
  // executes. It must have nothing to leak: no 'secrets.' reference at all,
  // matching the same guarantee pull request CI already has.
  assert.doesNotMatch(buildJob, /secrets\./);
  assert.doesNotMatch(buildJob, new RegExp(CREDENTIAL_ENV_VARS.join("|")));
  assert.doesNotMatch(buildJob, /--publisher/);
  assert.doesNotMatch(buildJob, /plugins\.mjs publish/);
  assert.match(buildJob, /plugins\.mjs build\b/);
  assert.match(buildJob, /--out\b/);
});

test("the publish job runs from a build snapshot and never builds a Plugin Source Package itself", async () => {
  const workflow = await readFile(publishWorkflowPath, "utf8");
  const publishJob = extractJob(workflow, "publish", null);

  assert.match(publishJob, /--from-snapshot\b/);
  assert.doesNotMatch(publishJob, /plugins\.mjs build\b/);
  // 'pnpm install' here only installs this repository's own tooling
  // dependencies, not a Plugin Source Package's; it must never run a
  // package's own build script.
  assert.doesNotMatch(publishJob, /pnpm run build|pnpm\s+build\b/);
});
