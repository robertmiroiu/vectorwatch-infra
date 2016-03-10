var Promise = require('bluebird'),
    express = require('express'),
    app = express(),
    VectorWatch = require('vectorwatch-sdk'),
    MySQLStorageProvider = require('vectorwatch-storageprovider-mysql'),
    NodeCache = require( "node-cache" );
    http = require('http');


//var CircularJSON = require('circular-json');

var CHUNK_SIZE = 50;
var UPDATE_INTERVAL_MINUTES = 30;

var vectorWatch = new VectorWatch({
    streamUID: process.env.STREAM_UID,
    token: process.env.VECTOR_TOKEN
});


var dbSettings = {
    connectionLimit: 10,
    host: process.env.VECTOR_DB_HOST,
    user: process.env.VECTOR_DB_USER,
    password: process.env.VECTOR_DB_PASS,
    database: process.env.VECTOR_DB
};


var storageProvider = new MySQLStorageProvider(dbSettings);
vectorWatch.setStorageProvider(storageProvider);

var stocksCache = new NodeCache( { stdTTL: 3600 /*60min*/, checkperiod: 120 } );


var YahooStocksApi = require('./YahooStocksApi.js');
var yahooStocksApi = new YahooStocksApi();



vectorWatch.on('subscribe', function(event, response) {

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
    storageProvider.removeUserSettingsAsync(event.getChannelLabel()).then(function(contents) {
        response.send();
    }).catch(function(err) {
        response.sendBadRequestError();
    });
});


/**
 * Push method. Repeat at every UPDATE_INTERVAL_MINUTES
 */
setInterval(function() {
    storageProvider.getAllUserSettingsAsync().then(function(records) {
        for (var i = 0; i < records.length; i += CHUNK_SIZE) {
            var _chunk = records.slice(i, i + CHUNK_SIZE);
            yahooStocksApi.getMultiple(buildSymbolsArray(_chunk)).then(function (symbolValues) {
                _chunk.forEach(function(record, index) {
                    stocksCache.set(record.userSettings.Ticker.name, { value : symbolValues[record.userSettings.Ticker.name] }, function( err, success ) {});
                    console.log("Lets do the push" + record.channelLabel + " " + buildPushData(record.userSettings, symbolValues[record.userSettings.Ticker.name]) + " " + index);
                    //do push  
                });
            }).catch(function (e) {

            });
        }
    }).catch(function(err) {

    });
}, UPDATE_INTERVAL_MINUTES * 60 * 1000);



app.use('/api/callback', vectorWatch.getMiddleware());

http.createServer(app).listen(process.env.PORT || 8080, function() {
    console.log('Non-secure server started.');
});


/**
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














