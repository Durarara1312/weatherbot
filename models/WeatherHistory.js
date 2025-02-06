const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./weather_bot.db');

module.exports = {
    /**
     * Логировать погодные данные в базу данных
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} city - Город
     * @param {number} temperature - Температура
     * @param {number} humidity - Влажность
     * @param {string} description - Описание погоды
     * @param {function} callback - Callback-функция
     */
    logWeatherData(chatId, city, temperature, humidity, description, callback) {
        db.run(
            "INSERT INTO weather_history (chat_id, city, temperature, humidity, description) VALUES (?, ?, ?, ?, ?)",
            [chatId, city, temperature, humidity, description],
            callback
        );
    }
};