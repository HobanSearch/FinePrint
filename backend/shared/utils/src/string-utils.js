"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kebabCase = exports.camelCase = exports.capitalize = exports.truncate = exports.slugify = void 0;
const slugify = (text) => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};
exports.slugify = slugify;
const truncate = (text, maxLength) => {
    if (text.length <= maxLength)
        return text;
    return text.slice(0, maxLength).trim() + '...';
};
exports.truncate = truncate;
const capitalize = (text) => {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};
exports.capitalize = capitalize;
const camelCase = (text) => {
    return text
        .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
        .replace(/\s+/g, '');
};
exports.camelCase = camelCase;
const kebabCase = (text) => {
    return text
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
};
exports.kebabCase = kebabCase;
//# sourceMappingURL=string-utils.js.map