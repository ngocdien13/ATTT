"use strict";
const assert = require("node:assert/strict");
exports.finishRecovery = async (p, pin = "72649315") => {
  await p.locator("#recoveryDialog").waitFor({ state: "visible" });
  let code = null;
  if (await p.locator("#recoverySetup").isVisible()) {
    await p.locator("#recoveryPin").fill(pin);
    await p.locator("#recoveryPinConfirm").fill(pin);
    await p.locator("#recoverySubmit").click();
    await p.locator("#recoverySave").waitFor({ state: "visible" });
    code = await p.locator("#recoveryCode").textContent();
    assert.equal(code.replaceAll("-", "").length, 64);
    await p.locator("#recoverySaved").check();
    await p.locator("#recoverySubmit").click();
  } else {
    await p.locator("#recoveryValue").fill(pin);
    await p.locator("#recoverySubmit").click();
  }
  await p.locator("#recoveryDialog").waitFor({ state: "hidden" });
  await p.locator("#userInfo").waitFor({ state: "visible" });
  await p.waitForFunction(
    () => document.querySelector("#newGroup").disabled === false,
    {},
    { timeout: 20000 },
  );
  return code;
};
