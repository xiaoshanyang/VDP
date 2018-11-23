/**
 * Created by youngs1 on 6/21/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var utility         = require('utility');
var User            = require('../proxy').User;
var Roles           = require('../proxy').Roles;
var Logs            = require('../proxy').Logs;
var logger          = require('../common/logger');
var tools           = require('../common/tools');
var mail            = require('../common/mail');

var getRolesList    = '';

exports.index = function (req, res, next) {
    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_roles','get_users', function (roles, users) {
        if (!roles) {
            return next();
        }
        getRolesList = roles;

        res.render('users/users',{
            i18n: res,
            rolesList: getRolesList,
            usersList: users
        });
    });
    // 获得角色列表
    Roles.getRolesByQuery('', '', ep.done('get_roles'));

    // 获得所有用户列表
    User.getUsersByQuery('', '', ep.done('get_users'));
};

exports.createUser = function (req, res, next) {
    var username = validator.trim(req.body.username).toLowerCase();
    var email = validator.trim(req.body.email).toLowerCase();
    var password = validator.trim(req.body.password);
    var role = validator.trim(req.body.role);

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('create_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    // 验证信息的正确性
    if ([username, password, email, role].some(function (item) { return item === ''; })) {
        return ep.emit('create_err', res.__('missing data'));
    }
    if (username.length < 3 || password.length < 3) {
        return ep.emit('create_err', res.__('accname valid'));
    }
    if (!tools.validateId(username)) {
        return ep.emit('create_err', res.__('accname valid'));
    }
    if (!validator.isEmail(email)) {
        return ep.emit('create_err', res.__('Please enter a valid email address'));
    }

    User.getUsersByQuery({'$or': [
        {'name': username},
        {'email': email}
    ]}, {}, function (err, users) {
        if (err) {
            return next(err);
        }
        if (users.length > 0) {
            return ep.emit('create_err', res.__('has been registered'));
        }
        tools.bhash(password, ep.done(function (passhash) {
            User.newAndSave(username, passhash, email, role, function (err) {
                if (err) {
                    return next(err);
                }

                mail.sendActiveMail(email, utility.md5(email + passhash + config.session_secret), username, function (err) {
                    if (err) {
                        return next(err);
                    } else {
                        Logs.addLogs('users', 'Create new user: '+ username, req.session.user.name, '0');
                        return res.send({success: true, reload: true});
                    }
                });

            });
        }));
    });
};

exports.updateUser = function (req, res, next) {
    var username = validator.trim(req.body.pk).toLowerCase();
    var reqName = validator.trim(req.body.name);
    var reqValue = validator.trim(req.body.value);

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('update_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    // 验证信息的正确性
    if (reqValue === '') {
        return ep.emit('update_err', res.__('missing data'));
    }

    // 修改邮件，检测新的邮件是否存在，不存在相同邮件则发送激活邮件，将用户置为未激活，保存日志。
    if (reqName === 'email') {
        if (!validator.isEmail(reqValue)) {
            return ep.emit('update_err', res.__('Please enter a valid email address'));
        }
        User.getUsersByQuery({'email': reqValue}, {}, function (err, users) {
            if (err) {
                return next(err);
            }
            if (users.length > 0) {
                return ep.emit('update_err', res.__('Please fix this field'));
            }
            // 更新数据
            User.getUserByLoginName(username, ep.done(function (user) {
                user.email = reqValue;
                user.active = false;
                user.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    mail.sendActiveMail(reqValue, utility.md5(reqValue + user.pass + config.session_secret), username, function (err) {
                        if (err) {
                            return next(err);
                        } else {
                            Logs.addLogs('users', 'Update email: '+ username, req.session.user.name, '0');
                            if (req.session.user.name === username) {
                                req.session.destroy();
                                res.clearCookie(config.auth_cookie_name, { path: '/' });
                                return res.send({success: true, reload: true});
                            } else {
                                return res.send({success: true});
                            }
                        }
                    });
                });
            }));
        });
    }

    // 修改密码，保存日志。
    if (reqName === 'pass') {
        if (reqValue.length < 3) {
            return ep.emit('update_err', res.__('missing data'));
        }
        User.getUserByLoginName(username, ep.done(function (user) {
            tools.bhash(reqValue, ep.done(function (passhash) {
                user.pass = passhash;
                user.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update pass: '+ username, req.session.user.name, '0');
                    if (req.session.user.name === username) {
                        req.session.destroy();
                        res.clearCookie(config.auth_cookie_name, { path: '/' });
                        return res.send({success: true, reload: true});
                    } else {
                        return res.send({success: true});
                    }
                });
            }));
        }));
    }

    // 修改角色，当前登录人不能修改自己的角色，保存日志。
    if (reqName === 'role') {
        if (req.session.user.name === username) {
            return ep.emit('update_err', res.__('Exceeded his powers.'));
        }
        User.getUserByLoginName(username, ep.done(function (user) {
            user.role = reqValue;
            user.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update role: '+ username, req.session.user.name, '0');
                return res.send({success: true});
            });
        }));
    }
};