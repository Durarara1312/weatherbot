const { 
    getTemperatureUnitLabel, 
    getPressureUnitLabel, 
    getWindSpeedUnitLabel 
} = require('../utils/formatting');
const database = require('../database');
const localization = require('../utils/localization');

module.exports = {
    /**
     * Обрабатывает выбор единицы измерения температуры
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Выбранная единица измерения ('celsius', 'fahrenheit', 'kelvin')
     */
    handleSetTemperatureUnit(bot, chatId, unit) {
        database.setTemperatureUnit(chatId, unit, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'general_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            // Получаем язык пользователя
            const userLanguageCode = await new Promise((resolve, reject) => {
                database.getUserLanguage(chatId, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lang = typeof result === 'object' ? result?.language : result;
                        resolve(lang || 'en'); // Преобразуем объект в строку
                    }
                });
            }).catch(() => 'en');
            // Получаем локализованное сообщение
            const successMessage = await localization.getLocaleText(chatId, 'temperature_unit_set', { 
                unit: getTemperatureUnitLabel(unit, userLanguageCode) 
            });
            bot.sendMessage(chatId, successMessage);
        });
    },

    /**
     * Обрабатывает выбор единицы измерения давления
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Выбранная единица измерения ('mmhg', 'hpa', 'psi')
     */
    handleSetPressureUnit(bot, chatId, unit) {
        database.setPressureUnit(chatId, unit, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'general_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            // Получаем язык пользователя
            const userLanguageCode = await new Promise((resolve, reject) => {
                database.getUserLanguage(chatId, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lang = typeof result === 'object' ? result?.language : result;
                        resolve(lang || 'en'); // Преобразуем объект в строку
                    }
                });
            }).catch(() => 'en');
            // Получаем локализованное сообщение
            const successMessage = await localization.getLocaleText(chatId, 'pressure_unit_set', { 
                unit: getPressureUnitLabel(unit, userLanguageCode) 
            });
            bot.sendMessage(chatId, successMessage);
        });
    },

    /**
     * Обрабатывает выбор единицы измерения скорости ветра
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     * @param {string} unit - Выбранная единица измерения ('ms', 'kmh')
     */
    handleSetWindSpeedUnit(bot, chatId, unit) {
        database.setWindSpeedUnit(chatId, unit, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'general_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            // Получаем язык пользователя
            const userLanguageCode = await new Promise((resolve, reject) => {
                database.getUserLanguage(chatId, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lang = typeof result === 'object' ? result?.language : result;
                        resolve(lang || 'en'); // Преобразуем объект в строку
                    }
                });
            }).catch(() => 'en');
            // Получаем локализованное сообщение
            const successMessage = await localization.getLocaleText(chatId, 'wind_speed_unit_set', { 
                unit: getWindSpeedUnitLabel(unit, userLanguageCode) 
            });
            bot.sendMessage(chatId, successMessage);
        });
    }
};