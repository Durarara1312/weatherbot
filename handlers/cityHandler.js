const database = require('../database');
const localization = require('../utils/localization');
const logger = require('../utils/logger');

// Состояния пользователей
const userStates = {};

module.exports = {
    /**
     * Запрашивает у пользователя город
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async requestCity(bot, chatId) {
        const cityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');
        // Устанавливаем состояние ожидания города
        userStates[chatId] = 'waiting_for_city';
        bot.sendMessage(chatId, cityPrompt, { reply_markup: { force_reply: true } });
    },

    /**
     * Обрабатывает ответ пользователя с новым городом
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от пользователя
     */
    async handleNewCity(bot, msg) {
        const chatId = msg.chat.id;

        // Проверяем, находится ли пользователь в состоянии ожидания города
        if (userStates[chatId] !== 'waiting_for_city') {
            return; // Игнорируем сообщение, если оно не связано с городом
        }

        const city = msg.text;

        // Проверка, что город не пустой
        if (!city.trim()) {
            const invalidCityError = await localization.getLocaleText(chatId, 'city_not_set_error');
            bot.sendMessage(chatId, invalidCityError);
            return;
        }

        // Сохраняем город в базе данных
        database.upsertSubscription(chatId, city, null, null, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'city_change_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }

            const successMessage = await localization.getLocaleText(chatId, 'city_change_success');
            bot.sendMessage(chatId, `${successMessage} ${city}`);

            // Очищаем состояние
            delete userStates[chatId];

            // Отправляем меню подписки после изменения города
            const menuHandler = require('./menuHandler');
            menuHandler.sendSubscriptionMenu(bot, chatId);
        });
    }
};