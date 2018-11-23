/**
 * Created by youngs1 on 7/26/16.
 */
var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var ObjectId  = Schema.ObjectId;
var utility   = require('utility');
var _ = require('lodash');

var RollSchema = new Schema({
    // 工单号、小卷号、总幅数、小卷所属幅数、开始码、结束码、实际印刷数、实际码量、
    // 品类ID、入库时间、消息状态、纸病机标识、刀数
    orderId: { type: Number, default: 0 },
    rollNum: { type: String },
    webNum: { type: Number, default: 6 },
    actualWebNum: { type: Number, default: 0 },
    startSerial: { type: Number, default: 0 },
    endSerial: { type: Number, default: 0 },
    startCode: { type: String},
    endCode: { type: String},
    actualCount: { type: Number, default: 0 },
    actualCode: { type: Number, default: 0 },
    categoryId: { type: ObjectId },
    pushDate: { type: Date, default: Date.now },
    msgContent: { type: String },
    doctorId: { type: Number, default: 0},
    bladeNumIn: { type: Number, default: 0}
},{ collection: 'roll' });

RollSchema.index({orderId: 1});
RollSchema.index({rollNum: 1});
RollSchema.index({pushDate: -1});

mongoose.model('Roll', RollSchema);