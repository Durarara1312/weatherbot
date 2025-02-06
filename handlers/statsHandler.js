const database = require('../database');
const localization = require('../utils/localization');
const logger = require('../utils/logger');

module.exports = {
    /**
     * Обрабатывает запрос на получение статистики пользователя
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleStatsRequest(bot, chatId) {
        try {
            // Получаем данные подписки пользователя
            const subscriptionRow = await this.getSubscription(chatId);

            // Получаем статистику использования бота
            const statsRow = await this.getUserStats(chatId);

            // Получаем историю погоды за последние 30 дней
            const weatherRows = await this.getWeatherHistory(chatId);

            // Формируем сообщение со статистикой
            let message = "";

            // Добавляем информацию о подписке
            if (subscriptionRow) {
                const subscriptionStartDate = new Date(subscriptionRow.subscription_start); // Преобразуем строку в объект Date
                const now = new Date();
                const weeksActive = Math.floor((now - subscriptionStartDate) / (1000 * 60 * 60 * 24 * 7));
                const subscriptionActiveText = await localization.getLocaleText(chatId, 'subscription_active_since');
                message += `${subscriptionActiveText} ${subscriptionStartDate.toLocaleDateString()} (${weeksActive} недели)\n`;
            }

            // Добавляем статистику использования бота
            if (statsRow) {
                const usageStatsText = await localization.getLocaleText(chatId, 'usage_stats');
                message += `\n${usageStatsText}\n` +
                    `• ${await localization.getLocaleText(chatId, 'total_requests')}: ${statsRow.total_requests}\n` +
                    `• ${await localization.getLocaleText(chatId, 'weather_requests')}: ${statsRow.weather_requests}\n` +
                    `• ${await localization.getLocaleText(chatId, 'city_changes')}: ${statsRow.city_changes}\n` +
                    `• ${await localization.getLocaleText(chatId, 'time_changes')}: ${statsRow.time_changes}\n`;
            }

            // Добавляем статистику погоды
            if (weatherRows.length > 0) {
                const temperatures = weatherRows.map(row => row.temperature);
                const avgTemperature = temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length || 0;
                const maxTemperature = Math.max(...temperatures) || 0;
                const minTemperature = Math.min(...temperatures) || 0;
                const rainyDays = weatherRows.filter(row => row.description.toLowerCase().includes('rain')).length;
                const sunnyDays = weatherRows.filter(row => row.description.toLowerCase().includes('clear')).length;

                const weatherStatsText = await localization.getLocaleText(chatId, 'weather_stats');
                message += `\n${weatherStatsText}\n` +
                    `• ${await localization.getLocaleText(chatId, 'average_temperature')}: ${avgTemperature.toFixed(1)}°C\n` +
                    `• ${await localization.getLocaleText(chatId, 'max_temperature')}: ${maxTemperature.toFixed(1)}°C\n` +
                    `• ${await localization.getLocaleText(chatId, 'min_temperature')}: ${minTemperature.toFixed(1)}°C\n` +
                    `• ${await localization.getLocaleText(chatId, 'rainy_days')}: ${rainyDays}\n` +
                    `• ${await localization.getLocaleText(chatId, 'sunny_days')}: ${sunnyDays}\n`;
            } else {
                const noWeatherDataText = await localization.getLocaleText(chatId, 'no_weather_data');
                message += `\n${noWeatherDataText}`;
            }

            // Отправляем сообщение со статистикой
            bot.sendMessage(chatId, message.trim(), { parse_mode: "Markdown" });

            // Возвращаем главное меню
            const menuHandler = require('./menuHandler');
            menuHandler.sendMainMenu(bot, chatId);
        } catch (error) {
            logger.error("Ошибка при отправке статистики", error);
            const errorMessage = await localization.getLocaleText(chatId, 'stats_error');
            bot.sendMessage(chatId, errorMessage);

            // Возвращаем главное меню при ошибке
            const menuHandler = require('./menuHandler');
            menuHandler.sendMainMenu(bot, chatId);
        }
    },

    /**
     * Получает данные подписки пользователя
     * @param {number} chatId - ID чата пользователя
     * @returns {Promise<Object>}
     */
    getSubscription(chatId) {
        return new Promise((resolve, reject) => {
            database.getSubscription(chatId, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    },

    /**
     * Получает статистику использования бота для пользователя
     * @param {number} chatId - ID чата пользователя
     * @returns {Promise<Object>}
     */
    getUserStats(chatId) {
        return new Promise((resolve, reject) => {
            database.get("SELECT * FROM user_stats WHERE chat_id = ?", [chatId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    },

    /**
     * Получает историю погоды пользователя за последние 30 дней
     * @param {number} chatId - ID чата пользователя
     * @returns {Promise<Array>}
     */
    getWeatherHistory(chatId) {
        return new Promise((resolve, reject) => {
            database.all("SELECT * FROM weather_history WHERE chat_id = ? AND date >= date('now', '-30 days')", [chatId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};