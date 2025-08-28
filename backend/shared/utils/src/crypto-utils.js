"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskString = exports.generateApiKey = exports.hashString = exports.generateToken = exports.generateUuid = void 0;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const generateUuid = () => {
    return (0, uuid_1.v4)();
};
exports.generateUuid = generateUuid;
const generateToken = (length = 32) => {
    return crypto_1.default.randomBytes(length).toString('hex');
};
exports.generateToken = generateToken;
const hashString = (input, algorithm = 'sha256') => {
    return crypto_1.default.createHash(algorithm).update(input).digest('hex');
};
exports.hashString = hashString;
const generateApiKey = () => {
    return `fp_${(0, exports.generateToken)(24)}`;
};
exports.generateApiKey = generateApiKey;
const maskString = (input, visibleChars = 4) => {
    if (input.length <= visibleChars)
        return input;
    const masked = '*'.repeat(input.length - visibleChars);
    return input.slice(0, visibleChars) + masked;
};
exports.maskString = maskString;
//# sourceMappingURL=crypto-utils.js.map