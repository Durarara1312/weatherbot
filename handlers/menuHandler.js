const TelegramBot = require('node-telegram-bot-api');
const database = require('../database');
const localization = require('../utils/localization');
const cityHandler = require('./cityHandler');
const logger = require('../utils/logger');
const models = require('../models');
const config = require('../config');
const { 
    getTemperatureUnitLabel, 
    getPressureUnitLabel, 
    getWindSpeedUnitLabel 
} = require('../utils/formatting');

// Хранилище ID последних сообщений меню для каждого пользователя
const lastMenuMessageId = {};

module.exports = {
    /**
     * Отправляет главное меню пользователю
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async sendMainMenu(bot, chatId) {
        console.log(`[DEBUG] Отправка главного меню для chatId ${chatId}`);
        const keyboard = await this.getMainMenuKeyboard(chatId);
        this.sendMenu(bot, chatId, keyboard, 'main_menu_message');
    },

    /**
     * Создает inline-клавиатуру для главного меню
     * @param {number} chatId - ID чата пользователя
     * @returns {Object} - Inline-клавиатура
     */
    async getMainMenuKeyboard(chatId) {
        const profileButton = await localization.getLocaleText(chatId, 'profile_button');
        const actionsButton = await localization.getLocaleText(chatId, 'actions_menu');
        const changeLanguageButton = await localization.getLocaleText(chatId, 'change_language_button');

        // Базовые кнопки для всех пользователей
        let keyboard = [
            [{ text: profileButton, callback_data: 'profile_menu' }],
            [{ text: actionsButton, callback_data: 'actions_menu' }],
            [{ text: changeLanguageButton, callback_data: 'change_language' }]
        ];

        // Добавляем кнопку "Админ панель", если это администратор
        if (chatId === config.ADMIN_CHAT_ID) {
            const adminPanelButton = await localization.getLocaleText(chatId, 'admin_panel_button');
            keyboard.push([{ text: adminPanelButton, callback_data: 'admin_panel' }]);
        }

        return {
            reply_markup: {
                inline_keyboard: keyboard
            }
        };
    },
    
    /**
     * Отправляет админ-панель администратору
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     */
    async sendAdminPanel(bot, chatId) {
        const adminPanelText = await localization.getLocaleText(chatId, 'admin_panel_text');
        const usersListButton = await localization.getLocaleText(chatId, 'users_list_button');
        const exportUsersButton = await localization.getLocaleText(chatId, 'export_users_button');
        const filterUsersButton = await localization.getLocaleText(chatId, 'filter_users_button');

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: usersListButton, callback_data: 'admin_users_list' }],
                    [{ text: exportUsersButton, callback_data: 'admin_export_users' }],
                    [{ text: filterUsersButton, callback_data: 'admin_filter_users' }]
                ]
            }
        };

        bot.sendMessage(chatId, adminPanelText, keyboard);
    },
    /**
     * Отправляет меню профиля
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
        async sendProfileMenu(bot, chatId) {
            const profileMenuText = await localization.getLocaleText(chatId, 'profile_menu_text');
            const subscribeButton = await localization.getLocaleText(chatId, 'subscribe_menu');
            const unitsSettingsButton = await localization.getLocaleText(chatId, 'units_settings_button');
            const backToMenuButton = await localization.getLocaleText(chatId, 'back_to_main_menu_button');
    
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: subscribeButton, callback_data: 'manage_subscription' }],
                        [{ text: unitsSettingsButton, callback_data: 'units_settings_menu' }],
                        [{ text: backToMenuButton, callback_data: 'back_to_main_menu' }],
                    ]
                }
            };
    
            bot.sendMessage(chatId, profileMenuText, keyboard);
        },


 /**
 * Отправляет меню настроек единиц измерения
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async sendUnitsSettingsMenu(bot, chatId) {
    try {
        // Получаем текущие настройки пользователя
        const settings = await new Promise((resolve, reject) => {
            database.getSettings(chatId, (err, settings) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(settings || {
                        temperature_unit: 'celsius',
                        pressure_unit: 'hpa',
                        wind_speed_unit: 'ms'
                    }); // Значения по умолчанию
                }
            });
        });

        // Получаем язык пользователя
        const userLanguageCode = await localization.getUserLanguage(chatId);

        // Определяем метки для текущих единиц измерения
        const currentTemperatureUnit = getTemperatureUnitLabel(settings.temperature_unit);
        const currentPressureUnit = getPressureUnitLabel(settings.pressure_unit, userLanguageCode);
        const currentWindSpeedUnit = getWindSpeedUnitLabel(settings.wind_speed_unit, userLanguageCode);

        // Формируем локализованный текст меню
        const unitsMenuText = await localization.getLocaleText(chatId, 'units_settings_menu_text');
        const currentTemperatureMessage = await localization.getLocaleText(chatId, 'current_temperature_unit', { unit: currentTemperatureUnit });
        const currentPressureMessage = await localization.getLocaleText(chatId, 'current_pressure_unit', { unit: currentPressureUnit });
        const currentWindSpeedMessage = await localization.getLocaleText(chatId, 'current_wind_speed_unit', { unit: currentWindSpeedUnit });

        // Локализуем кнопки
        const temperatureButton = await localization.getLocaleText(chatId, 'temperature_units_button');
        const pressureButton = await localization.getLocaleText(chatId, 'pressure_units_button');
        const windSpeedButton = await localization.getLocaleText(chatId, 'wind_speed_units_button');
        const backButton = await localization.getLocaleText(chatId, 'back_button');

        // Формируем сообщение
        const message = `${unitsMenuText}\n\n${currentTemperatureMessage}\n${currentPressureMessage}\n${currentWindSpeedMessage}`;

        // Формируем клавиатуру
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: temperatureButton, callback_data: 'temperature_units_menu' }],
                    [{ text: pressureButton, callback_data: 'pressure_units_menu' }],
                    [{ text: windSpeedButton, callback_data: 'wind_speed_units_menu' }],
                    [{ text: backButton, callback_data: 'profile_menu' }]
                ]
            }
        };

        // Отправляем сообщение
        bot.sendMessage(chatId, message, keyboard);
    } catch (err) {
        console.error(`Ошибка при отправке меню настроек единиц измерения для chatId ${chatId}:`, err.message);
        bot.sendMessage(chatId, "⚠️ Произошла ошибка при формировании меню настроек.");
    }
},

/**
 * Отправляет меню выбора единиц температуры
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async sendTemperatureUnitsMenu(bot, chatId) {
    const temperatureMenuText = await localization.getLocaleText(chatId, 'temperature_units_menu_text');
    const celsiusButton = await localization.getLocaleText(chatId, 'celsius_button');
    const fahrenheitButton = await localization.getLocaleText(chatId, 'fahrenheit_button');
    const kelvinButton = await localization.getLocaleText(chatId, 'kelvin_button');
    const backButton = await localization.getLocaleText(chatId, 'back_button');
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: celsiusButton, callback_data: 'set_temperature_celsius' }],
                [{ text: fahrenheitButton, callback_data: 'set_temperature_fahrenheit' }],
                [{ text: kelvinButton, callback_data: 'set_temperature_kelvin' }],
                [{ text: backButton, callback_data: 'units_settings_menu' }]
            ]
        }
    };
    bot.sendMessage(chatId, temperatureMenuText, keyboard);
},

/**
 * Отправляет меню выбора единиц давления
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async sendPressureUnitsMenu(bot, chatId) {
    const pressureMenuText = await localization.getLocaleText(chatId, 'pressure_units_menu_text');
    const mmHgButton = await localization.getLocaleText(chatId, 'mmhg_button');
    const hPaButton = await localization.getLocaleText(chatId, 'hpa_button');
    const psiButton = await localization.getLocaleText(chatId, 'psi_button');
    const backButton = await localization.getLocaleText(chatId, 'back_button');
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: mmHgButton, callback_data: 'set_pressure_mmhg' }],
                [{ text: hPaButton, callback_data: 'set_pressure_hpa' }],
                [{ text: psiButton, callback_data: 'set_pressure_psi' }],
                [{ text: backButton, callback_data: 'units_settings_menu' }]
            ]
        }
    };
    bot.sendMessage(chatId, pressureMenuText, keyboard);
},

/**
 * Отправляет меню выбора единиц скорости ветра
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async sendWindSpeedUnitsMenu(bot, chatId) {
    const windSpeedMenuText = await localization.getLocaleText(chatId, 'wind_speed_units_menu_text');
    const msButton = await localization.getLocaleText(chatId, 'ms_button');
    const kmhButton = await localization.getLocaleText(chatId, 'kmh_button');
    const backButton = await localization.getLocaleText(chatId, 'back_button');
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: msButton, callback_data: 'set_wind_speed_ms' }],
                [{ text: kmhButton, callback_data: 'set_wind_speed_kmh' }],
                [{ text: backButton, callback_data: 'units_settings_menu' }]
            ]
        }
    };
    bot.sendMessage(chatId, windSpeedMenuText, keyboard);
},


   /**
     * Отправляет меню подписки
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
   async sendSubscriptionMenu(bot, chatId) {
    // Получаем текущую подписку пользователя
    database.getSubscription(chatId, async (err, subscription) => {
        if (err) {
            console.error(err.message);
            bot.sendMessage(chatId, "❌ Произошла ошибка при загрузке меню подписки.");
            return;
        }

        const statusText = subscription?.status === 'active'
            ? await localization.getLocaleText(chatId, 'subscription_status_active')
            : await localization.getLocaleText(chatId, 'subscription_status_inactive');
            console.log(`[DEBUG] Текущий статус подписки для chatId ${chatId}: ${statusText}`);
        const cityText = subscription?.city
            ? await localization.getLocaleText(chatId, 'city_set', { city: subscription.city })
            : await localization.getLocaleText(chatId, 'city_not_set');

        const timeText = subscription?.time
            ? await localization.getLocaleText(chatId, 'time_set', { time: subscription.time })
            : await localization.getLocaleText(chatId, 'time_not_set');

        const subscriptionMenuMessage = `
${await localization.getLocaleText(chatId, 'subscription_menu_message')}

${statusText}
${cityText}
${timeText}
        `.trim();

        const keyboard = await this.getSubscriptionKeyboard(chatId, subscription?.status);
        bot.sendMessage(chatId, subscriptionMenuMessage, keyboard);
    });
},

/**
 * Получает клавиатуру для меню подписки
 * @param {number} chatId - ID чата пользователя
 * @param {string} status - Текущий статус подписки ('active' или 'inactive')
 * @returns {Object} - Клавиатура
 */
async getSubscriptionKeyboard(chatId, status) {
    const changeCityButton = await localization.getLocaleText(chatId, 'change_city_button');
    const changeTimeButton = await localization.getLocaleText(chatId, 'change_time_button');
    const unsubscribeButton = await localization.getLocaleText(chatId, 'unsubscribe_button');
    const subscribeButton = await localization.getLocaleText(chatId, 'subscribe_button');
    const backToMenuButton = await localization.getLocaleText(chatId, 'back_to_main_menu_button');

    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: changeCityButton, callback_data: 'change_city' }],
                [{ text: changeTimeButton, callback_data: 'change_time' }],
                status === 'active'
                    ? [{ text: unsubscribeButton, callback_data: 'unsubscribe' }]
                    : [{ text: subscribeButton, callback_data: 'subscribe' }],
                      [{ text: backToMenuButton, callback_data: 'back_to_main_menu' }],
            ]
        }
    };
},


    /**
     * Обрабатывает выбор города
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleCitySelection(bot, chatId) {
        cityHandler.requestCity(bot, chatId);
    },



     /**
     * Отправляет меню действий
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
     async sendActionsMenu(bot, chatId) {
        const keyboard = await this.getActionsMenuKeyboard(chatId);
        this.sendMenu(bot, chatId, keyboard, 'actions_menu_message');
    },

    /**
     * Создает inline-клавиатуру для меню действий
     * @param {number} chatId - ID чата пользователя
     * @returns {Object} - Inline-клавиатура
     */
    async getActionsMenuKeyboard(chatId) {
        const currentWeatherButton = await localization.getLocaleText(chatId, 'current_weather_button');
        const ThreeWeatherButton = await localization.getLocaleText(chatId, '3h_weather_button');
        const SixWeatherButton = await localization.getLocaleText(chatId, '6h_weather_button');
        const TwelveWeatherButton = await localization.getLocaleText(chatId, '12h_weather_button');
        const statsButton = await localization.getLocaleText(chatId, 'stats_button');
        const feedbackButton = await localization.getLocaleText(chatId, 'feedback_button');
        const backButton = await localization.getLocaleText(chatId, 'back_to_main_menu_button');

        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: currentWeatherButton, callback_data: 'current_weather' }],
                    [{ text: ThreeWeatherButton, callback_data: 'weather_3h' }],
                    [{ text: SixWeatherButton, callback_data: 'weather_6h' }],
                    [{ text: TwelveWeatherButton, callback_data: 'weather_12h' }],
                    [{ text: statsButton, callback_data: 'stats' }],
                    [{ text: feedbackButton, callback_data: 'feedback' }],
                    [{ text: backButton, callback_data: 'back_to_main_menu' }]
                ]
            }
        };
    },

    
    /**
     * Обрабатывает запрос статистики
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleStats(bot, chatId) {
        const statsMessage = `
📊 Статистика:
- Активных подписчиков: 120
- Новых пользователей за неделю: 15
- Популярные города: Москва, Санкт-Петербург, Новосибирск
        `.trim();

        bot.sendMessage(chatId, statsMessage);
    },

    /**
     * Обрабатывает обратную связь
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleFeedback(bot, chatId) {
        const feedbackPrompt = await localization.getLocaleText(chatId, 'feedback_prompt');
        bot.sendMessage(chatId, feedbackPrompt, { reply_markup: { force_reply: true } });

        // Обработка ответа пользователя
        bot.on('message', async (msg) => {
            if (msg.reply_to_message && msg.reply_to_message.text === (await localization.getLocaleText(chatId, 'feedback_prompt'))) {
                const feedback = msg.text;

                if (!feedback.trim()) {
                    const invalidFeedbackError = await localization.getLocaleText(chatId, 'invalid_feedback_error');
                    bot.sendMessage(chatId, invalidFeedbackError);
                    return;
                }

                // Сохраняем отзыв в базу данных или отправляем администратору
                console.log(`Получен отзыв от пользователя ${chatId}: ${feedback}`);

                const feedbackSuccess = await localization.getLocaleText(chatId, 'feedback_success');
                bot.sendMessage(chatId, feedbackSuccess);
            }
        });
    },

    /**
     * Универсальная функция для отправки меню
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     * @param {Object} keyboard - Inline-клавиатура
     * @param {string} messageKey - Ключ для получения текста сообщения из локализации
     */
    async sendMenu(bot, chatId, keyboard, messageKey) {
        // Удаляем старое сообщение, если оно существует
        if (lastMenuMessageId[chatId]) {
            try {
                await bot.deleteMessage(chatId, lastMenuMessageId[chatId]);
            } catch (error) {
                console.error(`Ошибка при удалении сообщения ${lastMenuMessageId[chatId]}:`, error.message);
            }
        }

        // Отправляем новое сообщение
        const sentMessage = await bot.sendMessage(
            chatId,
            await localization.getLocaleText(chatId, messageKey),
            keyboard
        );

        // Сохраняем ID нового сообщения
        lastMenuMessageId[chatId] = sentMessage.message_id;
    }
};