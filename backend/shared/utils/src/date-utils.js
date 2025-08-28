"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpired = exports.getDaysFromNow = exports.subtractDays = exports.addDays = exports.isValidDate = exports.formatDate = void 0;
const moment_1 = __importDefault(require("moment"));
const formatDate = (date, format = 'YYYY-MM-DD') => {
    return (0, moment_1.default)(date).format(format);
};
exports.formatDate = formatDate;
const isValidDate = (date) => {
    return (0, moment_1.default)(date).isValid();
};
exports.isValidDate = isValidDate;
const addDays = (date, days) => {
    return (0, moment_1.default)(date).add(days, 'days').toDate();
};
exports.addDays = addDays;
const subtractDays = (date, days) => {
    return (0, moment_1.default)(date).subtract(days, 'days').toDate();
};
exports.subtractDays = subtractDays;
const getDaysFromNow = (date) => {
    return (0, moment_1.default)(date).diff((0, moment_1.default)(), 'days');
};
exports.getDaysFromNow = getDaysFromNow;
const isExpired = (date) => {
    return (0, moment_1.default)(date).isBefore((0, moment_1.default)());
};
exports.isExpired = isExpired;
//# sourceMappingURL=date-utils.js.map