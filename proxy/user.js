/**
 * Created by youngs1 on 6/14/16.
 */

var models = require('../models');
var User = models.User;
var utility = require('utility');
var uuid = require('node-uuid');

exports.newAndSave = function (name, pass, email, role, callback) {
    var user = new User();
    user.name = name;
    user.pass = pass;
    user.email = email;
    user.profile_image_url = '128.jpg';
    user.role = role || 'guest';
    user.accessToken = uuid.v4();

    user.save(callback);
};

/**
 * 根据登录名查找用户
 * Callback:
 * - err, 数据库异常
 * - user, 用户
 * @param {String} Name 登录名
 * @param {Function} callback 回调函数
 */
exports.getUserByLoginName = function(name, callback) {
    User.findOne({'name': new RegExp('^'+name+'$', "i")}, callback);
};

/**
 * 根据用户ID，查找用户
 * Callback:
 * - err, 数据库异常
 * - user, 用户
 * @param {String} id 用户ID
 * @param {Function} callback 回调函数
 */
exports.getUserById = function (id, callback) {
    if (!id) {
        return callback();
    }
    User.findOne({_id: id}, callback);
};

/**
 * 根据邮箱，查找用户
 * Callback:
 * - err, 数据库异常
 * - user, 用户
 * @param {String} email 邮箱地址
 * @param {Function} callback 回调函数
 */
exports.getUserByMail = function (email, callback) {
    User.findOne({email: email}, callback);
};

/**
 * 根据关键字，获取一组用户
 * Callback:
 * - err, 数据库异常
 * - users, 用户列表
 * @param {String} query 关键字
 * @param {Object} opt 选项
 * @param {Function} callback 回调函数
 */
exports.getUsersByQuery = function (query, opt, callback) {
    User.find(query, '', opt, callback);
};
