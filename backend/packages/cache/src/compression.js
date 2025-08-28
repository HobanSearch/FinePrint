"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressionPresets = exports.CompressionManager = void 0;
const zlib_1 = require("zlib");
class CompressionManager {
    config;
    constructor(config) {
        this.config = config;
    }
    compress(data) {
        const originalSize = Buffer.byteLength(data, 'utf8');
        if (!this.config.enabled || originalSize < this.config.threshold) {
            return {
                data,
                compressed: false,
                originalSize,
                compressedSize: originalSize
            };
        }
        try {
            let compressedData;
            switch (this.config.algorithm) {
                case 'gzip':
                    compressedData = (0, zlib_1.gzipSync)(data, { level: this.config.level || 6 });
                    break;
                case 'lz4':
                    compressedData = (0, zlib_1.gzipSync)(data, { level: this.config.level || 1 });
                    break;
                case 'snappy':
                    compressedData = (0, zlib_1.gzipSync)(data, { level: this.config.level || 1 });
                    break;
                default:
                    compressedData = (0, zlib_1.gzipSync)(data, { level: this.config.level || 6 });
            }
            const compressedSize = compressedData.length;
            if (compressedSize < originalSize * 0.9) {
                return {
                    data: compressedData.toString('base64'),
                    compressed: true,
                    originalSize,
                    compressedSize
                };
            }
            else {
                return {
                    data,
                    compressed: false,
                    originalSize,
                    compressedSize: originalSize
                };
            }
        }
        catch (error) {
            return {
                data,
                compressed: false,
                originalSize,
                compressedSize: originalSize
            };
        }
    }
    decompress(data, wasCompressed) {
        if (!wasCompressed || typeof data !== 'string') {
            return data;
        }
        try {
            const buffer = Buffer.from(data, 'base64');
            switch (this.config.algorithm) {
                case 'gzip':
                    return (0, zlib_1.gunzipSync)(buffer).toString('utf8');
                case 'lz4':
                    return (0, zlib_1.gunzipSync)(buffer).toString('utf8');
                case 'snappy':
                    return (0, zlib_1.gunzipSync)(buffer).toString('utf8');
                default:
                    return (0, zlib_1.gunzipSync)(buffer).toString('utf8');
            }
        }
        catch (error) {
            return data;
        }
    }
    getCompressionRatio(originalSize, compressedSize) {
        if (originalSize === 0)
            return 1;
        return compressedSize / originalSize;
    }
    estimateCompressionBenefit(dataSize) {
        if (!this.config.enabled || dataSize < this.config.threshold) {
            return 0;
        }
        switch (this.config.algorithm) {
            case 'gzip':
                return Math.max(0, dataSize * 0.3);
            case 'lz4':
                return Math.max(0, dataSize * 0.5);
            case 'snappy':
                return Math.max(0, dataSize * 0.4);
            default:
                return Math.max(0, dataSize * 0.3);
        }
    }
    shouldCompress(dataSize) {
        return this.config.enabled && dataSize >= this.config.threshold;
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}
exports.CompressionManager = CompressionManager;
exports.compressionPresets = {
    archival: {
        enabled: true,
        algorithm: 'gzip',
        threshold: 1024,
        level: 9
    },
    balanced: {
        enabled: true,
        algorithm: 'gzip',
        threshold: 4096,
        level: 6
    },
    fast: {
        enabled: true,
        algorithm: 'lz4',
        threshold: 8192,
        level: 1
    },
    disabled: {
        enabled: false,
        algorithm: 'gzip',
        threshold: Number.MAX_SAFE_INTEGER,
        level: 1
    }
};
//# sourceMappingURL=compression.js.map