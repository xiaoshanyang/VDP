/**
 * Created by youngs1 on 6/24/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var fs              = require("fs");
var Roles           = require('../proxy').Roles;
var Logs            = require('../proxy').Logs;

exports.index = function (req, res, next) {
    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_roles', function (roles) {
        if (!roles) {
            return next();
        }

        res.render('roles/roles',{
            i18n: res,
            rolesList: roles
        });
    });
    // 获得角色列表
    Roles.getRolesByQuery('', '', ep.done('get_roles'));

};

exports.createRole = function (req, res, next) {
    var name = validator.trim(req.body.name);
    var permissions = req.body.permissions;
    if (permissions instanceof Array) {
        permissions = permissions;
    } else {
        permissions = [permissions];
    }

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('create_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    // 验证信息的正确性
    if ([name, permissions].some(function (item) { return item === ''; })) {
        return ep.emit('create_err', res.__('missing data'));
    }
    if (name.length < 2) {
        return ep.emit('create_err', res.__('accname valid'));
    }

    Roles.getRolesByQuery({'name': name}, {}, function (err, roles) {
        if (err) {
            return next(err);
        }
        if (roles.length > 0) {
            return ep.emit('create_err', res.__('Please fix this field'));
        }
        Roles.newAndSave(name, permissions, function (err) {
            if (err) {
                return next(err);
            }
            Logs.addLogs('users', 'Create new role: '+ name, req.session.user.name, '0');
            //写入文件,把该角色权限需要隐藏的页面写入文件中
            writeRoletofile(name, null, permissions);
            return res.send({success: true, reload: true});
        });
    });
};

exports.updateRole = function (req, res, next) {
    var roleid = validator.trim(req.body.pk);
    var reqName = validator.trim(req.body.name);
    var reqValue = '';

    if (reqName === 'name') {
        reqValue = validator.trim(req.body.value);
    } else {
        reqValue = req.body.value;
    }

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

    // 修改角色名称。
    if (reqName === 'name') {
        Roles.getRolesByQuery({'name': reqValue}, {}, function (err, roles) {
            if (err) {
                return next(err);
            }
            if (roles.length > 0) {
                return ep.emit('update_err', res.__('Please fix this field'));
            }
            // 更新数据
            Roles.getRolesById(roleid, ep.done(function (role) {
                var oldName = role.name;
                role.name = reqValue;
                role.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update role name: '+ oldName +' to '+ reqValue, req.session.user.name, '0');
                    //写入文件,把该角色权限需要隐藏的页面写入文件中
                    writeRoletofile(oldName, reqValue, null);
                    return res.send({success: true, reload: true});
                });
            }));
        });
    }

    // 修改角色权限。
    if (reqName === 'permissions') {

        if (reqValue instanceof Array) {
            reqValue = reqValue;
        } else {
            reqValue = [reqValue];
        }
        Roles.getRolesById(roleid, ep.done(function (role) {
            if (reqValue.toString() === role.permissions.toString()) {
                return res.send({success: true, reload:false});
            } else {
                // 更新数据
                role.permissions = reqValue;
                role.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update role power: '+ role.name, req.session.user.name, '0');
                    //写入文件,把该角色权限需要隐藏的页面写入文件中
                    writeRoletofile(role.name, null, reqValue);
                    return res.send({success: true, reload: true});
                });
            }
        }));
    }
};

function writeRoletofile(oldname, newname, permissions) {
    var SaveFile = 'public/report/roles.json';
    //把文件中的内容读出来,不用把之前月份的出入库情况再重新计算
    var roles=fs.readFileSync(SaveFile,"utf-8");
    roles = JSON.parse(roles);
    var isFind = false;
    roles.roles.forEach(function (r, index) {
        if(r.name == oldname){
            if(newname){
                r.name = newname;
                oldname = newname;
            }else{
                r.permissions = permissions;
            }
            isFind = true;
        }
    });
    if(!isFind){
        roles.roles.push({name:oldname,permissions:permissions});
    }
    var powerlist = [];
    config.power_list.forEach(function (c) {
        if(c.indexOf('.edit') < 0){
            powerlist.push(c);
        }
    });
    roles.roles.forEach(function (r) {
        if(r.name == oldname){
            r.permissions.forEach(function (s) {
                var j = powerlist.indexOf(s);
                if(j>=0){
                    powerlist.splice(j, 1);
                }
            });
            r.permissions = powerlist;
        }
    });

    fs.writeFile(SaveFile, JSON.stringify(roles), function(err, filedata) {
        if (err) {
            console.log('ERR: '+ err);
        } else {
            console.log('roles: '+ JSON.stringify(roles));
        }
    });
}