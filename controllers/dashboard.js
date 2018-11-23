/**
 * Created by youngs1 on 16/6/2.
 */

var FS              = require('fs');
var FacConsInfo     = require('../proxy').FacConsInfo;
var Roles           = require('../proxy').Roles;
var moment          = require('moment');
var logger          = require('../common/logger');
var eventproxy      = require('eventproxy');

exports.index = function (req,res,next) {

    var SaveFile = 'public/report/roles.json';
    //把文件中的内容读出来,不用把之前月份的出入库情况再重新计算
    var roles = FS.readFileSync(SaveFile,"utf-8");
    roles = JSON.parse(roles);

    var ep = new eventproxy();
    ep.fail(next);
    console.log(req.session.user);

    // for (var i = 1; i <= 100; i+=6) {
    //     console.log('i= '+ i);
    // }
    //查看用户权限
    var role = req.session.user.role;
    Roles.getPermissionsByRole(role, function (err, rs) {
       if(err){
           logger.error('get role fail.');
           roles.name = '';
       }
       var tmp = {
           user: '',
           roles: ''
       };
       if(rs){
           tmp.user = req.session.user.name;
           tmp.roles = rs.name;
       }
       var isMatch = false;
       roles.name.forEach(function (r) {
            if(r.user == tmp.user){
                r.roles = tmp.roles;
                isMatch = true;
            }
       });
       if(!isMatch){
           roles.name.push(tmp);
       }
       FS.writeFile(SaveFile, JSON.stringify(roles), function(err, filedata) {
            if (err) {
                console.log('ERR: '+ err);
            } else {
                console.log('roles: '+ JSON.stringify(roles));
                ep.emit('get_role_ok');
            }
        });
    });

    var Yesterday = new Date();
    Yesterday.setDate(Yesterday.getDate() - 1);
    Yesterday = moment(Yesterday);
    Yesterday = Yesterday.format('YYYY-MM-DD');

    FacConsInfo.getConsInfoByDate(Yesterday,function (err, rs) {
       if(err){
           return err;
       }
       ep.emit('get_FacCons_ok', rs);
    });

    ep.all('get_FacCons_ok', 'get_role_ok', function (facCons) {
        res.render('dashboard', {
            i18n: res,
            facConsCount:facCons,
            Yesterday:Yesterday
        });
    });
};

exports.getFacInfo = function (req, res, next) {

    var date = req.body.date;
    if(date === '')
    {
        var date = new Date();
        date.setDate(date.getDate() - 1);
        date = moment(date);
        date = date.format('YYYY-MM-DD');
    }else {
        date = new Date(date);
        date = moment(date);
        date = date.format('YYYY-MM-DD');
    }
    FacConsInfo.getConsInfoByDate(date,function (err, rs) {
        if(err){
            return err;
        }
        res.send(rs);
    });
}