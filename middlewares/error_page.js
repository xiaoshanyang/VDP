// ErrorPage middleware
exports.errorPage = function (req, res, next) {

  res.render404 = function (error) {
    return res.render('notify/notify', { i18n: res, status: 404, error: error });
  };

  res.renderError = function (error, statusCode) {
    if (statusCode === undefined) {
      statusCode = 400;
    }
    return res.render('notify/notify', { i18n: res, status: statusCode, error: error });
  };

  next();
};
