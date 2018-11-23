/**
 * Created by youngs1 on 6/14/16.
 */
var models = require('../models');
var QRCodeApply = models.QRCodeApply;
var logger = require('../common/logger');

exports.newAndSave = function (categoryId, generalId, orderId, appuser, dlCount, callback) {
    var codeApply = new QRCodeApply();
    codeApply.categoryId = categoryId;
    codeApply.generalId = generalId;
    codeApply.orderId = orderId;    // 给具体那个工单申请码
    codeApply.appuser = appuser;
    codeApply.dlCount = dlCount;
    codeApply.save(callback);
};

exports.getQRCodeApplyByQuery = function (query, opt, callback) {
    QRCodeApply.find(query, '', opt, callback);
};


exports.getQRCodeApplyById = function (id, callback) {
    if (!id) {
        return callback();
    }
    QRCodeApply.findOne({_id: id}, callback);
};

exports.getCountByQuery = function(query, callback){
    QRCodeApply.count(query, callback);
}