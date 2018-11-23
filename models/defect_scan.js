/**
 * Created by youngs1 on 7/27/16.
 *
 * A::2017-06-23 添加一个字段 PuID 标识 纸病机ID
 *
 */


var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var ObjectId  = Schema.ObjectId;
var utility   = require('utility');
var _ = require('lodash');

var ScanSerialSchema = new Schema({
    categoryId: { type: ObjectId },
    codeSerial: { type: Number, default: 0 },
    codeContent: {type: String},
    scanDate: { type: Date, default: Date.now },
    state: { type: Number, default: 0 },
    actWeb: { type: Number, default: 0 },
    groupCode: { type: Number, default: 0 },
    groupCodeContent: {type: String},
    // 标识是否为虚拟接头
    isVirtual: {type: Boolean, default: false}
    // 虚拟接头
},{ collection: 'scanserial' });

ScanSerialSchema.index({scanDate: -1});
ScanSerialSchema.index({codeSerial: 1});

mongoose.model('ScanSerial', ScanSerialSchema);