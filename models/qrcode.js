/**
 * Created by youngs1 on 7/22/16.
 */

var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var ObjectId  = Schema.ObjectId;
var utility   = require('utility');
var _ = require('lodash');

var QRCodeSchema = new Schema({
    // 品类ID、二维码、生产批次号、状态、序列、打印图片、打印检测重复次数、灌装检测重复次数、罐装日期、分片组合键
    categoryId: { type: ObjectId },
    content: { type: String },
    content1: { type: String },
    url: { type: String , default: 'https://q.openhema.com'},
    batch: { type: String},
    state: { type: Number, default: 1},
    orderId: { type: Number},
    serialNum: { type: Number},
    imgName: { type: String},
    printNum: { type: Number},
    cansNum: { type: Number},
    cansDate: { type: String },
    distribution: {type: Number}
},{ collection: 'qrcode' });


QRCodeSchema.index({content: 1});
QRCodeSchema.index({categoryId: 1});
QRCodeSchema.index({content1: 1}, {sparse: true});
QRCodeSchema.index({state: 1});
QRCodeSchema.index({cansDate: 1}, {sparse: true});
QRCodeSchema.index({orderId: 1});

mongoose.model('QRCode', QRCodeSchema);
