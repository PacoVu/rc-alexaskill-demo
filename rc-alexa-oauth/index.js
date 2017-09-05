require('dotenv').load();
var path = require('path');
var RC = require('ringcentral');
var app = require('express')();

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs');

var port = process.env.PORT || 5000

var server = require('http').createServer(app);
server.listen(port);

app.get('/', function(req, res) {
  var rcsdk = new RC({
    server: RC.server.sandbox,
    appKey: req.query.client_id,
    appSecret: process.env.RC_APP_SECRET
  });

  var opt = {
    state : req.query.state,
    response_type : req.query.response_type,
    redirectUri: req.query.redirect_uri
  }
  var oauthUri = rcsdk.platform().loginUrl(opt)

  res.render('index', {
    authorize_uri: oauthUri,
    redirect_uri: req.query.redirect_uri
  });
});
