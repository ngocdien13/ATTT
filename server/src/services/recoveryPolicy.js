"use strict";
exports.waitSeconds = (count) =>
  count < 5 ? 0 : [30, 60, 300, 900, 3600, 21600][Math.min(count - 5, 5)];
