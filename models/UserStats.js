const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./weather_bot.db');

module.exports = {
    /**
     * Увеличить количество запросов пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementTotalRequests(chatId, callback) {
        db.run(
            "UPDATE user_stats SET total_requests = total_requests + 1 WHERE chat_id = ?",
            [chatId],
            callback
        );
    },

    /**
     * Увеличить количество запросов погоды
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementWeatherRequests(chatId, callback) {
        db.run(
            "UPDATE user_stats SET weather_requests = weather_requests + 1 WHERE chat_id = ?",
            [chatId],
            callback
        );
    }
};