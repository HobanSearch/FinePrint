"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleCache = exports.MemoryTracker = exports.CircuitBreaker = exports.RateLimiter = void 0;
exports.delay = delay;
exports.retry = retry;
exports.chunk = chunk;
exports.sanitizeString = sanitizeString;
exports.extractDomain = extractDomain;
exports.generateHash = generateHash;
exports.calculateSimilarity = calculateSimilarity;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
exports.isValidEmail = isValidEmail;
exports.isValidUrl = isValidUrl;
exports.stripHtml = stripHtml;
exports.truncate = truncate;
exports.deepClone = deepClone;
exports.groupBy = groupBy;
exports.percentile = percentile;
const logger_1 = require("./logger");
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function retry(fn, maxAttempts, baseDelay = 1000) {
    let attempt = 1;
    while (attempt <= maxAttempts) {
        try {
            return await fn();
        }
        catch (error) {
            if (attempt === maxAttempts) {
                logger_1.logger.error(`Function failed after ${maxAttempts} attempts:`, error);
                throw error;
            }
            const delayMs = baseDelay * Math.pow(2, attempt - 1);
            logger_1.logger.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms:`, error);
            await delay(delayMs);
            attempt++;
        }
    }
    return null;
}
function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
function sanitizeString(str) {
    return str
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    }
    catch (error) {
        logger_1.logger.error('Invalid URL:', url);
        return '';
    }
}
function generateHash(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
}
function calculateSimilarity(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;
    if (len1 === 0)
        return len2;
    if (len2 === 0)
        return len1;
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
}
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    else {
        return `${seconds}s`;
    }
}
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
function stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
}
function truncate(str, length, suffix = '...') {
    if (str.length <= length)
        return str;
    return str.substring(0, length - suffix.length) + suffix;
}
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    if (obj instanceof Date)
        return new Date(obj.getTime());
    if (obj instanceof Array)
        return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    return obj;
}
function groupBy(array, key) {
    return array.reduce((groups, item) => {
        const group = String(item[key]);
        if (!groups[group]) {
            groups[group] = [];
        }
        groups[group].push(item);
        return groups;
    }, {});
}
function percentile(arr, p) {
    if (arr.length === 0)
        return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    if (Math.floor(index) === index) {
        return sorted[index];
    }
    else {
        const lower = sorted[Math.floor(index)];
        const upper = sorted[Math.ceil(index)];
        return lower + (upper - lower) * (index - Math.floor(index));
    }
}
class RateLimiter {
    maxRequests;
    windowMs;
    requests = [];
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    canMakeRequest() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        if (this.requests.length < this.maxRequests) {
            this.requests.push(now);
            return true;
        }
        return false;
    }
    getWaitTime() {
        if (this.requests.length === 0)
            return 0;
        const oldestRequest = Math.min(...this.requests);
        const waitTime = this.windowMs - (Date.now() - oldestRequest);
        return Math.max(0, waitTime);
    }
}
exports.RateLimiter = RateLimiter;
class CircuitBreaker {
    failureThreshold;
    resetTimeoutMs;
    failures = 0;
    lastFailTime = 0;
    state = 'closed';
    constructor(failureThreshold = 5, resetTimeoutMs = 60000) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
    }
    async execute(operation) {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailTime > this.resetTimeoutMs) {
                this.state = 'half-open';
            }
            else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = 'closed';
    }
    onFailure() {
        this.failures++;
        this.lastFailTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'open';
        }
    }
    getState() {
        return this.state;
    }
}
exports.CircuitBreaker = CircuitBreaker;
class MemoryTracker {
    startMemory;
    constructor() {
        this.startMemory = process.memoryUsage();
    }
    getUsage() {
        const current = process.memoryUsage();
        return {
            rss: formatBytes(current.rss),
            heapTotal: formatBytes(current.heapTotal),
            heapUsed: formatBytes(current.heapUsed),
            external: formatBytes(current.external),
            diff: {
                rss: formatBytes(current.rss - this.startMemory.rss),
                heapTotal: formatBytes(current.heapTotal - this.startMemory.heapTotal),
                heapUsed: formatBytes(current.heapUsed - this.startMemory.heapUsed),
                external: formatBytes(current.external - this.startMemory.external),
            },
        };
    }
}
exports.MemoryTracker = MemoryTracker;
class SimpleCache {
    defaultTtlMs;
    cache = new Map();
    constructor(defaultTtlMs = 300000) {
        this.defaultTtlMs = defaultTtlMs;
    }
    set(key, value, ttlMs) {
        const expires = Date.now() + (ttlMs || this.defaultTtlMs);
        this.cache.set(key, { value, expires });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expires) {
                this.cache.delete(key);
            }
        }
        return this.cache.size;
    }
}
exports.SimpleCache = SimpleCache;
//# sourceMappingURL=helpers.js.map