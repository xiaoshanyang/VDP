/**
 * Created by lxrent on 16/10/26.
 */

var EventProxy  = require('eventproxy');
var models      = require('../models');
var FacConsInfo     = models.FacConsInfo;
var logger      = require('../common/logger');
var _           = require('lodash');

exports.newAndSave = function (date, consinfo, callback) {
    var facconsinfo = new FacConsInfo();
    facconsinfo.consDate = date;
    facconsinfo.consInfo = consinfo;
    facconsinfo.save(callback);
};

exports.getConsInfoByDate = function (date, callback) {
    if(!date){
        return callback();
    }
    FacConsInfo.findOne({consDate:date},callback);
}

exports.getConsInfoByQuery = function (query, opt, callback) {
    FacConsInfo.find(query, '', opt, callback);
}