/**
 * Created by youngs1 on 7/25/16.
 */

var models      = require('../models');
var Order       = models.Order;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.getOrderByQuery = function (query, opt, callback) {
    Order.find(query, '', opt, callback);
};

exports.getCountByQuery = function (query, callback) {
    Order.count(query, callback);
};

exports.newAndSave = function (saleNum, orderId, customerCode, productCode, vdpType, codeURL, planCount, multipleNum,
                               splitSpec, designId, customerOrderNum, vdpVersion, orderNum, factoryCode, lineCode,
                               webNum, pushMESDate, categoryId, smtDesginID, smtVersionID, callback) {

    var order = new Order();
    order.saleNum = saleNum;
    order.orderId = orderId;
    order.customerCode = customerCode;
    order.productCode = productCode;
    order.vdpType = vdpType;
    order.codeURL = codeURL;
    order.planCount = planCount;
    order.multipleNum = multipleNum;
    order.splitSpec = splitSpec;
    order.designId = designId;
    order.customerOrderNum = customerOrderNum;
    order.vdpVersion = vdpVersion;
    order.orderNum = orderNum;
    order.factoryCode = factoryCode;
    order.lineCode = lineCode;
    order.webNum = webNum;
    order.pushMESDate = pushMESDate;
    order.categoryId = categoryId;
    order.smtDesginID = smtDesginID || '';
    order.smtVersionID = smtVersionID || '';

    // 如果vdptype = 3 折角码，状态设为state=3
    if(vdpType == 3){
        order.state = 3;
    }

    order.save(callback);
};

exports.getOrderById = function (id, callback) {
    if (!id) {
        return callback();
    }
    Order.findOne({_id: id}, callback);
};

exports.updateOrder = function (filter, update, callback) {
    Order.update(filter, update, { multi: true }, callback);
};