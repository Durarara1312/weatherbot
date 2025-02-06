const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./weather_bot.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id INTEGER PRIMARY KEY,
        city TEXT,
        time TEXT,
        timezone TEXT,
        subscription_start DATE DEFAULT (date('now')),
        language TEXT DEFAULT 'en',
        status TEXT DEFAULT 'inactive'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        chat_id INTEGER PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        weather_requests INTEGER DEFAULT 0,
        city_changes INTEGER DEFAULT 0,
        time_changes INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS weather_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        city TEXT,
        temperature REAL,
        humidity INTEGER,
        description TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
});

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
    },

    /**
     * Получить всех пользователей с установленным временем рассылки
     * @param {function} callback - Callback-функция
     */
    getUsersWithScheduledTime(callback) {
        db.all("SELECT * FROM subscriptions WHERE time IS NOT NULL AND status = 'active' AND city IS NOT NULL", callback);
    },

    /**
     * Получить общее количество пользователей
     * @param {function} callback - Callback-функция
     */
    getTotalUsers(callback) {
        db.get("SELECT COUNT(*) AS total FROM subscriptions", [], callback);
    },

    /**
     * Получить всех пользователей
     * @param {function} callback - Callback-функция
     */
    getAllUsers(callback) {
        db.all("SELECT chat_id FROM subscriptions", [], callback);
    },

    /**
 * Установить язык пользователя
 * @param {number} chatId - ID пользователя Telegram
 * @param {string} language - Код языка ('ru' или 'en')
 * @param {function} callback - Callback-функция
 */
setUserLanguage(chatId, language, callback) {
    db.run(
        "UPDATE subscriptions SET language = ? WHERE chat_id = ?",
        [language, chatId],
        callback
    );
},

/**
 * Получает подписку пользователя
 * @param {number} chatId - ID пользователя Telegram
 * @param {function} callback - Callback-функция
 */
getSubscription(chatId, callback) {
    db.get("SELECT * FROM subscriptions WHERE chat_id = ?", [chatId], callback);
},

/**
 * Обновляет статус подписки пользователя
 * @param {number} chatId - ID пользователя Telegram
 * @param {string} status - Новый статус ('active' или 'inactive')
 * @param {function} callback - Callback-функция
 */
updateSubscriptionStatus(chatId, status, callback) {
    db.run("UPDATE subscriptions SET status = ? WHERE chat_id = ?", [status, chatId], callback);
}

};


