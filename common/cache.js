var redis  = require('./redis');
var _      = require('lodash');
var logger = require('./logger');

var get = function (key, callback) {
    var t = new Date();
    redis.get(key, function (err, data) {
        if (err) {
            return callback(err);
        }
        if (!data) {
            return callback();
        }
        data = JSON.parse(data);
        var duration = (new Date() - t);
        logger.debug("Cache get "+ key +", value "+ JSON.stringify(data));
        callback(null, data);
    });
};

exports.get = get;

// time 参数可选，秒为单位
var set = function (key, value, time, callback) {
    var t = new Date();

    if (typeof time === 'function') {
        callback = time;
        time = null;
    }
    callback = callback || _.noop;
    value = JSON.stringify(value);

    if (!time) {
        redis.set(key, value, callback);
    } else {
        redis.set(key, time, value, callback);
    }
    var duration = (new Date() - t);
    logger.debug("Cache set "+ key +", value "+ value);
};

exports.set = set;

// 获取所有指定key的数量
var keys = function(keys, callback) {
    redis.keys(keys, callback)
};

exports.keys = keys;

// 删除key
var del = function(key, callback) {
    redis.del(key, callback);
}

exports.del = del;