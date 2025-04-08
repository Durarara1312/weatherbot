const { getWeatherByCity } = require('../utils/weatherUtils');
const { getFutureWeather } = require('../utils/weatherUtils');
const { formatWeatherMessage } = require('../utils/formatting');
const { formatFutureWeatherMessage } = require('../utils/formatting');
const database = require('../database');
const localization = require('../utils/localization');
const models = require('../models');
const { convertWeatherUnits } = require('../utils/unitConverter');

module.exports = {
    
    
    /**
     * Обработка запроса текущей погоды
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} query - CallbackQuery от Telegram
     */
    
async handleCurrentWeather(bot, query) {
    const chatId = query.message.chat.id;
    try {
        // Увеличиваем счётчики статистики
        database.incrementTotalRequests(chatId, (err) => {
            if (err) {
                console.error(`Ошибка при увеличении счётчика общих запросов для chatId ${chatId}:`, err.message);
            }
        });
        database.incrementWeatherRequests(chatId, (err) => {
            if (err) {
                console.error(`Ошибка при увеличении счётчика запросов погоды для chatId ${chatId}:`, err.message);
            }
        });

        // Получаем настройки пользователя
        const settings = await new Promise((resolve, reject) => {
            database.getSettings(chatId, (err, settings) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(settings);
                }
            });
        }).catch((err) => {
            console.error(`Ошибка при получении настроек для chatId ${chatId}:`, err.message);
            bot.sendMessage(chatId, "❌ Произошла ошибка при загрузке настроек.");
            return null;
        });

        if (!settings) return;

        // Получаем язык пользователя
        const userLanguageCode = await new Promise((resolve, reject) => {
            database.getUserLanguage(chatId, (err, languageCode) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(languageCode || 'en'); // По умолчанию английский
                }
            });
        }).catch((err) => {
            console.error(`Ошибка при получении языка пользователя для chatId ${chatId}:`, err.message);
            return 'en'; // По умолчанию английский
        });

        // Получаем город из базы данных
        const cityRow = await new Promise((resolve, reject) => {
            models.Subscription.getCityByChatId(chatId, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        }).catch((err) => {
            console.error("Ошибка при получении города:", err.message);
            bot.sendMessage(chatId, "❌ Произошла ошибка при получении города.");
            return null;
        });

        if (!cityRow || !cityRow.city) {
            const errorMessage = await localization.getLocaleText(chatId, 'city_not_set_error');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        const city = cityRow.city;

        // Получаем данные о погоде
        const weatherData = await getWeatherByCity(city);
        if (!weatherData) {
            const errorMessage = await localization.getLocaleText(chatId, 'weather_fetch_error');
            bot.sendMessage(chatId, `${errorMessage} ${city}.`);
            return;
        }

        // Преобразуем данные в зависимости от настроек пользователя
        const formattedWeather = convertWeatherUnits(
            weatherData,
            settings.temperature_unit,
            settings.pressure_unit,
            settings.wind_speed_unit,
            userLanguageCode
        );

        // Форматируем сообщение
        const message = await formatWeatherMessage({ ...formattedWeather, chatId }, city);

        try {
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            console.log(`[DEBUG] Текущая погода успешно отправлена для chatId ${chatId}`);
        } catch (error) {
            if (error.response && error.response.statusCode === 403) {
                console.warn(`[WARN] Пользователь chatId ${chatId} заблокировал бота. Удаляем из базы.`);
                database.deleteSubscriber(chatId, (err) => {
                    if (err) {
                        console.error(`Ошибка при удалении chatId ${chatId} из базы:`, err.message);
                    }
                });
            } else {
                console.error(`Ошибка при отправке текущей погоды для chatId ${chatId}:`, error.message);
            }
        }

        // Возвращаем главное меню
        const menuHandler = require('./menuHandler');
        menuHandler.sendMainMenu(bot, chatId);

        // Логируем погодные данные
        models.WeatherHistory.logWeatherData(
            chatId,
            city,
            weatherData.temperature,
            weatherData.humidity,
            weatherData.description,
        );
    } catch (error) {
        console.error(`Неожиданная ошибка при обработке текущей погоды для chatId ${chatId}:`, error.message);
        const errorMessage = await localization.getLocaleText(chatId, 'general_error');
        bot.sendMessage(chatId, errorMessage);
    }
},

/**
 * Обрабатывает запрос на прогноз погоды через указанное количество часов
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {Object} query - CallbackQuery объект
 */
async handleFutureWeather(bot, query) {
    const chatId = query.message.chat.id;
    const hours = parseInt(query.data.split('_')[1]); // Извлекаем количество часов (3, 6 или 12)

    try {


        // Получаем настройки пользователя
        const settings = await new Promise((resolve, reject) => {
            database.getSettings(chatId, (err, settings) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(settings);
                }
            });
        }).catch((err) => {
            console.error(`Ошибка при получении настроек для chatId ${chatId}:`, err.message);
            bot.sendMessage(chatId, "❌ Произошла ошибка при загрузке настроек.");
            return null;
        });

        if (!settings) return;

        // Получаем язык пользователя
        const userLanguageCode = await new Promise((resolve, reject) => {
            database.getUserLanguage(chatId, (err, languageCode) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(languageCode || 'en'); // По умолчанию английский
                }
            });
        }).catch((err) => {
            console.error(`Ошибка при получении языка пользователя для chatId ${chatId}:`, err.message);
            return 'en'; // По умолчанию английский
        });

        // Получаем город из базы данных
        const cityRow = await new Promise((resolve, reject) => {
            models.Subscription.getCityByChatId(chatId, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        }).catch((err) => {
            console.error("Ошибка при получении города:", err.message);
            bot.sendMessage(chatId, "❌ Произошла ошибка при получении города.");
            return null;
        });

        if (!cityRow || !cityRow.city) {
            const errorMessage = await localization.getLocaleText(chatId, 'city_not_set_error');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        const city = cityRow.city;

        // Получаем данные о погоде через OpenWeatherMap API
        const weatherData = await getFutureWeather(city, hours);
        if (!weatherData) {
            const errorMessage = await localization.getLocaleText(chatId, 'weather_fetch_error');
            bot.sendMessage(chatId, `${errorMessage} ${city}.`);
            return;
        }

        // Преобразуем данные в зависимости от настроек пользователя
        const formattedWeather = convertWeatherUnits(
            weatherData,
            settings.temperature_unit,
            settings.pressure_unit,
            settings.wind_speed_unit,
            userLanguageCode
        );

        // Форматируем сообщение
        const message = await formatFutureWeatherMessage({ ...formattedWeather, chatId }, city, hours);

        try {
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            console.log(`[DEBUG] Прогноз погоды через ${hours} часа успешно отправлен для chatId ${chatId}`);
        } catch (error) {
            if (error.response && error.response.statusCode === 403) {
                console.warn(`[WARN] Пользователь chatId ${chatId} заблокировал бота. Удаляем из базы.`);
                database.deleteSubscriber(chatId, (err) => {
                    if (err) {
                        console.error(`Ошибка при удалении chatId ${chatId} из базы:`, err.message);
                    }
                });
            } else {
                console.error(`Ошибка при отправке прогноза погоды для chatId ${chatId}:`, error.message);
            }
        }

        // Возвращаем главное меню
        const menuHandler = require('./menuHandler');
        menuHandler.sendMainMenu(bot, chatId);


    } catch (error) {
        console.error(`Неожиданная ошибка при обработке прогноза погоды для chatId ${chatId}:`, error.message);
        const errorMessage = await localization.getLocaleText(chatId, 'general_error');
        bot.sendMessage(chatId, errorMessage);
    }
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

        database.getUsersWithScheduledTime(async (err, rows) => {
            if (err) {
                console.error("Ошибка при получении пользователей для рассылки:", err.message);
                return;
            }

            // Фильтруем пользователей с текущим временем
            const users = rows.filter(row => {
                // Приводим время пользователя к формату HH:mm
                const userTime = row.time.trim();
                const [hours, minutes] = userTime.split(':').map(part => part.padStart(2, '0'));
                const formattedUserTime = `${hours}:${minutes}`;
                return formattedUserTime === currentTime;
            });

            if (users.length === 0) {
                const currentTime = `${currentHour}:${currentMinute}`;
                console.log(`[DEBUG] Нет пользователей для рассылки в ${currentTime}.`);
                return;
            }

            // Обрабатываем всех пользователей параллельно с использованием Promise.allSettled
            const results = await Promise.allSettled(
                users.map(async (row) => {
                    const chatId = row.chat_id;
                    const city = row.city;

                    try {
                        // Получаем настройки пользователя
                        const settings = await new Promise((resolve, reject) => {
                            database.getSettings(chatId, (err, settings) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(settings);
                                }
                            });
                        }).catch((err) => {
                            logger.warn(`Ошибка при получении настроек для chatId ${chatId}: ${err.message}`);
                            return null;
                        });

                        if (!settings) return;

                        // Получаем язык пользователя
                        const userLanguageCode = await new Promise((resolve, reject) => {
                            database.getUserLanguage(chatId, (err, languageCode) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(languageCode || 'en'); // По умолчанию английский
                                }
                            });
                        }).catch((err) => {
                            logger.warn(`Ошибка при получении языка пользователя для chatId ${chatId}: ${err.message}`);
                            return 'en'; // По умолчанию английский
                        });

                        // Получаем данные о погоде
                        const weatherData = await getWeatherByCity(city);
                        if (!weatherData) {
                            const errorMessage = await localization.getLocaleText(chatId, 'weather_fetch_error');
                            bot.sendMessage(chatId, `${errorMessage} ${city}.`);
                            logger.warn(`Не удалось получить данные о погоде для города ${city}`);
                            return;
                        }

                        // Преобразуем данные в зависимости от настроек пользователя
                        const formattedWeather = convertWeatherUnits(
                            weatherData,
                            settings.temperature_unit,
                            settings.pressure_unit,
                            settings.wind_speed_unit,
                            userLanguageCode
                        );

                        // Форматируем сообщение
                        const message = await formatWeatherMessage({ ...formattedWeather, chatId }, city);

                        try {
                            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

                            // Подсчитываем общее количество пользователей с текущим временем
                            const totalUsersWithTime = rows.filter(row => {
                                const userTime = row.time.trim();
                                const [hours, minutes] = userTime.split(':').map(part => part.padStart(2, '0'));
                                return `${hours}:${minutes}` === currentTime;
                            }).length;

                            console.log(`[DEBUG] Рассылка погоды успешно отправлена для chatId ${chatId}. Время: ${currentTime}. Всего пользователей с этим временем: ${totalUsersWithTime}`);
                        } catch (error) {
                            if (error.response && error.response.statusCode === 403) {
                                console.warn(`[WARN] Пользователь chatId ${chatId} заблокировал бота. Удаляем из базы.`);
                                database.deleteSubscriber(chatId, (err) => {
                                    if (err) {
                                        logger.warn(`Ошибка при удалении chatId ${chatId} из базы: ${err.message}`);
                                    }
                                });
                            } else {
                                logger.warn(`Ошибка при отправке рассылки для chatId ${chatId}: ${error.message}`);
                            }
                        }

                        // Логируем погодные данные
                        models.WeatherHistory.logWeatherData(
                            chatId,
                            city,
                            weatherData.temperature,
                            weatherData.humidity,
                            weatherData.description,
                        );
                    } catch (error) {
                        logger.warn(`Неожиданная ошибка при обработке рассылки для chatId ${chatId}: ${error.message}`);
                    }
                })
            );

            // Логируем результаты рассылки
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    logger.warn(`Ошибка при обработке пользователя ${users[index].chat_id}: ${result.reason.message}`);
                }
            });
    });
},

};