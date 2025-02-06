const database = require('../database');
const localization = require('../utils/localization');
const logger = require('../utils/logger');
const models = require('../models');

// Состояния пользователей
const userStates = {};

module.exports = {
    /**
     * Запрашивает у пользователя новое время рассылки
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async requestNewTime(bot, chatId) {
        const timePrompt = await localization.getLocaleText(chatId, 'enter_time_prompt');
        // Устанавливаем состояние ожидания времени
        userStates[chatId] = 'waiting_for_time';
        bot.sendMessage(chatId, timePrompt, { reply_markup: { force_reply: true } });
    },

    /**
     * Обрабатывает ответ пользователя с новым временем
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от пользователя
     */
    async handleNewTime(bot, msg) {
        const chatId = msg.chat.id;

        // Проверяем, находится ли пользователь в состоянии ожидания времени
        if (userStates[chatId] !== 'waiting_for_time') {
            return; // Игнорируем сообщение, если оно не связано с временем
        }

        const time = msg.text;

        // Проверка формата времени (HH:MM)
        const timeRegex = /^([01]?\d|2[0-3]):([0-5]?\d)$/;
        if (!timeRegex.test(time)) {
            const invalidTimeError = await localization.getLocaleText(chatId, 'invalid_time_format_error');
            bot.sendMessage(chatId, `${invalidTimeError} HH:MM`);
            return;
        }

        // Сохраняем время в базе данных
        database.upsertSubscription(chatId, null, null, time, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'time_change_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }

            const successMessage = await localization.getLocaleText(chatId, 'time_change_success');
            bot.sendMessage(chatId, `${successMessage} ${time}`);

            // Очищаем состояние
            delete userStates[chatId];

            // Отправляем главное меню после изменения времени
            const menuHandler = require('./menuHandler');
            menuHandler.sendMainMenu(bot, chatId);
        });
    }
};