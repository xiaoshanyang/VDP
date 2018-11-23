/**
 * Created by youngs1 on 7/25/16.
 *
 * A::2017-06-23 添加一个字段 PuID 标识 纸病机ID
 *
 */

var models      = require('../models');
var ScanSerial  = models.ScanSerial;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getScanByQuery = function (query, opt, callback) {
    ScanSerial.find(query, '', opt, callback);
};

// A:修改newandsave方法
//exports.newAndSave = function (categoryId, codeSerial, codeContent, actWeb, groupCode, groupCodeContent, callback) {
exports.newAndSave = function (categoryId, codeSerial, codeContent, actWeb, groupCode, groupCodeContent, isVirtual, callback) {
// A
    var scan = new ScanSerial();
    scan.categoryId = categoryId;
    scan.codeSerial = codeSerial;
    scan.codeContent = codeContent;
    scan.actWeb = actWeb;
    scan.groupCode = groupCode;
    scan.groupCodeContent = groupCodeContent;
    // 虚拟接头
    scan.isVirtual = isVirtual;
    // 虚拟接头
    scan.save(callback);
};

exports.getScanById = function (id, callback) {
    if (!id) {
        return callback();
    }
    ScanSerial.findOne({_id: id}, callback);
};

exports.getScanByCodeSerial = function (codeSerial, callback) {
    if(isNaN(codeSerial)){
        return callback();
    }
    ScanSerial.findOne({codeSerial:codeSerial}, callback);
};

exports.removeScanByCodeSerial = function (query, callback) {
    ScanSerial.remove(query, callback);
}