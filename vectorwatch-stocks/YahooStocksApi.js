/**
 * Created by robert on 09.03.2016.
 */
var Promise = require('bluebird');
var request = require('request');

var YahooStocksApi = function YahooStocksApi() { };


/**
 * @param symbol {String}
 * @returns {Promise}
 */
YahooStocksApi.prototype.get = function (symbol) {
    var future = Promise.defer();

    request(buildUrlForSymbol(symbol), function (err, response, body) {

        if (err) {
            return future.reject(err);
        }
        var json = {};
        try {
            json = JSON.parse(body);
        }
        catch (err) {
            return future.reject(err);
        }

        if (json.error || response.statusCode != 200 || (json.query && !json.query.results.quote.length && json.query.results.quote.LastTradePriceOnly == null)) {
            return future.reject({ error : "NOT_FOUND" });
        }

        future.resolve(extractDataFromQuote(json.query.results.quote));

    });

    return future.promise.catch(YahooStocksApi.parseError);
};



YahooStocksApi.prototype.getMultiple = function (symbols) {
    var future = Promise.defer();

    request(buildUrlForSymbols(symbols), function (err, response, body) {

        if (err) {
            return future.reject(err);
        }
        var json = {};
        try {
            json = JSON.parse(body);
        }
        catch (err) {
            return future.reject(err);
        }

        if (json.error || response.statusCode != 200 || (json.query && json.query.results.quote && json.query.results.quote.length < 1) || !json.query.results) {
            return future.reject({ error : "NOT_FOUND" });
        }

        var resultsMap = {}
        json.query.results.quote.forEach(function(quote) {
            resultsMap[quote.symbol] = extractDataFromQuote(quote);
        });

        future.resolve(resultsMap);

    });

    return future.promise.catch(YahooStocksApi.parseError);
};



/**
 * Returns the ticker data from the API returned object(returned from the Yahoo! API)
 * @param {Object} quote
 *  {
 *      "symbol": "AAPL",
 *       "AverageDailyVolume": "49246200",
 *       "Change": "-0.07",
 *       "DaysLow": "100.27",
 *       "DaysHigh": "101.58",
 *       "YearLow": "92.00",
 *       "YearHigh": "134.54",
 *       "MarketCapitalization": "559.78B",
 *       "LastTradePriceOnly": "100.96",
 *       "DaysRange": "100.27 - 101.58",
 *       "Name": "Apple Inc.",
 *       "Symbol": "AAPL",
 *       "Volume": "6453123",
 *       "StockExchange": "NMS"
 *  }
 * @returns {Object}
 * */
function extractDataFromQuote(quote) {
    if (quote && quote.LastTradePriceOnly != null) {
        var trend = getTrendFromPriceChange(quote.Change);
        quote.LastTradePriceOnly = parseFloat(quote.LastTradePriceOnly).toFixed(2);

        return quote.LastTradePriceOnly + trend;
    }
}

/***
 * Receives a stock price change and returns the sign of the change or empty string if no price change.
 * @param change
 * @returns {*}
 */
function getTrendFromPriceChange(change) {
    if (change != null) {
        return (change.indexOf("-") != -1) ? "-" : "+";
    }
    return "";
}


/*
 * Returns the Yahoo! Finance API url for a symbol
 * @param {Object} symbol - symbol to get data for
 * @returns {String} Yahoo! Finance API query url
 * */
function buildUrlForSymbol(symbol) {
    var query = encodeURIComponent('select * from yahoo.finance.quote where symbol in (\'' + symbol + '\')');
    return "https://query.yahooapis.com/v1/public/yql?q=" + query + "&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=";
}


/*
 * Returns the Yahoo! Finance API url for a symbol
 * @param {Object} symbol - symbol to get data for
 * @returns {String} Yahoo! Finance API query url
 * */
function buildUrlForSymbols(symbols) {
    var value = "'" + symbols.join("','") + "'"
    var query = encodeURIComponent('select * from yahoo.finance.quote where symbol in (' + value + ')');
    console.log("https://query.yahooapis.com/v1/public/yql?q=" + query + "&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=")
    return "https://query.yahooapis.com/v1/public/yql?q=" + query + "&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=";
}



function YahooStocksApiError(rawError) {
    this.raw = rawError;
    this.message = rawError.message;
    this.name = 'YahooStocksApiError';
    Error.captureStackTrace(this, YahooStocksApiError);
}
YahooStocksApiError.prototype = Object.create(Error.prototype);
YahooStocksApiError.prototype.getType = function() { return this.raw.type; };
YahooStocksApiError.prototype.getRaw = function() { return this.raw; };
YahooStocksApiError.prototype.constructor = YahooStocksApiError;


YahooStocksApi.parseError = function(err) {
    throw new YahooStocksApiError(err);
}


YahooStocksApi.YahooStocksApiError = YahooStocksApiError;

module.exports = YahooStocksApi;






