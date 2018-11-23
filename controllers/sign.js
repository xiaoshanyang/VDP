/**
 * Created by youngs1 on 6/15/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var User            = require('../proxy').User;
var Logs            = require('../proxy').Logs;
var mail            = require('../common/mail');
var tools           = require('../common/tools');
var logger          = require('../common/logger');
var utility         = require('utility');
var authMiddleWare  = require('../middlewares/auth');

/**
 * define some page when login just jump to the home page
 * @type {Array}
 */
var notJump = [
    '/active_account', //active page
    '/reset_pass',     //reset password page, avoid to reset twice
    '/signup',         //regist page
    '/search_pass'    //serch pass page
];

exports.activeAccount = function (req, res, next) {
    var key  = validator.trim(req.query.key);
    var name = validator.trim(req.query.name);

    User.getUserByLoginName(name, function (err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            return next(new Error('[ACTIVE_ACCOUNT] no such user: ' + name));
        }
        var passhash = user.pass;
        if (!user || utility.md5(user.email + passhash + config.session_secret) !== key) {
            return res.render('signin', {i18n: res, error: res.__('error not be activated')});
        }
        if (user.active) {
            return res.render('signin', {i18n: res,error: res.__('error url activated')});
        }
        user.active = true;
        user.save(function (err) {
            if (err) {
                return next(err);
            }
            res.render('signin', {i18n: res, success: res.__('url activated')});
        });
    });
};

exports.showLogin = function (req, res) {
    req.session._loginReferer = req.headers.referer;
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.render('signin', {i18n: res});
    }
}
//登陆验证 --> 点击登陆按钮时
exports.login = function (req, res, next) {
    var name = validator.trim(req.body.username).toLowerCase();
    var pass = validator.trim(req.body.password);
    var keep = req.body.keepsign || false;

    var ep = new eventproxy();

    ep.fail(next);

    if (!name || !pass) {
        res.status(422);
        return res.render('signin', {i18n: res, error: res.__('missing data')});
    }

    //两种登陆方式:用户名、邮箱
    var getUser;
    if (name.indexOf('@') !== -1) {
        getUser = User.getUserByMail;
    } else {
        getUser = User.getUserByLoginName;
    }

    ep.on('login_error', function (login_error) {
        res.status(403);
        return res.render('signin', {i18n: res, error: res.__('error pass')});
    });
    //根据上边的判断,调用不同的函数
    //查询返回值在user中存放
    getUser(name, function (err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            return ep.emit('login_error');
        }
        var passhash = user.pass;
        tools.bcompare(pass, passhash, ep.done(function (bool) {
            if (!bool) {
                return ep.emit('login_error');
            }
            if (!user.active) {
                mail.sendActiveMail(user.email, utility.md5(user.email + passhash + config.session_secret), user.name, function(err){
                    if (err) {
                        return ep.emit('login_error');
                    }
                });
                res.status(403);
                return res.render('signin', {i18n: res, error: res.__('again activate', user.email)});
            }
            //登陆成功
            authMiddleWare.gen_session(req, res, user);
            Logs.addLogs('users', '[Login] '+user.name+' login to platform.', user.name, '0');

            var refer = req.session._loginReferer || '/';
            for (var i = 0, len = notJump.length; i !== len; ++i) {
                if (refer.indexOf(notJump[i]) >= 0) {
                    refer = '/';
                    break;
                }
            }
            res.redirect(refer);
        }));
    });
};

// sign out
exports.signout = function (req, res, next) {
    Logs.addLogs('users', '[Login] '+ req.session.user.name+' logout to platform.', req.session.user.name, '0');
    req.session.destroy();
    res.clearCookie(config.auth_cookie_name, { path: '/' });
    res.redirect('/');
};

//changePassword
exports.changePassword = function (req, res, next) {
    var name = validator.trim(req.body.user).toLowerCase();
    var oldpass = validator.trim(req.body.oldPassword);
    var newpass = validator.trim(req.body.newPassword);

    var ep = new eventproxy();

    if (!name || !oldpass || !newpass) {
        res.status(422);
        return res.render('signin', {i18n: res, error: res.__('missing data')});
    }

    //两种登陆方式:用户名、邮箱
    var getUser;
    if (name.indexOf('@') !== -1) {
        getUser = User.getUserByMail;
    } else {
        getUser = User.getUserByLoginName;
    }

    ep.on('login_error', function (login_error) {
        res.status(403);
        return res.render('signin', {i18n: res, error: res.__('error pass')});
    });
    //根据上边的判断,调用不同的函数
    //查询返回值在user中存放
    getUser(name, function (err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            return ep.emit('login_error');
        }
        var passhash = user.pass;
        tools.bcompare(oldpass, passhash, ep.done(function (bool) {
            if (!bool) {
                return ep.emit('login_error');
            }
            if (!user.active) {
                mail.sendActiveMail(user.email, utility.md5(user.email + passhash + config.session_secret), user.name, function(err){
                    if (err) {
                        return ep.emit('login_error');
                    }
                });
                res.status(403);
                return res.render('signin', {i18n: res, error: res.__('again activate', user.email)});
            }

            //认证成功，重新设置密码
            tools.bhash(newpass, ep.done(function (passhash) {
                user.pass = passhash;
                user.save(function (err, rs) {
                    if(err){
                        return ep.emit('login_error');
                    }
                });
            }));

            res.redirect('/');
        }));
    });

}
