/**
 * Created by youngs1 on 16/6/3.
 */
var config = require('../config');
var logger = require('../common/logger');
var tools = require('../common/tools');
var mail = require('../common/mail');
var utility = require('utility');
var validator = require('validator');
var User = require('../proxy').User;
var Roles = require('../proxy').Roles;
var Logs = require('../proxy').Logs;
var fs = require('fs');
var configFile = 'config.json';

exports.index = function (req,res,next) {
    res.render('setup',{
        i18n: res
    });
};

exports.testdb = function (req,res,next) {
    var dbhost = validator.trim(req.body.host);
    var dbport = validator.trim(req.body.port);
    var dbname = validator.trim(req.body.dbname);
    var dbuser = validator.trim(req.body.user);
    var dbpass = validator.trim(req.body.pass);
    var dburi = 'mongodb://'+ dbhost + ':' + dbport + '/' + dbname;
    var opts = {
        "user": dbuser,
        "pass": dbpass,
        "server": {
            "poolSize": 20,
            "socketOptions": {},
            "auto_reconnect": true
        },
        "db": {
            "forceServerObjectId": false,
            "w": 1
        },
        "auth": {},
        "replset": {
            "socketOptions": {}
        }
    };

    tools.testdbconn(dburi, opts, function(err){
        if (err) {
            res.send({
                success: false,
                message: err.message
            });
        } else {
            config.db.host = dbhost;
            config.db.port = dbport;
            config.db.dbname = dbname;
            config.db.options.user = dbuser;
            config.db.options.pass = dbpass;
            config.db.uri = dburi;

            res.send({
                success: true
            });
        }
    });
};

exports.testemail = function (req,res,next) {
    var mailhost = validator.trim(req.body.host);
    var mailport = validator.trim(req.body.port);
    var mailname = validator.trim(req.body.user);
    var mailpass = validator.trim(req.body.pass);
    var mailto = validator.trim(req.body.mailto);
    var mail_opts = {
        host: mailhost,
        secureConnection: false,
        port: mailport,
        auth: {
            user: mailname,
            pass: mailpass
        },
        tls: {
            ciphers: "SSLv3"
        },
        connectionTimeout: 3000
    };
    var subject = config.name + "Test Email";
    var html = "Send mail is ok. Please do not reply to this message.";
    var data = {
        from: mailname,
        to: mailto,
        subject: subject,
        html: html
    };
    mail.testMail(mail_opts,data, function(err){
        if (err) {
            res.send({
                success: false,
                message: err.message
            });
        } else {
            config.mail_opts = mail_opts;
            res.send({
                success: true
            });
        }
    });
};

exports.save = function (req, res, next) {
    var dbhost = validator.trim(req.body.db.host);
    var dbport = validator.trim(req.body.db.port);
    var dbname = validator.trim(req.body.db.dbname);
    var dbuser = validator.trim(req.body.db.user);
    var dbpass = validator.trim(req.body.db.pass);
    var mailhost = validator.trim(req.body.mail_opts.host);
    var mailport = validator.trim(req.body.mail_opts.port);
    var mailuser = validator.trim(req.body.mail_opts.user);
    var mailpass = validator.trim(req.body.mail_opts.pass);
    var session_secret = validator.trim(req.body.session_secret);
    var auth_cookie_name = validator.trim(req.body.auth_cookie_name);
    var comname = validator.trim(req.body.comname);
    var name = validator.trim(req.body.name);
    var adminname = validator.trim(req.body.adminname).toLowerCase();
    var adminpwd = validator.trim(req.body.adminpwd).toLowerCase();
    var adminmail = validator.trim(req.body.adminmail).toLowerCase();

    // Start 验证信息正确性
    if ([dbhost, dbport, dbname, dbuser, dbpass,
        mailhost, mailport, mailuser, mailpass,
        session_secret, auth_cookie_name, comname, name,
        adminname, adminpwd, adminmail
        ].some(function(item) { return item === '';})) {
            res.send({
                success: false,
                message: '配置信息不完整。'
            });
            return;
    }
    if (!validator.isInt(dbport,{min: 0,max: 65535}) || !validator.isInt(mailport,{min: 0,max: 65535})) {
        res.send({
            success: false,
            message: '端口号必须在0-65535之间。'
        });
        return;
    }
    if (!tools.validateId(adminname)) {
        res.send({
            success: false,
            message: '超级账号名称不合法。'
        });
        return;
    }
    if (!validator.isEmail(adminmail)) {
        res.send({
            success: false,
            message: '超级账号邮件格式不正确。'
        });
        return;
    }
    // End 验证信息正确性

    // Start 生成配置信息
    var dburi = 'mongodb://'+ dbhost + ':' + dbport + '/' + dbname;
    var dbopts = {
        "user": dbuser,
        "pass": dbpass,
        "server": {
            "poolSize": 20,
            "socketOptions": {},
            "auto_reconnect": true
        },
        "db": {
            "forceServerObjectId": false,
            "w": 1
        },
        "auth": {},
        "replset": {
            "socketOptions": {}
        }
    };
    var mail_opts = {
        host: mailhost,
        secureConnection: false,
        port: mailport,
        auth: {
            user: mailuser,
            pass: mailpass
        },
        tls: {
            ciphers: "SSLv3"
        },
        connectionTimeout: 3000
    };
    config.db.host = dbhost;
    config.db.port = dbport;
    config.db.options = dbopts;
    config.db.uri = dburi;
    config.mail_opts = mail_opts;
    config.session_secret = session_secret;
    config.auth_cookie_name = auth_cookie_name;
    config.comname = comname;
    config.name = name;
    config.isinit = true;
    // End 生成配置信息

    // 初始化权限和角色
    Roles.initialize(function(err, roles) {
        if (err) {
            res.send({
                success: false,
                message: err.message
            });
        } else {
            //创建用户
            tools.bhash(adminpwd, function (err, passhash) {
                if (err) {
                    res.send({
                        success: false,
                        message: err.message
                    });
                } else {
                    User.newAndSave(adminname, passhash, adminmail, roles._id, function (err) {
                        if (err) {
                            res.send({
                                success: false,
                                message: err.message
                            });
                        } else {
                            // 发送激活邮件
                            mail.sendActiveMail(adminmail, utility.md5(adminmail + passhash + config.session_secret), adminname, function (err) {
                                if (err) {
                                    res.send({
                                        success: false,
                                        message: err.message
                                    });
                                } else {
                                    Logs.addLogs('system', 'Complete system initialization.', 'system', '0');
                                    res.send({
                                        success: true
                                    });
                                    // 更新配置文件，nodemon自动重启。
                                    fs.writeFile(configFile, JSON.stringify(config, null, 4));
                                }
                            });
                        }
                    });
                }
            });
        }
    });
};