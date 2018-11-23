/**
 * Created by youngs1 on 16/6/1.
 */

var mongoose = require('mongoose');
var config   = require('../config');
var logger = require('../common/logger');


mongoose.connect(config.db.uri, config.db.options, function (err) {
    if (err) {
        logger.error('connect to %s error: ', config.db, err.message);
        process.exit(1);
    }
});

// models
require('./user');
require('./roles');
require('./logs');
require('./materiel');
require('./customer');
require('./category');
require('./ftpinfo');
require('./qrcode_apply');
require('./qrcode');
require('./order');
require('./roll');
require('./defect_scan');
require('./fac_consinfo');
require('./cons_Calc');
require('./roll_DetailInfo');

exports.User        = mongoose.model('User');
exports.Roles       = mongoose.model('Roles');
exports.Logs        = mongoose.model('Logs');
exports.Materiel    = mongoose.model('Materiel');
exports.Customer    = mongoose.model('Customer');
exports.Category    = mongoose.model('Category');
exports.FTP         = mongoose.model('FTP');
exports.QRCodeApply = mongoose.model('QRCodeApply');
exports.QRCode      = mongoose.model('QRCode');
exports.Order       = mongoose.model('Order');
exports.Roll        = mongoose.model('Roll');
exports.ScanSerial  = mongoose.model('ScanSerial');
exports.FacConsInfo = mongoose.model('FacConsInfo');
exports.consCalc    = mongoose.model('cons_Calc');
exports.RollDetailInfo = mongoose.model('RollDetailInfo');
