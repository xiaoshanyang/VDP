/**
 * Created by youngs1 on 7/19/16.
 */
var EventProxy  = require('eventproxy');
var models      = require('../models');
var FTPInfo     = models.FTP;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getFTPInfoByQuery = function (query, opt, callback) {
    FTPInfo.find(query, '', opt, callback);
};

exports.newAndSave = function (type, host, port, user, pass, code, callback) {
    var ftpinfo = new FTPInfo();
    ftpinfo.type = type;
    ftpinfo.host = host;
    ftpinfo.user = user;
    ftpinfo.pass = pass;
    ftpinfo.code = code;
    ftpinfo.port = port;
    ftpinfo.save(callback);
};

exports.getFTPInfoById = function (id, callback) {
    if (!id) {
        return callback();
    }
    FTPInfo.findOne({_id: id}, callback);
};

exports.getFTPInfoByCode = function (code, opt, callback) {
    if(!code)
        return callback();
    FTPInfo.findOne({code:code}, '', opt, callback);
}