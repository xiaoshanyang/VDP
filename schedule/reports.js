/**
 * Created by youngs1 on 8/15/16.
 *
 * {
  "Summary": {
    "allCount": 1494002232,
    "avlQRCode": 308445891,
    "Printing": 68900821,
    "Printed": 22212345,
    "Canned": 811111111
  },
  "CodeCount": {
    "allCount": 1494002232,
    "getCount": [["1月", 3.7],["2月", 2.3],["3月", 3.2],["4月", 4.8],["5月", 2.2],["6月", 2.5],["7月", 2.8]],
    "putCount": [["1月", 2.2],["2月", 3.8],["3月", 3.1],["4月", 3.8],["5月", 1.2],["6月", 1.1],["7月", 1.2]]
  }
}
 */
var EventProxy          = require('eventproxy');
var fs                  = require("fs");

var tools               = require('../common/tools');
var QRCode              = require('../proxy').QRCode;
var QRCodeApply        = require('../proxy').QRCodeApply;
var Category            = require('../proxy').Category;
var Order               = require('../proxy').Order;
var Roll                = require('../proxy').Roll;
var FacConsInfo         = require('../proxy').FacConsInfo;
var models              = require('../models');
var OrderEntity         = models.Order;
var RollEntity          = models.Roll;
var logger              = require('../common/logger');
var Logs                = require('../proxy').Logs;
var moment              = require('moment');

exports.Reports = function (file) {
    var SaveFile = file || 'public/report/data.json';
    //把文件中的内容读出来,不用把之前月份的出入库情况再重新计算
    var ReportContent=fs.readFileSync(SaveFile,"utf-8");
    ReportContent = JSON.parse(ReportContent);

    //ReportContent.Summary = {};
    var CategoryColors = ReportContent.CategoryColor;
    //ReportContent.CodeCount = {};

    var ep = new EventProxy();
    ep.fail(function(err) {
        console.log('Task(Report) ERROR: '+ err);
        Logs.addLogs('system', '[Task] failed in Run Report. ERROR: '+ err, 'system', '2');
    });

    ep.on('_err', function (msg) {
        console.log('Task(Report) ERROR: '+ msg);
        Logs.addLogs('system', '[Task] failed in Run Report. ERROR: '+ msg, 'system', '2');
    });
    // 写入JSON文件
    ep.all('get_Summary', 'get_Category_used', 'get_Category_avls', 'get_Category_cans', function () {
        fs.writeFile(SaveFile, JSON.stringify(ReportContent), function(err, filedata) {
            if (err) {
                console.log('ERR: '+ err);
            } else {
                console.log('ReportData: '+ JSON.stringify(ReportContent));
            }
        });
    });
    // 统计汇总信息
    ep.all('get_summary_allCount', 'get_summary_issuredCount', 'get_summary_producted', 'get_summary_canned', function(){
        ep.emit('get_Summary');
        logger.debug('get new code count information.');
    });
    // 全部码 == 入库量 根据申请表记录计算总的申请量
    /*
    var query = {};
    QRCodeApply.getQRCodeApplyByQuery( {}, '', function (err, rs) {
        if (err) {
            return logger.error('Task(Report) get all qrcode count ERROR:' + err);
        }
        var allCount = 0;
        rs.forEach(function (r) {
            allCount += r.dbCount;
        });
        ReportContent.Summary.allCount = allCount;
        console.log('allCount: '+ allCount);
        ep.emit('get_summary_allCount');
    });*/
    // 申请二维码量 根据品类剩余可用量来判断,遍历品类表、顺便生成文件、以及全部码即所有品类码量和
    Category.getCategoryByQuery({}, '', function (err, rs) {
        if(err){
            return logger.error('Task(Report) get category ERROR:' + err);
        }
        var allCount = 0;
        //var IssuredCount = 0;
        var avlCount = 0;
        rs.forEach(function (r) {
            if(!r.disable){
                allCount += r.codeCount;
                //IssuredCount += r.codeCount - r.codeAvailable;
                avlCount += r.codeAvailable;
            }
            var isColor = false
            CategoryColors.forEach(function (c) {
               if(c.label == r.name){
                   isColor = true;
               }
            });
            if(!isColor){
                var color = '#' + Math.floor(16777216*Math.random()).toString(16);//#ffffff --> 16777215
                for(;color.length<7;){  //如果颜色位数不足6位,会导致显示不正常
                    color = color + '0';
                }
                CategoryColors.push({label:r.name, color:color});
            }
        });
        ReportContent.Summary.allCount = allCount;
        //ReportContent.Summary.IssuredCount = IssuredCount;
        ReportContent.Summary.avlCount = avlCount;
        console.log('allCount: '+ allCount);
        console.log('AvlCount: ' + avlCount);
        //console.log('IssuredCount: '+ IssuredCount);
        ep.emit('get_summary_allCount');
        //ep.emit('get_summary_issuredCount');
        ep.emit('get_color');
        ep.emit('get_category_ok', rs);
    });

    // 生产量 根据小卷量来计算 先计算出一个总量,然后按照日期每天增加,不是每天都去计算
    ep.all('get_category_ok', function (category) {
        var activeCategoryId = [];
        category.forEach(function (c) {
            if(!c.disable){
                activeCategoryId.push(c._id);
            }
        });
        {   //计算工单量
            var IssuredCount = 0;
            var query = {
                pushMESDate:{$gt:new Date('2016-10-31')},
                categoryId:{$in:activeCategoryId},
                state: 1,
                vdpType:{$in:[0, 2, 3, 4]}
            };
            var fields = 'orderId actCount';
            var options = { sort: 'orderId'};
            var stream = OrderEntity.find(query,fields, options).lean().batchSize(1000).stream();
            stream.on('data',function (doc) {
                stream.pause();
                IssuredCount += doc.actCount;
                stream.resume();
            }).on('error', function (err) {
                logger.error(err);
            }).on('close', function () {
                ReportContent.Summary.IssuredCount = IssuredCount;
                console.log('IssuredCount: '+ IssuredCount);
                ep.emit('get_summary_issuredCount');
            });
        }
        {   //计算小卷量
            var rollCount = 0;
            var codeCount = 0;
            var query = {
                pushDate:{$gt:new Date('2016-10-31')},
                categoryId:{$in:activeCategoryId}
            };
            var fields = 'rollNum actualCode';
            var options = { sort: 'orderId'};
            var stream = RollEntity.find(query, fields, options).lean().batchSize(1000).stream();
            stream.on('data',function (doc) {
                rollCount++;
                if(doc.rollNum.indexOf('1')==0){
                    //return ;
                }else{
                    stream.pause();
                    codeCount += doc.actualCode;
                    stream.resume();
                }
            }).on('error', function (err) {
                logger.error(err);
            }).on('close', function () {
                ReportContent.Summary.productedCount = codeCount;
                console.log('ProductedCount: '+ codeCount);
                ep.emit('get_summary_producted');
            });
        }

    });


    // 罐装码量 先按照state状态count一下之后,按照日期每天把昨天的灌装码量添加进去 fac_consinfo 表中的信息
    // 不然就把10月31号到11月23号之间的数据跑出,根据facconsInfo表,统计出灌装量
    // 现在facconsInfo表中数据仅是从2016-10-31开始的,所以直接全部取出
    var date = new Date();
    date.setDate(date.getDate() - 1);
    date = moment(date);
    date = date.format('YYYY-MM-DD');
    var fac_query = {
        consDate:{$gte:"2016-10-31"}
    };
    // ep.all('get_category_ok', 'get_color', function (categorys){
    //
    // });

    // FacConsInfo.getConsInfoByDate(date, function (err, rs) {
    //     if(err||!rs){
    //         logger.error(err);
    //         return ep.emit('get_summary_canned');
    //     }
    //     var currentConsCount = parseInt(ReportContent.Summary.Canned);
    //     rs.consInfo.forEach(function (info) {
    //         info.mapinfo.forEach(function (f) {
    //             currentConsCount += parseFloat(f.value)*10000;
    //         })
    //     });
    //     ReportContent.Summary.Canned = currentConsCount;
    //     console.log('CannedCount: '+ ReportContent.Summary.Canned);
    //     ep.emit('get_summary_canned');
    // });


    //取右侧饼状图的信息,按品类生产数量计算
    //可用量和下发量
    //先取出所有的品类id、name
    ep.all('get_category_ok', 'get_color', function (categorys) {
        {
            if(categorys.length>0){
                var piechart_used = [];
                var piechart_avl = [];
                categorys.forEach(function (c) {
                    var p_used = {};
                    var p_avl = {};
                    var data_used = [];
                    var data_avl = [];
                    CategoryColors.forEach(function (cc) {
                        if(c.name == cc.label){
                            // if(c.name.length > 9){
                            //     c.name = c.name.substring(0,6) + '<br>' + c.name.substring(6, c.name.length);
                            // }
                            p_used.label = c.name;
                            p_avl.label = c.name;
                            p_used.color = cc.color;
                            p_avl.color = cc.color;
                        }
                    });

                    data_used.push(c.codeCount-c.codeAvailable);
                    data_avl.push(c.codeAvailable);
                    p_used.data = data_used;
                    p_avl.data = data_avl;

                    //去除调关闭的品类的灌装信息
                    if(!c.disable){
                        if(data_used > 0){
                            piechart_used.push(p_used);
                        }
                        if(data_avl > 0 ){
                            piechart_avl.push(p_avl);
                        }
                    }
                });

                if(categorys.length > 0){
                    piechart_used.sort(function (a, b) {
                        return -(a.data[0] - b.data[0]);
                    });
                    piechart_avl.sort(function (a, b) {
                        return -(a.data[0] - b.data[0]);
                    });
                    ReportContent.PieChart_Used = piechart_used;
                    ReportContent.PieChart_Avl = piechart_avl;

                }
                ep.emit('get_Category_used');
                ep.emit('get_Category_avls');
            }
        }

        {
            //计算灌装量,之前的数据设置
            FacConsInfo.getConsInfoByQuery(fac_query ,function (err, rs) {
                if(err||!rs){
                    logger.error(err);
                    ep.emit('get_Category_cans');
                    return ep.emit('get_summary_canned');
                }

                var currentConsCount = 0;
                var tmp = [];
                var tmpconsCount = [];
                rs.forEach(function (c) {
                    c.consInfo.forEach(function (info) {
                        tmp.push({label:info.name, color:info.mapinfo[0].color});
                        var tmpvalue = 0;
                        info.mapinfo.forEach(function (f) {
                            currentConsCount += parseFloat(f.value)*10000;
                            tmpvalue += parseFloat(f.value)*10000;
                        });
                        tmpconsCount.push(tmpvalue);
                    });
                });

                var cansInfo = [];
                tmp.forEach(function (t, index) {
                    // if(t.label.length > 9){
                    //     t.label = t.label.substring(0,6) + '<br>' + t.label.substring(6, t.label.length);
                    // }
                    var ismatch = false;
                    cansInfo.forEach(function (c, j) {
                        if(c.label == t.label){
                            cansInfo[j].data[0] += tmpconsCount[index];
                            ismatch = true;
                        }
                    });
                    if(!ismatch){
                        cansInfo.push({label:t.label, data:[tmpconsCount[index]], color:t.color});
                    }
                });

                //去除调关闭的品类的灌装信息
                categorys.forEach(function (c) {
                    if(c.disable){
                        var i=0;
                        for(; i<cansInfo.length; ){
                            if(c.name == cansInfo[i].label){
                                currentConsCount -= cansInfo[i].data[0];
                                cansInfo.splice(i, 1);
                                break;
                            }
                            if(cansInfo[i].data[0] <= 0){
                                currentConsCount -= cansInfo[i].data[0];
                                cansInfo.splice(i, 1);
                            }else{
                                i++;
                            }
                        }
                    }
                });

                ReportContent.Summary.Canned = currentConsCount;
                console.log('CannedCount: '+ ReportContent.Summary.Canned);
                ep.emit('get_summary_canned');

                cansInfo.sort(function (a, b) {
                    return -(a.data[0] - b.data[0]);
                });

                //同一颜色信息
                cansInfo.forEach(function (c) {
                    CategoryColors.forEach(function (cc) {
                        if(c.label == cc.label){
                            c.color = cc.color;
                        }
                    });
                });


                ReportContent.PieChart_NewCanned = cansInfo;
                console.log(cansInfo);
                ep.emit('get_Category_cans');
            });
        }
    });




}


//格式化日期：yyyy-MM-dd
function rptFormatDate (date) {
    var myyear = date.getFullYear();
    var mymonth = date.getMonth()+1;
    var myweekday = date.getDate();

    if(mymonth < 10){
        mymonth = "0" + mymonth;
    }
    if(myweekday < 10){
        myweekday = "0" + myweekday;
    }
    return (myyear+"-"+mymonth + "-" + myweekday);
}

//获得某月的天数
function getMonthDays(myMonth){
    var monthStartDate = new Date(nowYear, myMonth, 1);
    var monthEndDate = new Date(nowYear, myMonth + 1, 1);
    var   days   =   (monthEndDate   -   monthStartDate)/(1000   *   60   *   60   *   24);
    return   days;
}

//获得本季度的开始月份
function getQuarterStartMonth(){
    var quarterStartMonth = 0;
    if(nowMonth<3){
        quarterStartMonth = 0;
    }
    if(2<nowMonth && nowMonth<6){
        quarterStartMonth = 3;
    }
    if(5<nowMonth && nowMonth<9){
        quarterStartMonth = 6;
    }
    if(nowMonth>8){
        quarterStartMonth = 9;
    }
    return quarterStartMonth;
}

//获得本周的开始日期
function getWeekStartDate() {
    var weekStartDate = new Date(nowYear, nowMonth, nowDay - nowDayOfWeek);
    return rptFormatDate(weekStartDate);
}

//获得本周的结束日期
function getWeekEndDate() {
    var weekEndDate = new Date(nowYear, nowMonth, nowDay + (6 - nowDayOfWeek));
    return rptFormatDate(weekEndDate);
}

//获得本月的开始日期
function getMonthStartDate(){
    var monthStartDate = new Date(nowYear, nowMonth, 1);
    return rptFormatDate(monthStartDate);
}

//获得本月的结束日期
function getMonthEndDate(){
    var monthEndDate = new Date(nowYear, nowMonth, getMonthDays(nowMonth));
    return rptFormatDate(monthEndDate);
}

//获得上月开始时间
function getLastMonthStartDate(){
    var lastMonthStartDate = new Date(nowYear, lastMonth, 1);
    return rptFormatDate(lastMonthStartDate);
}

//获得上月结束时间
function getLastMonthEndDate(){
    var lastMonthEndDate = new Date(nowYear, lastMonth, getMonthDays(lastMonth));
    return rptFormatDate(lastMonthEndDate);
}

//获得本季度的开始日期
function getQuarterStartDate(){

    var quarterStartDate = new Date(nowYear, getQuarterStartMonth(), 1);
    return rptFormatDate(quarterStartDate);
}

//或的本季度的结束日期
function getQuarterEndDate(){
    var quarterEndMonth = getQuarterStartMonth() + 2;
    var quarterStartDate = new Date(nowYear, quarterEndMonth, getMonthDays(quarterEndMonth));
    return rptFormatDate(quarterStartDate);
}

// var query = {
//     categoryId:c._id
// };
// query.state = {};
// query.state.$gte = 11;
// QRCode.getCountByQuery(query, function (err, rs) {
//     if(err){
//         return logger.error('Task(Report) get code counts information ERROR:' + err);
//     }
//     var p = {};
//     p.label = c.name;
//     var data = [];
//     data.push(rs);
//     p.data = data;
//     //var index = Math.floor(Math.random() * 20);
//     //var color = query.categoryId.toString().substring(index, index+6);
//     //p.color = '#'+color;
//     var color = '#' + Math.floor(16777216*Math.random()).toString(16);//#ffffff --> 16777215
//     p.color = color;
//     piechart.push(p);
//     ep.emit('piechart_ok');