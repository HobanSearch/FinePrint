"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockRedis = void 0;
exports.mockRedis = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    decrby: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn().mockResolvedValue(1),
    lpush: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
    lpop: jest.fn().mockResolvedValue(null),
    rpop: jest.fn().mockResolvedValue(null),
    llen: jest.fn().mockResolvedValue(0),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    sismember: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue([]),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    pipeline: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
    }),
    multi: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
    }),
    on: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    emit: jest.fn().mockReturnThis(),
    eval: jest.fn().mockResolvedValue(0),
    _mockData: new Map(),
    _setMockData: function (key, value) {
        this._mockData.set(key, value);
        this.get.mockImplementation((k) => Promise.resolve(k === key ? value : null));
    },
    _clearMockData: function () {
        this._mockData.clear();
        this.get.mockResolvedValue(null);
        this.hgetall.mockResolvedValue({});
        this.smembers.mockResolvedValue([]);
        this.zrange.mockResolvedValue([]);
    },
    _simulateError: function (method, error) {
        this[method].mockRejectedValueOnce(error);
    },
};
exports.default = exports.mockRedis;
//# sourceMappingURL=redis.mock.js.map