/**
 * Created by youngs1 on 7/25/16.
 */

var mongoose        = require('mongoose')
require('mongoose-double')(mongoose);
var BaseModel       = require("./base_model");
var Schema          = mongoose.Schema;
var SchemaTypes     = mongoose.Schema.Types;
var ObjectId        = Schema.ObjectId;
var utility         = require('utility');
var _ = require('lodash');

var OrderSchema = new Schema({
    // 订单号、工单号、客户编码、物料编码、打印类型、拼接URL、计划量、码倍数、分拆规格
    // 设计编码、客户订单号、可变印刷版本号、申请次数、工厂编码、产线编码、幅数、订单下发日期
    // 开始码序列号、上传打印时间、MES触发平台时间、文件清单、文件最大序列号、状态
    // 品类ID、实际打印量
    saleNum: { type: String },
    orderId: { type: Number, default: 0 },
    customerCode: { type: String },         //客户编码
    productCode: { type: String },
    // 双码关联的加入，更改 打印类型 数据格式 由0,1,2,3依次增加 改为 通过位标识显示
    // -----------------------------------
    // | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |    //依次标识，码(1/0)、双码(4/3/2/1/0)、 图(1/0) 、旋转(1/0) 、 ……保留位待更新
    // -----------------------------------
    vdpType: { type: Number, default: 0 },
    //vdpType: { type: String, default: '0000000000000000000000000' },
    codeURL: { type: String },              //拼接URL
    planCount: { type: Number, default: 0 },//计划量
    multipleNum: { type: SchemaTypes.Double },
    splitSpec: { type: Number, default: 18 },
    designId: { type: String },
    customerOrderNum: { type: String },     //客户订单号
    vdpVersion: { type: String },
    orderNum: { type: String },
    factoryCode: { type: String },
    lineCode: { type: String },
    webNum: { type: Number, default: 6 },
    startSerialNum: { type: Number, default: 0 },
    endSerialNum: { type: Number, default: 0 },
    startCodeId: { type: ObjectId },
    endCodeId: { type: ObjectId },
    pushMESDate: { type: Date, default: Date.now },
    pushPrintDate: { type: Date, default: Date.now },
    pushDate: { type: Date, default: Date.now },
    fileName: { type: String },
    fileMaxSerial: { type: Number, default: 0 },
    fileRow: { type: Number, default: 0 },
    state: { type: Number, default: 0 },
    categoryId: { type: ObjectId },         //品类ID
    actCount: { type: Number, default: 0 },
    smtDesginID: {type: String},
    smtVersionID: {type: String}
},{ collection: 'order' });
//1或者-1 表示索引升序或者降序
OrderSchema.index({pushDate: -1});
OrderSchema.index({orderId: -1});
OrderSchema.index({categoryId: 1});

mongoose.model('Order', OrderSchema);
