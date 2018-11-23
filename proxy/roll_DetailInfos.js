/**
 * mes推送小卷详细信息表： 增、查
 * */

var models      = require('../models');
var RollDetailInfo = models.RollDetailInfo;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getRollByQuery = function (query, opt, callback) {
    RollDetailInfo.find(query, '', opt, callback);
};

exports.newAndSave = function (detailInfo, callback) {

    var rollInfo = new RollDetailInfo();
    rollInfo.rollNum = detailInfo.G_Reels;
    rollInfo.outdlcode = detailInfo.outdlcode;
    rollInfo.D_rollNum = detailInfo.D_Reels;
    rollInfo.RollPks = detailInfo.ReelPks;
    rollInfo.TrayNo = detailInfo.TrayNo;
    rollInfo.PalletItems = detailInfo.PalletItems;
    rollInfo.OrderNo = detailInfo.OrderNo;
    rollInfo.pf_Code = detailInfo.pf_Code;
    rollInfo.PDCNText = detailInfo.PDCNText;
    rollInfo.Remark = detailInfo.Remark;
    rollInfo.Splice = detailInfo.Splice;
    rollInfo.Actual_Length = detailInfo.Actual_Length;
    rollInfo.M_Rolls = detailInfo.M_Rolls;
    rollInfo.OupputNum = detailInfo.OupputNum;
    rollInfo.WOItems = detailInfo.WOItems;
    rollInfo.PalletCount = detailInfo.PalletCount;
    rollInfo.DeliveryDate = detailInfo.DeliveryDate;
    rollInfo.deliver_add = detailInfo.deliver_add;
    rollInfo.Field1 = detailInfo.Field1;
    rollInfo.Field2 = detailInfo.Field2;
    rollInfo.Field3 = detailInfo.Field3;
    rollInfo.Field4 = detailInfo.Field4;
    rollInfo.Field5 = detailInfo.Field5;
    rollInfo.save(callback);
};

exports.getRollDetailInfoById = function (id, callback) {
    if (!id) {
        return callback();
    }
    RollDetailInfo.findOne({_id: id}, callback);
};

exports.getRollDetailInfoByrollNum = function (rollNum, callback) {
    if (!rollNum) {
        return callback();
    }
    RollDetailInfo.find({rollNum: rollNum}, '', {sort: 'M_Rolls'}, callback);
};

exports.getRollDetailInfoByOrderId = function (order_id, callback) {
    RollDetailInfo.find({orderId: order_id} , null, {sort:{rollNum:1}}, callback);
}

exports.updateRollDetailInfoByQuery = function (filter, update, callback ) {
    RollDetailInfo.update(filter, update, { multi: true }, callback);
}

exports.getRollNumByGroup = function (match, group, callback) {
    RollDetailInfo.aggregate().match(match).group(group).exec(callback);
}

exports.deleteRollNumByOutCode = function (outdlcode, callback) {
    RollDetailInfo.remove({outdlcode:outdlcode}, callback);
}