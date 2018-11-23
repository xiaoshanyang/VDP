/**
 * Created by youngs1 on 7/30/16.
 */
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var tools           = require('../common/tools');

var Logs            = require('../proxy').Logs;
var FTP             = require('../proxy').FTPInfo;
var Category        = require('../proxy').Category;


exports.index = function (req, res, next) {
    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_ftp', 'get_category', function (ftpinfo, categoryinfo) {
        if (!ftpinfo) {
            return next();
        }
        //手动改掉ftp页面上的未表示部分
        categoryinfo.push({_id:'数码通', name:'数码通'});
        res.render('ftp/ftp',{
            i18n: res,
            docList: ftpinfo,
            categoryList: categoryinfo
        });
    });
    // 获得FTP列表
    FTP.getFTPInfoByQuery('', {sort: '-_id'}, ep.done('get_ftp'));
    // 获得品类列表
    Category.getCategoryByQuery('', '', ep.done('get_category'));
};

exports.createFTP = function(req, res, next) {
    var ftptype = validator.trim(req.body.ftptype);
    var ftpcode = req.body.ftpcode;
    var ftphost = validator.trim(req.body.ftphost);
    var ftpport = validator.trim(req.body.ftpport);
    var ftpuser = validator.trim(req.body.ftpuser);
    var ftppass = validator.trim(req.body.ftppass);
    console.log('---------------');
    console.log('ftptype: '+ ftptype);
    console.log('ftpcode: '+ ftpcode);
    console.log('ftphost: '+ ftphost);
    console.log('ftpport: '+ ftpport);
    console.log('ftpuser: '+ ftpuser);
    console.log('ftppass: '+ ftppass);
    console.log('---------------');

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('create_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    FTP.getFTPInfoByQuery({"type": ftptype,"code": ftpcode},'', function(err, docs) {
        if (err) {
            return ep.emit('create_err', err.message);
        }
        if (docs.length > 0) {
            return ep.emit('create_err', res.__('Please fix this field'));
        }
        tools.testftpconn(ftphost, ftpport, ftpuser, ftppass, function(err, docs) {
            if (err) {
                return ep.emit('create_err', err.message);
            }
            FTP.newAndSave(ftptype, ftphost, ftpport, ftpuser, ftppass, ftpcode, ep.done(function() {
                Logs.addLogs('users', 'Create FTPInfo for '+ ftptype +': '+ ftpcode, req.session.user.name, '0');
                return res.send({success: true, reload: true});
            }));
        });
    });

}

exports.testFTP = function (req, res, next) {
    var ftphost = validator.trim(req.body.ftphost);
    var ftpport = validator.trim(req.body.ftpport);
    var ftpuser = validator.trim(req.body.ftpuser);
    var ftppass = validator.trim(req.body.ftppass);
    console.log('---------------');
    console.log('ftphost: '+ ftphost);
    console.log('ftpport: '+ ftpport);
    console.log('ftpuser: '+ ftpuser);
    console.log('ftppass: '+ ftppass);
    console.log('---------------');
    tools.testftpconn(ftphost, ftpport, ftpuser, ftppass, function(err, docs) {
        if (err) {
            res.status(422);
            res.send(err.message);
            return;
        }
        return res.send({success: true});
    });
}

exports.updateFTP = function(req, res, next) {
    var ftpid = validator.trim(req.body.pk).toLowerCase();
    var reqName = validator.trim(req.body.name);
    var reqValue = validator.trim(req.body.value);

    console.log('---------------');
    console.log('ftpid: '+ ftpid);
    console.log('reqName: '+ reqName);
    console.log('reqValue: '+ reqValue);
    console.log('---------------');

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('update_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    switch (reqName) {
        case 'code':
            FTP.getFTPInfoById(ftpid, ep.done(function (docs) {
                FTP.getFTPInfoByQuery({"type": docs.type,"code": reqValue},'', function(err, rs) {
                    if (err) {
                        return ep.emit('update_err', err.message);
                    }
                    if (rs.length > 0) {
                        return ep.emit('update_err', res.__('Please fix this field'));
                    }
                    docs.code = reqValue;
                    docs.save(function (err) {
                        if (err) {
                            return next(err);
                        }
                        Logs.addLogs('users', 'Update FTPInfo '+ reqName +' : '+ reqValue, req.session.user.name, '0');
                        return res.send({success: true});
                    });
                });
            }));
            break;
        case 'host':
            FTP.getFTPInfoById(ftpid, ep.done(function (docs) {
                docs.host = reqValue;
                docs.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update FTPInfo '+ reqName +' : '+ reqValue, req.session.user.name, '0');
                    return res.send({success: true});
                });
            }));
            break;
        case 'port':
            FTP.getFTPInfoById(ftpid, ep.done(function (docs) {
                docs.port = reqValue;
                docs.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update FTPInfo '+ reqName +' : '+ reqValue, req.session.user.name, '0');
                    return res.send({success: true});
                });
            }));
            break;
        case 'user':
            FTP.getFTPInfoById(ftpid, ep.done(function (docs) {
                docs.user = reqValue;
                docs.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update FTPInfo '+ reqName +' : '+ reqValue, req.session.user.name, '0');
                    return res.send({success: true});
                });
            }));
            break;
        case 'pass':
            FTP.getFTPInfoById(ftpid, ep.done(function (docs) {
                docs.pass = reqValue;
                docs.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update FTPInfo '+ reqName +' : '+ reqValue, req.session.user.name, '0');
                    return res.send({success: true});
                });
            }));
            break;
    }

    //return res.send({success: true});

}