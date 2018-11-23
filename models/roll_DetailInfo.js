/**
 * Created by taozhou on 2017/7/3.
 */
/**
* 1.基本信息：名称（二维码下的产品名称，即品类名或者物料号）
*            纸卷号：所属小卷
*            包菜数量：所在小卷的二维码数量
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

var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var ObjectId  = Schema.ObjectId;
var utility   = require('utility');
var _ = require('lodash');

var RollDetailInfoSchema = new Schema({
    // 小卷号、发货单号、纸病卷号、小卷标准包数、托盘号、托盘上小卷数、工单号、纸病代码
    // 纸病描述、纸病备注、小卷接头数、去除纸病米数、母卷号、母卷产出卷数、该工单在当前批次中的包数（千只）、
    // 该工单在当前批次中的托数、 扫托出库日期、发货地址、 备用字段、上传数码通 成功失败
    rollNum: { type: String },
    outdlcode: { type: String },
    D_rollNum: { type: String },
    RollPks: { type: String },
    TrayNo: {type: String},
    PalletItems: { type: Number, default: 0 },
    OrderNo: { type: String },
    pf_Code: { type: String },
    PDCNText: { type: String },
    Remark: { type: String },
    Splice: { type: Number, default: 0 },
    Actual_Length: { type:Number, default:0 },
    M_Rolls: { type: String },
    OupputNum: { type: Number, default: 0 },
    WOItems: { type: Number, default: 0 },
    PalletCount: { type: Number, default: 0 },
    DeliveryDate: { type: Date },
    deliver_add: { type: String },
    send_state: { type: Number, default: 0 },   //0:未发送、1:发送完成、2:发送失败、3:没有找到文件、
    Field1: { type: String },
    Field2: { type: String },
    Field3: { type: String },
    Field4: { type: String },
    Field5: { type: String }
},{ collection: 'rollDetail' });

RollDetailInfoSchema.index({rollNum: 1});
RollDetailInfoSchema.index({outdlcode: 1});
RollDetailInfoSchema.index({OrderNo: 1});

mongoose.model('RollDetailInfo', RollDetailInfoSchema);