/**
 * Created by youngs1 on 7/19/16.
 */
var EventProxy  = require('eventproxy');
var models      = require('../models');
var Category    = models.Category;
var FTPInfo     = require('./ftpinfo');
var User        = require('./user');
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getCategoryByQuery = function (query, opt, callback) {
    Category.find(query, '', opt, function (err, categorys) {
        if (err) {
            return callback(err);
        }
        if (categorys.length === 0) {
            return callback(null, []);
        }

        var proxy = new EventProxy();
        proxy.after('category_ready', categorys.length, function () {
        //    categorys = _.compact(categorys);
            return callback(null, categorys);
        });
        proxy.fail(callback);

        categorys.forEach(function (categroy) {
            FTPInfo.getFTPInfoByQuery({"code":categroy._id, "type":"category"}, {}, function(err, ftprs) {
                if (err) {
                    return next(err);
                }
                categroy.ftpinfo = {
                    id: '0',
                    host: '127.0.0.1',
                    user: 'admin',
                    pass: 'admin'
                };
                for (var k in ftprs) {
                    categroy.ftpinfo = {
                        id: ftprs[k]._id,
                        host: ftprs[k].host,
                        user: ftprs[k].user,
                        pass: ftprs[k].pass
                    };
                }
                proxy.emit('category_ready');
            });
        });

    });
};

exports.newAndSave = function (name, materiel_number, webNum, splitSpec, isGDT, designId, vdpVersion, createUser, createDate, VDPType, QRCodeCount, QRCodeVersion, modulePoints,
    ErrorLevel, pen_offset, QRCodeSize, RotAngle, PicFormat, PicModel, PicDpi, JobType, sendURL, sendXML, callback) {
    var category = new Category();
    category.name = name;
    category.webNum = webNum;
    materiel_number.forEach(function (pair) {
        category.materiel_number.push(pair);
    });
    category.isGDT = isGDT;
    category.designId = designId;
    category.vdpVersion = vdpVersion;
    category.designIdVersion = designId + '-' + vdpVersion;
    category.splitSpec = splitSpec;

    category.createUser = createUser;
    category.createDate = createDate;

    category.VDPType = VDPType;
    category.QRCodeCount = QRCodeCount;

    category.QRCodeVersion = QRCodeVersion;
    category.modulePoints = modulePoints;
    category.ErrorLevel = ErrorLevel;
    category.pen_offset = pen_offset;
    category.QRCodeSize = QRCodeSize;

    category.RotAngle = RotAngle;
    category.PicFormat = PicFormat;
    category.PicModel = PicModel;
    category.PicDpi = PicDpi;
    category.JobType = JobType;

    category.sendURL = sendURL;
    category.sendXML = sendXML;
    category.save(callback);
};

exports.getCategoryById = function (id, callback) {
    if (!id) {
        return callback();
    }
    Category.findOne({_id: id}, callback);
};

exports.getCategoryForSelect = function (query, opt, callback) {
    Category.find(query, opt, callback);
};

exports.updateCategory = function (filter, update, callback) {
    Category.update(filter, update, { multi: true }, callback);
}