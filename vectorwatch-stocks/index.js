var Promise = require('bluebird'),
    express = require('express'),
    app = express(),
    VectorWatch = require('vectorwatch-sdk'),
    MySQLStorageProvider = require('vectorwatch-storageprovider-mysql'),
    NodeCache = require( "node-cache"),
    schedule = require('node-schedule'),
    http = require('http');

var CHUNK_SIZE = 50;

var vectorWatch = new VectorWatch({
    streamUID: process.env.STREAM_UUID,
    token: process.env.VECTOR_TOKEN,
    production: process.env.PRODUCTION
});

var storageProvider = new MySQLStorageProvider();
vectorWatch.setStorageProvider(storageProvider);

var stocksCache = new NodeCache( { stdTTL: 3600 /*60min*/, checkperiod: 120 } );


var YahooStocksApi = require('./YahooStocksApi.js');
var yahooStocksApi = new YahooStocksApi();



vectorWatch.on('subscribe', function(event, response) {
    vectorWatch.logger.info("New user subscribed to Stocks stream!");
    var cached = stocksCache.get(event.getUserSettings().settings.Ticker.name);
    if (cached) {
        response.setValue(buildPushData(event.getUserSettings().settings, cached.value));
        return response.send();
    }

    yahooStocksApi.get(event.getUserSettings().settings.Ticker.name).then(function(symbolValue) {
        storageProvider.storeUserSettingsAsync(event.getChannelLabel(), event.getUserSettings()).then(function(contents) {
            stocksCache.set(event.getUserSettings().settings.Ticker.name, { value : symbolValue }, function( err, success ) {});
            response.setValue(buildPushData(event.getUserSettings().settings, symbolValue));
            response.send();
        }).catch(function(err) {
            response.sendBadRequestError();
        });
    }).catch(function(err) {
        response.sendBadRequestError();
    })
});

vectorWatch.on('unsubscribe', function(event, response) {
    vectorWatch.logger.info("User unsubscribed from Stocks stream!");
    storageProvider.removeUserSettingsAsync(event.getChannelLabel()).then(function(contents) {
        response.send();
    }).catch(function(err) {
        response.sendBadRequestError();
    });
});

function doPush() {
    storageProvider.getAllUserSettingsAsync().then(function(records) {

        vectorWatch.logger.info("Stocks push" + records.length);
        for (var i = 0; i < records.length; i += CHUNK_SIZE) {
            var _chunk = records.slice(i, i + CHUNK_SIZE);
            if (_chunk.length > 1) {
                yahooStocksApi.getMultiple(buildSymbolsArray(_chunk)).then(function (symbolValues) {
                    _chunk.forEach(function(record, index) {
                        stocksCache.set(record.userSettings.Ticker.name, { value : symbolValues[record.userSettings.Ticker.name] }, function( err, success ) {});

                    });
                }).catch(function (e) {
                    vectorWatch.logger.error("Stocks push error1: " + JSON.stringify(e));
                });
            } else {
                yahooStocksApi.get(_chunk[0].userSettings.Ticker.name).then(function (symbolValue) {
                    stocksCache.set(_chunk[0].userSettings.Ticker.name, { value : symbolValue }, function( err, success ) {});


                }).catch(function (e) {
                    vectorWatch.logger.error("Stocks push error2: " + JSON.stringify(e));
                });
            }
        }
    }).catch(function(err) {
        vectorWatch.logger.error("Stocks push error3: " + JSON.stringify(err));
    });
}



app.use('/api/callback', vectorWatch.getMiddleware());

app.use('/health', function(req,res, next) {
    res.sendStatus(200);
});


http.createServer(app).listen(process.env.PORT || 8080, function() {
    console.log('Non-secure server started.');
    var scheduleRule = new schedule.RecurrenceRule();
    scheduleRule.minute = [20, 50];
    schedule.scheduleJob(scheduleRule, doPush);
});


/**
 * Returns an array of stock symbols
 * Returns an array of stock symbols
 * @param chunk - array of objects from DB
 *      {
 *        userSettings : {
 *        "Ticker":{
 *            "name":"AAPL"
 *        },
 *        "Display Option":{
 *            "name":"VALUE"
 *           }
 *        },
 *        channelLabels: label.
 *      }
 * @returns {Array} - stock symbols
 */
function buildSymbolsArray(chunk) {
    symbolsArray = [];
    chunk.forEach(function(record) {
        symbolsArray.push(record.userSettings.Ticker.name);
    })
    return symbolsArray;
}

/**
 * Build push data based on what option the user has chosen
 * @param settings :
    * {
 *        "Ticker":{
 *            "name":"AAPL"
 *        }
 *    }
 * @param data
 * @returns {*}
 */
function buildPushData(settings, data) {

   switch (settings['Display Option'].name) {
       case "TICKER VALUE":
           return settings.Ticker.name + " " + data;
       case "VALUE":
           return data;
       default:
           return data;
   }

}















