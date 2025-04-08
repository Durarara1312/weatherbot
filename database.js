const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./weather_bot.db');

db.serialize((err) => {

    if (err) {
        console.error("Ошибка при инициализации базы данных:", err.message);
    } else {
        console.log("База данных успешно инициализирована.");
    }


    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id INTEGER PRIMARY KEY,
        city TEXT,
        time TEXT,
        timezone TEXT,
        subscription_start DATE DEFAULT (date('now')),
        language TEXT DEFAULT 'en',
        username TEXT,
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

    db.run(`CREATE TABLE IF NOT EXISTS user_states (
        chat_id INTEGER PRIMARY KEY,
        state TEXT
    )`);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_settings (
            chat_id INTEGER PRIMARY KEY,
            temperature_unit TEXT DEFAULT 'celsius',
            pressure_unit TEXT DEFAULT 'hpa',
            wind_speed_unit TEXT DEFAULT 'ms'
        )
    `);
    
});

module.exports = {

    /**
     * Выполняет SQL-запрос и возвращает одну строку
     * @param {string} sql - SQL-запрос
     * @param {Array} params - Параметры запроса
     * @param {function} callback - Callback-функция
     */
    get(sql, params, callback) {
        db.get(sql, params, callback);
    },

    /**
     * Выполняет SQL-запрос и возвращает все строки
     * @param {string} sql - SQL-запрос
     * @param {Array} params - Параметры запроса
     * @param {function} callback - Callback-функция
     */
    all(sql, params, callback) {
        db.all(sql, params, callback);
    },

    /**
     * Выполняет SQL-запрос без возврата данных
     * @param {string} sql - SQL-запрос
     * @param {Array} params - Параметры запроса
     * @param {function} callback - Callback-функция
     */
    run(sql, params, callback) {
        db.run(sql, params, callback);
    },

    /**
     * Установить состояние пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} state - Состояние
     * @param {function} callback - Callback-функция
     */
    setState(chatId, state, callback) {
        db.run(
            "INSERT INTO user_states (chat_id, state) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET state = ?",
            [chatId, state, state],
            callback
        );
    },

    /**
     * Получить состояние пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    getState (chatId, callback) {
        db.get("SELECT state FROM user_states WHERE chat_id = ?", [chatId], callback);
    },

    /**
     * Очистить состояние пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    clearState (chatId, callback) {
        db.run("DELETE FROM user_states WHERE chat_id = ?", [chatId], callback);
    },

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
     * @param {string} username - Username пользователя
     * @param {function} callback - Callback-функция
     */
    upsertSubscription(chatId, city, language, time, username, callback) {
        const query = `
            INSERT INTO subscriptions (chat_id, city, time, timezone, language, status, username)
            VALUES (?, ?, ?, NULL, ?, 'inactive', ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                city = COALESCE(?, city),
                time = COALESCE(?, time),
                language = COALESCE(?, language),
                username = COALESCE(?, username)
        `;
        console.log(`[DEBUG] Выполняется запрос upsertSubscription для chatId ${chatId}: city=${city}, time=${time}`);
        db.run(query, [chatId, city, time, null, language, username, city, time, language, 'inactive', username], callback);
    },

    /**
     * Обновляет город пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} city - Город
     * @param {function} callback - Callback-функция
     */
    updateCity(chatId, city, callback) {
        const query = `
            UPDATE subscriptions
            SET city = ?
            WHERE chat_id = ?
        `;
        db.run(query, [city, chatId], callback);
    },

    /**
     * Добавляет или обновляет пользователя в таблице subscriptions
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} username - Username пользователя (если есть)
     * @param {function} callback - Callback-функция
     */
    upsertUser(chatId, username, callback) {
        const query = `
            INSERT INTO subscriptions (chat_id, username, status)
            VALUES (?, ?, 'inactive')
            ON CONFLICT(chat_id) DO UPDATE SET
                username = COALESCE(?, username)
        `;
        db.run(query, [chatId, username, username], (err) => {
            if (err) {
                console.error(`Ошибка при добавлении/обновлении пользователя chatId ${chatId}:`, err.message);
            } else {
                console.log(`[DEBUG] Пользователь успешно добавлен/обновлён: chatId ${chatId}`);
            }
            callback(err);
        });
    },

    /**
     * Обновляет время рассылки пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} time - Время рассылки (HH:MM)
     * @param {function} callback - Callback-функция
     */
    updateTime(chatId, time, callback) {
        const query = `
            UPDATE subscriptions
            SET time = ?
            WHERE chat_id = ?
        `;
        db.run(query, [time, chatId], callback);
        
    },

    /**
     * Удаляет подписчика из базы данных
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    deleteSubscriber(chatId, callback) {
        const query = "DELETE FROM subscriptions WHERE chat_id = ?";
        db.run(query, [chatId], (err) => {
            if (err) {
                console.error(`Ошибка при удалении chatId ${chatId} из базы:`, err.message);
            } else {
                console.log(`[DEBUG] Пользователь chatId ${chatId} успешно удалён из базы`);
            }
            callback(err);
        });
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
        const query = `
            SELECT 
                s.chat_id, s.username, s.city, s.time, s.language, s.status, s.subscription_start,
                us.temperature_unit, us.pressure_unit, us.wind_speed_unit
            FROM subscriptions s
            LEFT JOIN user_settings us ON s.chat_id = us.chat_id
        `;
        db.all(query, [], (err, rows) => {
            if (err) {
                return callback(err);
            }
            callback(null, rows);
        });
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
    },

    /**
     * Увеличивает счётчик общих запросов пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementTotalRequests(chatId, callback) {
        db.run(
            "INSERT INTO user_stats (chat_id, total_requests) VALUES (?, 1) " +
            "ON CONFLICT(chat_id) DO UPDATE SET total_requests = total_requests + 1",
            [chatId],
            callback
        );
    },

    /**
     * Увеличивает счётчик запросов текущей погоды пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementWeatherRequests(chatId, callback) {
        db.run(
            "INSERT INTO user_stats (chat_id, weather_requests) VALUES (?, 1) " +
            "ON CONFLICT(chat_id) DO UPDATE SET weather_requests = weather_requests + 1",
            [chatId],
            callback
        );
    },

    /**
     * Увеличивает счётчик изменений города пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementCityChanges(chatId, callback) {
        db.run(
            "INSERT INTO user_stats (chat_id, city_changes) VALUES (?, 1) " +
            "ON CONFLICT(chat_id) DO UPDATE SET city_changes = city_changes + 1",
            [chatId],
            callback
        );
    },

    /**
     * Увеличивает счётчик изменений времени пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @param {function} callback - Callback-функция
     */
    incrementTimeChanges(chatId, callback) {
        db.run(
            "INSERT INTO user_stats (chat_id, time_changes) VALUES (?, 1) " +
            "ON CONFLICT(chat_id) DO UPDATE SET time_changes = time_changes + 1",
            [chatId],
            callback
        );
    },

    /**
     * Получает настройки пользователя
     * @param {number} chatId - ID чата пользователя
     * @param {function} callback - Callback-функция
     */
        /**
     * Получает настройки пользователя
     * @param {number} chatId - ID чата пользователя
     * @param {function} callback - Callback-функция
     */
        getSettings(chatId, callback) {
            const query = `
                SELECT temperature_unit, pressure_unit, wind_speed_unit
                FROM user_settings
                WHERE chat_id = ?
            `;
            db.get(query, [chatId], (err, row) => {
                if (err) {
                    console.error("Ошибка при получении настроек:", err.message);
                    return callback(err, null);
                }
                if (!row) {
                    // Если настроек нет, возвращаем значения по умолчанию
                    return callback(null, {
                        temperature_unit: 'celsius',
                        pressure_unit: 'hpa',
                        wind_speed_unit: 'ms'
                    });
                }
                callback(null, row);
            });
        },

    /**
     * Устанавливает единицу измерения температуры
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Единица измерения ('celsius', 'fahrenheit', 'kelvin')
     * @param {function} callback - Callback-функция
     */
    setTemperatureUnit(chatId, unit, callback) {
        const query = `
            INSERT INTO user_settings (chat_id, temperature_unit)
            VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET temperature_unit = ?
        `;
        db.run(query, [chatId, unit, unit], callback);
    },

    /**
     * Устанавливает единицу измерения давления
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Единица измерения ('mmhg', 'hpa', 'psi')
     * @param {function} callback - Callback-функция
     */
    setPressureUnit(chatId, unit, callback) {
        const query = `
            INSERT INTO user_settings (chat_id, pressure_unit)
            VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET pressure_unit = ?
        `;
        db.run(query, [chatId, unit, unit], callback);
    },

    /**
     * Устанавливает единицу измерения скорости ветра
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Единица измерения ('ms', 'kmh')
     * @param {function} callback - Callback-функция
     */
    setWindSpeedUnit(chatId, unit, callback) {
        const query = `
            INSERT INTO user_settings (chat_id, wind_speed_unit)
            VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET wind_speed_unit = ?
        `;
        db.run(query, [chatId, unit, unit], callback);
    },
    
};