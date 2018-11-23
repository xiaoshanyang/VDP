/**
 * Created by lxrent on 2016/12/21.
 */

//修改state状态:

var eventproxy      = require('eventproxy');

var mongoose        = require('mongoose');
var models          = require('../models');
var Order           = require('../proxy').Order;
var QRCode          = require('../proxy').QRCode;
var QRCodeEntity    = models.QRCode;

//"content" : "30012027U227WTporgcchUp84d"

exports.changestate = function () {

    var ep = new eventproxy();
    ep.fail(function (err) {
        console.log(err);
    });
    var code = "30012027U227WTporgcchUp84d";
    QRCode.getQRCodeByCode(code, function (err, rs) {
       if(err){
           return console.log(err);
       }
       ep.emit('get_categoryId', (rs.categoryId).toString());
    });

    ep.all('get_categoryId', function (categoryId) {
        var query = {
            state: {$in:[11, 111]}
        };
        var codeCount = 0;
        var loopUpdateNum = 0;
        var updatedDoc = 0;
        var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
        var stream = QRCodeEntity.find(query, '', '').lean().batchSize(100000).stream();
        stream.on('data', function (doc) {
            codeCount++;
            if((doc.categoryId).toString() == categoryId){
               // console.log('试机');
            }else{
                //批量更新状态
                loopUpdateNum++;
                stream.pause();
                doc.state = doc.state+1000;
                batch.find({ content: doc.content }).update({ $inc: { state: 1000 }});
                if(loopUpdateNum % 5000 === 0){
                    console.log(codeCount);
                        batch.execute(function(err, rs) {
                            if (err) {
                                return console.log('Update Code is Error: '+ err);
                            } else {
                                updatedDoc = updatedDoc + rs.nModified;
                                console.log('[Task-GetCansData] Count: ('+ loopUpdateNum +'). Updated: ('+ updatedDoc +').');
                                batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                                stream.resume();
                            }
                        });
                }else{
                    stream.resume();
                }
            }
           // console.log(codeCount);
        }).on('err', function (err) {
            console.log(err);
        }).on('close', function () {
            batch.execute(function(err, rs) {
                if (err) {
                    return console.log('Update Code is Error: '+ err);
                } else {
                    updatedDoc = updatedDoc + rs.nModified;
                    console.log('[Task-GetCansData] Count: ('+ loopUpdateNum +'). Updated: ('+ updatedDoc +').');
                    batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                }
            });
            console.log('更新完成');
        });
    });

}

