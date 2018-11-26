/*
 * QRCode - app.js
 * @author Yos <youngswang@msn.com>
 * @create data 2016-06-01
 * @copyright Copyright (c) 2015, GreatViewPack, Inc.
 */

/*
 * App Config. When you first run App the wizard page will be show.
 */

var path = require('path');
var config = require('./config.json');

if (!config.istest) {
    config.db.host = 'vdp.greatviewpack.org';
    config.db.dbname = 'vdp';
    config.db.uri = 'mongodb://vdp.greatviewpack.org:27072/vdp';
    config.db.options.user = 'admin.vdp';
    config.db.options.pass = 'Ap123456';

    config.redis.host = 'vdp.greatviewpack.org';
    config.redis.pass = 'qrcode@2016';

    config.host = 'vdp.greatviewpack.org';
    config.port = 80;
    config.hostname = 'vdp.greatviewpack.org';
} else {
    //config.db.host = '127.0.0.1';
    //config.db.dbname = 'vdp';
    // config.db.uri = 'mongodb://127.0.0.1:27017/vdp';
    //config.db.options.user = 'qrowner';
    //config.db.options.pass = 'qr@2016';
    //
   // config.redis.host = '127.0.0.1';
    //config.redis.pass = 'qr@2016';

    //正式环境
    // config.db.host = 'vdp.greatviewpack.org';
    // config.db.dbname = 'vdp';
    // config.db.uri = 'mongodb://vdp.greatviewpack.org:27072/vdp';
    // config.redis.host = 'vdp.greatviewpack.org';
    // config.redis.pass = 'qrcode@2016';

    // config.db.options.user = 'admin.vdp';
    // config.db.options.pass = 'Ap123456';

    //测试环境
    // config.db.host = '192.168.11.36';
    // config.db.dbname = 'vdp';
    // config.db.uri = 'mongodb://192.168.11.36:27017/vdp';
    config.db.host = '192.168.14.61';
    config.db.dbname = 'vdp';
    //config.db.uri = 'mongodb://192.168.14.61:27072/vdp';
    config.db.uri = 'mongodb://vdp.documents.azure.cn:10255/vdp?ssl=true&replicaSet=globaldb';

    config.db.options.user = 'vdp';
    config.db.options.pass = 'iuxgvcbIrCYO6eO1mQTNqEo4g1JM1BksHhulQx32ELqWaFrqDL0pF3SaDUud7lrQQC1RzHXpcUI2AsWBKIEkXg==';

    config.redis.host = '192.168.14.48';
    config.redis.pass = 'qrcode@2016';

    config.host = 'localhost';
    config.port = process.env.PORT || 1337;
    config.hostname = 'localhost';

    // config.host = '192.168.14.48';
    // config.port = 3000;
    // config.hostname = 'vdp_test';
}

config.mini_assets = false;
if (process.env.NODE_ENV === 'test') {
    config.db.dbname = config.db.dbname + '_test';
}
config.i18n_opts.directory = path.join(__dirname, 'i18n/');
config.upload.path = path.join(__dirname, 'public/upload/');
config.data_exchange.path = path.join(__dirname, 'middlewares/data/');
var urlinfo = require('url').parse(config.host);
config.hostname = urlinfo.hostname || config.host;
var dburi = 'mongodb://'+ config.db.host + ':' + config.db.port + '/' + config.db.dbname;
// config.db.uri = dburi;

module.exports = config;
