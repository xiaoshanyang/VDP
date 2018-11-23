/**
 * Created by youngs1 on 6/6/16.
 */
var mailer = require('nodemailer');
var config = require('../config');
var util = require('util');
var logger = require('./logger');
var transporter = mailer.createTransport(config.mail_opts);
var SITE_ROOT_URL = 'http://' + config.host;

exports.testMail = function (opts, data, callback) {
    var testsend = mailer.createTransport(opts);
    testsend.sendMail(data, function(error, info) {
        if (error) {
            logger.error(error);
            return callback(error);
        } else {
            logger.info('Message sent:'+ info.response);
            return callback(null);
        }
    });
};

/**
 * 发送激活通知邮件
 * @param {String} who 接收人的邮件地址
 * @param {String} token 重置用的token字符串
 * @param {String} name 接收人的用户名
 */
exports.sendActiveMail = function (who, token, name, callback) {
    var from    = util.format('%s <%s>', config.name, config.mail_opts.auth.user);
    var to      = who;
    var subject = config.name + '帐号激活/Account activation';
    var html    = '<p>您好：' + name + '</p>' +
        '<p>我们收到您在' + config.name + '的注册信息，请点击下面的链接来激活帐户：</p>' +
        '<a href  = "' + SITE_ROOT_URL + '/active_account?key=' + token + '&name=' + name + '">激活链接</a>' +
        '<p>若您没有在' + config.name + '填写过注册信息，说明有人滥用了您的电子邮箱，请删除此邮件，我们对给您造成的打扰感到抱歉。</p>' +
        '<p>' + config.name + ' 谨上。</p>'+
        '<p></p>'+
        '<p>Hi ' + name + ',</p>'+
        '<p>We have received your register information on ' + config.name + ', Click the following link to activate your account: </p>' +
        '<a href  = "' + SITE_ROOT_URL + '/active_account?key=' + token + '&name=' + name + '">Verify Links</a>' +
        '<p>if you did not sign up to join the ' + config.name + ', please delete this email.</p>' +
        '<p>Yours sincerely,</p>'+
        '<p>' + config.name + '</p>';

    if (config.debug) {
        logger.debug('from: '+ from);
        logger.debug('to: '+ to);
        logger.debug('subject: '+ subject);
        logger.debug('html: '+ html);
        //return callback(null);
    }

    transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        html: html
    }, function (err, info) {
        if (err) {
            logger.error(err);
            return callback(err);
        } else {
            logger.info('Message sent:'+ info.response);
            return callback(null);
        }

    });
};

/**
 * 发送密码重置通知邮件
 * @param {String} who 接收人的邮件地址
 * @param {String} token 重置用的token字符串
 * @param {String} name 接收人的用户名
 */
exports.sendResetPassMail = function (who, token, name) {
    var from = util.format('%s <%s>', config.name, config.mail_opts.auth.user);
    var to = who;
    var subject = config.name + '社区密码重置';
    var html = '<p>您好：' + name + '</p>' +
        '<p>我们收到您在' + config.name + '重置密码的请求，请在24小时内单击下面的链接来重置密码：</p>' +
        '<a href="' + SITE_ROOT_URL + '/reset_pass?key=' + token + '&name=' + name + '">重置密码链接</a>' +
        '<p>若您没有在' + config.name + '申请过服务，说明有人滥用了您的电子邮箱，请删除此邮件，我们对给您造成的打扰感到抱歉。</p>' +
        '<p>' + config.name + ' 谨上。</p>'+
        '<p></p>'+
        '<p>Hi ' + name + ',</p>'+
        '<p>We have received your request for reset password on ' + config.name + ', Please click the following link to reset your password within 24hrs</p>' +
        '<a href  = "' + SITE_ROOT_URL + '/reset_pass?key=' + token + '&name=' + name + '">Reset</a>' +
        '<p>if you did not sign up to join the ' + config.name + ', please delete this email.</p>' +
        '<p>Yours sincerely,</p>'+
        '<p>' + config.name + '</p>';
    if (config.debug) {
        logger.debug('from: '+ from);
        logger.debug('from: '+ to);
        logger.debug('from: '+ subject);
        logger.debug('from: '+ html);
        return;
    }
    exports.sendMail({
        from: from,
        to: to,
        subject: subject,
        html: html
    });
};
