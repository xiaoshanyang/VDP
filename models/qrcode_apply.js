/**
 * Created by youngs1 on 7/22/16.
 */
var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var ObjectId  = Schema.ObjectId;
var utility   = require('utility');
var _ = require('lodash');

var QRCodeApplySchema = new Schema({
    categoryId: { type: ObjectId },
    orderId: {type: String },   //99999-1 99999表示工单号，1表示工单的申请次数
    generalId: { type: String },
    appuser: { type: String},
    dlCount: { type: Number, default: 0},
    dbCount: { type: Number, default: 0},
    fileName: { type: String},
    create_at: { type: Date, default: Date.now },
    insert_at: { type: Date, default: Date.now },
    startSerial: { type: Number, default: 0},
    endSerial: { type: Number, default: 0},
    state: { type: Number, default:0}
},{ collection: 'qrcode_apply' });

QRCodeApplySchema.index({categoryId: 1});
QRCodeApplySchema.index({fileName: 1});

mongoose.model('QRCodeApply', QRCodeApplySchema);