const TelegramBot = require('node-telegram-bot-api');
const database = require('../database');
const localization = require('../utils/localization');
const cityHandler = require('./cityHandler');
const logger = require('../utils/logger');
const models = require('../models');

// Хранилище ID последних сообщений меню для каждого пользователя
const lastMenuMessageId = {};

module.exports = {
    /**
     * Отправляет главное меню пользователю
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async sendMainMenu(bot, chatId) {
        const keyboard = await this.getMainMenuKeyboard(chatId);
        this.sendMenu(bot, chatId, keyboard, 'main_menu_message');
    },

    /**
     * Создает inline-клавиатуру для главного меню
     * @param {number} chatId - ID чата пользователя
     * @returns {Object} - Inline-клавиатура
     */
    async getMainMenuKeyboard(chatId) {
        const subscribeButton = await localization.getLocaleText(chatId, 'subscribe_button');
        const actionsButton = await localization.getLocaleText(chatId, 'actions_menu');
        const changeLanguageButton = await localization.getLocaleText(chatId, 'change_language_button');

        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: subscribeButton, callback_data: 'subscription_menu' }],
                    [{ text: actionsButton, callback_data: 'actions_menu' }],
                    [{ text: changeLanguageButton, callback_data: 'change_language' }]
                ]
            }
        };
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
                      [{ text: backToMenuButton, callback_data: 'back_to_main_menu' }]
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
        const statsButton = await localization.getLocaleText(chatId, 'stats_button');
        const feedbackButton = await localization.getLocaleText(chatId, 'feedback_button');
        const backButton = await localization.getLocaleText(chatId, 'back_to_main_menu_button');

        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: currentWeatherButton, callback_data: 'current_weather' }],
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