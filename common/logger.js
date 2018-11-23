var config = require('../config');

var env = process.env.NODE_ENV || "development";


var log4js = require('log4js');
log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'dateFile',
            filename: 'logs/pudding',
            category: 'pudding',
            alwaysIncludePattern: true,
            pattern: "-yyyy-MM-dd.log"
        }
    ]
});

var logger = log4js.getLogger('pudding');
logger.setLevel(config.debug && env !== 'test' ? 'DEBUG' : 'ERROR')

module.exports = logger;
