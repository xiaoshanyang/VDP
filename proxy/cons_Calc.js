/**
 * Created by fengyu on 16/11/7.
 */

var models=require('../models');
var logger=require('../common/logger');


var consCalc=models.consCalc;

exports.pushValtoCons=function (uptime,lindid,customerFactName,consNumber,consNumbererr,fileTxt,callback) {

    var calcBt=new consCalc();

    calcBt.uploadDate=uptime;
    calcBt.lindId=lindid;
    calcBt.customerFact=customerFactName;
    calcBt.consNum=consNumber;
    calcBt.consNumerr=consNumbererr;
    calcBt.consFileName=fileTxt;

    calcBt.save(callback); // 表示执行完成save方法，然后 callback 回调
                            // mongoose 决定的 使用callback 方法获取数据并进行数据库操作。

};

exports.consTblFind=function (uptime,callback) {


    //var consFind=new consCalc();

    consCalc.findOne({uploadDate:uptime},callback);

};

exports.consTblFind_Multi=function(query,opt,callback){

    consCalc.find(query,'',opt,callback);

};

exports.getConsTblCount = function (query, callback) {
    consCalc.count(query, callback);
}