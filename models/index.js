const sqlite3 = require('sqlite3').verbose();

module.exports = {
    Subscription: require('./Subscription'),
    UserStats: require('./UserStats'),
    WeatherHistory: require('./WeatherHistory')
};