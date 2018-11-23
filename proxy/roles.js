/**
 * Created by youngs1 on 6/14/16.
 */
var models = require('../models');
var Roles = models.Roles;
var logger = require('../common/logger');

exports.initialize = function (callback) {
    var roles = new Roles();
    roles.name = 'admin';
    roles.permissions.push('dashboard.view');
    roles.permissions.push('qrcode.view');
    roles.permissions.push('order.view');
    roles.permissions.push('customer.view');
    roles.permissions.push('batch.view');
    roles.permissions.push('users.view');
    roles.permissions.push('roles.view');
    roles.permissions.push('cycle.view');
    roles.permissions.push('category.view');
    roles.permissions.push('ftp.view');
    roles.permissions.push('interface.view');
    roles.permissions.push('dashboard.edit');
    roles.permissions.push('qrcode.edit');
    roles.permissions.push('order.edit');
    roles.permissions.push('customer.edit');
    roles.permissions.push('batch.edit');
    roles.permissions.push('users.edit');
    roles.permissions.push('roles.edit');
    roles.permissions.push('cycle.edit');
    roles.permissions.push('category.edit');
    roles.permissions.push('ftp.edit');
    roles.permissions.push('interface.edit');
    roles.permissions.push('log.view');
    roles.permissions.push('log.edit');

    roles.save(callback);
};

exports.newAndSave = function (name, permissions, callback) {
    var roles = new Roles();
    roles.name = name;
    permissions.forEach(function (pair) {
        roles.permissions.push(pair);
    });
    roles.save(callback);
};

/**
 * 根据角色名查找权限
 * Callback:
 * - err, 数据库异常
 * - permissions, 权限
 * @param {String} Role 角色
 * @param {Function} callback 回调函数
 */
exports.getPermissionsByRole = function(role, callback) {
    if (!role) {
        return callback();
    }
    Roles.findOne({id: role}, callback);
};

/**
 * 根据关键字，获取角色
 * Callback:
 * - err, 数据库异常
 * - roles, 角色列表
 * @param {String} query 关键字
 * @param {Object} opt 选项
 * @param {Function} callback 回调函数
 */
exports.getRolesByQuery = function (query, opt, callback) {
    Roles.find(query, '', opt, callback);
};

/**
 * 根据名称查找角色
 * Callback:
 * - err, 数据库异常
 * - roles, 角色
 * @param {String} Name 角色名称
 * @param {Function} callback 回调函数
 */
exports.getRolesByName = function(name, callback) {
    Roles.findOne({'name': new RegExp('^'+name+'$', "i")}, callback);
};

/**
 * 根据用户ID，查找角色
 * Callback:
 * - err, 数据库异常
 * - roles, 角色
 * @param {String} id 角色ID
 * @param {Function} callback 回调函数
 */
exports.getRolesById = function (id, callback) {
    if (!id) {
        return callback();
    }
    Roles.findOne({_id: id}, callback);
};
