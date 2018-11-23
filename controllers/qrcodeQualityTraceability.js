/**
* 1.基本信息：名称（二维码下的产品名称，即品类名或者物料号）
*            纸卷号：所属小卷
*            包材数量：所在小卷的二维码数量
*            位置序号：所处位置，在当前小卷第多少个码
*            所属托盘：小卷所属托盘号
*            纸卷数量：所属托盘包含小卷数量
*            订单号：二维码所在工单
*            发货日期：具体发货日期
* 2.纸病信息：异常问题：所在小卷上纸病机的原因
*            接头数量：该小卷具体有多少接头
*            剃除数量：撕掉的米数
* 3.生产信息：工单号：
*            母卷编号：小卷所属母卷
*            产出数量：所在母卷分切几个小卷
* 4.物流信息：发送地：
*            发货日期：
*            发货数量：该二维码所属工单发货总量
*            托盘数量：发货的托盘总数量
* */

var eventproxy      = require('eventproxy');
var logger          = require('../common/logger');
var Qrcode          = require('../proxy').QRCode;
var Roll            = require('../proxy').Roll;
var Categroy        = require('../proxy').Category;
var RollDetailInfo  = require('../proxy').RollDetailInfo;


exports.qrcodeTrace = function (req, res, next) {
    var content = req.params.content || '';

    var result = {
        status: 0, message: '',

        Name: '', ScrollNo: '', PackNum: 0, PlaceNo: 0,
        TrayNo: '', ScrollNum: '', OrderNo: '', SendDate: '',

        Trouble: [], JoinNum: 0, OutNum: 0,

        WorkNo: '', MainNo: [], OutputNum: 0,

        Place: '', SendDate: '', SendNum: 0, TrayNum: 0
    };

    if(content === ''){
        return res.format({'application/json': function(){
            res.status(200).send(result);
        }});
    }
    // content = content.split('/');
    // content = content[content.length-1];


    var serialNum = '',
        webNum = 0,
        rollInfo = [];

    var rollNumber = new Array();

    var ep = new eventproxy();
    ep.fail(next);

    // 基本数据查找失败
    ep.all('basicInfoError', function (message) {
        result.status = 2;
        result.message = message;
        res.format({'application/json': function(){
            res.status(200).send(result);
        }});
    });

    // 缺少MES数据
    ep.all('mesInfoError', function (message) {
        result.status = 3;
        result.message = message;
        res.format({'application/json': function(){
            res.status(200).send(result);
        }});
    });


    // 基本信息获取
    //1.组合二维码，进行查询
    var codes = ['https://ga.openhema.com/'+content, 'http://q.openhema.com/'+content, 'https://q.openhema.com/'+content, content];
    Qrcode.getQRCodeByCodeArray(codes, function (err, rs) {
        if(err){
            ep.emit('basicInfoError', '没有找到当前二维码对应的信息');
            return logger.error('find qrcode error:' + err + '. condition: '+ codes);
        }
        if(rs == null)
        {
            ep.emit('basicInfoError', '没有找到当前二维码对应的信息');
            return logger.error('cannot find qrcode by condition: '+ codes);
        }
        serialNum = rs.serialNum;

        Categroy.getCategoryById(rs.categoryId, ep.done('getCategory_ok'));
        //Order.getOrderByQuery({orderId:rs.orderId}, ep.done('getOrder_ok'));
        var query_tmp = {
            categoryId: rs.categoryId,
            endSerial: {
                $gte: serialNum
            },
            startSerial: {
                $lte: serialNum
            }
            //actualWebNum: q.serialNum%rs_c.webNum?q.serialNum%rs_c.webNum:rs_c.webNum
        };
        ep.emit('getserialNum_ok', query_tmp);
    });

    //2.获取小卷信息
    ep.all('getCategory_ok','getserialNum_ok', function(rs_c, q_roll){
        if(rs_c == null){
            ep.emit('basicInfoError', '没有找到当前二维码对应的品类');
            return logger.error('cannot find category info. . condition: '+ codes);
        }
        result.Name = rs_c.name;
        webNum = rs_c.webNum;

        //q_roll.actualWebNum = serialNum%rs_c.webNum == 0?rs_c.webNum : serialNum%rs_c.webNum;

        Roll.getRollByQuery(q_roll, {sort:{_id:1}}, function(err_r, rs_r){
            if(err_r){
                logger.error('[Searching rollInfo] searching rollInfo by '+codes+' ERROR:' + err_r);
                ep.emit('basicInfoError', '查找二维码对应小卷信息错误');
            }else{
                if(rs_r.length > 0){
                    for(var i=0; i<rs_r.length; ){
                        // 纸病卷
                        if(rs_r[i].rollNum.startsWith('1')){
                            rs_r.splice(i,1);
                        }else{
                            // 删除不是同一副的小卷
                            if(Math.abs(rs_r[i].endSerial-serialNum) % webNum != 0){
                                rs_r.splice(i,1);
                            }else{
                                i++;
                            }
                        }
                    }
                }
                if(rs_r.length == 0){
                    logger.error('[Searching rollInfo] cannot find rollInfo by '+codes+' ERROR:' + err_r);
                    return ep.emit('basicInfoError', '没有找到对应的小卷信息');
                }
                // 如果有多个小卷匹配,按照入库的时间来说，取最后一个小卷即可

                // 只有一个小卷

                ep.emit('getRollNum_ok',rs_r[rs_r.length-1].rollNum);
            }

        });

    });

    // 根据小卷号，找出当前小卷的所有区间
    ep.all('getRollNum_ok', function (rollNum) {
        result.ScrollNo = rollNum;
        // 根据小卷号，关联mes推送信息
        RollDetailInfo.getRollDetailInfoByrollNum(rollNum, function (err, rs) {
            if(err){
                logger.error('[Searching rollInfo] searching rollInfo from mes by '+codes+' ERROR:' + err);
                return ep.emit('mesInfoError', '查找小卷对应的发货信息错误');
            }
            if(rs != null){
                if(rs.length > 0){
                    result.TrayNo = rs[0].TrayNo;
                    result.ScrollNum = rs[0].PalletItems;
                    result.SendDate = rs[0].DeliveryDate;
                    result.OrderNo = rs[0].outdlcode;

                    result.JoinNum = rs[0].Splice;
                    //result.OutNum = rs[0].Actual_Length;

                    rs.forEach(function (r) {
                        // 去重
                        //
                        result.Trouble.push(r.PDCNText);
                        result.OutNum += r.Actual_Length;
                        if(result.MainNo.indexOf(r.M_Rolls) < 0){
                            result.MainNo.push(r.M_Rolls);
                        }

                    });

                    result.WorkNo = rs[0].OrderNo;
                    result.OutputNum = rs[0].OupputNum;

                    result.Place = rs[0].deliver_add;
                    result.SendDate = rs[0].DeliveryDate;
                    result.SendNum = rs[0].WOItems;
                    result.TrayNum = rs[0].PalletCount;

                    ep.emit('getRollInfoMES_ok', null);
                }
                else{
                    logger.error('[Searching rollInfo] searching nothing rollInfo from mes by '+codes);
                    ep.emit('getRollInfoMES_ok', '没有找到小卷对应的发货记录');
                }
            }else{
                logger.error('[Searching rollInfo] searching nothing rollInfo from mes by '+codes);
               ep.emit('getRollInfoMES_ok', '没有找到小卷对应的发货记录');
            }
            // ep.emit('getRollInfoMES_ok');

        });
        // 获取小卷信息
        Roll.getRollByQuery({rollNum:rollNum}, {sort:{_id:1}}, function (err, rs) {
           if(err){
               logger.error('[Searching rollInfo] searching rollInfo by '+codes+' ERROR:' + err);
               //return ep.emit('basicInfoError', '查找小卷二维码位置信息错误');
               return ep.emit('getRollInfoVDP_ok', '查找小卷二维码位置信息错误');
           }
           if(rs != null){
               rs.reverse(); // 反向排序，取出前几个小卷号一致的信息即可，剩下的不要了
               for(var i=0; i<rs.length; i++){
                   if(rs[i].rollNum == rollNum){
                       //把区间信息导入: 小卷号、实际区间量、小卷实际量、起始、结束
                       var isInArea = 0;
                       if(rs[i].startSerial <= serialNum && rs[i].endSerial>= serialNum){
                           isInArea = parseInt((rs[i].endSerial-serialNum)/webNum)+1;
                       }
                       rollInfo.unshift({rollNum:rs[i].rollNum,actualCode:rs[i].actualCode,actualCount:rs[i].actualCount,
                           startSerial:rs[i].startSerial,endSerial:rs[i].endSerial,isInArea:isInArea});
                   }
               }
               rollInfo.forEach(function (r, index) {
                   if(result.PlaceNo === result.PackNum){
                       result.PlaceNo += r.isInArea===0 ? r.actualCode : r.isInArea;
                   }
                   result.PackNum += r.actualCode;

               });
               //如果小卷生成时间在8月份之前的话，从文件中取出所在位置
               //grep -ni '字符串' 文件名
               ep.emit('getRollInfoVDP_ok', null);
           }else{
              // ep.emit('basicInfoError', '查找小卷二维码位置信息错误');
               ep.emit('getRollInfoVDP_ok', '查找小卷二维码位置信息错误');
           }
           // ep.emit('getRollInfoVDP_ok');
        });
    });

    ep.all('getRollInfoMES_ok', 'getRollInfoVDP_ok', function (mesInfo, vdpInfo) {
       logger.debug('success');
       if(mesInfo==null && vdpInfo==null){
           result.status = 1;
           result.message = '查找成功';
       }else{
           result.status = 3;
           result.message = mesInfo==null?vdpInfo:(vdpInfo==null?mesInfo:mesInfo+','+vdpInfo);
       }
       if(result.JoinNum > 0){
           result.OutNum = result.OutNum/2;
       }
       logger.debug(result);
       //res.write(JSON.stringify(result));

        res.format({'application/json': function(){
            res.status(200).send(result);
        }});
    });

    //res.write(result);
}