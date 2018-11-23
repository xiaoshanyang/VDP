/**
 * Created by taozhou on 2017/3/29.
 */
var config          = require('../config');
var FS              = require('fs');
var validator       = require('validator');
var configFile      = 'config.json';

//需要判断范围、是否是数字

exports.distribution = function (req, res, next) {
    var shardname = req.body.shard_name || '';
    var startRange = req.body.start_range || '';
    var endRange = req.body.end_range || '';

    var shardList = [];
    var index = -1;  //判断新添加范围的shard是否已经存在
    for(var i=0; ;i++){
        var shard = eval('config.shard_ranges.shard' + i);
        if(typeof shard === 'undefined' || shard.range.length == 0){
            break;
        }else{
            if(shard.name == shardname){
                index = i;
            }
            shardList.push(shard);
        }
    }

    if(shardname === '' || startRange === '' || endRange === ''){
        res.render('shards/shards', {
            i18n: res,
            query: {
                shard_name: shardname,
                start_range: startRange,
                end_range: endRange
            },
            shardList: shardList
        });
    }else{
        if(index < 0){
            index = shardList.length;
            var tmp = {
                name: shardname,
                range: [[startRange, endRange]],
                active: true
            };
            eval('config.shard_ranges.shard'+ index +'= tmp');
            shardList.push(tmp);
        }else{
            eval('config.shard_ranges.shard'+ index +'.range.push([startRange, endRange])');
            //console.log(eval('config.shard_ranges.shard'+ index +'.range'));
            //shardList[index].range.push([startRange, endRange]);
            //console.log(eval('config.shard_ranges.shard'+ index +'.range'));
        }
        FS.writeFile(configFile, JSON.stringify(config, null, 4));
        res.send({success:true, reload:true});
    }
}

exports.updateRange = function (req, res, next) {
    var pk = validator.trim(req.body.pk);
    var changeName = validator.trim(req.body.name);
    var reqValue = validator.trim(req.body.value);

    var name = pk.split('_')[0];
    var num = pk.split('_')[1];
    var index = 0;
    for(var i=0; ; i++){
        var shard = eval('config.shard_ranges.shard' + i);
        if(typeof shard === 'undefined' || shard.range.length == 0){
            break;
        }else{
            if(shard.name == name){
                index = i;
                break;
            }
        }
    }


    //修改起始码
    if(changeName == 'startRange'){
        if(isNaN(reqValue)){
            return res.send({error: true, message: 'please input number'});
        }
        eval('config.shard_ranges.shard'+ index +'.range[num][0] = reqValue');
        console.log(config.shard_ranges);
        FS.writeFile(configFile, JSON.stringify(config, null, 4));
        return res.send({success: true, reload: true});
    }
    //修改结束码
    if(changeName == 'endRange'){
        if(isNaN(reqValue)){
            return res.send({error: true, message: 'please input number'});
        }
        eval('config.shard_ranges.shard'+ index +'.range[num][1] = reqValue');
        FS.writeFile(configFile, JSON.stringify(config, null, 4));
        return res.send({success: true, reload: true});
    }
    //修改shard状态
    if(changeName == 'changeState'){
        if(reqValue === 'true'){
            reqValue = false;
        }else{
            reqValue = true;
        }
        eval('config.shard_ranges.shard'+ index +'.active = reqValue');
        FS.writeFile(configFile, JSON.stringify(config, null, 4));
        return res.send({success: true, reload: true});
    }

}
