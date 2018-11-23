/**
 * Created by youngs1 on 7/19/16.
 */

var mongoose  = require('mongoose');
var Schema    = mongoose.Schema;
var _ = require('lodash');

var CategorySchema = new Schema({
    //  品类名、申请ID、品类关联物料、分拆规格、幅数、***、***、设计号、是否数码通(明确码的来源)、品类二维码、可用二维码量、是否显示
    name: { type: String},
    generalId: { type: String, default: '5679f868eaf6dca4c9539efb'},
    materiel_number: [],
    splitSpec: { type: Number, default: 18},
    webNum: {type: Number, default: 6},
    sendURL: { type: Boolean, default: false},
    sendXML: { type: Boolean, default: false},
    designId: { type: String },
    vdpVersion: { type: String },
    designIdVersion: { type: String },          //添加这个字段，是为了与数码通token一一对应，设计号+可变版本号 根据token下载二维码
    isGDT: { type: Boolean, default: true },
    codeCount: { type: Number, default: 0},
    codeAvailable: { type: Number, default: 0},
    //--折角码可用量-- 是否需要码池
    needCodePool: { type: Boolean, default: false},
    codePool: { type: Number, default: 0},
    totalcodePool: { type: Number, default: 0},
    //--------------
    disable: {type: Boolean, default: false},
    categoryImg: { type: String, default: '/public/images/product/default.png'},
    state: { type: Number, default: 0 }, // 用来标识 是否已经被 大品类组 关联， 已关联 state:1
    createDate: { type: Date, default: Date.now },   //创建时间
    createUser: { type: String },                    //des 设计创建人员
    // 标识可变类型
    VDPType: {type: String},
    // 标识多码情况，码的个数
    QRCodeCount: { type: Number, default: 1},
    //折角码对应信息
    QRCodeVersion: { type: String },  //二维码版本QR3、QR4……
    modulePoints: { type: String, default:0 },   //模块点数
    ErrorLevel: { type: String, default:0 },     //纠错级别
    pen_offset: { type: String, default:0 },     //喷头水平偏移
    QRCodeSize: { type: String, default:0 },     //二维码尺寸
    //------------
    RotAngle: { type: String, default:0 },   //旋转角度
    PicFormat: { type: String },  //图像格式
    PicModel: { type: String },   //图像模式
    PicDpi: { type: String },     //图像分辨率
    JobType: { type: String }     //对应柯达热文件夹名
    //--如果是折角码对应，记录当前品类下发码池PID值，累加从0开始----------
    //PID: {type: Number, default:0},  //折角码对应码池PID值,即发送到GMS生成ijps的文件个数

},{ collection: 'category' });

mongoose.model('Category', CategorySchema);
