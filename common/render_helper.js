/**
 * Created by youngs1 on 6/15/16.
 */
var _           = require('lodash');
var config      = require('../config');
var multiline   = require('multiline');

exports.escapeSignature = function (signature) {
    return signature.split('\n').map(function (p) {
        return _.escape(p);
    }).join('<br>');
};

exports.staticFile = function (filePath) {
    if (filePath.indexOf('http') === 0 || filePath.indexOf('//') === 0) {
        return filePath;
    }
    return config.site_static_host + filePath;
};

exports._ = _;
exports.multiline = multiline;