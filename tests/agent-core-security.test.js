"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isPathAllowed } = require("../agent-core/autonomy-policy");
const { validateSource } = require("../code-sandbox");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ultron-policy-"));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ultron-outside-"));
try {
  fs.mkdirSync(path.join(root, "safe"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");

  assert.equal(isPathAllowed("safe/new.txt", root), true);
  assert.equal(isPathAllowed("../outside.txt", root), false);

  try {
    fs.symlinkSync(outside, path.join(root, "escape"), "junction");
    assert.equal(isPathAllowed("escape/secret.txt", root), false);
  } catch (error) {
    // Symlink creation may be unavailable on restricted CI runners.
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
  }

  assert.equal(validateSource("return await tools.readFile('package.json');").allowed, true);
  assert.equal(validateSource("return process.env.SECRET;").allowed, false);
  assert.equal(validateSource("return require('fs').readFileSync('x');").allowed, false);
  assert.equal(validateSource("return ({}).constructor('return process')();").allowed, false);

  console.log("agent-core security tests: PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
