/**
 * Created by youngs1 on 7/25/16.
 */

var models      = require('../models');
var Roll        = models.Roll;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getRollByQuery = function (query, opt, callback) {
    Roll.find(query, '', opt, callback);
};

exports.newAndSave = function (orderId, rollNum, webNum, actualWebNum, startSerial, endSerial, startCode, endCode,
                               actualCount, codeCount, categoryId, msgContent, doctorId, bladeNumIn, callback) {

    var roll = new Roll();
    roll.orderId = orderId;
    roll.rollNum = rollNum;
    roll.webNum = webNum;
    roll.actualWebNum = actualWebNum;
    roll.startSerial = startSerial;
    roll.endSerial = endSerial;
    roll.startCode = startCode;
    roll.endCode = endCode;
    roll.actualCount = actualCount;
    roll.actualCode = codeCount;
    roll.categoryId = categoryId;
    roll.msgContent = msgContent;
    roll.doctorId = doctorId;
    roll.bladeNumIn = bladeNumIn;
    roll.save(callback);
};

exports.getRollById = function (id, callback) {
    if (!id) {
        return callback();
    }
    Roll.findOne({_id: id}, callback);
};

exports.getRollByNum = function (rollNum, callback) {
    if (!rollNum) {
        return callback();
    }
    Roll.findOne({rollNum: rollNum}, callback);
};

exports.getRollByCode = function (serialnum, callback) {
    if (!serialnum) {
        return callback();
    }

    var query = {};
    query.startSerial = {};
    query.startSerial.$lte = serialnum;
    query.endSerial = {};
    query.endSerial.$gte = serialnum;

    console.log('query: '+ query);

    Roll.findOne(query, callback);
};

exports.getRollByOrderId = function (order_id, callback) {
    Roll.find({orderId: order_id} , null, {sort:{rollNum:1}}, callback);
    //Roll.find({orderId:order_id}).sort({r})
   // Roll.findOne({bladeNumIn: 19} , callback);
   // Roll.aggregate([{$match:{orderId: order_id}},{},{$group:{rollNum:'$rollNum'}}],{},callback);
}

exports.removeRollByRollNum = function (rollNum, callback) {
    Roll.remove({rollNum:{$in:rollNum}}, callback);
}

exports.removeRollBydoctorTimes = function (doctime, callback) {
    if(!doctime){
        return callback();
    }
    Roll.remove({rollNum:eval(doctime)}, callback);
}