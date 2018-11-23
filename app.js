/*
 * QRCode - app.js
 * @author Yos <youngswang@msn.com>
 * @author xxx <>
 * @author xxx <>
 * @create data 2016-06-01
 * @copyright Copyright (c) 2016, GreatViewPack, Inc.
 */

/*
 * How to start : hotnode app.js
 */

/*
 * Folder description.
 * api: Application interface for external.
 * bin: Admin script，such as Fix bug, Modify data...
 * common: public and private components.
 * !!!controllers: Business processing core
 * logs: logs...
 * middlewares: Platform middlewares, such as Auth management, Logs handling...
 * !!!models: Data model and structure.
 * node_modules: Third party module. See Module dependencies.
 * proxy: Proxy service for linking the controllers and models.
 * public: Static files.
 * middlewares/data: Temporary handle the space for files.
 * !!!views: Foreground pages.
 */

/*
 * Module dependencies.
 * colors: Get colors in your node.js console
 * express: Fast, unopinionated, minimalist web framework
 * path: Node.JS path module
 * express-session: Simple session middleware for Express
 * mongoose: Mongoose MongoDB ODM
 * connect-redis: Redis session store for Connect
 * i18n: Lightweight translation module with dynamic json storage
 * lodash: Lodash modular utilities.
 * csurf: CSRF token middleware.
 * compression: Node.js compression middleware.
 * body-parser: Changer post data to JSON.
 * connect-busboy: File upload middleware for busboy.
 * errorhandler: Development-only error handler middleware.
 * helmet: Help secure Express/Connect apps with various HTTP headers
 * bytes: Utility to parse a string bytes to bytes and vice-versa
 * ejs-mate: Express 4.x locals for layout, partial.
 * response-time: Response time for Node.js servers.
 * method-override: Lets you use HTTP verbs such as PUT or DELETE in places where the client doesn't support it.
 * cookie-parser: Cookie parsing with signatures
 * grunt-zip: Zip and unzip files via a grunt plugin
 * lei-stream: Read/Write Stream.
 * node-schedule: A cron-like and not-cron-like job scheduler for Node.
 * validator: String validation and sanitization.
 */

var config                  = require('./config');
                            require('colors');
var path                    = require('path');
var Loader                  = require('loader');
var express                 = require('express');
var session                 = require('express-session');

                            require('./middlewares/mongoose_log');
                            require('./models');

var webRouter               = require('./web_router');
var apiRouterV1             = require('./api_router_v1');
if (config.isinit) {
    var auth                    = require('./middlewares/auth');
}
var errorPageMiddleware     = require('./middlewares/error_page');
var RedisStore              = require('connect-redis')(session);
var i18n                    = require('i18n');
var _                       = require('lodash');
var csurf                   = require('csurf');
var compress                = require('compression');
var bodyParser              = require('body-parser');
var busboy                  = require('connect-busboy');
var errorhandler            = require('errorhandler');
var cors                    = require('cors');
var requestLog              = require('./middlewares/request_log');
var renderMiddleware        = require('./middlewares/render');
var logger                  = require('./common/logger');
var helmet                  = require('helmet');
var bytes                   = require('bytes');

// 静态目录
var staticDir = path.join(__dirname,'public');
// assets
var assets = {};

if (config.mini_assets) {
    try {
        assets = require('./assets.json');
    } catch (e) {
        logger.error('You must execute `make build` before start app when mini_assets is true.');
        throw e;
    }
}

var app = express();

// config i18n
i18n.configure({
    locales: config.i18n_opts.locales,
    directory: config.i18n_opts.directory,
    defaultLocale: config.i18n_opts.defaultLocale,
    cookie: 'i18n'
});
//设为默认的模板页,自动替换<%- body %>
//但如果<% layout('layout_signin') -%> 重新定义了,就不会替换默认模板页中的内容而是相应的layout_signin文件
// configuration in all env
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('html', require('ejs-mate'));
app.locals._layoutFile = 'layout.html';

app.enable('trust proxy');

// Request logger。请求时间
app.use(requestLog);

if (config.debug) {
    // 渲染时间
    app.use(renderMiddleware.render);
}

app.use('/public', express.static(staticDir));

// 通用的中间件
app.use(require('response-time')());
app.use(helmet.frameguard('sameorigin'));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(bodyParser.json({limit: '1mb'}));
app.use(require('method-override')());
app.use(require('cookie-parser')(config.session_secret));
app.use(compress());
app.use(session({
    secret: config.session_secret,
    store: new RedisStore({
        port: config.redis.port,
        host: config.redis.host,
        pass: config.redis.pass
    }),
    resave: true,
    saveUninitialized: true
}));
app.use(i18n.init);
if (config.isinit) {
    app.use(auth.initUser);
    app.use(auth.blockUser());
};

if (!config.debug) {
    app.use(function (req, res, next) {
        if (req.path === '/api' || req.path.indexOf('/api') === -1) {
            csurf()(req, res, next);
            return;
        }
        next();
    });
    app.set('view cache', true);
}

// set static, dynamic helpers
_.extend(app.locals, {
    config: config,
    Loader: Loader,
    assets: assets
});

app.use(errorPageMiddleware.errorPage);
_.extend(app.locals, require('./common/render_helper'));

app.use(function (req, res, next) {
    if (req.user) {
        req.setLocale(req.user.locale);
    } else if (req.cookies.locale) {
        req.setLocale(req.cookies.locale);
    } else if (req.acceptsLanguages()) {
        req.setLocale(req.acceptsLanguages());
    } else {
        req.setLocale('en');
    }
    res.locals.csrf = req.csrfToken ? req.csrfToken() : '';
    next();
});

app.use(busboy({
    limits: {
        fileSize: bytes(config.file_limit)
    }
}));

// routes
app.use('/api/v1', apiRouterV1);
app.use('/', webRouter);

// error handler
if (config.debug) {
    app.use(errorhandler());
} else {
    app.use(function (err, req, res, next) {
        logger.error(err);
        return res.render('notify/notify', { i18n: res, status: 500, error: res.__('Internal Server Error') });
    });
}
// 关于 主机名、端口号设置 在 config.js 中 设置，并没有使用 config.json 中的配置文件
//
//if (!module.parent) {
    app.listen(config.port, function () {
        logger.info('VDP WebApp listening on port', config.port);
        logger.warn('Wanna date me? ...');
        logger.info('You can debug your app with http://' + config.hostname + ':' + config.port);
        logger.info();
    });
//}
//require('./bin/test');
module.exports = app;