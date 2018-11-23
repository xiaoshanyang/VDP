/**
 * Created by taozhou on 2017/7/5.
 */
var mailer = require('nodemailer');
var config = require('../config');
var util = require('util');
var logger = require('../common/logger');
var transporter = mailer.createTransport(config.mail_opts);
var SITE_ROOT_URL = 'http://' + config.host;

var pushordererror = 'pushorder';
var pushspliterror = 'pushsplit';
var pushrollerror = 'pushroll';
var importCode = 'importcode';
var applycode = 'applycode';
var taskgetcons = '[Task-GetCansData]';

exports.sendEmail = function (content) {
    var who = 'tao.zhou@greatviewpack.com';
    var subject = '';
    var html = '';
    var needSend = false;
    // 表示执行任务失败
    if( content.toLocaleLowerCase().indexOf(pushordererror) >= 0 ){
        //执行工单任务时，失败，发送邮件to工单相关人员
        needSend = true;
        subject = '工单执行错误';
        html = '<p>工单执行错误:</p>';
    }else if( content.toLocaleLowerCase().indexOf(pushspliterror) >= 0 ){

    }else if( content.toLocaleLowerCase().indexOf(pushrollerror) >= 0 ){

    }else if(content.toLocaleLowerCase().indexOf(importCode) >= 0 ||
             content.toLocaleLowerCase().indexOf(applycode) >= 0){
        //申请二维码出错
        needSend = true;
        subject = '工单执行错误';
        html = '<p>工单申请二维码错误:</p>';
    }else if( content.toLocaleLowerCase().indexOf(taskgetcons) >= 0){
        //导入过程中出现300二维码
        needSend = true;
        subject = '处理灌装文件错误';
        html = '<p>处理灌装文件错误:</p>';
    }

    if(needSend){

        html += '<p>'+content+'</p>';
        sendErrorMail(who,subject,html,function (err) {
            if(err){
                logger.error(err);
            }
        });
    }
}


/**
 * 发送工单错误通知邮件
 * @param {String} who 接收人的邮件地址
 * @param {String} content 错误信息
 */
var sendErrorMail = function (who, subject, content, callback) {
    var from    = util.format('%s <%s>', config.name, config.mail_opts.auth.user);
    var to      = who;

    if (config.debug) {
        logger.debug('from: '+ from);
        logger.debug('to: '+ to);
        logger.debug('subject: '+ subject);
        logger.debug('html: '+ content);
        //return callback(null);
    }

    transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        html: content
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

