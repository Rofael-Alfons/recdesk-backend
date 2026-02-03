"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrottleRegistration = exports.ThrottleAuth = void 0;
const throttler_1 = require("@nestjs/throttler");
const ThrottleAuth = () => (0, throttler_1.Throttle)({
    short: { limit: 10, ttl: 60000 },
    medium: { limit: 30, ttl: 300000 },
    long: { limit: 60, ttl: 3600000 },
});
exports.ThrottleAuth = ThrottleAuth;
const ThrottleRegistration = () => (0, throttler_1.Throttle)({
    short: { limit: 5, ttl: 60000 },
    medium: { limit: 10, ttl: 300000 },
    long: { limit: 20, ttl: 3600000 },
});
exports.ThrottleRegistration = ThrottleRegistration;
//# sourceMappingURL=throttle-auth.decorator.js.map