const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./weather_bot.db');

module.exports = {
    /**
     * Получить город пользователя по chatId
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    getCityByChatId(chatId, callback) {
        db.get("SELECT city FROM subscriptions WHERE chat_id = ?", [chatId], callback);
    },

    /**
     * Получить язык пользователя по chatId
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    getUserLanguage(chatId, callback) {
        db.get("SELECT language FROM subscriptions WHERE chat_id = ?", [chatId], callback);
    },

    /**
     * Добавить или обновить подписку пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} city - Город
     * @param {string} language - Язык
     * @param {string} time - Время рассылки (опционально)
     * @param {function} callback - Callback-функция
     */
    upsertSubscription(chatId, city, language, time, callback) {
        const query = `
            INSERT INTO subscriptions (chat_id, city, language, time)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                city = COALESCE(?, city),
                language = COALESCE(?, language),
                time = COALESCE(?, time)
        `;
        db.run(query, [chatId, city, language, time, city, language, time], callback);
    },

    /**
     * Удалить подписку пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    deleteSubscription(chatId, callback) {
        db.run("DELETE FROM subscriptions WHERE chat_id = ?", [chatId], callback);
    },

    /**
     * Получить подписку пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    getSubscription(chatId, callback) {
        db.get("SELECT * FROM subscriptions WHERE chat_id = ?", [chatId], callback);
    },

    /**
     * Обновить статус подписки пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} status - Новый статус ('active' или 'inactive')
     * @param {function} callback - Callback-функция
     */
    updateSubscriptionStatus(chatId, status, callback) {
        db.run("UPDATE subscriptions SET status = ? WHERE chat_id = ?", [status, chatId], callback);
    }
};