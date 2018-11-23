/**
 * Created by youngs1 on 6/20/16.
 */

var models = require('../models');
var sendEmailToAmdin = require('../schedule/sendErrorInfoToAdmin').sendEmail;
var Logs = models.Logs;

exports.addLogs = function (type, content, opsname, state) {
    var logs        = new Logs();
    logs.opstype    = type;
    logs.todo       = content;
    logs.opsname    = opsname || 'system';
    logs.state      = state || 1;
    logs.save();

    // 邮件通知state = 2, content:{}
    if(state == 2){
        //sendEmailToAmdin(content);
    }
};

exports.getLastLogs = function(callback) {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate()-1);
    Logs.find({create_at: {$gte: yesterday}},'' , {limit: 100, sort: {create_at : -1}}, callback);
};


/**
 * 根据关键字，获取日志
 * Callback:
 * - err, 数据库异常
 * - logs, 日志列表
 * @param {String} query 关键字
 * @param {Object} opt 选项
 * @param {Function} callback 回调函数
 */
exports.getLogsByQuery = function (query, opt, callback) {
    Logs.find(query, '', opt, callback);
};

exports.getCountByQuery = function (query, callback) {
    Logs.count(query, callback);
};