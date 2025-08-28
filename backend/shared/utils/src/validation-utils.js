"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeHtml = exports.isValidUuid = exports.isValidUrl = exports.isValidEmail = exports.uuidSchema = exports.urlSchema = exports.emailSchema = void 0;
const zod_1 = require("zod");
exports.emailSchema = zod_1.z.string().email();
exports.urlSchema = zod_1.z.string().url();
exports.uuidSchema = zod_1.z.string().uuid();
const isValidEmail = (email) => {
    return exports.emailSchema.safeParse(email).success;
};
exports.isValidEmail = isValidEmail;
const isValidUrl = (url) => {
    return exports.urlSchema.safeParse(url).success;
};
exports.isValidUrl = isValidUrl;
const isValidUuid = (uuid) => {
    return exports.uuidSchema.safeParse(uuid).success;
};
exports.isValidUuid = isValidUuid;
const sanitizeHtml = (html) => {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+="[^"]*"/gi, '');
};
exports.sanitizeHtml = sanitizeHtml;
//# sourceMappingURL=validation-utils.js.map