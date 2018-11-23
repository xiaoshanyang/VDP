/**
 * Created by youngs1 on 8/24/16.
 */
var config = require('../config');
var Redis = require('ioredis');
var logger = require('./logger');

var client = new Redis({
    port: config.redis.port,
    host: config.redis.host,
    password: config.redis.pass,
    db: config.redis.db
});

client.on('error', function (err) {
    if (err) {
        logger.error('connect to redis error, check your redis config', err);
        process.exit(1);
    }
})

exports = module.exports = client;
