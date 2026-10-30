"use strict";
require("esbuild").buildSync({
  entryPoints: [
    require("path").resolve(__dirname, "../src/crypto/secure-v2.mjs"),
  ],
  bundle: true,
  format: "iife",
  globalName: "SeruchatV2",
  platform: "browser",
  target: "es2022",
  outfile: require("path").resolve(
    __dirname,
    "../../client/js/vendor/secure-v2.js",
  ),
  legalComments: "eof",
});
