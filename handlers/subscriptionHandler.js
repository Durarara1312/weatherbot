const database = require('../database');
const localization = require('../utils/localization');
const models = require('../models');

module.exports = {
    /**
     * Обрабатывает подписку пользователя
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleSubscribe(bot, chatId) {
        // Проверяем, есть ли уже подписка
        database.getSubscription(chatId, async (err, row) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'subscription_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }

            if (row && row.status === 'active') {
                const alreadySubscribedMessage = await localization.getLocaleText(chatId, 'already_subscribed');
                bot.sendMessage(chatId, alreadySubscribedMessage);
                return;
            }

            // Если подписка неактивна, активируем её
            if (row && row.status === 'inactive') {
                database.updateSubscriptionStatus(chatId, 'active', async (err) => {
                    if (err) {
                        console.error(err.message);
                        const errorMessage = await localization.getLocaleText(chatId, 'subscription_error');
                        bot.sendMessage(chatId, errorMessage);
                        return;
                    }
                    const successMessage = await localization.getLocaleText(chatId, 'resubscribe_success');
                    bot.sendMessage(chatId, successMessage);

                    // Отправляем главное меню
                    const menuHandler = require('./menuHandler');
                    menuHandler.sendMainMenu(bot, chatId);
                });
                return;
            }

            // Если подписки нет, запрашиваем город и время
            const cityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');
            bot.sendMessage(chatId, cityPrompt, { reply_markup: { force_reply: true } });

            // Обработка ответа пользователя (город)
            bot.once('message', async (cityMsg) => {
                if (cityMsg.reply_to_message && cityMsg.reply_to_message.text === cityPrompt) {
                    const city = cityMsg.text;

                    // Запрашиваем время
                    const timePrompt = await localization.getLocaleText(chatId, 'enter_time_prompt');
                    bot.sendMessage(chatId, timePrompt, { reply_markup: { force_reply: true } });

                    // Обработка ответа пользователя (время)
                    bot.once('message', async (timeMsg) => {
                        if (timeMsg.reply_to_message && timeMsg.reply_to_message.text === timePrompt) {
                            const time = timeMsg.text;

                            // Проверка формата времени (HH:MM)
                            const timeRegex = /^([01]?\d|2[0-3]):([0-5]?\d)$/;
                            if (!timeRegex.test(time)) {
                                const invalidTimeError = await localization.getLocaleText(chatId, 'invalid_time_format_error');
                                bot.sendMessage(chatId, `${invalidTimeError} HH:MM`);
                                return;
                            }

                            // Сохраняем подписку в базе данных
                            database.upsertSubscription(chatId, city, 'en', time, async (err) => {
                                if (err) {
                                    console.error(err.message);
                                    const errorMessage = await localization.getLocaleText(chatId, 'subscription_error');
                                    bot.sendMessage(chatId, errorMessage);
                                    return;
                                }
                                const successMessage = await localization.getLocaleText(chatId, 'subscription_success');
                                bot.sendMessage(chatId, `${successMessage} ${city}, ${time}`);

                                // Активируем подписку
                                database.updateSubscriptionStatus(chatId, 'active', async (err) => {
                                    if (err) {
                                        console.error(err.message);
                                        const errorMessage = await localization.getLocaleText(chatId, 'subscription_error');
                                        bot.sendMessage(chatId, errorMessage);
                                        return;
                                    }

                                    // Отправляем главное меню
                                    const menuHandler = require('./menuHandler');
                                    menuHandler.sendMainMenu(bot, chatId);
                                });
                            });
                        }
                    });
                }
            });
        });
    },

    /**
     * Обрабатывает отписку пользователя
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async handleUnsubscribe(bot, chatId) {
        // Обновляем статус подписки на 'inactive'
        database.updateSubscriptionStatus(chatId, 'inactive', async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'unsubscribe_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            const successMessage = await localization.getLocaleText(chatId, 'unsubscribe_success');
            bot.sendMessage(chatId, successMessage);

            // Отправляем главное меню
            const menuHandler = require('./menuHandler');
            menuHandler.sendMainMenu(bot, chatId);
        });
    }
};