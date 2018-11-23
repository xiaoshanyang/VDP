/**
 * Created by youngs1 on 8/22/16.
 */
var config              = require('../config');
var eventproxy          = require('eventproxy');
var tools               = require('../common/tools');
var Order               = require('../proxy').Order;
var Roll                = require('../proxy').Roll;
var Category            = require('../proxy').Category;
var Scan                = require('../proxy').ScanSerial;
var FS                  = require('fs');
var QRCode              = require('../proxy').QRCode;
var logger              = require('../common/logger');
var writeLine           = require('lei-stream').writeLine;
var models              = require('../models');
var QRCodeEntity        = models.QRCode;

exports.index = function (req, res, next) {
    var OrderId = req.body.orderId || '';
    var vdpType = req.body.vdpType || [0,1,2,3,4];//默认显示三种类型的工单
    var PlanCount = req.body.PlanCount || '';
    var IssuedCount = req.body.IssuedCount || '';

    var query = {};
    var perpage = parseInt(req.body.prePage) || 10;
    var page = parseInt(req.body.page, 10) || 1;
    page = page > 0 ? page : 1;

    if (OrderId !== '') {
        if (OrderId.indexOf(',') > 0) {
            OrderId = OrderId.replace(new RegExp(',','gm'),' ');
        }
        OrderId = OrderId.split(' ');
        query.orderId = {};
        query.orderId.$in = OrderId;
    }
    if (vdpType !== '') {
        //vdpType = vdpType.split(',');
        query.vdpType = {};
        query.vdpType.$in = vdpType;
    }
    if (PlanCount !== '') {
        PlanCount = PlanCount.split(',');
        query.planCount = {};
        query.planCount.$gte = PlanCount[0] * 1000;
        query.planCount.$lte = PlanCount[1] * 1000;
    }
    if (IssuedCount !== '') {
        IssuedCount = IssuedCount.split(',');
        query.actCount = {};
        query.actCount.$gte = IssuedCount[0] * 1000;
        query.actCount.$lte = IssuedCount[1] * 1000;
    }
    //跳过前边的页数包含的条数,只返回当前页面的值
    var options = { skip: (page - 1) * perpage, limit: perpage, sort: '-_id'};
    console.log('query: ' + JSON.stringify(query));
    console.log('options: ' + JSON.stringify(options));

    var ep = new eventproxy();
    ep.fail(next);



    ep.all('get_order', 'get_count', function (order, count) {
        if (!order) {
            return next();
        }
        var pages = Math.ceil(count / perpage);
        //var newOrder = new Array();
        var categoryname = [];
        ep.after('get_roll', order.length, function () {
            //neworder.sort();

            res.render('order/order',{
                i18n: res,
                orderList: order,
                orderSearch: {
                    OrderId: OrderId,
                    vdpType: JSON.stringify(vdpType),
                    PlanCount: PlanCount,
                    IssuedCount: IssuedCount
                },
                orderPage: {
                    all_logs_count: count,
                    perPage: perpage,
                    current_page: page,
                    pages: pages
                },
                config: config
            });
        });
        order.forEach(function (e) {
            e.completionStatus = e.state === 1? '成功': (e.state === 2?'失败': '正在执行');
            e.planCount = (e.planCount / 1000).toFixed(3);
            e.actCount = (e.actCount/1000).toFixed(3);
            e.pushDateFormot = tools.formatDate(e.pushDate, false);
            var j = categoryname.indexOf(e.categoryId);
            if(j<0){
                Category.getCategoryById(e.categoryId, function (err, cate) {
                    if(err){
                       return next(err);
                    }
                    if(cate){
                        categoryname.push(e.categoryId);
                        categoryname.push(cate.name);
                        j = categoryname.length-1;
                        e.categoryname = categoryname[j];
                        //ep.emit('get_roll', e);
                    }
                    ep.emit('get_roll');
                });
            }else{
                e.categoryname = categoryname[j+1];
                ep.emit('get_roll');
            }
        });
    });
    //返回当前页面的条 和 满足条件的总条数  查询结果放在了回调函数里边 即上边的函数里边的order、count
    Order.getOrderByQuery(query, options, ep.done('get_order'));
    Order.getCountByQuery(query, ep.done('get_count'));

}
//依据工单号查询小卷信息
exports.getRollOne=function (req,res,next) {
      var orderId=req.body.roll_id;
      var query={};

      if(orderId!==''){
          query.orderId=orderId;
      }
      var ep = new eventproxy();
      ep.fail(next);

      ep.all('get_roll',function (roll) {
          if(!roll){
              return next();
          }
          roll.sort(function (a, b) {
              return -(a.bladeNumIn - b.bladeNumIn);
          });
          var newrollList = [];
          roll.forEach(function (r, index) {
              if(! r.rollNum.startsWith('10') && r.rollNum.indexOf(',')<0){
                  newrollList.push(r);
              }
          });
          //
          //把相同rollId的数据放在一块
          var showRoll = [];
          newrollList.forEach(function (a) {
              var ismatch = false;
              showRoll.forEach(function (s) {
                  if(s.rollNum == a.rollNum && !ismatch){
                      s.codeRange = s.codeRange + '<br>' + a.startSerial+'-->'+a.endSerial + ' ';
                      ismatch = true;
                  }
              });
              if(!ismatch){
                  var j = showRoll.length;
                  showRoll[j] = a;
                  showRoll[j].codeRange = ''+a.startSerial+'-->'+a.endSerial+' ';
                  showRoll[j].sortBy = a.bladeNumIn*10 + a.actualWebNum;
              }

          });
          showRoll.sort(function (a, b) {
              return -(a.sortBy - b.sortBy);
          })
          //
          showRoll.forEach(function (r) {
              var filename = 'middlewares/data/roll/'+r.rollNum+'.txt';
              r.isErr = false;
              tools.shellgetLine(filename, function (err, lines) {
                  if(err){
                      r.lines = 0;
                  }else if(isNaN(lines)){
                      r.lines = 0;
                  }else{
                      r.lines = lines;
                  }
                  if(isNaN(r.lines)){
                      r.isErr = true;
                      r.lines = 0;
                  }
                  r.actualCount = r.rollNum.substr(17, 5);
                  r.value = Math.abs(r.actualCount - r.lines);
                  if(r.value > config.interface_opts.Dvalue_Roll){
                      r.isErr = true;
                  }
                  ep.emit('getrollLine_ok');
              });
          });

          ep.after('getrollLine_ok', showRoll.length, function () {
              console.log(showRoll);
              res.render('order/roll',{
                  i18n:res,
                  orderId:orderId,
                  roll:showRoll
              });
          });

      });


    Roll.getRollByQuery(query,'',ep.done('get_roll'));
}

exports.getRollExport = function (req, res, next) {
    var rollnum = req.body.rollNum;
    var orderId = req.body.orderId;
    var categoryId = null;
    var newRoll = [];   //存放调整好顺序的小卷

    var ep = new eventproxy();
    ep.fail(next);

    var option = {sort:'_id'};
    Roll.getRollByQuery({rollNum:rollnum}, option, function (err, rs) {
       if(err){
           logger.error(err);
           return res.send({success:"执行成功",error:"执行失败",isSuccess:false});
       }
       //如果这个小卷中msgcontent有值,表示小卷错误

        var msgContent = '';
        rs.forEach(function (r) {
            categoryId = r.categoryId;
            if(r.msgContent !== ""){
                msgContent += r.msgContent+'\r\n';
            }
        });
        if(msgContent !== ""){
            return res.send({success:"执行成功",error:msgContent,isSuccess:false});
        }
        //writeRolltoFile(rs);

       //把该小卷的所有信息搜到,然后通过接头把小卷中几段的顺序排好
       rs.forEach(function (r, index) {
           ep.after('getRoll_ok', index, function () {
               //当起始结束二维码存在的时候才能继续,不然查询时间特别耗时
               categoryId = r.categoryId;
               var query = {
                   categoryId: r.categoryId,
                   codeSerial: r.endSerial
               };
               if(r.startCode && r.endCode){
                   //上过纸病机
                   Scan.getScanByQuery(query, '', function (err, s) {
                       if(err){

                       }
                       if(s.length == 1){
                           if(s[0].groupCode==0 || newRoll.length==0){ //即这是扫描时该小卷的最后一个码
                               newRoll.push(r);
                           }else{
                               var ismatch = false;
                               for(var i=0; i<newRoll.length; i++){
                                   if(s[0].groupCode == newRoll[i].endSerial && !ismatch){
                                       ismatch = true;
                                       newRoll.splice(i-1, 0, r);
                                       break;
                                   }
                               }
                               if(!ismatch){
                                   newRoll.unshift(r);
                               }
                           }
                       }else if(r.doctorId==0){
                           newRoll.push(r);
                           newRoll.sort(function (a, b) {
                               return a.startSerial - b.startSerial;
                           });
                           for(var j=0; j<newRoll.length-1; j++){
                               //发现有重复的小卷号
                               if(newRoll[j].startSerial == newRoll[j+1].startSerial){
                                   newRoll.splice(j, 1);
                                   j--;
                               }
                           }
                       }
                       ep.emit('getRoll_ok');
                   });
               }
           });
       });
        ep.after('getRoll_ok', rs.length, function () {
           // console.log(newRoll);
            //导出文件,要把newRoll反过来 按照_id:-1导出
            newRoll.reverse();
            writeRolltoFile(newRoll);

        });
    });

    function writeRolltoFile(arrContent) {
        var CodeCount = 0;
        var rollCodeCount = 0;
        var rollFile = 'middlewares/data/roll_new/'+ rollnum +'.txt';
        var input = writeLine(rollFile, {
            cacheLines: 10000
        });
        ep.after('writeRoll_ok', arrContent.length, function () {
            input.end(function () {
                logger.debug('[SOAP-PushRoll '+ rollnum +'] Complete roll file for rollid is '+ rollnum +' count is '+ CodeCount+' this roll has '+rollCodeCount+' codes');
                res.send({success:"执行成功",error:"执行失败",isSuccess:true, rollFile:rollFile});
                //downloadfile(rollFile);
            });
        });
        arrContent.forEach(function (c, index) {
            ep.after('writeRoll_ok', index, function () {
                ep.all('get_startId', 'get_endId', function (startId, endId) {
                    if (!startId || !endId) { //err
                        logger.error('[SOAP-PushRoll' + rollnum + '] get qrcode._id failed.');
                        return setTimeout(function () {
                            ep.emit('writeRoll_ok');
                        }, 2000);
                    }
                    var query = {
                        categoryId: categoryId,
                        _id: {}
                    };
                    var totalCount = endId.serialNum - startId.serialNum;
                    if (totalCount < 0) {
                        query._id.$gte = endId._id;
                        query._id.$lte = startId._id;
                    } else {
                        query._id.$gte = startId._id;
                        query._id.$lte = endId._id;
                    }
                    var fields = 'content serialNum';
                    var totalCount = Math.abs(totalCount) + 1;
                    var options = {limit: totalCount, sort: '-_id'};
                    var stream = QRCodeEntity.find(query, fields, options).lean().batchSize(100000).stream();
                    stream.on('data', function (doc) {
                        CodeCount++;
                        stream.pause();
                        var isMatch = false;
                        var serialNum = doc.serialNum;

                        if (serialNum >= c.startSerial && serialNum <= c.endSerial && (serialNum - c.startSerial) % c.webNum == 0) {
                            isMatch = true;
                        }
                        if (isMatch) {
                            rollCodeCount++;
                            input.write(doc.content + ', ' + serialNum, stream.resume());
                        } else {
                            stream.resume();
                        }

                    }).on('err', function (err) {
                        logger.error('[SOAP-PushSplit ' + rollnum + '] Err: ' + err);
                        return false;
                    }).on('close', function () {
                        ep.emit('writeRoll_ok');
                    });
                });
                if(c.doctorId == 0){
                    QRCode.getQRCodeById(c.startCode, ep.done('get_startId'));
                    QRCode.getQRCodeById(c.endCode, ep.done('get_endId'));
                }else{
                    QRCode.getQRCodeByCode(c.startCode, ep.done('get_startId'));
                    QRCode.getQRCodeByCode(c.endCode, ep.done('get_endId'));
                }
            });
        });
    }
    function downloadfile(filename) {
        // res.setHeader('content-type', 'text/html;charset=UTF-8');
        // res.setHeader("Content-Disposition", "attachment; filename=" + "templet.txt");
        // res.setHeader("Pragma", "public");
        // res.setHeader("Cache-Control", "max-age=0");

    }

}

exports.download = function (req, res, next) {
    var path = req.query.filepath;
    var name = req.query.filename;

    res.download(path, name, function () {
        console.log(111);
        //res.send({isSuccess:true});
    });
    //res.send({isSuccess:true});
}

//暂不使用
exports.getRollExport_allRolls = function (req, res, next) {
    var rollnum = req.body.rollNum;
    var orderId = req.body.orderId;

    var orderIdIn = rollnum.substr(6, 5);
    var webNumIn = parseInt(rollnum.substr(11, 2));
    var bladeNumIn = rollnum.substr(13, 4);
    var ActualCountIn = rollnum.substr(17, 5);
    
    var startserialNum = [];
    var endserialNum = [];
    var webNum = 6;
    var orders = [];
    var inputfile = [];
    var actweb = '';

    var ep = new eventproxy();
    ep.fail(next);
    //--------------------------------------
    var query = {
            orderId:orderId,
            state:1
    };
    Order.getOrderByQuery(query, '', function (err, rs) {
        if(err){
            return next(err);
        }
        if(rs.length>0){
           orders = rs;
           webNum = rs[0].webNum;
           ep.emit('getorder_ok');
        }
    });
    ep.all('getorder_ok', function(){
        for(var i=1; i<=webNum; i++){
            var newrollnum = orderIdIn+'0'+i+bladeNumIn+ActualCountIn;
            var reg = new RegExp(newrollnum); //不区分大小写
            var query = {
                rollNum: {$regex : reg}
            };
            getSeriNums(query, newrollnum);
        }
    });
    //----------------------------------
    ep.after('getrollserialNum', webNum, function () {

        //for(var j=0; j<orders.length; j++){
        orders.forEach(function (order, index) {
            ep.all('readCode_ok'+index,function () {
                readCode(order,index);
            });
        });
        ep.all('write_ok',function (index) {
           inputfile.forEach(function (input) {
               input.end(function () {
                   console.log('okokok');
               });
           });
           ep.emit('readCode_ok'+index);
        });
        ep.emit('readCode_ok0');
        ep.all('readCode_ok'+orders.length, function () {
           logger.debug('Export-Roll: orderId: '+orderId+' werNum: '+actweb+' bladeNum:'+bladeNumIn+' OK');
	   res.send({success:"执行成功",error:"执行失败"});
        });
    });
    function startReadStream(query, fields, options, serialNums) {

    }
    function getSeriNums(query, newrollnum) {
        Roll.getRollByQuery(query, '',function (err, rs) {
            if (err) {
                return next(err);
            }
            if(rs.length>0){
                actweb = actweb+newrollnum.substr(5, 2)+' ';
                webNum = rs[0].webNum;
                var tmparr = [];
                var iszhibing = true;
                var thisrollNum = [];
                rs.forEach(function (r) {
                    tmparr.push(r.rollNum.substr(0, 6));    //020000  5055201001518000
                    if(r.rollNum.startsWith('1')){
                    }else{
                        iszhibing = false;
                    }
                });
                var index = startserialNum.length;
                startserialNum.push([]);
                endserialNum.push([]);
                rs.forEach(function (r) {
                    if(r.rollNum.startsWith('1') && !iszhibing){
                        return;
                    }
                    var rollId = r.rollNum.substr(2, 4); //02 0000  5055201001518000
                    for(var i=0; i<tmparr.length; i++){
                        if(rollId < tmparr[i].substr(2, 4) && !tmparr[i].startsWith('1')){
                            return;
                        }
                    }
                    if(thisrollNum.length == 0 || thisrollNum[thisrollNum.length-1] == r.rollNum){
                        thisrollNum.push(r.rollNum);
                    }
                    startserialNum[index].push(r.startSerial);
                    endserialNum[index].push(r.endSerial);
                });
                //------
                var rollName = 'middlewares/data/roll/'+ orderId +"-"+ newrollnum +'.txt';
                var input = writeLine(rollName, {
                    cacheLines: 1000
                });
                inputfile.push(input);
                //------
                console.log(thisrollNum);
                console.log(startserialNum[index].sort());
                console.log(endserialNum[index].sort());
            }
            ep.emit('getrollserialNum');
        });
    }
    function readCode(order,index) {
        var isfind = false;
        var writefileCount = 0;
        var serialNums = [];
        for(var i=0; i<startserialNum.length; i++){
            serialNums.push([]);
            for(var k=0; k<startserialNum[i].length; k++){
                if(startserialNum[i][k] >= order.startSerialNum && startserialNum[i][k] <= order.endSerialNum){
                    if(endserialNum[i][k] <= order.endSerialNum){
                        serialNums[i].push(startserialNum[i][k]);
                        serialNums[i].push(endserialNum[i][k]);
                        startserialNum[i][k]=0;
                        endserialNum[i][k]=0;
                        isfind = true;
                    }
                }
            }
        }
        if(isfind){
            var query = {
                categoryId:order.categoryId,
                _id:{$gte:order.startCodeId}
            };
            var fields = 'content serialNum';
            var start = order.startSerialNum;
            var totalCount = order.actCount;
            var options = { limit: totalCount, sort: '_id'};
            //startReadStream(query, fields, options, serialNums);
            var stream = QRCodeEntity.find(query, fields, options).lean().batchSize(10000).stream();
            var codeCount = 0;
            var count = 0;
            stream.on('data', function (doc) {
                stream.pause();
                count++;
                var isIn = false;
                var serialNum = doc.serialNum;
                //console.log(serialNum);
                for(var j=0; j<serialNums.length; j++){
                    for(var i=0; i<serialNums[j].length; i=i+2){
                        if(serialNum>=serialNums[j][i] && serialNum<=serialNums[j][i+1] && (serialNum-serialNums[j][i])%webNum ==0){
                            isIn = true;
                            codeCount++;
                            inputfile[j].write(doc.content+','+doc.serialNum,stream.resume());
                        }
                    }
                }
                if(count%100000==0){
                    console.log('read '+count+' codes only '+codeCount+' codes is useful');
                }
                if(!isIn){
                    stream.resume();
                }


            }).on('err', function (err) {
                logger.debug('[export_roll '+ rollnum +'] Err: '+ err);
                return false;
            }).on('close', function () {
                console.log(codeCount);
                ep.emit('write_ok',index+1);
            });
        }
    }
}