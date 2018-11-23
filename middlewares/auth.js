/**
 * Created by youngs1 on 6/17/16.
 */
var mongoose        = require('mongoose');
var UserModel       = mongoose.model('User');
var config          = require('../config');
var eventproxy      = require('eventproxy');
var logger          = require('../common/logger');
var UserProxy       = require('../proxy').User;
var Roles           = require('../proxy').Roles;
var Logs            = require('../proxy').Logs;

exports.auth = function (req, res, next) {
    // 未登录用户跳转登录页面
    if (!req.session.user) {
        return res.render('signin',{i18n: res, error: res.__('please login')});
    }
    // start 获取用户请求资源
    var getPath = req.path;
    // /dashboard/download >> dashboard/download
    getPath = getPath.substring(1);
    if (getPath.indexOf('/') >= 0) {
        // dashboard/download >> dashboard.edit
        getPath = getPath.substr(0, getPath.indexOf('/')) + '.edit';
    } else {
        // dashboard >> dashboard.view
        getPath = getPath + '.view';
    }

    var UserRole = req.session.user.role;
    // end 获取用户请求资源

    // start 获取用户角色权限
    Roles.getPermissionsByRole(UserRole, function(err, power){
        if (!err) {
            var UserPower = power.permissions;
            // start 判断用户角色是否包括请求资源
            if (UserPower.indexOf(getPath) >= 0 || power.name === 'admin') {
                return next();
            } else {
                if (req.is('json') === null) {
                    return res.render('notify/notify', { i18n: res, status: 403, error: res.__('Exceeded his powers.') });
                } else {
                    res.status(422);
                    return res.send(res.__('Exceeded his powers.'));
                }
            }
            // end 判断用户角色是否包括请求资源
        } else {
            return res.render('notify/notify', { i18n: res, status: 403, error: res.__('Exceeded his powers.') });
        }
    });
};

exports.gen_session = function (req, res, user) {
    var auth_token = user._id + '$$$$';
    var opts = {
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 30,
        signed: true,
        httpOnly: true
    };

    res.cookie(config.auth_cookie_name, auth_token, opts);

};

exports.initUser = function (req, res, next) {
    var ep = new eventproxy();
    ep.fail(next);

    res.locals.current_user = null;

    ep.all('get_user', function (user) {
        if (!user) {
            return next();
        }
        user = res.locals.current_user = req.session.user = new UserModel(user);

        // 读取24小时内的日志（未来考虑站内个人消息）
        Logs.getLastLogs(ep.done(function(msgLogs){
            res.locals.msgLogs = msgLogs;
        }));
        // 初始化个人角色权限
        Roles.getPermissionsByRole(user.role, ep.done(function( power){
            user.powers = power.permissions;
            next();
        }));
    });

    if (req.session.user) {
        ep.emit('get_user', req.session.user);
    } else {
        var auth_token = req.signedCookies[config.auth_cookie_name];
        if (!auth_token) {
            return next();
        }
        var auth = auth_token.split('$$$$');
        var user_id = auth[0];

        UserProxy.getUserById(user_id, ep.done('get_user'));
    }

};

exports.blockUser = function () {

    return function (req, res, next) {

        if (req.path === '/signout') {
            return next();
        }

        if (req.session.user && req.session.user.is_block && req.method !== 'GET') {
            return res.render('notify/notify', { i18n: res, status: 403, error: res.__('You have been banned.') });
        }
        next();
    };
};