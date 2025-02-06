const { getWeatherByCity } = require('../utils/weatherUtils');
const { formatWeatherMessage } = require('../utils/formatting');
const database = require('../database');
const localization = require('../utils/localization');
const axios = require('axios');
const models = require('../models');

module.exports = {
    /**
     * Обработка запроса текущей погоды
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} query - CallbackQuery от Telegram
     */
    async handleCurrentWeather(bot, query) {
        const chatId = query.message.chat.id;
    
        // Логируем chatId для отладки
        // Получаем город из базы данных
        models.Subscription.getCityByChatId(chatId, async (err, row) => {
            if (err) {
                console.error("Ошибка при получении города:", err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении города.");
                return;
            }
    
            // Логируем результат запроса к базе данных
    
            if (!row || !row.city) {
                const errorMessage = await localization.getLocaleText(chatId, 'city_not_set_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
    
            const city = row.city;
            const weatherData = await getWeatherByCity(city);
    
            if (!weatherData) {
                const errorMessage = await localization.getLocaleText(chatId, 'weather_fetch_error');
                bot.sendMessage(chatId, `${errorMessage} ${city}.`);
                return;
            }
    
            const message = await formatWeatherMessage({ ...weatherData, chatId }, city);
            bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        });
    },

    /**
     * Рассылка погоды по подписке
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     */
    async sendScheduledWeather(bot) {
        const now = new Date();
        const currentHour = String(now.getHours()).padStart(2, '0');
        const currentMinute = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;

        // Получаем всех пользователей с установленным временем рассылки
        database.getUsersWithScheduledTime(async (err, rows) => {
            if (err) {
                console.error("Ошибка при получении пользователей для рассылки:", err.message);
                return;
            }

            for (const row of rows) {
                if (row.time === currentTime) {
                    const chatId = row.chat_id;
                    const city = row.city;

                    const weatherData = await getWeatherByCity(city);
                    if (!weatherData) {
                        const errorMessage = await localization.getLocaleText(chatId, 'weather_fetch_error');
                        bot.sendMessage(chatId, `${errorMessage} ${city}.`);
                        continue;
                    }

                    const message = await formatWeatherMessage({ ...weatherData, chatId }, city);
                    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

                    // Логируем погодные данные
                    models.WeatherHistory.logWeatherData(
                        chatId,
                        city,
                        weatherData.temperature,
                        weatherData.humidity,
                        weatherData.description,
                        (err) => {
                            if (err) {
                                console.error(`Ошибка при логировании данных для chatId ${chatId}:`, err.message);
                            }
                        }
                    );
                }
            }
        });
    }
};